"use client";

import { useCallback, useEffect, useRef } from "react";
import ProofPanel from "@/components/ProofPanel";
import { MUTED, PRIMARY, ROW, SECONDARY } from "@/lib/demo-ui";
import {
    COIN_RULE,
    FLIP_EASE,
    FLIP_MS,
    MAX_FLIPS,
    faceOf,
    flipTarget,
    restAfterFlip,
    resultLine,
} from "@/lib/coinflip";
import type { PlayRecord } from "@/lib/demo-tee";
import { useDemoEpoch } from "@/lib/use-demo-epoch";

const CONFIG = {
    key: "coinflip",
    rule: COIN_RULE,
    maxPlays: MAX_FLIPS,
    outcomeLabel: "Faces recompute from the seed",
};

const TOSS: Keyframe[] = [
    { transform: "translateY(0)", easing: "cubic-bezier(0.15, 0.7, 0.4, 1)" },
    { transform: "translateY(-48px)", offset: 0.5, easing: "cubic-bezier(0.6, 0, 0.85, 0.3)" },
    { transform: "translateY(0)" },
];

export default function CoinflipDemo() {
    const coinRef = useRef<HTMLDivElement>(null);
    const tossRef = useRef<HTMLDivElement>(null);
    const animRef = useRef<Animation | null>(null);
    const restDegRef = useRef<number>(0);

    const applyRest = useCallback(() => {
        const el = coinRef.current;
        if (el) el.style.transform = `rotateX(${restDegRef.current}deg)`;
    }, []);

    const animate = useCallback(
        (record: PlayRecord) => {
            const el = coinRef.current;
            if (!el) return;
            const fromDeg = restDegRef.current;
            const { targetDeg } = flipTarget({ fromDeg, draw: record.draw, signature: record.signature });
            animRef.current?.cancel();

            const park = () => {
                restDegRef.current = restAfterFlip(targetDeg);
                applyRest();
            };
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                park();
                return;
            }
            tossRef.current?.animate(TOSS, { duration: FLIP_MS, fill: "none" });
            const anim = el.animate([{ transform: `rotateX(${fromDeg}deg)` }, { transform: `rotateX(${targetDeg}deg)` }], {
                duration: FLIP_MS,
                easing: FLIP_EASE,
                fill: "none",
            });
            animRef.current = anim;
            return anim.finished.then(park);
        },
        [applyRest],
    );

    const { sectionRef, phase, view, last, error, full, play, reveal, nextEpoch } = useDemoEpoch(CONFIG, animate);

    useEffect(() => {
        applyRest();
        return () => animRef.current?.cancel();
    }, [applyRest]);

    const flipping = phase === "playing";
    const canFlip = !flipping && phase !== "revealing" && phase !== "revealed" && !full;
    const canReveal = (view?.plays.length ?? 0) > 0 && phase !== "revealed" && !flipping;

    return (
        <div ref={sectionRef} data-demo="coinflip" className="pt-12" aria-busy={flipping}>
            <h2 className="text-[clamp(24px,2.4vw,30px)] font-medium leading-[1.15] tracking-[-0.02em]">
                Heads or tails, <span className="text-primary">decided in advance.</span>
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
                The same protocol as the wheel, with two outcomes instead of fifteen.
            </p>

            <div
                className="mt-8 grid h-52 place-items-center rounded-card border border-line bg-white"
                style={{ perspective: "900px" }}
                aria-hidden="true"
            >
                <div ref={tossRef}>
                    <div ref={coinRef} data-coin className="coin size-28">
                        <span className="coin-face tech bg-primary text-[13px] text-white">Heads</span>
                        <span className="coin-face coin-back tech bg-ink text-[13px] text-white">Tails</span>
                    </div>
                </div>
            </div>

            <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
                data-result-face={last ? faceOf(last.draw) : undefined}
            >
                {phase === "revealed"
                    ? "Epoch closed. Every face recomputed below."
                    : last
                      ? resultLine(last.draw, last.betId, last.epochId)
                      : ""}
            </p>

            <div className={`${ROW} sm:justify-end`}>
                {phase === "revealed" ? (
                    <button type="button" onClick={nextEpoch} className={PRIMARY}>
                        Start a new epoch
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => void play()}
                        aria-disabled={!canFlip}
                        className={canFlip ? PRIMARY : MUTED}
                    >
                        {full ? "Epoch full" : flipping ? "Flipping" : "Flip the coin"}
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
