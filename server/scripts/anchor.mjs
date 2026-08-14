// Commits and anchors server epochs on ForeseerInstructionSender.
// Usage: node scripts/anchor.mjs [epochId ...]   (no args: every unanchored closed epoch)
import { Contract, JsonRpcProvider, Wallet } from "ethers";

const ABI = [
    "function commitEpoch(uint64 epochId, bytes32 seedCommit) external",
    "function anchorEpoch(uint16 specVersion, bytes32 codeVersion, uint64 epochId, bytes32 seedCommit, bytes32 serverSeed, bytes32 merkleRoot, uint64 receiptCount, bytes signature) external",
    "function epochs(uint64) view returns (bytes32 seedCommit, bytes32 merkleRoot, bytes32 serverSeed, uint64 receiptCount, bool committed, bool anchored)",
    "function teeId() view returns (address)",
];

const api = process.env.FORESEER_API ?? "http://localhost:8787";
const rpcUrl = process.env.FORESEER_CHAIN_RPC ?? "https://coston2-api.flare.network/ext/C/rpc";
const sender = process.env.FORESEER_SENDER;
const posterKey = process.env.FORESEER_POSTER_KEY;

if (!sender || !posterKey) {
    console.error("set FORESEER_SENDER and FORESEER_POSTER_KEY");
    process.exit(1);
}

const get = async (path) => {
    const res = await fetch(`${api}${path}`);
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
};

const provider = new JsonRpcProvider(rpcUrl);
const poster = new Wallet(posterKey, provider);
const contract = new Contract(sender, ABI, poster);

const health = await get("/health");
const onchainTeeId = (await contract.teeId()).toLowerCase();
if (onchainTeeId !== health.teeId.toLowerCase()) {
    console.error(`teeId mismatch: server signs with ${health.teeId}, contract expects ${onchainTeeId}`);
    console.error("anchorEpoch would revert with 'not signed by the tee'. Align the keys before anchoring.");
    process.exit(1);
}
console.log(`poster ${poster.address}, sender ${sender}, teeId ${onchainTeeId}`);

let targets = process.argv.slice(2).map(Number);
if (targets.length === 0) {
    const current = await get("/epochs/current");
    for (let id = 1; id < current.epochId; id++) targets.push(id);
}

let anchored = 0;
for (const epochId of targets) {
    const epoch = await get(`/epochs/${epochId}`);
    if (epoch.closedAt === null) {
        console.log(`epoch ${epochId}: still open, skipping`);
        continue;
    }
    const record = await contract.epochs(epochId);
    if (record.anchored) {
        console.log(`epoch ${epochId}: already anchored`);
        continue;
    }
    if (!record.committed) {
        const tx = await contract.commitEpoch(epochId, epoch.seedCommit);
        await tx.wait();
        console.log(`epoch ${epochId}: committed ${tx.hash}`);
    }
    const tx = await contract.anchorEpoch(
        1,
        epoch.codeVersion ?? "0x6094010faf9dafee4b20d2dd6d5bc2ffcbb480ee3d8f3226c5625d5076f7a28b",
        epochId,
        epoch.seedCommit,
        epoch.serverSeed,
        epoch.merkleRoot,
        epoch.receiptCount,
        epoch.closeSignature,
    );
    await tx.wait();
    console.log(`epoch ${epochId}: anchored ${tx.hash} (${epoch.receiptCount} receipts)`);
    anchored += 1;
}
console.log(`done, ${anchored} epoch(s) anchored`);
