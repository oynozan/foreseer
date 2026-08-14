"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [armed, setArmed] = useState(false);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        if (el.getBoundingClientRect().top < window.innerHeight) return;
        setArmed(true);
        const io = new IntersectionObserver(
            ([e]) => {
                if (e.isIntersecting) {
                    setInView(true);
                    io.disconnect();
                }
            },
            { threshold: 0.25 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <div ref={ref} className={`reveal ${armed && !inView ? "armed" : ""} ${className}`}>
            {children}
        </div>
    );
}
