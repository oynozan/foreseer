import { JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";
import { api, cfg, operatorHeaders } from "./config.mjs";

const amount = process.argv[2] ?? "1";
if (cfg.walletKey === undefined) throw new Error("DEMO_WALLET_KEY missing, run: node setup.mjs");

const health = await api("GET", "/health");
if (health.treasury === null) throw new Error("Foreseer server has no treasury configured");

const wallet = new Wallet(cfg.walletKey, new JsonRpcProvider(cfg.rpc));
console.log(`paying ${amount} to treasury ${health.treasury} from ${wallet.address}`);
const tx = await wallet.sendTransaction({ to: health.treasury, value: parseEther(amount) });
console.log(`tx ${tx.hash}, waiting for confirmation`);
await tx.wait();

const credited = await api("POST", "/billing/topup", { txHash: tx.hash }, operatorHeaders());
console.log(`credited ${formatEther(credited.creditedWei)}, balance ${formatEther(credited.balanceWei)}`);
