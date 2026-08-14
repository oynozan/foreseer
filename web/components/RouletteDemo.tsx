"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RouletteProof from "@/components/RouletteProof";
import RouletteStrip from "@/components/RouletteStrip";
import {
    GEO,
    MAX_SPINS,
    ORANGE_BAND_RULE,
    SPIN_EASE,
    SPIN_MS,
    cellUnderMarker,
    payoutMultiplier,
    pocketAtCell,
    restAfterSettle,
    resultLine,
    spinTarget,
    toneOf,
    translateXFor,
} from "@/lib/roulette";
import { ensureTee, type EpochView, type SpinRecord, type TeeHandle } from "@/lib/roulette-tee";

type Phase = "cold" | "arming" | "ready" | "spinning" | "settled" | "revealing" | "revealed" | "error";

const PILL = "rounded-full px-6 py-3 text-[14px] font-medium transition-colors";
const PRIMARY = `${PILL} bg-primary text-white hover:bg-primary-hover`;
const SECONDARY = `${PILL} border border-line bg-white text-ink hover:border-ink`;
const MUTED = `${PILL} border border-line bg-white text-muted`;

function geometry(): { pitch: number; cellWidth: number } {
    const narrow = typeof window !== "undefined" && window.innerWidth < 640;
    return narrow ? { pitch: GEO.pitchNarrow, cellWidth: GEO.cellNarrow } : { pitch: GEO.pitch, cellWidth: GEO.cell };
}

