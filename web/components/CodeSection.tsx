import { codeToHtml } from "shiki";
import CodeShowcase, { type ShowTab } from "@/components/CodeShowcase";

const TS_RAW = `import { dice, merkleProof, receiptDigest, toBytes } from "foreseer-sdk";
import { ReferenceTee } from "foreseer-sdk/reference";
import { verifyCommit, verifyMerkleProof, verifyOutcome, verifyReceiptSignature } from "foreseer-sdk/verify";

const tee = new ReferenceTee();
const { seedCommit } = tee.openEpoch();
const rule = dice({ target: 4999, mode: "over" });
const bet = tee.play({ clientSeed: "alice", rule });
console.log("rolled", bet.receipt.draws[0], bet.receipt.win ? "win" : "lose");
const signatureOk = verifyReceiptSignature(bet, tee.domain, tee.teeId).ok;
const { serverSeed, merkleRoot } = tee.closeEpoch();
const digest = receiptDigest(bet.receipt, tee.domain);
console.log({
    signature: signatureOk,
    commit: verifyCommit(serverSeed, seedCommit),
    outcome: verifyOutcome(bet.receipt, rule, serverSeed).ok,
    merkle: verifyMerkleProof(digest, merkleProof([digest], 0), toBytes(merkleRoot)),
});`;

const PY_RAW = `import hashlib, hmac

seed = bytes.fromhex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
block = hmac.new(seed, b"alice:0:0", hashlib.sha256).digest()
x = int.from_bytes(block[:4], "big")
assert x < 4294960000          # otherwise take the next 4 bytes
print(x % 10000)               # 3725, matching the receipt`;

const SH_RAW = `curl -X POST localhost:8787/play \\
  -H "x-api-key: $KEY" -H "content-type: application/json" \\
  -d '{"clientSeed":"alice","ruleHash":"0xdd9d...9125"}'`;

const SH_OUT_RAW = `{
    "epochId": 1,
    "betId": 0,
    "receipt": {
        "specVersion": 1,
        "epochId": 1,
        "betId": 0,
        "seedCommit": "0xd07fde38...ea9834ee",
        "clientSeed": "alice",
        "nonce": 0,
        "ruleHash": "0xdd9d92df...24779125",
        "draws": [7334],
        "win": true,
        "payoutBp": 19800,
        "timestamp": 1786591860
    },
    "signature": "0x2004931f...cdcec966..."
}`;

const THEME = "github-light";

export default async function CodeSection() {
    const [tsHtml, pyHtml, shHtml, shOutHtml] = await Promise.all([
        codeToHtml(TS_RAW, { lang: "typescript", theme: THEME }),
        codeToHtml(PY_RAW, { lang: "python", theme: THEME }),
        codeToHtml(SH_RAW, { lang: "bash", theme: THEME }),
        codeToHtml(SH_OUT_RAW, { lang: "json", theme: THEME }),
    ]);

    const tabs: ShowTab[] = [
        { key: "ts", label: "TypeScript SDK", cap: ".TS", outCap: ".LOG", codeHtml: tsHtml, raw: TS_RAW },
        {
            key: "py",
            label: "Python, by hand",
            cap: ".PY",
            outCap: ".OUT",
            note: "No Foreseer code. Standard library only.",
            codeHtml: pyHtml,
            raw: PY_RAW,
        },
        {
            key: "sh",
            label: "curl",
            cap: ".SH",
            outCap: ".JSON",
            outChip: "200 OK",
            codeHtml: shHtml,
            raw: SH_RAW,
            outHtml: shOutHtml,
        },
    ];

    return <CodeShowcase tabs={tabs} />;
}
