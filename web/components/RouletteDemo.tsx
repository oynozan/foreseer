"use client";

import { useCallback, useEffect, useRef } from "react";
import ProofPanel from "@/components/ProofPanel";
import RouletteStrip from "@/components/RouletteStrip";
import { MUTED, PRIMARY, ROW, SECONDARY } from "@/lib/demo-ui";
import {
    GEO,
    MAX_SPINS,
    SPIN_EASE,
    SPIN_MS,
    WHEEL_RULE,
    cellUnderMarker,
    pocketAtCell,
    restAfterSettle,
    resultLine,
    spinTarget,
    translateXFor,
} from "@/lib/roulette";
import type { PlayRecord } from "@/lib/demo-tee";
import { useDemoEpoch } from "@/lib/use-demo-epoch";

const CONFIG = {
    key: "roulette",
    rule: WHEEL_RULE,
    maxPlays: MAX_SPINS,
    outcomeLabel: "Pockets recompute from the seed",
};

function geometry(): { pitch: number; cellWidth: number } {
    const narrow = typeof window !== "undefined" && window.innerWidth < 640;
    return narrow ? { pitch: GEO.pitchNarrow, cellWidth: GEO.cellNarrow } : { pitch: GEO.pitch, cellWidth: GEO.cell };
}

export default function RouletteDemo() {
    const cellsRef = useRef<HTMLDivElement>(null);
    const animRef = useRef<Animation | null>(null);
    const restCellRef = useRef<number>(GEO.initialCell);
    const restJitterRef = useRef<number>(0);

    const applyRest = useCallback(() => {
        const el = cellsRef.current;
        if (!el) return;
        const geo = geometry();
        el.style.transform = `translate3d(${translateXFor({
            cell: restCellRef.current,
            jitter: restJitterRef.current,
            ...geo,
        })}px,0,0)`;
    }, []);

    const park = useCallback(
        (record: PlayRecord, targetCell: number, jitter: number) => {
            restCellRef.current = restAfterSettle(targetCell);
            restJitterRef.current = jitter;
            applyRest();
            const geo = geometry();
            const landed = pocketAtCell(
                Math.round(
                    cellUnderMarker({
                        translateX: translateXFor({ cell: restCellRef.current, jitter, ...geo }),
                        ...geo,
                    }),
                ),
            );
            // The pixels must agree with the receipt, always.
            if (landed !== record.draw) {
                restJitterRef.current = 0;
                applyRest();
            }
        },
        [applyRest],
    );

    const animate = useCallback(
        (record: PlayRecord) => {
            const el = cellsRef.current;
            if (!el) return;
            const startCell = restCellRef.current;
            const { targetCell, jitter } = spinTarget({
                startCell,
                pocket: record.draw,
                signature: record.signature,
            });
            const geo = geometry();
            const fromX = translateXFor({ cell: startCell, jitter: restJitterRef.current, ...geo });
            const toX = translateXFor({ cell: targetCell, jitter, ...geo });
            animRef.current?.cancel();

            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                park(record, targetCell, jitter);
                return;
            }
            const anim = el.animate(
                [{ transform: `translate3d(${fromX}px,0,0)` }, { transform: `translate3d(${toX}px,0,0)` }],
                { duration: SPIN_MS, easing: SPIN_EASE, fill: "none" },
            );
            animRef.current = anim;
            return anim.finished.then(() => park(record, targetCell, jitter));
        },
        [park],
    );

    const { sectionRef, phase, view, last, error, full, canPlay, canReveal, closed, play, reveal, nextEpoch } =
        useDemoEpoch(CONFIG, animate);

    useEffect(() => {
        applyRest();
        return () => animRef.current?.cancel();
    }, [applyRest]);

    const spinning = phase === "playing";

    return (
        <div ref={sectionRef} data-demo="roulette" className="pt-12" aria-busy={spinning}>
            <div>
                <h2 className="text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">
                    The roll was determined <span className="text-primary">before you played.</span>
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-muted">
                    The wheel spins on demand, not on a shared timer. Its seed was committed before your first spin, so
                    every pocket was already decided.
                </p>
            </div>

            <div className="mt-8">
                <RouletteStrip ref={cellsRef} />
            </div>

            <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
                data-result-pocket={last ? last.draw : undefined}
            >
                {phase === "revealed"
                    ? "Epoch closed. Every pocket recomputed below."
                    : last
                      ? resultLine(last.draw, last.betId, last.epochId)
                      : ""}
            </p>

            <div className={`${ROW} sm:justify-end`}>
                {closed ? (
                    <button type="button" onClick={nextEpoch} className={PRIMARY}>
                        Start a new epoch
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => void play()}
                        aria-disabled={!canPlay}
                        className={canPlay ? PRIMARY : MUTED}
                    >
                        {full ? "Epoch full" : spinning ? "Spinning" : "Spin the wheel"}
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
