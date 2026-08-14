import type { ReactNode } from "react";

type DemoSectionProps = {
    demo: string;
    title: ReactNode;
    sub: string;
    header: string;
    chip: string;
    footer: string;
    reverse?: boolean;
    children: ReactNode;
};

function DemoSection({ demo, title, sub, header, chip, footer, reverse, children }: DemoSectionProps) {
    return (
        <div className="grid items-center gap-10 pt-12 md:grid-cols-2 md:gap-14">
            <div className={reverse ? "md:order-2" : ""}>
                <h2 className="text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">{title}</h2>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">{sub}</p>
            </div>
            <div className={`card ${reverse ? "md:order-1" : ""}`}>
                <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                    <span className="flex gap-1.5" aria-hidden="true">
                        <i className="h-2 w-2 rounded-full border border-line" />
                        <i className="h-2 w-2 rounded-full border border-line" />
                        <i className="h-2 w-2 rounded-full border border-line" />
                    </span>
                    <span className="tech keepcase text-[11px] text-muted">{header}</span>
                    <span className="chip tech">[ .RULE ]</span>
                </div>
                <div className="stage relative m-4 overflow-hidden" data-demo={demo}>
                    {children}
                    <div className="absolute inset-x-0 bottom-3 grid place-items-center">
                        <span className="chip tech bg-white/95">
                            <span className="pulse pulse-primary" aria-hidden="true" />
                            {chip}
                        </span>
                    </div>
                </div>
                <div className="tech keepcase border-t border-line px-5 py-3 text-[11px] text-muted">{footer}</div>
            </div>
        </div>
    );
}

export function DiceDemo() {
    return (
        <DemoSection
            demo="dice"
            title={
                <>
                    One draw from 0..9999, <span className="text-primary">exactly uniform.</span>
                </>
            }
            sub="Rejection sampling makes every value equally likely; there is no modulo bias, by arithmetic rather than by approximation."
            header={'dice({ target: 5000, mode: "over" })'}
            chip="[ SIMULATION PENDING ]"
            footer="payout_bp 19803 · ruleHash 0x7939b82e…7016a87"
        >
            <div className="relative h-60">
                <div className="absolute inset-x-8 top-1/2 h-px bg-line" />
                <span className="tech absolute left-8 top-[56%] text-[10px] text-muted">0</span>
                <span className="tech absolute right-8 top-[56%] text-[10px] text-muted">9999</span>
                <div className="absolute bottom-[34%] left-1/2 top-[34%] w-px bg-ink/40" />
                <span className="tech keepcase absolute left-1/2 top-[22%] -translate-x-1/2 whitespace-nowrap text-[10px] text-muted">
                    target &gt; 5000
                </span>
                <div className="absolute bottom-[40%] top-[40%] w-0.75 rounded-full bg-primary" style={{ left: "37.25%" }} />
                <span
                    className="tech keepcase absolute top-[62%] -translate-x-1/2 whitespace-nowrap text-[10px] text-primary"
                    style={{ left: "37.25%" }}
                >
                    draws: [3725]
                </span>
                <div className="scanline" aria-hidden="true" />
            </div>
        </DemoSection>
    );
}

export function CoinflipDemo() {
    return (
        <DemoSection
            demo="coinflip"
            title={
                <>
                    One bit, <span className="text-primary">nothing hidden.</span>
                </>
            }
            sub="Draw one value that is 0 or 1, win on 1, pay just under 2x. The whole game is four lines of JSON."
            header="coinflip()"
            chip="[ SIMULATION PENDING ]"
            footer="payout_bp 19800 · min 0 · max 1 · count 1"
            reverse
        >
            <div className="grid h-60 grid-cols-2 gap-4 p-6">
                <div className="flip-cell grid place-items-center rounded-lg border border-line text-4xl font-medium text-muted">
                    0
                </div>
                <div
                    className="flip-cell grid place-items-center rounded-lg border border-line text-4xl font-medium text-muted"
                    style={{ animationDelay: "-4s" }}
                >
                    1
                </div>
            </div>
        </DemoSection>
    );
}

export function RouletteDemo() {
    return (
        <DemoSection
            demo="roulette"
            title={
                <>
                    Roulette compiles to <span className="text-primary">a JSON rule.</span>
                </>
            }
            sub="There is no roulette preset today; the rule grammar already expresses it, the same way the docs build a three-card game from draws, mod, and, or."
            header="rules are data, not code"
            chip="[ NO PRESET YET · GRAMMAR READY ]"
            footer="grammar: int draws · mod · and / or / not · count 1..16"
        >
            <div
                className="keepcase flex h-60 flex-col justify-center gap-2.5 px-8 text-[12.5px] leading-none text-ink"
                style={{ fontFamily: "var(--font-tech)" }}
            >
                <div>{"{"}</div>
                <div className="pl-6">&quot;v&quot;: 0,</div>
                <div className="pl-6">
                    &quot;random&quot;: {"{"} &quot;type&quot;: &quot;int&quot;, &quot;min&quot;: 0, &quot;max&quot;:{" "}
                    <span className="redact w-8" /> , &quot;count&quot;: <span className="redact w-5" /> {"}"},
                </div>
                <div className="pl-6">
                    &quot;win&quot;: {"{"} &quot;op&quot;: <span className="redact w-10" />, &quot;l&quot;: {"{"}{" "}
                    &quot;r&quot;: 0 {"}"}, &quot;r&quot;: <span className="redact w-14" /> {"}"},
                </div>
                <div className="pl-6">
                    &quot;payout_bp&quot;: <span className="redact w-12" />
                </div>
                <div>{"}"}</div>
            </div>
        </DemoSection>
    );
}
