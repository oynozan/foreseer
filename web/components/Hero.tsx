import Band from "@/components/Band";
import example from "@/data/example.json";
import { DOCS_URL, VERIFY_URL } from "@/lib/links";

export function trunc(hex: string): string {
    return hex.slice(0, 10) + "…" + hex.slice(-8);
}

const CHIPS: [string, string, string, string][] = [
    ["[ SHA256(serverSeed) ]", "7%", "27%", "-3deg"],
    ["[ EIP-712 SIGNED ]", "79%", "31%", "2deg"],
    ["[ CHAIN ID 114 ]", "4%", "55%", "2deg"],
    ["[ SPEC v0.1 ]", "83%", "62%", "-2deg"],
];

const CHECKS = ["signature", "commit", "outcome", "merkle"] as const;

export default function Hero() {
    const r = example.receipt;
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
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3" aria-hidden="false">
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

                <div className="card mx-auto mt-14 max-w-2xl text-left">
                    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                        <span className="flex gap-1.5" aria-hidden="true">
                            <i className="h-2 w-2 rounded-full border border-line" />
                            <i className="h-2 w-2 rounded-full border border-line" />
                            <i className="h-2 w-2 rounded-full border border-line" />
                        </span>
                        <span className="tech keepcase text-[11px] text-muted">
                            receipt · epoch {r.epochId} · bet {r.betId}
                        </span>
                        <span className="chip tech">[ .JSON ]</span>
                    </div>
                    <div id="receipt-status" className="tech keepcase border-b border-line px-5 py-2.5 text-[11px] text-muted">
                        [ ANCHORED ] · merkleRoot {trunc(example.merkleRoot)}
                    </div>
                    <pre id="receipt-json" className="keepcase overflow-x-auto px-5 py-4 text-[12.5px] leading-[1.7] text-ink" style={{ fontFamily: "var(--font-tech)" }}>
{`{
    "specVersion": ${r.specVersion},
    "codeVersion": "${trunc(r.codeVersion)}",
    "epochId": ${r.epochId},
    "betId": ${r.betId},
    "seedCommit": "${trunc(r.seedCommit)}",
    "clientSeed": "${r.clientSeed}",
    "nonce": ${r.nonce},
    "ruleHash": "${trunc(r.ruleHash)}",
    "draws": [`}<span className="text-primary">{r.draws[0]}</span>{`],
    "win": ${r.win},
    "payoutBp": ${r.payoutBp},
    "timestamp": ${r.timestamp},
    "signature": "${trunc(example.signature)}"
}`}
                    </pre>
                    <div className="border-t border-line px-5 py-4">
                        <ul id="receipt-checks" className="grid gap-2 sm:grid-cols-2">
                            {CHECKS.map((name) => (
                                <li key={name} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
                                    <span className="tech keepcase text-[11px] text-muted">{name}</span>
                                    <span className="tech keepcase text-[11px] text-[#15803d]">true</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="chip tech">[ 4 / 4 OFFLINE CHECKS PASS ]</span>
                            <span className="text-[12px] text-muted">
                                Checks 2 and 4 are onchain reads against the attested TEE registry and the anchored
                                commit.
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </Band>
    );
}
