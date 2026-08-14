import { DOCS } from "@/lib/links";

const STEPS: [string, string, string][] = [
    [
        "01",
        "Send us your operator wallet.",
        "We create your operator account bound to that address and hand back one API key. It is shown once, and we keep only its SHA-256 hash.",
    ],
    [
        "02",
        "Top up from that wallet.",
        "An ordinary onchain transfer to the Foreseer treasury. Post the transaction hash, we verify sender, recipient and confirmation over RPC, then credit it exactly once.",
    ],
    [
        "03",
        "Register your game.",
        "Rules are JSON documents. Take a preset (roulette, dice, coinflip, towers) or write your own, and you get a rule hash back to reuse forever.",
    ],
    [
        "04",
        "Call play, once per bet.",
        "One HTTP call from your backend carrying the player's client seed. The key stays server side and never reaches a browser.",
    ],
    [
        "05",
        "Settle from the signed receipt.",
        "Check the TEE signature, then pay out using payoutBp. Refuse to settle anything that does not verify.",
    ],
    [
        "06",
        "Watch it in the dashboard.",
        "Connect that same wallet, sign a nonce, and read your balance, deposits and every play. There is no password anywhere.",
    ],
];

const PLANES: [string, string, string][] = [
    [
        "YOUR BACKEND",
        "One API key",
        "Sent as x-api-key on every play. Machines cannot sign wallet messages thousands of times a second, and you should never put a funding key on a server that faces players.",
    ],
    [
        "YOU",
        "Your wallet",
        "A signature logs you into the dashboard, read only. Nothing to remember, nothing to phish, no shared secret between you and us.",
    ],
    [
        "YOUR MONEY",
        "The chain",
        "Top-ups are real transfers signed by your wallet. A payment that did not come from your registered address is rejected, whoever submits it.",
    ],
];

export default function GettingStarted() {
    return (
        <div className="pt-12">
            <div className="text-center">
                <h2 className="text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">
                    From zero to your first bet, <span className="text-primary">in six steps.</span>
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
                    Your wallet says who you are, one key lets your backend play, and the chain moves the money. Three
                    credentials, three jobs, and none of them can do another job.
                </p>
            </div>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
                {STEPS.map(([num, lead, rest]) => (
                    <li key={num} className="card p-6">
                        <div className="tech text-[11px] text-muted">{num}</div>
                        <p className="keepcase mt-4 text-[14px] leading-relaxed text-muted">
                            <strong className="font-medium text-ink">{lead}</strong> {rest}
                        </p>
                    </li>
                ))}
            </ol>
            <div className="card mt-10 p-8">
                <h3 className="text-[18px] font-medium">Three credentials, three jobs</h3>
                <div className="mt-6 grid gap-6 md:grid-cols-3">
                    {PLANES.map(([who, what, why]) => (
                        <div key={who}>
                            <div className="tech text-[11px] text-muted">{who}</div>
                            <div className="mt-2 text-[15px] font-medium text-primary">{what}</div>
                            <p className="keepcase mt-2 text-[14px] leading-relaxed text-muted">{why}</p>
                        </div>
                    ))}
                </div>
                <p className="keepcase mt-8 border-t border-line pt-6 text-[14px] leading-relaxed text-muted">
                    <strong className="font-medium text-ink">So a leaked key is bounded.</strong> It can spend the
                    balance you prepaid and nothing else: there is no withdrawal endpoint anywhere in the API, your
                    owner wallet cannot be changed through it, and your dashboard still needs your signature.
                </p>
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
