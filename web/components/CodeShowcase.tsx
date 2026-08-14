"use client";

import { useState, type ReactNode } from "react";

const V = ({ children }: { children: ReactNode }) => <span className="text-primary">{children}</span>;

const TS_OUT = (
    <>
        <span className="text-muted">rolled … a fresh epoch seed each run</span>
        {`
{
    signature: `}
        <V>true</V>
        {`,
    commit: `}
        <V>true</V>
        {`,
    outcome: `}
        <V>true</V>
        {`,
    merkle: `}
        <V>true</V>
        {`
}`}
    </>
);

const PY_OUT = (
    <>
        <V>3725</V>
        {`
the draw in the golden receipt, recomputed
with nothing but the standard library`}
    </>
);

const OUTS: Record<string, ReactNode> = { ts: TS_OUT, py: PY_OUT };

export type ShowTab = {
    key: string;
    label: string;
    cap: string;
    outCap: string;
    outChip?: string;
    note?: string;
    codeHtml: string;
    raw: string;
    outHtml?: string;
};

export default function CodeShowcase({ tabs }: { tabs: ShowTab[] }) {
    const [active, setActive] = useState(0);
    const [copied, setCopied] = useState(false);
    const tab = tabs[active];

    const copy = () => {
        navigator.clipboard.writeText(tab.raw).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        });
    };

    const onKeys = (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const next = (active + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
        setActive(next);
        (e.currentTarget.children[next] as HTMLElement)?.focus();
    };

    return (
        <div className="pt-12">
            <div className="text-center">
                <h2 className="text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">
                    Integrate the SDK, or verify <span className="text-primary">with no Foreseer code at all.</span>
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
                    The reference SDK, plain Python, or plain curl. The protocol is standard cryptography end to end.
                </p>
            </div>
            <div
                role="tablist"
                aria-label="Integration paths"
                className="mt-8 flex flex-wrap justify-center gap-2"
                onKeyDown={onKeys}
            >
                {tabs.map((t, i) => (
                    <button
                        key={t.key}
                        role="tab"
                        aria-selected={i === active}
                        tabIndex={i === active ? 0 : -1}
                        onClick={() => setActive(i)}
                        className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                            i === active ? "bg-primary-soft text-primary" : "text-muted hover:text-ink"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div key={tab.key} className="card fade-in mt-6 grid overflow-hidden md:grid-cols-[1.25fr_1fr]">
                <div className="border-b border-line md:border-r md:border-b-0">
                    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                        <span className="chip tech">{tab.cap}</span>
                        {tab.note && <span className="text-[12px] text-muted">{tab.note}</span>}
                        <button
                            type="button"
                            onClick={copy}
                            className="-my-2 -mr-2 px-2 py-2 text-[12px] font-medium text-muted transition-colors hover:text-ink"
                        >
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                    <div className="code-pane" dangerouslySetInnerHTML={{ __html: tab.codeHtml }} />
                </div>
                <div className="bg-bg-soft/60">
                    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                        <span className="chip tech">{tab.outCap}</span>
                        {tab.outChip && <span className="chip tech text-primary">{tab.outChip}</span>}
                    </div>
                    {tab.outHtml ? (
                        <div className="code-pane" dangerouslySetInnerHTML={{ __html: tab.outHtml }} />
                    ) : (
                        <pre
                            className="keepcase overflow-x-auto px-5 py-4 text-[12.5px] leading-[1.75] text-muted"
                            style={{ fontFamily: "var(--font-tech)" }}
                        >
                            {OUTS[tab.key]}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
}
