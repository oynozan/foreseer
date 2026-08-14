"use client";

import { useState, type ReactNode } from "react";

const V = ({ children }: { children: ReactNode }) => <span className="text-primary">{children}</span>;

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

const TS_CODE = (
    <>
        {`import { dice, merkleProof, receiptDigest, toBytes } from "foreseer-sdk";
import { ReferenceTee } from "foreseer-sdk/reference";
import { `}
        <V>verifyCommit</V>, <V>verifyMerkleProof</V>, <V>verifyOutcome</V>, <V>verifyReceiptSignature</V>
        {` } from "foreseer-sdk/verify";

const tee = new ReferenceTee();
const { seedCommit } = tee.openEpoch();
const rule = dice({ target: 4999, mode: "over" });
const bet = tee.play({ clientSeed: "alice", rule });
console.log("rolled", bet.receipt.draws[0], bet.receipt.win ? "win" : "lose");
const signatureOk = `}
        <V>verifyReceiptSignature</V>
        {`(bet, tee.domain, tee.teeId).ok;
const { serverSeed, merkleRoot } = tee.closeEpoch();
const digest = receiptDigest(bet.receipt, tee.domain);
console.log({
    signature: signatureOk,
    commit: `}
        <V>verifyCommit</V>
        {`(serverSeed, seedCommit),
    outcome: `}
        <V>verifyOutcome</V>
        {`(bet.receipt, rule, serverSeed).ok,
    merkle: `}
        <V>verifyMerkleProof</V>
        {`(digest, merkleProof([digest], 0), toBytes(merkleRoot)),
});`}
    </>
);

const PY_CODE = (
    <>
        {`import hashlib, hmac

seed = bytes.fromhex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
block = hmac.new(seed, `}
        <V>b&quot;alice:0:0&quot;</V>
        {`, hashlib.sha256).digest()
x = int.from_bytes(block[:4], "big")
assert x < 4294960000          `}
        <span className="text-muted"># otherwise take the next 4 bytes</span>
        {`
print(x % 10000)               `}
        <span className="text-muted">
            # <V>3725</V>, matching the receipt
        </span>
    </>
);

const SH_CODE = (
    <>
        {`curl -X POST localhost:8787`}
        <V>/play</V>
        {` \\
  -H "x-api-key: $KEY" -H "content-type: application/json" \\
  -d '{"clientSeed":"alice","ruleHash":"0xdd9d...9125"}'`}
    </>
);

const SH_OUT = (
    <>
        {`{
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
        `}
        <V>&quot;win&quot;: true</V>
        {`,
        `}
        <V>&quot;payoutBp&quot;: 19800</V>
        {`,
        "timestamp": 1786591860
    },
    "signature": "0x2004931f...cdcec966..."
}`}
    </>
);

const TS_OUT = (
    <>
        <span className="text-muted">rolled … a fresh epoch seed each run</span>
        {`
{
    signature: `}
        <V>true</V>
        {`,
    commit: `}
        <V>true</V>
        {`,
    outcome: `}
        <V>true</V>
        {`,
    merkle: `}
        <V>true</V>
        {`
}`}
    </>
);

const PY_OUT = (
    <>
        <V>3725</V>
        {`
the draw in the golden receipt, recomputed
with nothing but the standard library`}
    </>
);

type Tab = {
    key: string;
    label: string;
    cap: string;
    outCap: string;
    outChip?: string;
    code: ReactNode;
    raw: string;
    out: ReactNode;
    note?: string;
};

const TABS: Tab[] = [
    { key: "ts", label: "TypeScript SDK", cap: "[ .TS ]", outCap: "[ .LOG ]", code: TS_CODE, raw: TS_RAW, out: TS_OUT },
    {
        key: "py",
        label: "Python, by hand",
        cap: "[ .PY ]",
        outCap: "[ .OUT ]",
        code: PY_CODE,
        raw: PY_RAW,
        out: PY_OUT,
        note: "No Foreseer code. Standard library only.",
    },
    { key: "sh", label: "curl", cap: "[ .SH ]", outCap: "[ .JSON ]", outChip: "[ 200 OK ]", code: SH_CODE, raw: SH_RAW, out: SH_OUT },
];

export default function CodeShowcase() {
    const [active, setActive] = useState(0);
    const [copied, setCopied] = useState(false);
    const tab = TABS[active];

    const copy = () => {
        navigator.clipboard.writeText(tab.raw).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        });
    };

    const onKeys = (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const next = (active + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
        setActive(next);
        (e.currentTarget.children[next] as HTMLElement)?.focus();
    };

    return (
        <div className="pt-12">
            <div className="text-center">
                <h2 className="text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">
                    Integrate the SDK, or verify <span className="text-primary">with no Foreseer code at all.</span>
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
                    The reference SDK, plain Python, or plain curl. The protocol is standard cryptography end to end.
                </p>
            </div>
            <div
                role="tablist"
                aria-label="Integration paths"
                className="mt-8 flex flex-wrap justify-center gap-2"
                onKeyDown={onKeys}
            >
                {TABS.map((t, i) => (
                    <button
                        key={t.key}
                        role="tab"
                        aria-selected={i === active}
                        tabIndex={i === active ? 0 : -1}
                        onClick={() => setActive(i)}
                        className={`tech rounded-full px-4 py-2 text-[11px] transition-colors ${
                            i === active
                                ? "bg-primary-soft text-primary"
                                : "border border-transparent text-muted hover:text-ink"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div key={tab.key} className="card fade-in mt-6 grid overflow-hidden md:grid-cols-[1.25fr_1fr]">
                <div className="border-b border-line md:border-b-0 md:border-r">
                    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                        <span className="chip tech">{tab.cap}</span>
                        {tab.note && <span className="text-[12px] text-muted">{tab.note}</span>}
                        <button onClick={copy} className="tech text-[11px] text-muted transition-colors hover:text-ink">
                            {copied ? "[ COPIED ]" : "[ COPY ]"}
                        </button>
                    </div>
                    <pre
                        className="keepcase overflow-x-auto px-5 py-4 text-[12.5px] leading-[1.75] text-ink"
                        style={{ fontFamily: "var(--font-tech)" }}
                    >
                        {tab.code}
                    </pre>
                </div>
                <div className="bg-bg-soft/60">
                    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                        <span className="chip tech">{tab.outCap}</span>
                        {tab.outChip && <span className="chip tech text-primary">{tab.outChip}</span>}
                    </div>
                    <pre
                        className="keepcase overflow-x-auto px-5 py-4 text-[12.5px] leading-[1.75] text-muted"
                        style={{ fontFamily: "var(--font-tech)" }}
                    >
                        {tab.out}
                    </pre>
                </div>
            </div>
        </div>
    );
}
