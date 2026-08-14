"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
    play: () => Promise<void>;
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
    const phaseRef = useRef(phase);

    // latest closures, read only from handlers
    useEffect(() => {
        animateRef.current = animate;
        phaseRef.current = phase;
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

    const play = useCallback(async () => {
        // the ref guards across the await, state cannot
        if (busyRef.current) return;
        if (phaseRef.current === "revealing" || phaseRef.current === "revealed") return;
        busyRef.current = true;

        const handle = teeRef.current ?? (await arm());
        if (!handle || !aliveRef.current) {
            busyRef.current = false;
            return;
        }

        let record: PlayRecord;
        try {
            record = handle.play();
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
        setView(teeRef.current?.snapshot() ?? null);
        setPhase("settled");
    }, [arm]);

    const reveal = useCallback(() => {
        const handle = teeRef.current;
        if (!handle || (view?.plays.length ?? 0) === 0) return;
        setPhase("revealing");
        try {
            handle.reveal();
            setView(handle.snapshot());
            setPhase("revealed");
        } catch (err) {
            setError(err instanceof Error ? err.message : "reveal failed");
            setPhase("error");
        }
    }, [view]);

    const nextEpoch = useCallback(() => {
        const handle = teeRef.current;
        if (!handle) return;
        setView(handle.startNextEpoch());
        setLast(null);
        setPhase("ready");
    }, []);

    const plays = view?.plays ?? [];
    return {
        sectionRef,
        phase,
        view,
        last,
        error,
        plays,
        full: plays.length >= config.maxPlays,
        play,
        reveal,
        nextEpoch,
    };
}
