import Band from "@/components/Band";
import EpochStrip from "@/components/EpochStrip";
import HeroBackdrop from "@/components/HeroBackdrop";
import ReceiptWidget from "@/components/ReceiptWidget";
import { DOCS_URL, VERIFY_URL } from "@/lib/links";

export default function Hero() {
    return (
        <Band id="hero" meta={["[ 01 / 08 ]", "PROTOCOL // COMMIT BEFORE BET //"]} className="-mt-px">
            <div className="relative pt-16 text-center md:pt-24">
                <HeroBackdrop />
                <div className="relative">
                    <h1 className="mx-auto max-w-5xl text-[clamp(38px,5.5vw,62px)] font-medium leading-[1.05] tracking-[-0.02em]">
                        The house locks its randomness
                        <br className="hidden md:block" /> <span className="text-primary">before you bet.</span>
                    </h1>
                    <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted">
                        Foreseer resolves game outcomes inside an attested TEE on Flare Confidential Compute. Every bet
                        returns a signed receipt that anyone can recompute, offline, in a browser.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                        <a
                            href={VERIFY_URL}
                            className="rounded-full bg-primary px-6 py-3 text-[14px] font-medium text-white transition-colors hover:bg-primary-hover"
                        >
                            Verify a bet
                        </a>
                        <a
                            href={DOCS_URL}
                            className="rounded-full border border-line bg-white px-6 py-3 text-[14px] font-medium text-ink transition-colors hover:border-ink"
                        >
                            Read the docs
                        </a>
                    </div>
                    <EpochStrip />
                    <ReceiptWidget />
                </div>
            </div>
        </Band>
    );
}
