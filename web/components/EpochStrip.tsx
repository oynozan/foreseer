"use client";

import { useEffect, useState } from "react";
import example from "@/data/example.json";
import { useReducedMotion } from "@/lib/useReducedMotion";

const trunc = (hex: string) => hex.slice(0, 10) + "…" + hex.slice(-6);

const PHASES: [string, string][] = [
    ["COMMIT", `seedCommit ${trunc(example.seedCommit)}`],
    ["PLAY", "draws [3725] · dice over 5000 · lost"],
    ["REVEAL", `serverSeed ${trunc(example.serverSeed)}`],
    ["ANCHOR", `merkleRoot ${trunc(example.merkleRoot)}`],
];

export default function EpochStrip() {
    const reduced = useReducedMotion();
    const [active, setActive] = useState(0);

    useEffect(() => {
        if (reduced) return;
        const id = setInterval(() => setActive((a) => (a + 1) % PHASES.length), 2600);
        return () => clearInterval(id);
    }, [reduced]);

    return (
        <div className="mx-auto mt-14 max-w-3xl">
            <div className="relative">
                <div className="absolute inset-x-[12.5%] top-[5px] h-px bg-line" />
                {!reduced && (
                    <span
                        className="absolute top-[2px] h-2 w-2 -translate-x-1/2 rounded-full bg-primary transition-[left] duration-700 ease-out"
                        style={{ left: `${12.5 + active * 25}%` }}
                    />
                )}
                <ol className="relative grid grid-cols-4">
                    {PHASES.map(([label], i) => (
                        <li key={label} className="flex flex-col items-center gap-2.5">
                            <span
                                className={`h-[11px] w-[11px] rounded-full border bg-white transition-colors ${
                                    reduced || i === active ? "border-primary" : "border-line"
                                }`}
                            />
                            <span
                                className={`tech text-[11px] transition-colors ${
                                    reduced || i === active ? "text-ink" : "text-muted"
                                }`}
                            >
                                {label}
                            </span>
                        </li>
                    ))}
                </ol>
            </div>
            <p
                className="keepcase mt-3 min-h-5 text-center text-[12.5px] text-muted"
                style={{ fontFamily: "var(--font-mono)" }}
            >
                {reduced ? "commit · play · reveal · anchor" : PHASES[active][1]}
            </p>
        </div>
    );
}
