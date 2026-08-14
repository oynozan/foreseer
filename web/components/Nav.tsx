import { DOCS_URL, VERIFY_URL } from "@/lib/links";

const LINKS = [
    ["Games", "#demo-roulette"],
    ["How it works", "#how-it-works"],
    ["Integrate", "#code"],
    ["FAQ", "#faq"],
] as const;

export default function Nav() {
    return (
        <header className="sticky top-0 z-50">
            <div
                className={`col flex h-16 items-center justify-between gap-6 border border-line transition-colors bg-white`}
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
                <span className="flex items-center gap-2">
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
                </span>
            </div>
        </header>
    );
}
