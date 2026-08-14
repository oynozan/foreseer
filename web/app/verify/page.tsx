import type { Metadata } from "next";
import Script from "next/script";
import Band from "@/components/Band";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
    title: "Foreseer · Receipt verifier",
    description: "Run the six Foreseer checks on any signed receipt, entirely in your browser.",
};

const mono = { fontFamily: "var(--font-mono)" };

function Field({ label, id, value, wide }: { label: string; id: string; value?: string; wide?: boolean }) {
    return (
        <label className={wide ? "block grow" : "block"}>
            <span className="tech mb-1.5 block text-[11px] text-muted">{label}</span>
            <input
                id={id}
                defaultValue={value}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-ink"
                style={mono}
            />
        </label>
    );
}

function Area({ label, id, tall }: { label: string; id: string; tall?: boolean }) {
    return (
        <label className="block">
            <span className="tech mb-1.5 block text-[11px] text-muted">{label}</span>
            <textarea
                id={id}
                className={`w-full rounded-md border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-ink ${
                    tall ? "min-h-44" : "min-h-16"
                }`}
                style={mono}
            />
        </label>
    );
}

export default function VerifyPage() {
    return (
        <div className="frame">
            <Nav />
            <main>
                <Band id="verifier" meta={["[ VERIFY ]", "SIX CHECKS // NOTHING LEAVES THIS PAGE //"]}>
                    <div className="pt-12 text-center">
                        <h1 className="text-[clamp(30px,3.6vw,44px)] font-medium leading-[1.1] tracking-[-0.02em]">
                            Every check runs <span className="text-primary">in your browser.</span>
                        </h1>
                        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
                            The open source SDK compiled to a single file. Paste a receipt, load the golden example, or
                            pull a bet from a server you point it at.
                        </p>
                    </div>
                    <div className="card mt-10 flex flex-wrap items-end gap-3 p-5">
                        <Field label="Server URL, optional" id="server" wide />
                        <div className="w-20">
                            <Field label="Epoch" id="epochId" value="1" />
                        </div>
                        <div className="w-20">
                            <Field label="Bet" id="betId" value="0" />
                        </div>
                        <button
                            id="load"
                            className="rounded-full border border-line bg-white px-5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-ink"
                        >
                            Load from server
                        </button>
                        <button
                            id="example"
                            className="rounded-full border border-line bg-white px-5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-ink"
                        >
                            Load golden example
                        </button>
                    </div>
                    <div className="card mt-4 p-5">
                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="space-y-4">
                                <Area label='Signed receipt JSON, {"receipt": ..., "signature": "0x..."}' id="receipt" tall />
                                <Area label="Rule JSON" id="rule" />
                                <Area label="Merkle proof, JSON array of hex" id="proof" />
                            </div>
                            <div className="space-y-4">
                                <Field label="Revealed server seed, hex" id="serverSeed" />
                                <Field label="Seed commitment, hex" id="seedCommit" />
                                <Field label="Merkle root, hex" id="merkleRoot" />
                                <Field label="Expected TEE address, from the attestation registry" id="teeId" />
                                <Field label="Chain id" id="chainId" value="114" />
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end">
                            <button
                                id="verify"
                                className="rounded-full bg-primary px-6 py-3 text-[14px] font-medium text-white transition-colors hover:bg-primary-hover"
                            >
                                Verify
                            </button>
                        </div>
                    </div>
                    <div className="pt-10 pb-8">
                        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                            <h2 className="text-[15px] font-medium">Verification</h2>
                            <span className="tech text-[11px] text-muted" aria-hidden="true">
                                four run here, two read the chain //
                            </span>
                        </div>
                        <div id="results">
                            <p>Paste a receipt or load the golden example.</p>
                        </div>
                    </div>
                </Band>
            </main>
            <Footer />
            <Script src="/foreseer-widget.js" strategy="afterInteractive" />
        </div>
    );
}
