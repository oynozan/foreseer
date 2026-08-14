"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
    const mq = matchMedia(QUERY);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
}

export default function HeroBackdrop() {
    const reduced = useSyncExternalStore(
        subscribe,
        () => matchMedia(QUERY).matches,
        () => true,
    );

    if (reduced) return null;

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.92)_0%,rgba(255,255,255,0.55)_45%,rgba(255,255,255,0)_100%)]" />
        </div>
    );
}
