import { writeFileSync } from "node:fs";
import { JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";
import { api, cfg, envPath } from "./config.mjs";

const wallet = cfg.walletKey ? new Wallet(cfg.walletKey) : Wallet.createRandom();
const ownerWallet = wallet.address.toLowerCase();
const name = `roulette-demo-${ownerWallet.slice(2, 10)}`;

let operatorKey = cfg.operatorKey;
if (operatorKey === undefined) {
    const created = await api("POST", "/admin/operators", { name, ownerWallet }, { "x-admin-key": cfg.adminKey });
    operatorKey = created.apiKey;
    console.log(`operator ${created.id} "${created.name}" created, wallet ${ownerWallet}`);
} else {
    console.log(`operator key already present, wallet ${ownerWallet}`);
}

const provider = new JsonRpcProvider(cfg.rpc);
let balance = await provider.getBalance(wallet.address);
if (balance < parseEther("1") && cfg.funderKey) {
    const funder = new Wallet(cfg.funderKey, provider);
    console.log(`funding ${wallet.address} with 5 native tokens from ${funder.address}`);
    await (await funder.sendTransaction({ to: wallet.address, value: parseEther("5") })).wait();
    balance = await provider.getBalance(wallet.address);
}
console.log(`wallet balance: ${formatEther(balance)}`);
if (balance === 0n) {
    console.log("wallet is empty: fund it (faucet or FUNDER_KEY) before topping up");
}

const lines = [
    `FORESEER_API=${cfg.api}`,
    `FORESEER_ADMIN_KEY=${cfg.adminKey}`,
    `DEMO_OPERATOR_KEY=${operatorKey}`,
    `DEMO_WALLET_KEY=${wallet.privateKey}`,
    `CHAIN_RPC=${cfg.rpc}`,
    `DEMO_PORT=${cfg.port}`,
];
if (cfg.funderKey) lines.push(`FUNDER_KEY=${cfg.funderKey}`);
writeFileSync(envPath, lines.join("\n") + "\n");
console.log(`.env written, next: node topup.mjs 1`);
