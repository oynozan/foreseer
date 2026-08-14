import type { Rule } from "foreseer-sdk";

export interface DemoConfig {
    key: string;
    rule: Rule;
    maxPlays: number;
    outcomeLabel: string;
}

export interface PlayRecord {
    epochId: bigint;
    betId: bigint;
    nonce: bigint;
    draw: number;
    win: boolean;
    payoutBp: number;
    ruleHash: string;
    signature: string;
    signatureOk: boolean;
}

export interface CheckRow {
    key: "signature" | "commit" | "outcome" | "merkle";
    label: string;
    ok: boolean;
    detail: string;
}

export interface RevealView {
    serverSeed: string;
    merkleRoot: string;
    receiptCount: number;
    proofDepth: number;
    checks: CheckRow[];
    allGreen: boolean;
}

export interface EpochView {
    epochId: bigint;
    seedCommit: string;
    clientSeed: string;
    teeId: string;
    plays: PlayRecord[];
    reveal: RevealView | null;
}

export interface TeeHandle {
    snapshot(): EpochView;
    play(rule?: Rule): PlayRecord;
    reveal(): RevealView;
    startNextEpoch(): EpochView;
}

type Loaded = {
    core: typeof import("foreseer-sdk");
    reference: typeof import("foreseer-sdk/reference");
    verify: typeof import("foreseer-sdk/verify");
};

const pending = new Map<string, Promise<TeeHandle>>();

async function build(config: DemoConfig): Promise<TeeHandle> {
    const [core, reference, verify]: [Loaded["core"], Loaded["reference"], Loaded["verify"]] = await Promise.all([
        import("foreseer-sdk"),
        import("foreseer-sdk/reference"),
        import("foreseer-sdk/verify"),
    ]);

    const tee = new reference.ReferenceTee({});
    const clientSeed = reference.generateClientSeed(12);

    let epochId: bigint = BigInt(0);
    let seedCommit: `0x${string}` = "0x";
    let plays: PlayRecord[] = [];
    let signed: ReturnType<typeof tee.play>[] = [];
    let played: Rule[] = [];
    let reveal: RevealView | null = null;
    let open = false;

    // only ever called explicitly, never from snapshot
    function openEpoch(): void {
        if (open) return;
        const started = tee.openEpoch();
        epochId = started.epochId;
        seedCommit = started.seedCommit;
        plays = [];
        signed = [];
        played = [];
        reveal = null;
        open = true;
    }

    function snapshot(): EpochView {
        return { epochId, seedCommit, clientSeed, teeId: tee.teeId, plays: [...plays], reveal };
    }

    openEpoch();

    return {
        snapshot,
        play(rule: Rule = config.rule) {
            if (!open) throw new Error("start a new epoch first");
            if (plays.length >= config.maxPlays) throw new Error("epoch full, reveal to continue");
            const bet = tee.play({ clientSeed, rule });
            const sigCheck = verify.verifyReceiptSignature(bet, tee.domain, tee.teeId);
            const record: PlayRecord = {
                epochId: bet.receipt.epochId,
                betId: bet.receipt.betId,
                nonce: bet.receipt.nonce,
                draw: bet.receipt.draws[0],
                win: bet.receipt.win,
                payoutBp: bet.receipt.payoutBp,
                ruleHash: core.ruleHash(rule),
                signature: bet.signature,
                signatureOk: sigCheck.ok,
            };
            signed.push(bet);
            played.push(rule);
            plays.push(record);
            return record;
        },
        reveal() {
            if (!open) throw new Error("no open epoch");
            if (signed.length === 0) throw new Error("play at least once before revealing");
            const closed = tee.closeEpoch();
            open = false;

            const leaves = signed.map((s) => core.receiptDigest(s.receipt, tee.domain));
            const rootBytes = core.toBytes(closed.merkleRoot);
            let proofDepth = 0;
            let merkleOk = true;
            for (let i = 0; i < leaves.length; i++) {
                const proof = core.merkleProof(leaves, i);
                proofDepth = proof.length;
                if (!verify.verifyMerkleProof(leaves[i], proof, rootBytes)) merkleOk = false;
            }

            const commitOk = verify.verifyCommit(closed.serverSeed, seedCommit);
            let outcomeOk = true;
            signed.forEach((s, i) => {
                if (!verify.verifyOutcome(s.receipt, played[i], closed.serverSeed).ok) outcomeOk = false;
            });
            const signatureOk = plays.every((s) => s.signatureOk);

            const checks: CheckRow[] = [
                {
                    key: "signature",
                    label: "Signed by the house",
                    ok: signatureOk,
                    detail: tee.teeId,
                },
                {
                    key: "commit",
                    label: "Seed matches the commitment",
                    ok: commitOk,
                    detail: closed.serverSeed,
                },
                {
                    key: "outcome",
                    label: config.outcomeLabel,
                    ok: outcomeOk,
                    detail: `${plays.length} recomputed`,
                },
                {
                    key: "merkle",
                    label: "Receipts prove into the root",
                    ok: merkleOk,
                    detail: `${closed.merkleRoot} at depth ${proofDepth}`,
                },
            ];

            reveal = {
                serverSeed: closed.serverSeed,
                merkleRoot: closed.merkleRoot,
                receiptCount: closed.receiptCount,
                proofDepth,
                checks,
                allGreen: checks.every((c) => c.ok),
            };
            return reveal;
        },
        startNextEpoch() {
            openEpoch();
            return snapshot();
        },
    };
}

export function ensureTee(config: DemoConfig): Promise<TeeHandle> {
    let handle = pending.get(config.key);
    if (!handle) {
        handle = build(config);
        pending.set(config.key, handle);
    }
    return handle;
}
