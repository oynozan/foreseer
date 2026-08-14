"use client";

import { useEffect, useRef, useState } from "react";
import example from "@/data/example.json";
import BorderGlow from "@/components/reactbits/BorderGlow";

const trunc = (hex: string) => hex.slice(0, 10) + "…" + hex.slice(-8);

const r = example.receipt;

const HEAD = `{
    "specVersion": ${r.specVersion},
    "codeVersion": "${trunc(r.codeVersion)}",
    "epochId": ${r.epochId},
    "betId": ${r.betId},
    "seedCommit": "${trunc(r.seedCommit)}",
    "clientSeed": "${r.clientSeed}",
    "nonce": ${r.nonce},
    "ruleHash": "${trunc(r.ruleHash)}",
    "draws": [`;
const DRAW = String(r.draws[0]);
const TAIL = `],
    "win": ${r.win},
    "payoutBp": ${r.payoutBp},
    "timestamp": ${r.timestamp},
    "signature": "${trunc(example.signature)}"
}`;
const LINES = (HEAD + DRAW + TAIL).split(/\r?\n/);
const TOTAL = LINES.reduce((n, line) => n + line.length + 1, 0);

const STATUS = [
    "EPOCH 1 OPEN · seedCommit published onchain",
    "PLAY · dice over 5000 · rolled 3725 · lost",
    `EPOCH 1 CLOSED · serverSeed ${trunc(example.serverSeed)} revealed`,
    `ANCHORED · merkleRoot ${trunc(example.merkleRoot)}`,
];

const CHECKS = ["signature", "commit", "outcome", "merkle"] as const;
const GLYPHS = '0123456789abcdefx{}[]:,"';

export default function ReceiptWidget() {
    const [display, setDisplay] = useState<string | null>(null);
    const [statusIdx, setStatusIdx] = useState(3);
    const [checksShown, setChecksShown] = useState(4);
    const timers = useRef<number[]>([]);

    useEffect(() => {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        let raf = 0;
        const schedule = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
        const cycle = () => {
            timers.current = [];
            setStatusIdx(0);
            setChecksShown(0);
            const t0 = performance.now();
            const tick = (now: number) => {
                const p = Math.min((now - t0) / 2200, 1);
                const cut = Math.floor(p * TOTAL);
                let idx = 0;
                const out = LINES.map((line) => {
                    let s = "";
                    for (let j = 0; j < line.length; j++, idx++) {
                        const ch = line[j];
                        s += idx < cut || ch === " " ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
                    }
                    idx++;
                    return s;
                }).join("\n");
                setDisplay(p < 1 ? out : null);
                if (p < 1) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
            schedule(() => setStatusIdx(1), 2500);
            schedule(() => setStatusIdx(2), 5000);
            schedule(() => setStatusIdx(3), 7500);
            CHECKS.forEach((_, i) => schedule(() => setChecksShown(i + 1), 7900 + i * 250));
            schedule(cycle, 13000);
        };
        cycle();
        return () => {
            cancelAnimationFrame(raf);
            timers.current.forEach(clearTimeout);
        };
    }, []);

    return (
        <BorderGlow className="mx-auto mt-14 max-w-2xl border-line text-left">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                <span className="flex gap-1.5" aria-hidden="true">
                    <i className="h-2 w-2 rounded-full border border-line" />
                    <i className="h-2 w-2 rounded-full border border-line" />
                    <i className="h-2 w-2 rounded-full border border-line" />
                </span>
                <span className="tech keepcase text-[11px] text-muted">
                    receipt · epoch {r.epochId} · bet {r.betId}
                </span>
                <span className="chip tech">.JSON</span>
            </div>
            <div className="tech keepcase border-b border-line px-5 py-2.5 text-[11px] text-muted">
                {STATUS[statusIdx]}
            </div>
            <pre
                className="keepcase overflow-x-auto px-5 py-4 text-[12.5px] leading-[1.7] text-ink"
                style={{ fontFamily: "var(--font-tech)" }}
            >
                {display === null ? (
                    <>
                        {HEAD}
                        <span className="text-primary">{DRAW}</span>
                        {TAIL}
                    </>
                ) : (
                    display
                )}
            </pre>
            <div className="border-t border-line px-5 py-4">
                <ul className="grid gap-2 sm:grid-cols-2">
                    {CHECKS.map((name, i) => (
                        <li
                            key={name}
                            className={`flex items-center justify-between rounded-md border border-line px-3 py-2 transition-opacity duration-300 ${
                                i < checksShown ? "opacity-100" : "opacity-30"
                            }`}
                        >
                            <span className="tech keepcase text-[11px] text-muted">{name}</span>
                            <span className="tech keepcase text-[11px] text-[#15803d]">
                                {i < checksShown ? "true" : "…"}
                            </span>
                        </li>
                    ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className={`chip tech transition-opacity duration-300 ${checksShown === 4 ? "opacity-100" : "opacity-0"}`}>
                        4 / 4 offline checks pass
                    </span>
                    <span className="text-[12px] text-muted">
                        Checks 2 and 4 are onchain reads against the attested TEE registry and the anchored commit.
                    </span>
                </div>
            </div>
        </BorderGlow>
    );
}
