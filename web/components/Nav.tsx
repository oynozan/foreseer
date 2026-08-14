"use client";

import { useEffect, useState } from "react";
import { DOCS_URL, VERIFY_URL } from "@/lib/links";

const LINKS = [
    ["Games", "#demo-roulette"],
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
        <header className="sticky top-0 z-50">
            <div
                className={`col flex h-16 items-center justify-between gap-6 border-b transition-colors ${
                    scrolled ? "border-line bg-white/85 backdrop-blur" : "border-transparent"
                }`}
            >
                <a href="#hero" className="flex items-center">
                    <img src="/text-logo.svg" alt="Foreseer" className="h-8 w-auto" />
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
                    className="rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-primary-hover"
                >
                    Verify a bet
                </a>
            </div>
        </header>
    );
}
