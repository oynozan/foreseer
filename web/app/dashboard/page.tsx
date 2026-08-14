"use client";

import Link from "next/link";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_FORESEER_API ?? "http://localhost:8787";

interface Deposit {
    txHash: string;
    fromWallet: string;
    amountWei: string;
    createdAt: number;
}

interface Play {
    epochId: number;
    betId: number;
    clientSeed: string;
    win: boolean;
    payoutBp: number;
    timestamp: number;
}

interface OperatorData {
    operatorId: number;
    name: string;
    createdAt: number;
    plays: number;
    wins: number;
    payoutBpSum: number;
    epochsUsed: number;
    depositedWei: string;
    spentWei: string;
    balanceWei: string;
    deposits: Deposit[];
    recent: Play[];
}

interface MeResponse {
    wallet: string;
    pricePerPlayWei: string;
    operators: OperatorData[];
}

type Phase = "idle" | "connecting" | "loaded" | "untied" | "error";

const ONE_FLR = BigInt("1000000000000000000");
const TENTH_MILLI = BigInt("100000000000000");

function flr(wei: string): string {
    const v = BigInt(wei);
    const neg = v < BigInt(0);
    const abs = neg ? -v : v;
    const whole = abs / ONE_FLR;
    const frac = (abs % ONE_FLR) / TENTH_MILLI;
    return `${neg ? "-" : ""}${whole}.${frac.toString().padStart(4, "0")}`;
}

const when = (t: number) => new Date(t * 1000).toLocaleString();
const short = (h: string) => `${h.slice(0, 10)}...${h.slice(-6)}`;

async function getJson(path: string, headers: Record<string, string> = {}) {
    const res = await fetch(`${API}${path}`, { headers });
    return { status: res.status, json: await res.json() };
}

