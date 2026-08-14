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
        const price = BigInt(state.balance.pricePerPlayWei);
        const spins = price > 0n ? `, ${BigInt(state.balance.balanceWei) / price} paid spins left` : ", free dev mode";
        el("fair-strip").textContent =
            `epoch ${state.epoch.epochId} commit ${state.epoch.seedCommit.slice(0, 18)}... ` +
            `| TEE ${state.teeId} | chain ${state.chainId} ` +
            `| casino balance ${flr(state.balance.balanceWei)} C2FLR${spins}`;
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

// The button survives every click and doubles as a refresh
function renderVerify(cell, spun, html) {
    cell.innerHTML = `${html}<button class="verify">Verify</button>`;
    cell.querySelector(".verify").addEventListener("click", () => runVerify(cell, spun));
}

const shortHex = (h) => (typeof h === "string" && h.length > 22 ? `${h.slice(0, 12)}...${h.slice(-6)}` : h);
const hex = (h) => `<span class="hex" title="${h}">${shortHex(h)}</span>`;

function section(state, title, meaning, rows, note) {
    const cls = state === true ? "ok" : state === false ? "bad" : "wait";
    const mark = state === true ? "PASS" : state === false ? "FAIL" : "WAITING";
    const body = rows.map(([k, v]) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`).join("");
    return (
        `<section class="check ${cls}"><h3><em>${mark}</em>${title}</h3>` +
        `<p>${meaning}</p>${body}${note ? `<p class="note">${note}</p>` : ""}</section>`
    );
}

function proofHtml(d) {
    const eq = (a, b) => `<b class="${a === b ? "same" : "diff"}">${a}</b> ${a === b ? "=" : "!="} <b>${b}</b>`;
    const pending =
        'The seed is revealed when the epoch closes: <span class="countdown">soon</span>. ' +
        "This panel rechecks automatically. Why the wait? One seed drives every bet in the epoch, so " +
        "revealing it early would let players compute future spins before betting. Your signed receipt " +
        "above already locks the casino in; the reveal only lets you recompute it.";
    const parts = [];
    parts.push(
        section(
            d.signer.ok,
            "The casino signed this exact result",
            "The whole receipt is hashed and the 65 byte signature must recover the TEE's address. " +
                "If one digit of your result were changed, the recovered address would differ. " +
                "The casino cannot edit or deny this bet later.",
            [
                ["receipt digest", hex(d.digest)],
                ["recovered signer", hex(d.signer.recovered ?? "invalid signature")],
                ["expected TEE", hex(d.signer.expected)],
                ["match", d.signer.ok ? "yes" : "NO, do not trust this receipt"],
            ],
        ),
    );
    parts.push(
        section(
            d.commitment.ok,
            "The outcome seed was locked before your bet",
            "Before any bet, the casino published the SHA-256 hash of a secret seed. " +
                "After the epoch closes it must reveal that seed, and the hash of the reveal must equal the lock. " +
                "So the casino picked its seed before it ever saw your bet, and could not swap it after.",
            d.closed
                ? [
                      ["locked before bets", hex(d.commitment.seedCommit)],
                      ["revealed seed", hex(d.commitment.serverSeed)],
                      ["SHA-256 of reveal", hex(d.commitment.seedHash)],
                      ["match", d.commitment.ok ? "yes" : "NO, the seed was swapped"],
                  ]
                : [["locked before bets", hex(d.commitment.seedCommit)]],
            d.closed ? "" : pending,
        ),
    );
    const o = d.outcome;
    parts.push(
        section(
            o.ok,
            "Your number is pure math, recomputed here",
            "The wheel number comes from HMAC-SHA256 over the revealed server seed, your client seed, and your " +
                "bet number, with unbiased sampling into 0..36. Nobody picked it, and anyone can redo the math. " +
                "This page just did, independently of the casino result.",
            d.closed
                ? [
                      ["server seed", hex(d.commitment.serverSeed ?? "")],
                      ["your client seed", `<span class="hex">${o.clientSeed}</span>`],
                      ["nonce", String(o.nonce)],
                      ["game rule hash", `${hex(o.ruleHash)} ${o.ruleMatches === false ? "(RULE MISMATCH)" : ""}`],
                      ["recomputed vs wheel", eq(String(o.recomputedDraws ?? "?"), String(o.receiptDraws))],
                      ["recomputed payout", o.recomputedWin ? `win, ${(o.recomputedPayoutBp / 10000).toFixed(3)}x` : "no win"],
                  ]
                : [
                      ["your client seed", `<span class="hex">${o.clientSeed}</span>`],
                      ["nonce", String(o.nonce)],
                      ["game rule hash", hex(o.ruleHash)],
                  ],
            d.closed ? "" : pending,
        ),
    );
    parts.push(
        section(
            d.merkle.ok,
            "Your bet is sealed into the epoch",
            "Every receipt in the epoch is hashed into one Merkle root, and that root is what gets anchored " +
                "onchain. Your receipt digest proves into the root, so the bet cannot be deleted or replaced " +
                "without changing the root everyone can see.",
            d.closed
                ? [
                      ["merkle root", hex(d.merkle.merkleRoot ?? "")],
                      ["proof hashes", String(d.merkle.proof ? d.merkle.proof.length : 0)],
                      ["receipts sealed", String(d.merkle.receiptCount ?? "?")],
                      ["your digest proves in", d.merkle.ok ? "yes" : "NO"],
                  ]
                : [],
            d.closed ? "" : pending,
        ),
    );
    const api = `${d.apiBase}/epochs/${d.epochId}`;
    const independent =
        `${d.verifyUrl}?server=${encodeURIComponent(d.apiBase)}&epoch=${d.epochId}&bet=${d.betId}`;
    return (
        `<div class="proof">${parts.join("")}` +
        `<p class="proof-links"><a class="recheck" href="${independent}" target="_blank">Recheck it yourself</a>` +
        ` opens the independent verifier, which redoes all of this in your own browser. ` +
        `Raw data, no key needed: ` +
        `<a href="${api}" target="_blank">epoch</a> · ` +
        `<a href="${api}/receipts" target="_blank">receipts</a> · ` +
        `<a href="${api}/proof/${d.betId}" target="_blank">proof</a> · ` +
        `<a href="${d.apiBase}/verify/${d.epochId}/${d.betId}" target="_blank">server verify</a>` +
        ` <button class="hide-proof">Hide</button></p></div>`
    );
}

function renderProof(cell, spun, data) {
    const badge = (name, ok) => `<span class="badge ${ok ? "" : "bad"}">${name} ${ok ? "✓" : "✗"}</span>`;
    let html = badge("signature", data.signer.ok);
    if (data.closed) {
        html += badge("commit", data.commitment.ok) + badge("outcome", data.outcome.ok) + badge("merkle", data.merkle.ok);
    }
    renderVerify(cell, spun, `${html} `);
    const row = cell.closest("tr");
    if (row.nextElementSibling?.classList.contains("proof-row")) row.nextElementSibling.remove();
    const proofRow = document.createElement("tr");
    proofRow.className = "proof-row";
    proofRow.innerHTML = `<td colspan="6">${proofHtml(data)}</td>`;
    proofRow.querySelector(".hide-proof").addEventListener("click", () => proofRow.remove());
    row.after(proofRow);
    if (!data.closed) armAutoRefresh(proofRow, cell, spun, data.closesAt);
}

// Live countdown plus a steady poll until the reveal lands
function armAutoRefresh(proofRow, cell, spun, closesAt) {
    let nextPoll = Math.floor(Date.now() / 1000) + 10;
    const timer = setInterval(async () => {
        if (!proofRow.isConnected) return clearInterval(timer);
        const now = Math.floor(Date.now() / 1000);
        if (closesAt) {
            const left = closesAt - now;
            proofRow.querySelectorAll(".countdown").forEach((el) => {
                el.textContent = left > 0 ? `in ${left}s` : "any moment now";
            });
        }
        if (now < nextPoll) return;
        nextPoll = now + 10;
        try {
            const res = await fetch(`/api/proof/${spun.epochId}/${spun.betId}`);
            if (!res.ok) return;
            const fresh = await res.json();
            if (fresh.closed) {
                clearInterval(timer);
                renderProof(cell, spun, fresh);
            }
        } catch {}
    }, 1000);
}

async function runVerify(cell, spun) {
    cell.textContent = "...";
    let data;
    try {
        const res = await fetch(`/api/proof/${spun.epochId}/${spun.betId}`);
        data = await res.json();
        if (!res.ok) throw new Error(data.error);
    } catch (err) {
        renderVerify(cell, spun, `<span class="badge bad">${err.message}</span> `);
        return;
    }
    renderProof(cell, spun, data);
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
