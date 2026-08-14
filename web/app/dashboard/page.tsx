"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import Nav from "@/components/Nav";

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

type Phase = "idle" | "signing" | "loaded" | "untied" | "error";
type Session = { addr?: string; phase: Phase; error: string; me: MeResponse | null };

const EMPTY: Session = { phase: "idle", error: "", me: null };

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
const mono = { fontFamily: "var(--font-mono)" };

async function getJson(path: string, headers: Record<string, string> = {}) {
    const res = await fetch(`${API}${path}`, { headers });
    return { status: res.status, json: await res.json() };
}

// tokens live for the tab so a reload never re-prompts
const tokenKey = (wallet: string) => `foreseer.token.${wallet}`;
function readToken(wallet: string): string | null {
    try {
        return sessionStorage.getItem(tokenKey(wallet));
    } catch {
        return null;
    }
}
function writeToken(wallet: string, token: string) {
    try {
        sessionStorage.setItem(tokenKey(wallet), token);
    } catch {}
}
function dropToken(wallet: string) {
    try {
        sessionStorage.removeItem(tokenKey(wallet));
    } catch {}
}

const PILL = "rounded-full px-5 py-2.5 text-[13px] font-medium transition-colors";
const PRIMARY = `${PILL} bg-primary text-white hover:bg-primary-hover disabled:opacity-50`;

function WalletButton() {
    return (
        <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                if (!mounted) return <span className="h-10 w-32" aria-hidden="true" />;
                if (!account || !chain) {
                    return (
                        <button onClick={openConnectModal} className={PRIMARY}>
                            Connect wallet
                        </button>
                    );
                }
                if (chain.unsupported) {
                    return (
                        <button onClick={openChainModal} className={PRIMARY}>
                            Wrong network
                        </button>
                    );
                }
                return (
                    <button onClick={openAccountModal} className={PRIMARY} style={mono}>
                        {account.displayName}
                    </button>
                );
            }}
        </ConnectButton.Custom>
    );
}

