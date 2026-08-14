import { runChecks, loadFromServer } from "./widget-core.mjs";
import example from "../data/example.json";

const $ = (id) => document.getElementById(id);

// Everything below is attacker reachable: url params, remote server strings
const esc = (v) =>
    String(v).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );

const fail = (message) => {
    $("results").textContent = "";
    const p = document.createElement("p");
    p.className = "verdict red";
    p.textContent = message;
    $("results").append(p);
};

const CHAIN_ROWS = [
    ["signature", "1. Receipt signature recovers the TEE address"],
    ["teeRegistered", "2. TEE address registered by Flare attestation"],
    ["commit", "3. Revealed seed matches the commitment"],
    ["commitAnchored", "4. Commitment anchored onchain"],
    ["outcome", "5. Draws, win, payout recompute from the seed"],
    ["merkle", "6. Receipt digest proves into the Merkle root"],
];
const CHAIN_ONLY = new Set(["teeRegistered", "commitAnchored"]);

function render(result) {
    const rows = CHAIN_ROWS.map(([key, label]) => {
        if (CHAIN_ONLY.has(key)) {
            return `<div class="check chain"><span class="dot">&#9679;</span> ${label}
                <small>chain read: live once ForeseerInstructionSender is registered on Coston2</small></div>`;
        }
        const c = result.checks[key];
        const cls = c.ok ? "green" : "red";
        return `<div class="check ${cls}"><span class="dot">&#9679;</span> ${label} <small>${esc(c.detail)}</small></div>`;
    });
    $("results").innerHTML =
        rows.join("") +
        (result.allGreen
            ? `<p class="verdict green">All offline checks green. teeId ${esc(result.teeId)}</p>`
            : `<p class="verdict red">Verification FAILED, do not trust this receipt.</p>`);
}

function inputs() {
    const signed = JSON.parse($("receipt").value);
    if (signed.receipt === undefined || signed.signature === undefined) {
        throw new Error('paste the signed receipt as {"receipt": ..., "signature": "0x..."}');
    }
    return {
        receipt: signed.receipt,
        signature: signed.signature,
        rule: JSON.parse($("rule").value),
        serverSeed: $("serverSeed").value.trim(),
        seedCommit: $("seedCommit").value.trim(),
        merkleRoot: $("merkleRoot").value.trim(),
        proof: JSON.parse($("proof").value),
        expectedTeeId: $("teeId").value.trim() || undefined,
        chainId: Number($("chainId").value || 114),
    };
}

$("verify").addEventListener("click", () => {
    try {
        render(runChecks(inputs()));
    } catch (e) {
        fail(e.message);
    }
});

$("example").addEventListener("click", () => {
    $("receipt").value = JSON.stringify({ receipt: example.receipt, signature: example.signature }, null, 2);
    $("rule").value = JSON.stringify(example.rule);
    $("serverSeed").value = example.serverSeed;
    $("seedCommit").value = example.seedCommit;
    $("merkleRoot").value = example.merkleRoot;
    $("proof").value = JSON.stringify(example.proof);
    $("teeId").value = example.teeId;
    $("chainId").value = "114";
    $("results").textContent = "Golden vector loaded, press Verify.";
});

async function loadIntoForm() {
    const data = await loadFromServer($("server").value.trim(), Number($("epochId").value), Number($("betId").value));
    $("receipt").value = JSON.stringify({ receipt: data.receipt, signature: data.signature }, null, 2);
    $("rule").value = JSON.stringify(data.rule);
    $("serverSeed").value = data.serverSeed;
    $("seedCommit").value = data.seedCommit;
    $("merkleRoot").value = data.merkleRoot;
    $("proof").value = JSON.stringify(data.proof);
    if (data.teeId) $("teeId").value = data.teeId;
}

$("load").addEventListener("click", async () => {
    try {
        await loadIntoForm();
        $("results").textContent = "Loaded from server, press Verify.";
    } catch (e) {
        fail(e.message);
    }
});

// Deep link: /verify?server=...&epoch=7&bet=42 loads and checks itself
(async () => {
    const q = new URLSearchParams(window.location.search);
    const server = q.get("server");
    const epoch = q.get("epoch");
    const bet = q.get("bet");
    if (server === null || epoch === null || bet === null) return;
    $("server").value = server;
    $("epochId").value = epoch;
    $("betId").value = bet;
    $("results").textContent = `Loading bet ${bet} of epoch ${epoch}...`;
    try {
        await loadIntoForm();
        render(runChecks(inputs()));
    } catch (e) {
        fail(e.message);
    }
})();
