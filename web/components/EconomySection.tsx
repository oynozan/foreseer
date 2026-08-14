import { DOCS } from "@/lib/links";

const STEPS: [string, string, string][] = [
    [
        "01",
        "Register your rules.",
        "Games are JSON documents. Dice and coinflip ship as presets; the grammar covers the games you invent.",
    ],
    [
        "02",
        "Open epochs, pay per play.",
        "openEpoch carries the fee, split between treasury and your operator balance. Billing meters every play.",
    ],
    [
        "03",
        "Stake an operator bond.",
        "OperatorBond backs honest operation onchain, with delayed withdrawals and slashing.",
    ],
];

export default function EconomySection() {
    return (
        <div className="pt-12">
            <div className="text-center">
                <h2 className="text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">
                    Plug in your service, <span className="text-primary">pay per play.</span>
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
                    Foreseer is one layer of your stack: the outcome engine. You keep the players, the funds, and the
                    front end. Usage is metered per operator, and fairness is enforced by the protocol.
                </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
                {STEPS.map(([num, lead, rest]) => (
                    <div key={num} className="card p-6">
                        <div className="tech text-[11px] text-muted">{num}</div>
                        <p className="keepcase mt-4 text-[14px] leading-relaxed text-muted">
                            <strong className="font-medium text-ink">{lead}</strong> {rest}
                        </p>
                    </div>
                ))}
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <a
                    href="/dashboard"
                    className="rounded-full bg-primary px-6 py-3 text-[14px] font-medium text-white transition-colors hover:bg-primary-hover"
                >
                    Open the dashboard
                </a>
                <a
                    href={DOCS.api}
                    className="rounded-full border border-line bg-white px-6 py-3 text-[14px] font-medium text-ink transition-colors hover:border-ink"
                >
                    Server API
                </a>
            </div>
        </div>
    );
}
