import { CONTRACTS, DOCS, DOCS_URL, EXPLORER, VERIFY_URL } from "@/lib/links";

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
            ["Verifier widget", VERIFY_URL],
            ["Docs", DOCS_URL],
        ],
    ],
];

const ONCHAIN: [string, string][] = [
    ["ForeseerInstructionSender", CONTRACTS.instructionSender],
    ["OperatorBond", CONTRACTS.operatorBond],
];

export default function Footer() {
    return (
        <footer className="band">
            <div className="col grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr_1.6fr]">
                <div>
                    <img src="/logo.svg" alt="Foreseer" className="h-8 w-8" />
                    <p className="mt-5 max-w-64 text-sm leading-relaxed text-muted">
                        <strong className="font-medium text-ink">Tamper evident, by construction.</strong> Three
                        implementations, one spec, golden vectors in between.
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
                <div>
                    <h3 className="tech text-[11px] text-muted">Onchain, Coston2</h3>
                    <ul className="mt-4 space-y-2.5 text-sm">
                        {ONCHAIN.map(([label, address]) => (
                            <li key={label}>
                                <a
                                    href={EXPLORER + address}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-muted transition-colors hover:text-ink"
                                >
                                    {label}
                                </a>
                                <div className="tech keepcase text-[10px] text-muted/70">{address}</div>
                            </li>
                        ))}
                        <li className="tech keepcase text-[10px] text-muted/70">commitEpoch 0xee82feb5...28b2d5</li>
                        <li className="tech keepcase text-[10px] text-muted/70">anchorEpoch 0x293c0e32...d2529f</li>
                    </ul>
                </div>
            </div>
            <div className="border-t border-line">
                <div className="col flex flex-wrap items-center justify-between gap-3 py-5">
                    <span className="tech flex items-center gap-2.5 text-[11px] text-muted">
                        <span className="pulse" aria-hidden="true" />
                        LIVE ON COSTON2 · CHAIN ID 114 · GOLDEN EPOCH ANCHORED
                    </span>
                    <span className="tech text-[11px] text-muted">FORESEER-SPEC v0.1 · MIT</span>
                </div>
            </div>
        </footer>
    );
}
