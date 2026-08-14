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

const GLYPHS = '0123456789abcdefx{}[]:,"';

export default function ReceiptWidget() {
    const [display, setDisplay] = useState<string | null>(null);
    const timers = useRef<number[]>([]);

    useEffect(() => {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        let raf = 0;
        const schedule = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
        const cycle = () => {
            timers.current = [];
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
            schedule(cycle, 10000);
        };
        cycle();
        return () => {
            cancelAnimationFrame(raf);
            timers.current.forEach(clearTimeout);
        };
    }, []);

    return (
        <div className="mx-auto mt-12 h-100 max-w-2xl overflow-hidden rounded-card border border-line bg-white/80 text-left backdrop-blur-sm">
            <pre
                className="keepcase h-full overflow-x-auto overflow-y-hidden px-5 py-4 text-[12.5px] leading-[1.7] text-ink"
                style={{ fontFamily: "var(--font-mono)" }}
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
