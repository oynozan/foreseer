import MagicBento from "@/components/reactbits/MagicBento";
import { VERIFY_URL } from "@/lib/links";

const CARDS = [
    {
        label: "COMMIT",
        title: "The seed is hashed onchain first",
        description: "SHA256(serverSeed) goes public before any bet exists.",
        span: true,
    },
    {
        label: "PLAY",
        title: "Outcomes are pure functions",
        description: "HMAC draws, zero modulo bias, EIP-712 signed receipts.",
    },
    {
        label: "REVEAL",
        title: "The secret becomes public",
        description: "Epoch closes, seed revealed, every draw recomputable.",
    },
    {
        label: "ANCHOR",
        title: "One Merkle root fixes the epoch",
        description: "Anyone can prove their receipt belongs, forever.",
        span: true,
    },
];

export default function HowItWorks() {
    return (
        <div className="pt-12">
            <div className="text-center">
                <h2 className="text-[clamp(28px,3.2vw,40px)] font-medium leading-[1.1] tracking-[-0.02em]">
                    One bet, four moments, <span className="text-primary">six checks.</span>
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
                    Commit, play, reveal, anchor. Four of the six checks run in your browser; two are onchain reads.
                </p>
            </div>
            <div className="mt-10">
                <MagicBento cards={CARDS} />
            </div>
            <div className="card mt-10 flex flex-wrap items-center justify-between gap-6 p-8">
                <p className="max-w-xl text-[15px] leading-relaxed text-muted">
                    <strong className="font-medium text-ink">Six checks. Four run right here.</strong> Paste a receipt
                    or load the golden example; nothing you paste leaves the page.
                </p>
                <a
                    href={VERIFY_URL}
                    className="rounded-full bg-primary px-6 py-3 text-[14px] font-medium text-white transition-colors hover:bg-primary-hover"
                >
                    Open the verifier
                </a>
            </div>
        </div>
    );
}
