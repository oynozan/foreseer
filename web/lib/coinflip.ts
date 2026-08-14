// Pure core, no imports, no Math.random, no Date.now.

export type Face = "heads" | "tails";

export interface CoinRule {
    v: 0;
    random: { type: "int"; min: number; max: number; count: number };
    win: { op: "=="; l: { r: number }; r: { c: number } };
    payout_bp: number;
}

export const HEADS = 1;

export function faceOf(draw: number): Face {
    return draw === HEADS ? "heads" : "tails";
}

// Mirrors RTP_BP in packages/ts/src/presets.ts, not exported there.
const RTP_BP = 9900;

export function payoutBp(winCount: number, outcomeCount: number): number {
    if (winCount < 1) throw new Error("rule leaves no winning outcome");
    return Math.floor((RTP_BP * outcomeCount) / winCount);
}

// The coin's rule document, identical to the sdk coinflip preset.
export const COIN_RULE: CoinRule = Object.freeze({
    v: 0,
    random: { type: "int", min: 0, max: 1, count: 1 },
    win: { op: "==", l: { r: 0 }, r: { c: HEADS } },
    payout_bp: payoutBp(1, 2),
}) as CoinRule;

// Pinned so an accidental rule edit fails the test loudly.
export const COIN_RULE_HASH = "0x39a389be93ce464ef161749ac9eb27bb013d1ad39e8dbb8d34d3daa24c3c2238";

export const FLIP_MS = 1500;
export const FLIP_EASE = "cubic-bezier(0.12, 0.78, 0.16, 1)";
export const MAX_FLIPS = 10;
export const MIN_TURNS = 4;
export const TURN_SPREAD = 4;

export function turnsFromSignature(signature: string): number {
    const byte = parseInt(signature.slice(-2), 16);
    const safe = Number.isFinite(byte) ? byte : 0;
    return MIN_TURNS + (safe % TURN_SPREAD);
}

export function faceUpAt(deg: number): Face {
    const wrapped = ((deg % 360) + 360) % 360;
    return wrapped < 90 || wrapped >= 270 ? "heads" : "tails";
}

export function flipTarget(input: { fromDeg: number; draw: number; signature: string }): {
    targetDeg: number;
    turns: number;
} {
    const wantDeg = input.draw === HEADS ? 0 : 180;
    const fromWrapped = ((input.fromDeg % 360) + 360) % 360;
    const delta = ((wantDeg - fromWrapped) % 360 + 360) % 360;
    const turns = turnsFromSignature(input.signature);
    return { targetDeg: input.fromDeg + turns * 360 + delta, turns };
}

export function restAfterFlip(targetDeg: number): number {
    return ((targetDeg % 360) + 360) % 360;
}

export function resultLine(draw: number, betId: bigint, epochId: bigint): string {
    return `${faceOf(draw)}. Determined before you flipped. Flip ${betId} of epoch ${epochId}.`;
}
