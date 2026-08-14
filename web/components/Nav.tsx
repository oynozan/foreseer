"use client";

import { useEffect, useState } from "react";
import { DOCS_URL, VERIFY_URL } from "@/lib/links";

const LINKS = [
    ["Games", "#demo-dice"],
    ["How it works", "#how-it-works"],
    ["Integrate", "#code"],
    ["FAQ", "#faq"],
] as const;

export default function Nav() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <header
            className={`sticky top-0 z-50 transition-colors ${
                scrolled ? "border-b border-line bg-white/85 backdrop-blur" : "border-b border-transparent"
            }`}
        >
            <div className="col flex h-16 items-center justify-between gap-6">
                <a href="#hero" className="flex items-center gap-3">
                    <img src="/text-logo.svg" alt="Foreseer" className="h-6 w-auto" />
                    <span className="chip tech">[ SPEC v0.1 ]</span>
                </a>
                <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
                    {LINKS.map(([label, href]) => (
                        <a key={href} href={href} className="transition-colors hover:text-ink">
                            {label}
                        </a>
                    ))}
                    <a href={DOCS_URL} className="transition-colors hover:text-ink">
                        Docs
                    </a>
                </nav>
                <a
                    href={VERIFY_URL}
                    className="tech rounded-full bg-primary px-4 py-2.5 text-[11px] font-medium text-white transition-colors hover:bg-primary-hover"
                >
                    [ VERIFY A BET ]
                </a>
            </div>
        </header>
    );
}
