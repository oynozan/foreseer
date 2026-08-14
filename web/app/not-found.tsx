import Link from "next/link";
import Band from "@/components/Band";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import { VERIFY_URL } from "@/lib/links";

export default function NotFound() {
    return (
        <div className="frame">
            <Nav />
            <main>
                <Band id="not-found" meta={["[ 404 ]", "NOT FOUND // NO SUCH EPOCH //"]}>
                    <div className="py-24 text-center md:py-36">
                        <p className="keepcase text-[12.5px] text-muted" style={{ fontFamily: "var(--font-mono)" }}>
                            verifyMerkleProof(thisPage) = false
                        </p>
                        <h1 className="mt-4 text-[clamp(64px,12vw,140px)] font-medium leading-none tracking-[-0.03em]">
                            4<span className="text-primary">0</span>4
                        </h1>
                        <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-muted">
                            Nothing is anchored at this address. The page you are looking for was never part of the
                            epoch.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                            <Link
                                href="/"
                                className="rounded-full bg-primary px-6 py-3 text-[14px] font-medium text-white transition-colors hover:bg-primary-hover"
                            >
                                Back home
                            </Link>
                            <Link
                                href={VERIFY_URL}
                                className="rounded-full border border-line bg-white px-6 py-3 text-[14px] font-medium text-ink transition-colors hover:border-ink"
                            >
                                Verify a bet
                            </Link>
                        </div>
                    </div>
                </Band>
            </main>
            <Footer />
        </div>
    );
}
