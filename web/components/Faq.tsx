"use client";

import { useState } from "react";

const QA: [string, string][] = [
    [
        "Is this provably fair, or actually fair?",
        "Foreseer makes outcomes tamper evident, not magically fair. The TEE necessarily knows outcomes during an epoch. What protects you is that its code is attested by Flare, its seed was committed before your bet, and every receipt is recomputable by anyone after the reveal.",
    ],
    [
        "What if the server lies to me?",
        "The server is untrusted for fairness. Every artifact it hands out is TEE-signed and player-recomputable, and the honest path is client-side: fetch the epoch, the rule, and the proof, then run the checks yourself. The server cannot lie to code it does not run.",
    ],
    [
        "Why should I trust the TEE?",
        "Only as far as Flare attestation: the registry binds the TEE's identity address to a measured image, and that address is what every signature check expects. Even if the enclave were broken, the commitment scheme still exposes tampering after the fact; what weakens is pre-reveal secrecy, not verifiability.",
    ],
    [
        "Is the TEE live right now?",
        "Not yet, and the difference matters. The Go engine, the attested image, and the contracts are real: the golden epoch is committed, anchored, and proof-verified on Coston2, and the extension is registered. But no Confidential Space VM is attached yet, so there are zero active TEE machines, and the reference server generates and stores epoch seeds itself, which it says plainly in its own code and README. Onchain anchoring is a manual step today, not an automated one. None of the verification math changes when the enclave is attached; what changes is who holds the seed.",
    ],
    [
        "Can operators build their own games?",
        "Yes. Rules are JSON data, not code: draws, comparisons, and, or, not, and mod, hashed canonically into every receipt. Dice and coinflip ship as presets; the docs build a three-card matching-ranks game from the same grammar. No implementation ever runs operator-supplied code.",
    ],
    [
        "What happens if a check fails?",
        "Keep the receipt: it is cryptographic evidence. A signature or outcome mismatch on a genuine receipt means the operator, the TEE image, or the data path misbehaved, and the receipt plus the anchored epoch is exactly what you show the world.",
    ],
    [
        "Is my bet private?",
        "Receipts are published per epoch so anyone can audit them, and your clientSeed appears in yours. If you want your bets unlinkable across sessions, use a fresh clientSeed each time; the SDK ships generateClientSeed() for exactly this.",
    ],
    [
        "Do I need an account or a wallet to verify?",
        "No. All read endpoints are public, and the browser widget runs entirely locally: nothing you paste leaves the page. Recomputing a roll by hand needs only a standard HMAC library.",
    ],
    [
        "What chain is this on?",
        "Coston2, Flare's public testnet, chain id 114. Contracts are deployed and the golden epoch is committed, anchored, and proof-verified over public RPC; extension registration in the Flare registry is the remaining step.",
    ],
];

function Item({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
    return (
        <div className="border-b border-line">
            <button
                aria-expanded={open}
                onClick={onToggle}
                className="flex w-full items-center justify-between gap-4 py-5 text-left"
            >
                <span className="text-[15px] font-medium">{q}</span>
                <span className={`plus ${open ? "open" : ""}`} aria-hidden="true" />
            </button>
            <div className={`acc ${open ? "open" : ""}`}>
                <div>
                    <p className="keepcase max-w-prose pb-5 text-[14px] leading-relaxed text-muted">{a}</p>
                </div>
            </div>
        </div>
    );
}

export default function Faq() {
    const [open, setOpen] = useState<number | null>(0);
    const half = Math.ceil(QA.length / 2);
    const cols = [QA.slice(0, half), QA.slice(half)];

    return (
        <div className="pt-12">
            <h2 className="text-center text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">
                Your <span className="text-primary">questions</span>, probably
            </h2>
            <div className="mt-10 grid gap-x-14 md:grid-cols-2">
                {cols.map((col, c) => (
                    <div key={c} className="border-t border-line">
                        {col.map(([q, a], i) => {
                            const idx = c * half + i;
                            return (
                                <Item
                                    key={q}
                                    q={q}
                                    a={a}
                                    open={open === idx}
                                    onToggle={() => setOpen(open === idx ? null : idx)}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
