"use client";

import { WHEEL_RULE_HASH } from "@/lib/roulette";
import { VERIFY_URL } from "@/lib/links";
import type { EpochView } from "@/lib/roulette-tee";

const mono = { fontFamily: "var(--font-mono)" };
const trunc = (hex: string) => (hex.length > 26 ? hex.slice(0, 12) + "…" + hex.slice(-8) : hex);

function Field({ label, value, title, name }: { label: string; value: string; title?: string; name: string }) {
    return (
        <div data-field={name} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="tech shrink-0 text-[11px] text-muted">{label}</span>
            <span className="keepcase truncate text-[12.5px] text-ink" style={mono} title={title ?? value}>
                {value}
            </span>
        </div>
    );
}

export default function RouletteProof({ view }: { view: EpochView | null }) {
    const dash = "--------";
    const spins = view?.spins ?? [];
    const reveal = view?.reveal ?? null;

    return (
        <div className="mt-10 grid gap-x-14 gap-y-10 lg:grid-cols-2">
            <div>
                <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                    <h3 className="text-[15px] font-medium">This epoch</h3>
                    <span className="tech text-[11px] text-muted" aria-hidden="true">
                        committed up front //
                    </span>
                </div>
                <div className="divide-y divide-line">
                    <Field name="epoch" label="Epoch" value={view ? String(view.epochId) : dash} />
                    <Field
                        name="commitment"
                        label="Commitment"
                        value={view ? trunc(view.seedCommit) : dash}
                        title={view?.seedCommit}
                    />
                    <Field name="client-seed" label="Client seed" value={view ? view.clientSeed : dash} />
                    <Field name="rule" label="Rule" value={trunc(WHEEL_RULE_HASH)} title={WHEEL_RULE_HASH} />
                    <Field name="nonce" label="Next nonce" value={view ? String(spins.length) : dash} />
                    {reveal && (
                        <Field
                            name="revealed-seed"
                            label="Revealed seed"
                            value={trunc(reveal.serverSeed)}
                            title={reveal.serverSeed}
                        />
                    )}
                </div>
            </div>

            <div>
                <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                    <h3 className="text-[15px] font-medium">{reveal ? "Verification" : "Spins"}</h3>
                    <span className="tech text-[11px] text-muted" aria-hidden="true">
                        {reveal ? "recomputed locally //" : "signed on arrival //"}
                    </span>
                </div>

                {!reveal && spins.length === 0 && (
                    <p className="py-6 text-[13px] text-muted">
                        No spins yet. The commitment on the left already fixes every pocket you are about to see.
                    </p>
                )}

                {!reveal && spins.length > 0 && (
                    <ul className="divide-y divide-line">
                        {[...spins].reverse().map((s) => (
                            <li key={`${s.epochId}-${s.betId}`} className="flex items-center justify-between gap-4 py-2.5">
                                <span className="flex items-baseline gap-3">
                                    <span className="w-8 text-[15px] font-medium text-ink" style={mono}>
                                        {s.pocket}
                                    </span>
                                    <span className="tech text-[11px] text-muted">nonce {String(s.nonce)}</span>
                                </span>
                                <span className="text-[12.5px] text-muted">
                                    signature <span className="text-[#15803d]">ok</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                {reveal && (
                    <div className="fade-in" data-reveal>
                        <ul className="divide-y divide-line">
                            {reveal.checks.map((c) => (
                                <li
                                    key={c.key}
                                    data-check={c.key}
                                    data-ok={c.ok}
                                    className="flex items-baseline justify-between gap-4 py-2.5"
                                >
                                    <span className="flex items-baseline gap-2.5">
                                        <span
                                            className={`inline-block size-1.5 shrink-0 rounded-full ${
                                                c.ok ? "bg-[#15803d]" : "bg-red"
                                            }`}
                                            aria-hidden="true"
                                        />
                                        <span className="text-[13.5px] text-ink">{c.label}</span>
                                    </span>
                                    <span
                                        className="keepcase max-w-[45%] truncate text-[12px] text-muted"
                                        style={mono}
                                        title={c.detail}
                                    >
                                        {trunc(c.detail)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <p data-verdict className="mt-4 text-[13px] leading-relaxed text-muted">
                            <strong className="font-medium text-ink">
                                {reveal.checks.filter((c) => c.ok).length} of {reveal.checks.length} checks green across{" "}
                                {reveal.receiptCount} receipts.
                            </strong>{" "}
                            The other two of the six are onchain reads, the TEE registration and the anchored
                            commitment, which live on Coston2 rather than in your browser.{" "}
                            <a href={VERIFY_URL} className="text-ink underline decoration-line underline-offset-4">
                                Open the verifier
                            </a>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