export default function Dashboard() {
    const { address: account } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const [session, setSession] = useState<Session>(EMPTY);
    const started = useRef<string | undefined>(undefined);

    // a session belongs to one wallet, switching clears it
    const { phase, error, me } = session.addr === account ? session : EMPTY;

    const signIn = useCallback(
        async (addr: string) => {
            const wallet = addr.toLowerCase();
            setSession({ ...EMPTY, addr, phase: "signing" });
            const settle = (status: number, json: MeResponse | { error?: string }) => {
                if (status === 404) return setSession({ ...EMPTY, addr, phase: "untied" });
                if (status !== 200) throw new Error((json as { error?: string }).error ?? "could not load billing");
                setSession({ addr, phase: "loaded", error: "", me: json as MeResponse });
            };
            try {
                const cached = readToken(wallet);
                if (cached) {
                    const hit = await getJson("/billing/me", { "x-owner-token": cached });
                    if (hit.status !== 401) return settle(hit.status, hit.json);
                    dropToken(wallet);
                }
                const nonce = await getJson(`/auth/nonce?wallet=${wallet}`);
                if (nonce.status !== 200) throw new Error(nonce.json.error);
                const signature = await signMessageAsync({ message: nonce.json.message });
                const login = await fetch(`${API}/auth/login`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ wallet, signature }),
                });
                const auth = await login.json();
                if (!login.ok) throw new Error(auth.error);
                writeToken(wallet, auth.token);
                const data = await getJson("/billing/me", { "x-owner-token": auth.token });
                settle(data.status, data.json);
            } catch (err) {
                setSession({
                    ...EMPTY,
                    addr,
                    phase: "error",
                    error: err instanceof Error ? err.message : "sign in failed",
                });
            }
        },
        [signMessageAsync],
    );

    // connecting or reconnecting asks to sign straight away
    useEffect(() => {
        if (!account) {
            started.current = undefined;
            return;
        }
        if (started.current === account) return;
        started.current = account;
        void signIn(account);
    }, [account, signIn]);

    const connected = account !== undefined;
    const retry = () => {
        if (!account) return;
        started.current = account;
        void signIn(account);
    };

    return (
        <div className="frame min-h-screen">
            <Nav action={<WalletButton />} />
            <main className="col pb-24">
                <div className="meta tech" aria-hidden="true">
                    <span>[ DASHBOARD ]</span>
                    <span>OPERATOR // FLARE COSTON2 //</span>
                </div>

                {phase === "loaded" && me ? (
                    <>
                        <div className="flex flex-wrap items-end justify-between gap-4 pt-10">
                            <div>
                                <p className="tech text-[11px] text-muted">Signed in as</p>
                                <h1 className="mt-2 text-2xl font-medium tracking-[-0.01em]" style={mono}>
                                    {short(me.wallet)}
                                </h1>
                            </div>
                            <span className="text-[13px] text-muted">
                                {me.operators.length} service{me.operators.length === 1 ? "" : "s"} · price per play{" "}
                                <strong className="font-medium text-ink">{flr(me.pricePerPlayWei)} C2FLR</strong>
                            </span>
                        </div>
                        {me.operators.map((op) => (
                            <Operator key={op.operatorId} op={op} />
                        ))}
                    </>
                ) : (
                    <>
                        <div className="mx-auto max-w-lg pt-16 text-center">
                            <h1 className="text-[clamp(28px,3.2vw,38px)] font-medium leading-[1.1] tracking-[-0.02em]">
                                Operator <span className="text-primary">dashboard.</span>
                            </h1>
                            <p className="mt-4 text-[15px] leading-relaxed text-muted">
                                {phase === "signing"
                                    ? "Check your wallet and sign the message. Nothing is sent onchain and there is no fee."
                                    : "Connect the wallet that pays for your epochs. Every deposit, play, and balance is metered here."}
                            </p>
                            {phase === "untied" && (
                                <p className="mt-6 rounded-card border border-line bg-primary-soft p-4 text-left text-[13px] leading-relaxed">
                                    This wallet is not tied to any Foreseer service. Operators get tied at signup: the
                                    owner wallet on the operator account is the one that signs in here.
                                </p>
                            )}
                            {phase === "error" && (
                                <div className="mt-6">
                                    <p className="text-[13px] text-red">{error}</p>
                                    {connected && (
                                        <button onClick={retry} className={`${PRIMARY} mt-4`}>
                                            Try again
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <LockedPreview />
                    </>
                )}
            </main>
        </div>
    );
}

function Operator({ op }: { op: OperatorData }) {
    return (
        <section className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
                <h2 className="text-xl font-medium tracking-[-0.01em]">{op.name}</h2>
                <span className="tech text-[11px] text-muted">
                    operator #{op.operatorId} · since {when(op.createdAt)}
                </span>
            </div>
            <StatGrid
                cells={[
                    ["Balance", `${flr(op.balanceWei)} C2FLR`, true],
                    ["Deposited", `${flr(op.depositedWei)} C2FLR`, false],
                    ["Spent", `${flr(op.spentWei)} C2FLR`, false],
                    ["Epochs used", String(op.epochsUsed), false],
                    ["Plays", String(op.plays), false],
                    ["Player wins", String(op.wins), false],
                    ["Win rate", op.plays === 0 ? "-" : `${((100 * op.wins) / op.plays).toFixed(1)}%`, false],
                    ["Avg payout", op.plays === 0 ? "-" : `${(op.payoutBpSum / op.plays / 10000).toFixed(2)}x`, false],
                ]}
            />
            <Panel title="Deposits" note="ONCHAIN TOPUPS //">
                {op.deposits.length === 0 ? (
                    <Empty>No deposits yet.</Empty>
                ) : (
                    <Table head={["Transaction", "Amount", "When"]} align={["left", "right", "right"]}>
                        {op.deposits.map((d) => (
                            <tr key={d.txHash} className="border-t border-line">
                                <td className="py-3 text-[12.5px]" style={mono}>
                                    {short(d.txHash)}
                                </td>
                                <td className="py-3 text-right tabular-nums">{flr(d.amountWei)} C2FLR</td>
                                <td className="py-3 text-right text-muted">{when(d.createdAt)}</td>
                            </tr>
                        ))}
                    </Table>
                )}
            </Panel>
            <Panel title="Recent plays" note="METERED PER RECEIPT //">
                {op.recent.length === 0 ? (
                    <Empty>No plays yet.</Empty>
                ) : (
                    <Table
                        head={["Epoch / bet", "Client seed", "Result", "Payout", "When"]}
                        align={["left", "left", "left", "right", "right"]}
                    >
                        {op.recent.map((p) => (
                            <tr key={`${p.epochId}-${p.betId}`} className="border-t border-line">
                                <td className="py-3 text-[12.5px]" style={mono}>
                                    {p.epochId} / {p.betId}
                                </td>
                                <td className="py-3 text-[12.5px]" style={mono}>
                                    {p.clientSeed}
                                </td>
                                <td className="py-3">
                                    <span className={p.win ? "text-primary" : "text-muted"}>
                                        {p.win ? "player won" : "house won"}
                                    </span>
                                </td>
                                <td className="py-3 text-right tabular-nums">{(p.payoutBp / 10000).toFixed(2)}x</td>
                                <td className="py-3 text-right text-muted">{when(p.timestamp)}</td>
                            </tr>
                        ))}
                    </Table>
                )}
            </Panel>
        </section>
    );
}

function StatGrid({ cells }: { cells: [string, string, boolean][] }) {
    return (
        <div className="mt-8 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {cells.map(([label, value, accent]) => (
                <div key={label} className="bg-white p-5">
                    <div className="tech text-[11px] text-muted">{label}</div>
                    <div
                        className={`mt-2 tabular-nums ${accent ? "text-2xl font-medium text-primary" : "text-lg font-medium text-ink"}`}
                    >
                        {value}
                    </div>
                </div>
            ))}
        </div>
    );
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
    return (
        <div className="mt-10">
            <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
                <h3 className="text-[15px] font-medium">{title}</h3>
                <span className="tech text-[11px] text-muted" aria-hidden="true">
                    {note}
                </span>
            </div>
            {children}
        </div>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="py-6 text-[13px] text-muted">{children}</p>;
}

function Table({
    head,
    align,
    children,
}: {
    head: string[];
    align: ("left" | "right")[];
    children: React.ReactNode;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
                <thead>
                    <tr className="tech text-[11px] text-muted">
                        {head.map((h, i) => (
                            <th key={h} className={`py-3 font-normal ${align[i] === "right" ? "text-right" : "text-left"}`}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

const MASK = "*****";

// locked preview, real labels and masked values
function LockedPreview() {
    return (
        <div aria-hidden="true" className="pointer-events-none mt-16 select-none opacity-40">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
                <h2 className="text-xl font-medium tracking-[-0.01em]">{MASK}</h2>
                <span className="tech text-[11px] text-muted">operator #{MASK}</span>
            </div>
            <StatGrid
                cells={[
                    ["Balance", `${MASK} C2FLR`, true],
                    ["Deposited", `${MASK} C2FLR`, false],
                    ["Spent", `${MASK} C2FLR`, false],
                    ["Epochs used", MASK, false],
                    ["Plays", MASK, false],
                    ["Player wins", MASK, false],
                    ["Win rate", MASK, false],
                    ["Avg payout", MASK, false],
                ]}
            />
            <Panel title="Deposits" note="ONCHAIN TOPUPS //">
                <Table head={["Transaction", "Amount", "When"]} align={["left", "right", "right"]}>
                    {[0, 1, 2].map((i) => (
                        <tr key={i} className="border-t border-line">
                            <td className="py-3 text-[12.5px]" style={mono}>
                                {MASK}
                            </td>
                            <td className="py-3 text-right">{MASK} C2FLR</td>
                            <td className="py-3 text-right text-muted">{MASK}</td>
                        </tr>
                    ))}
                </Table>
            </Panel>
            <Panel title="Recent plays" note="METERED PER RECEIPT //">
                <Table
                    head={["Epoch / bet", "Client seed", "Result", "Payout", "When"]}
                    align={["left", "left", "left", "right", "right"]}
                >
                    {[0, 1, 2].map((i) => (
                        <tr key={i} className="border-t border-line">
                            <td className="py-3 text-[12.5px]" style={mono}>
                                {MASK}
                            </td>
                            <td className="py-3 text-[12.5px]" style={mono}>
                                {MASK}
                            </td>
                            <td className="py-3 text-muted">{MASK}</td>
                            <td className="py-3 text-right">{MASK}</td>
                            <td className="py-3 text-right text-muted">{MASK}</td>
                        </tr>
                    ))}
                </Table>
            </Panel>
        </div>
    );
}