export default function Dashboard() {
    const [phase, setPhase] = useState<Phase>("idle");
    const [error, setError] = useState("");
    const [me, setMe] = useState<MeResponse | null>(null);

    async function connect() {
        const eth = (window as { ethereum?: { request(args: unknown): Promise<unknown> } }).ethereum;
        if (!eth) {
            setError("No wallet extension found. Install MetaMask or a compatible wallet.");
            setPhase("error");
            return;
        }
        setPhase("connecting");
        setError("");
        try {
            const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
            const wallet = accounts[0].toLowerCase();
            const nonce = await getJson(`/auth/nonce?wallet=${wallet}`);
            if (nonce.status !== 200) throw new Error(nonce.json.error);
            const signature = (await eth.request({
                method: "personal_sign",
                params: [nonce.json.message, accounts[0]],
            })) as string;
            const login = await fetch(`${API}/auth/login`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ wallet, signature }),
            });
            const session = await login.json();
            if (!login.ok) throw new Error(session.error);
            const data = await getJson("/billing/me", { "x-owner-token": session.token });
            if (data.status === 404) {
                setPhase("untied");
                return;
            }
            if (data.status !== 200) throw new Error(data.json.error);
            setMe(data.json as MeResponse);
            setPhase("loaded");
        } catch (err) {
            setError(err instanceof Error ? err.message : "connection failed");
            setPhase("error");
        }
    }

    return (
        <div className="frame min-h-screen">
            <header className="band">
                <div className="col flex h-16 items-center justify-between">
                    <Link href="/" className="flex items-center">
                        <img src="/text-logo.svg" alt="Foreseer" className="h-8 w-auto" />
                    </Link>
                    <span className="tech text-[11px] text-muted">Operator dashboard</span>
                </div>
            </header>
            <main className="col pb-24 pt-12">
                {phase !== "loaded" && (
                    <div className="mx-auto max-w-xl text-center">
                        <h1 className="text-4xl font-bold">Your Foreseer service</h1>
                        <p className="mt-4 text-muted">
                            Sign in with the wallet that pays for your epochs. If a Foreseer service is tied to it, every
                            deposit, play, and balance shows up here.
                        </p>
                        <button
                            onClick={connect}
                            disabled={phase === "connecting"}
                            className="mt-8 rounded-full bg-primary px-8 py-3 font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                        >
                            {phase === "connecting" ? "Waiting for wallet..." : "Connect wallet"}
                        </button>
                        {phase === "untied" && (
                            <p className="mt-6 rounded-card border border-line bg-primary-soft p-4 text-sm">
                                This wallet is not tied to any Foreseer service. Operators get tied at signup: the owner
                                wallet on the operator account is the one that logs in here.
                            </p>
                        )}
                        {phase === "error" && <p className="mt-6 text-sm text-red">{error}</p>}
                    </div>
                )}
                {phase === "loaded" && me && (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <h1 className="text-3xl font-bold">Your Foreseer service</h1>
                            <span className="chip keepcase">{me.wallet}</span>
                        </div>
                        {me.operators.map((op) => (
                            <section key={op.operatorId} className="card mt-8 p-6">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <h2 className="text-xl font-bold">{op.name}</h2>
                                    <span className="tech text-[11px] text-muted">
                                        operator #{op.operatorId} since {when(op.createdAt)}
                                    </span>
                                </div>
                                <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                                    <Stat label="Balance" value={`${flr(op.balanceWei)} C2FLR`} accent />
                                    <Stat label="Deposited" value={`${flr(op.depositedWei)} C2FLR`} />
                                    <Stat label="Spent" value={`${flr(op.spentWei)} C2FLR`} />
                                    <Stat label="Price per play" value={`${flr(me.pricePerPlayWei)} C2FLR`} />
                                    <Stat label="Plays" value={String(op.plays)} />
                                    <Stat label="Player wins" value={String(op.wins)} />
                                    <Stat label="Epochs used" value={String(op.epochsUsed)} />
                                    <Stat
                                        label="Win rate"
                                        value={op.plays === 0 ? "-" : `${((100 * op.wins) / op.plays).toFixed(1)}%`}
                                    />
                                </div>
                                <h3 className="mt-8 font-bold">Deposits</h3>
                                {op.deposits.length === 0 ? (
                                    <p className="mt-2 text-sm text-muted">No deposits yet.</p>
                                ) : (
                                    <table className="mt-2 w-full text-sm">
                                        <thead>
                                            <tr className="tech text-left text-[11px] text-muted">
                                                <th className="py-2">Transaction</th>
                                                <th>Amount</th>
                                                <th>When</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {op.deposits.map((d) => (
                                                <tr key={d.txHash} className="border-t border-line">
                                                    <td className="keepcase tech py-2 text-[12px]">{short(d.txHash)}</td>
                                                    <td>{flr(d.amountWei)} C2FLR</td>
                                                    <td>{when(d.createdAt)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                <h3 className="mt-8 font-bold">Recent plays</h3>
                                {op.recent.length === 0 ? (
                                    <p className="mt-2 text-sm text-muted">No plays yet.</p>
                                ) : (
                                    <table className="mt-2 w-full text-sm">
                                        <thead>
                                            <tr className="tech text-left text-[11px] text-muted">
                                                <th className="py-2">Epoch / bet</th>
                                                <th>Client seed</th>
                                                <th>Result</th>
                                                <th>Payout</th>
                                                <th>When</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {op.recent.map((p) => (
                                                <tr key={`${p.epochId}-${p.betId}`} className="border-t border-line">
                                                    <td className="tech keepcase py-2 text-[12px]">
                                                        {p.epochId} / {p.betId}
                                                    </td>
                                                    <td className="tech keepcase text-[12px]">{p.clientSeed}</td>
                                                    <td>{p.win ? "player won" : "house won"}</td>
                                                    <td>{(p.payoutBp / 10000).toFixed(2)}x</td>
                                                    <td>{when(p.timestamp)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </section>
                        ))}
                    </>
                )}
            </main>
        </div>
    );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="rounded-stage border border-line p-4">
            <div className="tech text-[11px] text-muted">{label}</div>
            <div className={`mt-1 text-lg font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
        </div>
    );
}
