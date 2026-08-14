import Band from "@/components/Band";
import ReceiptWidget from "@/components/ReceiptWidget";
import { DOCS_URL, VERIFY_URL } from "@/lib/links";

const CHIPS: [string, string, string, string][] = [
    ["[ SHA256(serverSeed) ]", "7%", "27%", "-3deg"],
    ["[ EIP-712 SIGNED ]", "79%", "31%", "2deg"],
    ["[ CHAIN ID 114 ]", "4%", "55%", "2deg"],
    ["[ SPEC v0.1 ]", "83%", "62%", "-2deg"],
];

export default function Hero() {
    return (
        <Band id="hero" meta={["[ 01 / 07 ]", "PROTOCOL // COMMIT BEFORE BET //"]}>
            <div className="relative pt-16 text-center md:pt-24">
                <div className="absolute inset-x-0 top-0 hidden h-full md:block" aria-hidden="true">
                    {CHIPS.map(([label, left, top, rot], i) => (
                        <span
                            key={label}
                            className="chip tech keepcase float-chip"
                            style={{ left, top, "--rot": rot, "--d": `${i * 1.3}s` } as React.CSSProperties}
                        >
                            {label}
                        </span>
                    ))}
                </div>
                <h1 className="mx-auto max-w-5xl text-[clamp(38px,5.5vw,62px)] font-medium leading-[1.05] tracking-[-0.02em]">
                    The house locks its randomness
                    <br className="hidden md:block" /> <span className="text-primary">before you bet.</span>
                </h1>
                <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted">
                    Foreseer resolves game outcomes inside an attested TEE on Flare Confidential Compute. Every bet
                    returns a signed receipt that anyone can recompute, offline, in a browser.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <a
                        href={VERIFY_URL}
                        className="tech rounded-full bg-primary px-6 py-3 text-[12px] font-medium text-white transition-colors hover:bg-primary-hover"
                    >
                        [ VERIFY A BET ]
                    </a>
                    <a
                        href={DOCS_URL}
                        className="tech rounded-full border border-line bg-white px-6 py-3 text-[12px] font-medium text-ink transition-colors hover:border-ink"
                    >
                        [ READ THE DOCS ]
                    </a>
                </div>
                <div className="mt-6 flex flex-wrap justify-center gap-2 md:hidden" aria-hidden="true">
                    {CHIPS.map(([label]) => (
                        <span key={label} className="chip tech keepcase">
                            {label}
                        </span>
                    ))}
                </div>
                <ReceiptWidget />
            </div>
        </Band>
    );
}
