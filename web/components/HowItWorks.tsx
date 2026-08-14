import Reveal from "@/components/Reveal";
import { VERIFY_URL } from "@/lib/links";

const STEPS: [string, string, string][] = [
    [
        "COMMIT",
        "The seed is hashed onchain first.",
        "Per epoch the TEE publishes SHA256(serverSeed) before any bet. Golden epoch commit: 0x630dcd29…bd710dd. From this moment the house cannot change its randomness.",
    ],
    [
        "PLAY",
        "Your outcome is a pure function.",
        "outcome = f(serverSeed, clientSeed, nonce) via HMAC-SHA256 and rejection sampling. Every bet returns an EIP-712 receipt with all 12 fields signed.",
    ],
    [
        "REVEAL",
        "The secret becomes public.",
        "At epoch close the TEE reveals the seed. Anyone can now recompute every draw, win flag, and payout from scratch.",
    ],
    [
        "ANCHOR",
        "One Merkle root fixes the epoch.",
        "A sorted-pair keccak256 root of all 12 receipt digests goes onchain. Golden epoch root: 0x6c4fd309…296b4c5e.",
    ],
];

const CHEATS: [string, string][] = [
    ["A different seed after the fact: its hash would not match the anchored commitment.", "[ CHECK 3 ]"],
    ["A doctored draw or flipped win: the signature breaks and the recomputation disagrees.", "[ CHECKS 1 + 5 ]"],
    ["A receipt quietly dropped from the epoch: its Merkle proof cannot reach the anchored root.", "[ CHECK 6 ]"],
    [
        "A different machine signing receipts: the recovered address does not match the attested TEE identity.",
        "[ CHECKS 1 + 2 ]",
    ],
];

export default function HowItWorks() {
    return (
        <div className="pt-12">
            <div className="text-center">
                <h2 className="text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">
                    One bet, four moments, <span className="text-primary">six checks.</span>
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
                    Every value below comes from the golden test vectors. You can reproduce each step yourself.
                </p>
            </div>
            <Reveal className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map(([tag, lead, rest], i) => (
                    <div key={tag} className="card p-6" style={{ "--i": i } as React.CSSProperties}>
                        <div className="tech flex items-baseline justify-between text-[11px] text-muted">
                            <span>{tag}</span>
                            <span>0{i + 1}</span>
                        </div>
                        <p className="keepcase mt-4 text-[14px] leading-relaxed text-muted">
                            <strong className="font-medium text-ink">{lead}</strong> {rest}
                        </p>
                    </div>
                ))}
            </Reveal>
            <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.6fr]">
                <div>
                    <h3 className="text-xl font-medium tracking-[-0.01em]">What would cheating look like?</h3>
                    <p className="mt-3 text-[14px] leading-relaxed text-muted">
                        Four of the six checks run in your browser today; two are onchain reads.
                    </p>
                </div>
                <ul className="divide-y divide-line border-y border-line">
                    {CHEATS.map(([attempt, check]) => (
                        <li key={check + attempt} className="flex items-center justify-between gap-6 py-4">
                            <span className="text-[14px] leading-relaxed text-muted">{attempt}</span>
                            <span className="chip tech whitespace-nowrap">{check}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="card mt-14 flex flex-wrap items-center justify-between gap-6 p-8">
                <p className="max-w-xl text-[15px] leading-relaxed text-muted">
                    <strong className="font-medium text-ink">Six checks. Four run right here.</strong> The hosted widget
                    is the SDK compiled to a single 58 kB file. Paste a receipt or load the golden example; nothing you
                    paste leaves the page.
                </p>
                <span className="flex items-center gap-3">
                    <a
                        href={VERIFY_URL}
                        className="tech rounded-full bg-primary px-6 py-3 text-[12px] font-medium text-white transition-colors hover:bg-primary-hover"
                    >
                        [ OPEN THE VERIFIER ]
                    </a>
                    <span className="chip tech">[ OFFLINE ]</span>
                </span>
            </div>
        </div>
    );
}
