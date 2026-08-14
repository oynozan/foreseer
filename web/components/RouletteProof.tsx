"use client";

import { payoutMultiplier } from "@/lib/roulette";
import { VERIFY_URL } from "@/lib/links";
import type { EpochView } from "@/lib/roulette-tee";

const mono = { fontFamily: "var(--font-mono)" };
const trunc = (hex: string) => (hex.length > 22 ? hex.slice(0, 10) + "…" + hex.slice(-8) : hex);

function Cell({ label, value, full }: { label: string; value: string; full?: string }) {
    return (
        <div className="bg-white p-4">
            <div className="tech text-[11px] text-muted">{label}</div>
            <div className="keepcase mt-1.5 truncate text-[13px] text-ink" style={mono} title={full ?? value}>
                {value}
            </div>
        </div>
    );
}

export default function RouletteProof({ view }: { view: EpochView | null }) {
    const dash = "--------";
    const spins = view?.spins ?? [];
    const reveal = view?.reveal ?? null;

    return (
        <div className="mt-10">
            <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
                <Cell label="Epoch" value={view ? String(view.epochId) : dash} />
                <Cell
                    label="Commitment"
                    value={view ? trunc(view.seedCommit) : dash}
                    full={view?.seedCommit}
                />
                <Cell label="Client seed" value={view ? view.clientSeed : dash} />
                <Cell label="Next nonce" value={view ? String(spins.length) : dash} />
            </div>

            {spins.length > 0 && (
                <ul className="mt-6 divide-y divide-line border-y border-line">
                    {[...spins].reverse().map((s) => (
                        <li key={`${s.epochId}-${s.betId}`} className="flex flex-wrap items-center gap-3 py-3">
                            <span className={`chip tech ${s.win ? "border-mint bg-mint text-mint-ink" : ""}`}>
                                pocket {s.pocket}
                            </span>
                            <span className="tech text-[11px] text-muted">
                                bet {String(s.betId)} · nonce {String(s.nonce)}
                            </span>
                            <span className="text-[13px] text-muted">
                                {s.win ? `pays ${payoutMultiplier(s.payoutBp)}x` : "no payout"}
                            </span>
                            <span className="ml-auto flex flex-wrap gap-2">
                                <span className="chip tech border-mint bg-mint text-mint-ink">signature ok</span>
                                {!reveal && (
                                    <>
                                        <span className="chip tech">outcome after reveal</span>
                                        <span className="chip tech">seed after reveal</span>
                                        <span className="chip tech">merkle after reveal</span>
                                    </>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {reveal && (
                <div className="fade-in mt-8">
                    <p className={`verdict ${reveal.allGreen ? "green" : "red"}`}>
                        {reveal.checks.filter((c) => c.ok).length} checks green across {reveal.receiptCount} receipts.
                    </p>
                    {reveal.checks.map((c) => (
                        <div key={c.key} className={`check ${c.ok ? "green" : "red"}`}>
                            <span className="dot">&#9679;</span> {c.label}
                            <small className="keepcase" style={mono}>
                                {c.detail}
                            </small>
                        </div>
                    ))}
                    <div className="check chain">
                        <span className="dot">&#9679;</span> Two of the six checks are onchain reads
                        <small>
                            The TEE registration and the anchored commitment live on Coston2. This demo runs the
                            reference implementation in your browser, so those two are out of scope here.{" "}
                            <a href={VERIFY_URL} className="underline">
                                Open the verifier
                            </a>
                        </small>
                    </div>
                </div>
            )}
        </div>
    );
}
