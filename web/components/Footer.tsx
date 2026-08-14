import { DOCS, DOCS_URL, VERIFY_URL } from "@/lib/links";

const COLUMNS: [string, [string, string][]][] = [
    [
        "Protocol",
        [
            ["How it works", DOCS.howItWorks],
            ["Game rules", DOCS.rules],
            ["Architecture", DOCS.architecture],
            ["Security model", DOCS.security],
        ],
    ],
    [
        "Integrate",
        [
            ["Server API", DOCS.api],
            ["TypeScript SDK", DOCS.sdk],
            ["Verifier", VERIFY_URL],
            ["Dashboard", "/dashboard"],
            ["Docs", DOCS_URL],
        ],
    ],
];

export default function Footer() {
    return (
        <footer className="band">
            <div className="col grid gap-12 py-16 md:grid-cols-[1.8fr_1fr_1fr]">
                <div>
                    <img src="/text-logo.svg" alt="Foreseer" className="h-7 w-auto" />
                    <p className="mt-5 max-w-72 text-sm leading-relaxed text-muted">
                        Provably fair outcomes for iGaming, on Flare Confidential Compute. Verify any bet in your
                        browser.
                    </p>
                </div>
                {COLUMNS.map(([title, links]) => (
                    <div key={title}>
                        <h3 className="tech text-[11px] text-muted">{title}</h3>
                        <ul className="mt-4 space-y-2.5 text-sm">
                            {links.map(([label, href]) => (
                                <li key={label}>
                                    <a href={href} className="text-muted transition-colors hover:text-ink">
                                        {label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </footer>
    );
}
