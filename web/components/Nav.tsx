import type { ReactNode } from "react";
import { DOCS_URL, VERIFY_URL } from "@/lib/links";

const LINKS = [
    ["Games", "#demo-roulette"],
    ["How it works", "#how-it-works"],
    ["Integrate", "#code"],
    ["FAQ", "#faq"],
] as const;

type NavProps = {
    home?: boolean;
    action?: ReactNode;
};

export default function Nav({ home = false, action }: NavProps) {
    const base = home ? "" : "/";
    return (
        <header className="sticky top-0 z-50">
            <div className="col grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-6 border border-line bg-white">
                <a href={home ? "#hero" : "/"} className="flex items-center justify-self-start">
                    <img src="/text-logo.svg" alt="Foreseer" className="h-8 w-auto" />
                </a>
                <nav className="hidden items-center gap-7 justify-self-center text-sm text-muted md:flex">
                    {LINKS.map(([label, href]) => (
                        <a key={href} href={base + href} className="transition-colors hover:text-ink">
                            {label}
                        </a>
                    ))}
                    <a href={DOCS_URL} className="transition-colors hover:text-ink">
                        Docs
                    </a>
                </nav>
                <span className="flex items-center gap-2 justify-self-end">
                    {action ?? (
                        <>
                            <a
                                href={VERIFY_URL}
                                className="rounded-full border border-line bg-white px-5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-ink"
                            >
                                Verify
                            </a>
                            <a
                                href="/dashboard"
                                className="rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-primary-hover"
                            >
                                Dashboard
                            </a>
                        </>
                    )}
                </span>
            </div>
        </header>
    );
}
