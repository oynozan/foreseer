"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
    const mq = matchMedia(QUERY);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
}

export function useReducedMotion(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => matchMedia(QUERY).matches,
        () => true,
    );
}
