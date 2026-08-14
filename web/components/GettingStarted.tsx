import { DOCS } from "@/lib/links";

type Step = { n: string; phase: string; title: string; note: string; code?: string };

const STEPS: Step[] = [
    { n: "01", phase: "SETUP", title: "Get your key", note: "Bound to your wallet. Shown once." },
    { n: "02", phase: "FUND", title: "Top up", note: "Pay the treasury, post the tx hash." },
    { n: "03", phase: "BUILD", title: "Register a rule", note: "A preset, or JSON you wrote." },
    { n: "04", phase: "PLAY", title: "Call play", note: "One request per bet.", code: "POST /play" },
    { n: "05", phase: "SETTLE", title: "Pay the winner", note: "Check the signature first.", code: "payoutBp" },
    { n: "06", phase: "WATCH", title: "Open the dashboard", note: "Same wallet, one signature." },
];

type Plane = { who: string; cred: string; can: string; cannot: string[] };

const PLANES: Plane[] = [
    {
        who: "YOUR BACKEND",
        cred: "x-api-key",
        can: "Play bets, spend prepaid balance",
        cannot: ["Withdraw a single wei", "Change your owner wallet", "Open your dashboard"],
    },
    {
        who: "YOU",
        cred: "wallet signature",
        can: "Read balance, deposits, every play",
        cannot: ["Expire into a support ticket", "Be stolen from our database"],
    },
    {
        who: "YOUR MONEY",
        cred: "onchain transfer",
        can: "Fund your balance from your wallet",
        cannot: ["Arrive from another address", "Be credited twice"],
    },
];

export default function GettingStarted() {
    return (
        <div className="pt-12">
            <div className="text-center">
                <h2 className="text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">
                    Six steps to your <span className="text-primary">first bet.</span>
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
                    Your wallet is who you are. One key runs your backend. The chain moves the money.
                </p>
            </div>

            <ol className="rail mt-12 border-t border-line md:grid md:grid-cols-6">
                {STEPS.map((s) => (
                    <li
                        key={s.n}
                        className="rail-step relative border-b border-line py-6 pl-4 md:border-b-0 md:pr-4 md:pl-3"
                    >
                        <span className="rail-tick absolute top-0 left-0 h-px w-6 bg-primary" aria-hidden="true" />
                        <span className="absolute top-0 left-0 h-4 w-px bg-primary md:hidden" aria-hidden="true" />
                        <div className="rail-body">
                            <div className="tech flex items-baseline gap-2 text-[10px]">
                                <span className="text-primary">{s.n}</span>
                                <span className="text-muted">{s.phase}</span>
                            </div>
                            <h3 className="mt-3 text-[15px] font-medium leading-tight">{s.title}</h3>
                            <p className="keepcase mt-1.5 text-[13px] leading-snug text-muted">{s.note}</p>
                            {s.code && (
                                <code className="chip keepcase mt-3 inline-flex text-[11px] text-ink">{s.code}</code>
                            )}
                        </div>
                    </li>
                ))}
            </ol>

            <div className="card mt-12 overflow-hidden">
                <div className="flex items-baseline justify-between gap-4 border-b border-line px-6 py-4">
                    <h3 className="text-[16px] font-medium">Three credentials, three jobs</h3>
                    <span className="tech text-[10px] text-muted">NONE OF THEM DOES ANOTHER JOB</span>
                </div>
                <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
                    {PLANES.map((p) => (
                        <div key={p.who} className="p-6">
                            <div className="tech text-[10px] text-muted">{p.who}</div>
                            <code className="chip keepcase mt-3 inline-flex text-[12px] text-ink">{p.cred}</code>
                            <p className="mt-4 flex gap-2 text-[14px] leading-snug">
                                <span aria-hidden="true" className="text-mint-ink">
                                    &#10003;
                                </span>
                                <span className="keepcase">{p.can}</span>
                            </p>
                            <ul className="mt-3 space-y-1.5">
                                {p.cannot.map((c) => (
                                    <li key={c} className="flex gap-2 text-[13px] leading-snug text-muted">
                                        <span aria-hidden="true" className="text-red">
                                            &#10007;
                                        </span>
                                        <span className="keepcase">{c}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <a
                    href={DOCS.api}
                    className="rounded-full bg-primary px-6 py-3 text-[14px] font-medium text-white transition-colors hover:bg-primary-hover"
                >
                    Server API
                </a>
                <a
                    href={DOCS.gamemodes}
                    className="rounded-full border border-line bg-white px-6 py-3 text-[14px] font-medium text-ink transition-colors hover:border-ink"
                >
                    Build a gamemode
                </a>
            </div>
        </div>
    );
}
