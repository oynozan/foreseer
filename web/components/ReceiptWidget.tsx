"use client";

import { useEffect, useRef, useState } from "react";
import example from "@/data/example.json";

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
        <div className="mx-auto mt-14 max-w-2xl border border-line text-left">
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
        </div>
    );
}
