import { runChecks, loadFromServer } from "./widget-core.mjs";
import example from "./example.json";

const $ = (id) => document.getElementById(id);

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
        return `<div class="check ${cls}"><span class="dot">&#9679;</span> ${label} <small>${c.detail}</small></div>`;
    });
    $("results").innerHTML =
        rows.join("") +
        (result.allGreen
            ? `<p class="verdict green">All offline checks green. teeId ${result.teeId}</p>`
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
        $("results").innerHTML = `<p class="verdict red">${e.message}</p>`;
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
    $("results").innerHTML = "<p>Golden vector loaded, press Verify.</p>";
});

$("load").addEventListener("click", async () => {
    try {
        const data = await loadFromServer($("server").value.trim(), Number($("epochId").value), Number($("betId").value));
        $("receipt").value = JSON.stringify({ receipt: data.receipt, signature: data.signature }, null, 2);
        $("rule").value = JSON.stringify(data.rule);
        $("serverSeed").value = data.serverSeed;
        $("seedCommit").value = data.seedCommit;
        $("merkleRoot").value = data.merkleRoot;
        $("proof").value = JSON.stringify(data.proof);
        if (data.teeId) $("teeId").value = data.teeId;
        $("results").innerHTML = "<p>Loaded from server, press Verify.</p>";
    } catch (e) {
        $("results").innerHTML = `<p class="verdict red">${e.message}</p>`;
    }
});
