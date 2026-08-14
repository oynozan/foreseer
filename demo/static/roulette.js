const WHEEL = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18,
    29, 7, 28, 12, 35, 3, 26,
];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const TAU = 2 * Math.PI;
const STEP = TAU / 37;
const TOP = -Math.PI / 2;

let phase = "idle";
let ballAngle = TOP;
let spinFrom = 0;
let spinTravel = 0;
let spinFrame = 0;
const SPIN_FRAMES = 240;
let pending = null;
let chips = 1000;
let selectedBet = "red";

const el = (id) => document.getElementById(id);
const msg = (t) => (el("message").textContent = t);

function colorOf(n) {
    if (n === 0) return "green";
    return RED.has(n) ? "red" : "black";
}

function newSeed() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    el("seed").value = [...bytes].map((b) => chars[b % 64]).join("");
}

function renderChips() {
    el("chips").textContent = `Chips: ${chips}`;
}

function flr(wei) {
    return (Number(BigInt(wei) / 10000000000000n) / 100000).toFixed(3);
}

async function refreshState() {
    try {
        const state = await (await fetch("/api/state")).json();
        el("fair-strip").textContent =
            `epoch ${state.epoch.epochId} commit ${state.epoch.seedCommit.slice(0, 18)}... ` +
            `| TEE ${state.teeId} | chain ${state.chainId} | casino balance ${flr(state.balance.balanceWei)} C2FLR`;
    } catch {
        el("fair-strip").textContent = "casino backend unreachable";
    }
}

/* p5 sketch: the wheel is fixed, only the ball moves */
function setup() {
    const canvas = createCanvas(440, 440);
    canvas.parent("wheel");
    textFont("Ubuntu");
}

function draw() {
    background(255);
    translate(width / 2, height / 2);
    noStroke();
    fill("#1d1d1d");
    circle(0, 0, 436);
    for (let i = 0; i < 37; i++) {
        const n = WHEEL[i];
        const a0 = i * STEP + TOP - STEP / 2;
        fill(n === 0 ? "#1c8a3c" : RED.has(n) ? "#c22b2b" : "#2a2a2a");
        arc(0, 0, 400, 400, a0, a0 + STEP, PIE);
    }
    fill(255);
    circle(0, 0, 240);
    fill("#ff6200");
    circle(0, 0, 60);
    textAlign(CENTER, CENTER);
    textSize(13);
    for (let i = 0; i < 37; i++) {
        const a = i * STEP + TOP;
        push();
        rotate(a + Math.PI / 2);
        fill(255);
        text(String(WHEEL[i]), 0, -168);
        pop();
    }
    fill("#ff6200");
    triangle(-10, -218, 10, -218, 0, -196);
    if (phase === "spinning") {
        spinFrame += 1;
        const t = Math.min(spinFrame / SPIN_FRAMES, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        ballAngle = spinFrom + spinTravel * eased;
        if (t >= 1) settle();
    }
    stroke("#1d1d1d");
    strokeWeight(2);
    fill(255);
    circle(Math.cos(ballAngle) * 148, Math.sin(ballAngle) * 148, 18);
    noStroke();
}

async function doSpin() {
    const stake = Math.min(Math.max(parseInt(el("stake").value, 10) || 1, 1), 100);
    if (chips < stake) return msg("not enough chips");
    const number = Math.min(Math.max(parseInt(el("number").value, 10) || 0, 0), 36);
    const bet = selectedBet === "straight" ? { type: "straight", number } : { type: selectedBet };
    el("spin").disabled = true;
    msg("");
    let json;
    try {
        const res = await fetch("/api/spin", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ clientSeed: el("seed").value, bet }),
        });
        json = await res.json();
        if (!res.ok) throw new Error(json.error);
    } catch (err) {
        msg(err.message);
        el("spin").disabled = false;
        return;
    }
    chips -= stake;
    renderChips();
    pending = { ...json, stake, bet };
    const target = WHEEL.indexOf(json.number) * STEP + TOP;
    spinFrom = ballAngle;
    const current = ((spinFrom % TAU) + TAU) % TAU;
    const norm = ((target % TAU) + TAU) % TAU;
    spinTravel = 5 * TAU + ((norm - current + TAU) % TAU);
    spinFrame = 0;
    phase = "spinning";
}

function settle() {
    phase = "idle";
    const spun = pending;
    pending = null;
    const returned = spun.win ? Math.round((spun.stake * spun.payoutBp) / 10000) : 0;
    chips += returned;
    renderChips();
    const net = returned - spun.stake;
    msg(spun.win ? `${spun.number} ${spun.color}: WIN +${net} chips` : `${spun.number} ${spun.color}: lost ${spun.stake} chips`);
    addRow(spun, net);
    el("spin").disabled = false;
    refreshState();
}

function addRow(spun, net) {
    const row = document.createElement("tr");
    const betLabel = spun.bet.type === "straight" ? `number ${spun.bet.number}` : spun.bet.type;
    row.innerHTML =
        `<td><span class="num ${spun.color}">${spun.number}</span></td>` +
        `<td>${betLabel} @ ${spun.stake}</td>` +
        `<td class="${net > 0 ? "win" : "lose"}">${net > 0 ? "+" : ""}${net}</td>` +
        `<td class="ids">epoch ${spun.epochId} bet ${spun.betId} nonce ${spun.nonce}</td>` +
        `<td><span class="badge">TEE signed</span></td>` +
        `<td class="checks"></td>`;
    renderVerify(row.querySelector(".checks"), spun, "");
    el("history").querySelector("tbody").prepend(row);
}

// The button survives until all four checks are final
function renderVerify(cell, spun, html) {
    cell.innerHTML = `${html}<button class="verify">Verify</button>`;
    cell.querySelector(".verify").addEventListener("click", () => runVerify(cell, spun));
}

async function runVerify(cell, spun) {
    cell.textContent = "...";
    try {
        const res = await (await fetch(`/api/verify/${spun.epochId}/${spun.betId}`)).json();
        const badge = (name, ok) => `<span class="badge ${ok ? "" : "bad"}">${name} ${ok ? "✓" : "✗"}</span>`;
        let html = badge("signature", res.checks.signature);
        if (res.closed) {
            html +=
                badge("commit", res.checks.commit) +
                badge("outcome", res.checks.outcome) +
                badge("merkle", res.checks.merkle);
            cell.innerHTML = html;
        } else {
            renderVerify(cell, spun, `${html}<span class="badge">epoch open, full checks after close</span> `);
        }
    } catch {
        renderVerify(cell, spun, `<span class="badge bad">verify failed</span> `);
    }
}

for (const button of document.querySelectorAll(".bet")) {
    button.addEventListener("click", () => {
        selectedBet = button.dataset.bet;
        document.querySelectorAll(".bet").forEach((b) => b.classList.remove("selected"));
        button.classList.add("selected");
        el("number").disabled = selectedBet !== "straight";
    });
}
el("reseed").addEventListener("click", newSeed);
el("spin").addEventListener("click", doSpin);
newSeed();
renderChips();
refreshState();
setInterval(refreshState, 15000);
