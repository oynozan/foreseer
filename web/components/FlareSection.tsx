const FCC_URL = "https://dev.flare.network/fcc/overview";

const ROWS: [string, string][] = [
    ["ATTEST", "Flare's registry binds the TEE identity to a measured code image."],
    ["EXECUTE", "Bets resolve inside the enclave and are signed with its identity key."],
    ["ANCHOR", "Every seed commitment and Merkle root lands on Coston2."],
];

const SHEET = "absolute inset-0 rounded-stage border border-line shadow-[0_10px_36px_rgba(29,29,29,0.10)]";
const EASE = "transition-transform duration-500 ease-out";

export default function FlareSection() {
    return (
        <div className="grid items-center gap-12 pt-12 lg:grid-cols-[2fr_3fr] lg:gap-16">
            <div>
                <h2 className="text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">
                    Attested compute, <span className="text-primary">anchored on Flare.</span>
                </h2>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
                    The outcome engine runs as a Flare Confidential Compute extension. You never trust our servers, you
                    trust the attested image and the chain.
                </p>
                <ul className="mt-8 divide-y divide-line border-y border-line">
                    {ROWS.map(([tag, text]) => (
                        <li key={tag} className="flex items-baseline gap-5 py-3.5">
                            <span className="tech w-20 shrink-0 text-[11px] text-primary">{tag}</span>
                            <span className="text-[14px] leading-relaxed text-muted">{text}</span>
                        </li>
                    ))}
                </ul>
                <a
                    href={FCC_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="group mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-ink"
                >
                    Read the Flare Confidential Compute docs
                    <span className="text-primary transition-transform duration-200 group-hover:translate-x-1">-&gt;</span>
                </a>
            </div>
            <a
                href={FCC_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Foreseer running on Flare Confidential Compute, read the Flare docs"
                className="group relative block pt-2 md:px-10 md:pt-6 md:pb-14"
            >
                <img
                    src="/demo/flare-3.png"
                    alt=""
                    className={`${SHEET} ${EASE} hidden -translate-x-5 translate-y-9 -rotate-6 scale-95 md:block group-hover:-translate-x-9 group-hover:translate-y-11 group-hover:-rotate-9`}
                />
                <img
                    src="/demo/flare-2.png"
                    alt=""
                    className={`${SHEET} ${EASE} hidden translate-x-4 translate-y-4.5 rotate-3 scale-[0.975] md:block group-hover:translate-x-7 group-hover:translate-y-6 group-hover:rotate-5`}
                />
                <img
                    src="/demo/flare-1.png"
                    alt="The Foreseer TEE extension running on Flare Confidential Compute"
                    className={`relative w-full rounded-stage border border-line shadow-[0_10px_36px_rgba(29,29,29,0.10)] ${EASE} md:-rotate-2 group-hover:md:-translate-y-1.5 group-hover:md:rotate-0 group-hover:md:scale-[1.02]`}
                />
            </a>
        </div>
    );
}
