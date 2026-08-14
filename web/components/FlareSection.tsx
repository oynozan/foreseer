const ROWS: [string, string][] = [
    ["ATTEST", "Flare's registry binds the TEE identity to a measured code image."],
    ["EXECUTE", "Bets resolve inside the enclave and are signed with its identity key."],
    ["ANCHOR", "Every seed commitment and Merkle root lands on Coston2."],
];

const STACK = [
    ["/demo/flare-3.png", "-rotate-3 translate-y-6 -translate-x-4 scale-95"],
    ["/demo/flare-2.png", "rotate-2 translate-y-3 translate-x-3 scale-[0.975]"],
    ["/demo/flare-1.png", ""],
];

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
            </div>
            <div className="relative pb-8 pr-6" aria-label="Foreseer running on Flare Confidential Compute">
                {STACK.map(([src, cls]) => (
                    <img
                        key={src}
                        src={src}
                        alt=""
                        className={`rounded-stage border border-line shadow-[0_10px_36px_rgba(29,29,29,0.10)] ${cls} ${
                            cls ? "absolute inset-0" : "relative"
                        }`}
                    />
                ))}
            </div>
        </div>
    );
}
