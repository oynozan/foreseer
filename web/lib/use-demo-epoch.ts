"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Rule } from "foreseer-sdk";
import { ensureTee, type DemoConfig, type EpochView, type PlayRecord, type TeeHandle } from "@/lib/demo-tee";

export type Phase = "cold" | "arming" | "ready" | "playing" | "settled" | "revealing" | "revealed" | "error";

export interface DemoEpoch {
    sectionRef: React.RefObject<HTMLDivElement | null>;
    phase: Phase;
    view: EpochView | null;
    last: PlayRecord | null;
    error: string;
    plays: PlayRecord[];
    full: boolean;
    canPlay: boolean;
    canReveal: boolean;
    closed: boolean;
    play: (rule?: Rule) => Promise<void>;
    reveal: () => void;
    nextEpoch: () => void;
}

export function useDemoEpoch(config: DemoConfig, animate: (record: PlayRecord) => Promise<void> | void): DemoEpoch {
    const sectionRef = useRef<HTMLDivElement>(null);
    const teeRef = useRef<TeeHandle | null>(null);
    const aliveRef = useRef(true);
    const busyRef = useRef(false);
    const animateRef = useRef(animate);

    const [phase, setPhase] = useState<Phase>("cold");
    const [view, setView] = useState<EpochView | null>(null);
    const [last, setLast] = useState<PlayRecord | null>(null);
    const [error, setError] = useState("");

    // latest closure, read only from handlers
    useEffect(() => {
        animateRef.current = animate;
    });

    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    const arm = useCallback(async () => {
        if (teeRef.current) return teeRef.current;
        setPhase((p) => (p === "cold" ? "arming" : p));
        try {
            const handle = await ensureTee(config);
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
    }, [config]);

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

    const play = useCallback(
        async (rule?: Rule) => {
            // the engine state decides, never the rendered phase
            if (busyRef.current) return;
            busyRef.current = true;

            const handle = teeRef.current ?? (await arm());
            if (!handle || !aliveRef.current) {
                busyRef.current = false;
                return;
            }
            const now = handle.snapshot();
            if (!now.open || now.plays.length >= config.maxPlays) {
                busyRef.current = false;
                setView(now);
                return;
            }

            let record: PlayRecord;
            try {
                record = handle.play(rule);
            } catch (err) {
                busyRef.current = false;
                setError(err instanceof Error ? err.message : "play failed");
                setPhase("error");
                return;
            }

            setPhase("playing");
            setLast(null);
            try {
                await animateRef.current(record);
            } catch {
                // a cancelled animation still settles on the receipt
            }
            busyRef.current = false;
            if (!aliveRef.current) return;
            setLast(record);
            setView(handle.snapshot());
            setPhase("settled");
        },
        [arm, config.maxPlays],
    );

    const reveal = useCallback(() => {
        if (busyRef.current) return;
        const handle = teeRef.current;
        if (!handle) return;
        const now = handle.snapshot();
        if (!now.open || now.plays.length === 0) return;

        busyRef.current = true;
        setPhase("revealing");
        try {
            handle.reveal();
            setView(handle.snapshot());
            setPhase("revealed");
        } catch (err) {
            setView(handle.snapshot());
            setError(err instanceof Error ? err.message : "reveal failed");
            setPhase("error");
        }
        busyRef.current = false;
    }, []);

    const nextEpoch = useCallback(() => {
        if (busyRef.current) return;
        const handle = teeRef.current;
        if (!handle) return;
        try {
            setView(handle.startNextEpoch());
            setLast(null);
            setError("");
            setPhase("ready");
        } catch (err) {
            setError(err instanceof Error ? err.message : "could not open an epoch");
            setPhase("error");
        }
    }, []);

    const plays = view?.plays ?? [];
    const full = plays.length >= config.maxPlays;
    const open = view === null || view.open;
    const busy = phase === "playing" || phase === "revealing";

    return {
        sectionRef,
        phase,
        view,
        last,
        error,
        plays,
        full,
        canPlay: open && !busy && !full,
        canReveal: open && !busy && plays.length > 0,
        closed: view !== null && !view.open,
        play,
        reveal,
        nextEpoch,
    };
}