export default function RouletteDemo() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const cellsRef = useRef<HTMLDivElement>(null);
    const teeRef = useRef<TeeHandle | null>(null);
    const animRef = useRef<Animation | null>(null);
    const aliveRef = useRef(true);
    const busyRef = useRef(false);
    const restCellRef = useRef<number>(GEO.initialCell);
    const restJitterRef = useRef<number>(0);

    const [phase, setPhase] = useState<Phase>("cold");
    const [view, setView] = useState<EpochView | null>(null);
    const [last, setLast] = useState<SpinRecord | null>(null);
    const [announcement, setAnnouncement] = useState("");
    const [error, setError] = useState("");

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

    useEffect(() => {
        aliveRef.current = true;
        applyRest();
        return () => {
            aliveRef.current = false;
            animRef.current?.cancel();
        };
    }, [applyRest]);

    const arm = useCallback(async () => {
        if (teeRef.current) return teeRef.current;
        setPhase((p) => (p === "cold" ? "arming" : p));
        try {
            const handle = await ensureTee();
            if (!aliveRef.current) return null;
            teeRef.current = handle;
            setView(handle.snapshot());
            setPhase((p) => (p === "revealed" ? p : "ready"));
            return handle;
        } catch (err) {
            if (!aliveRef.current) return null;
            setError(err instanceof Error ? err.message : "could not start the engine");
            setPhase("error");
            return null;
        }
    }, []);

    useEffect(() => {
        const node = sectionRef.current;
        if (!node) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    io.disconnect();
                    void arm();
                }
            },
            { rootMargin: "400px 0px" },
        );
        io.observe(node);
        return () => io.disconnect();
    }, [arm]);

    const settle = useCallback(
        (record: SpinRecord, targetCell: number, jitter: number) => {
            restCellRef.current = restAfterSettle(targetCell);
            restJitterRef.current = jitter;
            applyRest();
            const el = cellsRef.current;
            if (el) {
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
                if (landed !== record.pocket) {
                    restJitterRef.current = 0;
                    restCellRef.current = restAfterSettle(targetCell);
                    applyRest();
                }
            }
            busyRef.current = false;
            if (!aliveRef.current) return;
            setLast(record);
            setView(teeRef.current?.snapshot() ?? null);
            setAnnouncement(resultLine(record.pocket, record.win, record.betId, record.epochId));
            setPhase("settled");
        },
        [applyRest],
    );

    const onSpin = useCallback(async () => {
        // the ref guards across the await, state cannot
        if (busyRef.current) return;
        if (phase === "spinning" || phase === "revealing" || phase === "revealed") return;
        busyRef.current = true;

        const handle = teeRef.current ?? (await arm());
        if (!handle || !aliveRef.current) {
            busyRef.current = false;
            return;
        }

        let record: SpinRecord;
        try {
            record = handle.spin();
        } catch (err) {
            busyRef.current = false;
            setError(err instanceof Error ? err.message : "spin failed");
            setPhase("error");
            return;
        }

        setPhase("spinning");
        setLast(null);
        const startCell = restCellRef.current;
        const { targetCell, jitter } = spinTarget({
            startCell,
            pocket: record.pocket,
            signature: record.signature,
        });
        const geo = geometry();
        const fromX = translateXFor({ cell: startCell, jitter: restJitterRef.current, ...geo });
        const toX = translateXFor({ cell: targetCell, jitter, ...geo });

        const el = cellsRef.current;
        if (!el) {
            busyRef.current = false;
            return;
        }
        animRef.current?.cancel();

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            settle(record, targetCell, jitter);
            return;
        }

        const anim = el.animate(
            [{ transform: `translate3d(${fromX}px,0,0)` }, { transform: `translate3d(${toX}px,0,0)` }],
            { duration: SPIN_MS, easing: SPIN_EASE, fill: "none" },
        );
        animRef.current = anim;
        anim.finished
            .then(() => {
                if (aliveRef.current) settle(record, targetCell, jitter);
            })
            .catch(() => {});
    }, [arm, phase, settle, view]);

    const onReveal = useCallback(() => {
        const handle = teeRef.current;
        if (!handle || (view?.spins.length ?? 0) === 0) return;
        setPhase("revealing");
        try {
            const result = handle.reveal();
            setView(handle.snapshot());
            setAnnouncement(
                `Epoch closed. ${result.checks.filter((c) => c.ok).length} of ${result.checks.length} checks green across ${result.receiptCount} receipts.`,
            );
            setPhase("revealed");
        } catch (err) {
            setError(err instanceof Error ? err.message : "reveal failed");
            setPhase("error");
        }
    }, [view]);

    const onNextEpoch = useCallback(() => {
        const handle = teeRef.current;
        if (!handle) return;
        setView(handle.startNextEpoch());
        setLast(null);
        setAnnouncement("");
        setPhase("ready");
    }, []);

    const spins = view?.spins ?? [];
    const full = spins.length >= MAX_SPINS;
    const spinning = phase === "spinning";
    const canSpin = !spinning && phase !== "revealing" && phase !== "revealed" && !full;

    return (
        <div ref={sectionRef} data-demo="roulette" className="pt-12" aria-busy={spinning}>
            <div className="max-w-2xl">
                <h2 className="text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">
                    Bet the orange band. <span className="text-primary">Recompute the result.</span>
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-muted">
                    Every spin bets the same thing: the ball lands in the orange band, pockets 1 through 7. Seven of
                    fifteen pockets win, so the rule pays {payoutMultiplier(ORANGE_BAND_RULE.payout_bp)}x at 99 percent
                    RTP. No stake, no chips, nothing to choose. The point is the receipt.
                </p>
            </div>

            <div className="mt-8">
                <RouletteStrip ref={cellsRef} />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <p role="status" aria-live="polite" aria-atomic="true" className="min-h-6 text-[14px]">
                    {last ? (
                        <>
                            <span
                                className={`chip tech mr-2 ${
                                    last.win ? "border-mint bg-mint text-mint-ink" : ""
                                }`}
                            >
                                pocket {last.pocket}
                            </span>
                            {last.win
                                ? `in the orange band. Pays ${payoutMultiplier(last.payoutBp)}x.`
                                : toneOf(last.pocket) === "green"
                                  ? "the green pocket. No payout."
                                  : "outside the orange band. No payout."}
                        </>
                    ) : (
                        <span className="text-muted">
                            {phase === "revealed"
                                ? "Epoch closed and verified below."
                                : spinning
                                  ? "Spinning."
                                  : "The seed behind these fifteen pockets is already fixed. You are looking at its SHA-256."}
                        </span>
                    )}
                </p>
                <span className="flex flex-wrap items-center gap-3">
                    <span className="tech text-[11px] text-muted">
                        {spins.length} / {MAX_SPINS} spins
                    </span>
                    {phase === "revealed" ? (
                        <button type="button" onClick={onNextEpoch} className={PRIMARY}>
                            Start a new epoch
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void onSpin()}
                            aria-disabled={!canSpin}
                            className={canSpin ? PRIMARY : MUTED}
                        >
                            {full ? "Epoch full" : spinning ? "Spinning" : "Spin the wheel"}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onReveal}
                        aria-disabled={spins.length === 0 || phase === "revealed" || spinning}
                        className={spins.length > 0 && phase !== "revealed" && !spinning ? SECONDARY : MUTED}
                    >
                        Reveal and verify
                    </button>
                </span>
            </div>

            {phase === "error" && (
                <div className="check red mt-6">
                    <span className="dot">&#9679;</span> {error}
                </div>
            )}

            <RouletteProof view={view} />
        </div>
    );
}
