"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ProofPanel from "@/components/ProofPanel";
import { MUTED, PRIMARY, ROW, SECONDARY } from "@/lib/demo-ui";
import {
    DEFAULT_MODE,
    DEFAULT_TARGET,
    MAX_ROLLS,
    MAX_TARGET,
    MIN_TARGET,
    ROLL_EASE,
    ROLL_MS,
    type Mode,
    clampTarget,
    diceRule,
    offsetPx,
    resultLine,
    rollFraction,
    rollLabel,
    trackOffset,
    zoneGradient,
} from "@/lib/dice";
import type { PlayRecord } from "@/lib/demo-tee";
import { useDemoEpoch } from "@/lib/use-demo-epoch";

const CONFIG = {
    key: "dice",
    rule: diceRule(DEFAULT_TARGET, DEFAULT_MODE),
    maxPlays: MAX_ROLLS,
    outcomeLabel: "Rolls recompute from the seed",
};

const MODES: Mode[] = ["under", "over"];
const mono = { fontFamily: "var(--font-mono)" };

export default function DiceDemo() {
    const trackRef = useRef<HTMLDivElement>(null);
    const handRef = useRef<HTMLDivElement>(null);
    const animRef = useRef<Animation | null>(null);
    const restFracRef = useRef(0);

    const [target, setTarget] = useState(DEFAULT_TARGET);
    const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
    const [rolledWith, setRolledWith] = useState<{ target: number; mode: Mode } | null>(null);

    const applyRest = useCallback(() => {
        const el = handRef.current;
        if (el) el.style.left = trackOffset(restFracRef.current);
    }, []);

    const animate = useCallback(
        (record: PlayRecord) => {
            const el = handRef.current;
            const track = trackRef.current;
            if (!el || !track) return;
            const from = restFracRef.current;
            const to = rollFraction(record.draw);
            const width = track.clientWidth;
            const park = () => {
                restFracRef.current = to;
                applyRest();
            };
            animRef.current?.cancel();

            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                park();
                return;
            }
            const anim = el.animate(
                [{ left: `${offsetPx(from, width)}px` }, { left: `${offsetPx(to, width)}px` }],
                { duration: ROLL_MS, easing: ROLL_EASE, fill: "none" },
            );
            animRef.current = anim;
            return anim.finished.then(park);
        },
        [applyRest],
    );

    const { sectionRef, phase, view, last, error, full, canPlay, canReveal, closed, play, reveal, nextEpoch } =
        useDemoEpoch(CONFIG, animate);

    useEffect(() => {
        applyRest();
        return () => animRef.current?.cancel();
    }, [applyRest]);

    const rolling = phase === "playing";
    // the reading only stands while the selection still matches the receipt
    const fresh = last !== null && rolledWith?.target === target && rolledWith?.mode === mode;

    const onRoll = () => {
        setRolledWith({ target, mode });
        void play(diceRule(target, mode));
    };

    return (
        <div ref={sectionRef} data-demo="dice" className="pt-12" aria-busy={rolling}>
            <h2 className="text-[clamp(24px,2.4vw,30px)] font-medium leading-[1.15] tracking-[-0.02em]">
                Under or over, <span className="text-primary">rolled in advance.</span>
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
                Pick a number and a direction. The roll was fixed before you pressed play.
            </p>

            <div className="mt-8 flex h-52 flex-col justify-center gap-7 rounded-card border border-line bg-white px-5">
                <div className="flex items-center justify-between gap-4">
                    <div className="inline-flex rounded-full border border-line p-0.5" role="group" aria-label="Direction">
                        {MODES.map((m) => (
                            <button
                                key={m}
                                type="button"
                                data-mode={m}
                                aria-pressed={mode === m}
                                onClick={() => setMode(m)}
                                className={`rounded-full px-4 py-1.5 text-[13px] font-medium capitalize transition-colors ${
                                    mode === m ? "bg-ink text-white" : "text-muted hover:text-ink"
                                }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                    <span data-target className="keepcase text-[15px] text-ink" style={mono}>
                        {target}.00
                    </span>
                </div>

                <div ref={trackRef} className="relative">
                    <div
                        ref={handRef}
                        data-hand
                        data-roll={fresh && last ? rollLabel(last.draw) : undefined}
                        className="pointer-events-none absolute bottom-full mb-3 flex -translate-x-1/2 flex-col items-center gap-1.5"
                        aria-hidden="true"
                    >
                        <span className="keepcase min-h-4 text-[13px] text-ink" style={mono}>
                            {fresh && last ? rollLabel(last.draw) : ""}
                        </span>
                        <span className="dice-caret" />
                    </div>
                    <div
                        data-zones
                        className="h-2.5 rounded-full"
                        style={{ background: zoneGradient(target, mode) }}
                        aria-hidden="true"
                    />
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={target}
                        onChange={(e) => setTarget(clampTarget(Number(e.target.value)))}
                        aria-label={`Roll ${mode} this number`}
                        aria-valuetext={`${target}.00`}
                        className="dice-range absolute inset-x-0 top-1/2 -translate-y-1/2"
                    />
                </div>

                <div className="tech flex justify-between text-[11px] text-muted" aria-hidden="true">
                    <span>{MIN_TARGET - 1}</span>
                    <span>{MAX_TARGET + 1}</span>
                </div>
            </div>

            <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
                data-result-roll={last ? rollLabel(last.draw) : undefined}
            >
                {phase === "revealed"
                    ? "Epoch closed. Every roll recomputed below."
                    : last && rolledWith
                      ? resultLine(last.draw, rolledWith.target, rolledWith.mode, last.betId, last.epochId)
                      : ""}
            </p>

            <div className={ROW}>
                {closed ? (
                    <button type="button" onClick={nextEpoch} className={PRIMARY}>
                        Start a new epoch
                    </button>
                ) : (
                    <button type="button" onClick={onRoll} aria-disabled={!canPlay} className={canPlay ? PRIMARY : MUTED}>
                        {full ? "Epoch full" : rolling ? "Rolling" : "Roll the dice"}
                    </button>
                )}
                <button
                    type="button"
                    onClick={reveal}
                    aria-disabled={!canReveal}
                    className={canReveal ? SECONDARY : MUTED}
                >
                    Reveal and verify
                </button>
            </div>

            {phase === "error" && <p className="mt-4 text-[13px] text-red">{error}</p>}

            <ProofPanel view={view} />
        </div>
    );
}
