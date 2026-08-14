// Pure core, no imports, no Math.random, no Date.now.

export type Mode = "under" | "over";

export interface DiceRule {
    v: 0;
    random: { type: "int"; min: number; max: number; count: number };
    win: { op: ">" | "<"; l: { r: number }; r: { c: number } };
    payout_bp: number;
}

export const OUTCOMES = 10000;
export const MAX_DRAW = OUTCOMES - 1;
export const MIN_TARGET = 1;
export const MAX_TARGET = 99;
export const DEFAULT_TARGET = 50;
export const DEFAULT_MODE: Mode = "over";
export const MAX_ROLLS = 10;

export const ROLL_MS = 1100;
export const ROLL_EASE = "cubic-bezier(0.12, 0.78, 0.16, 1)";
export const THUMB_PX = 16;

// Mirrors RTP_BP in packages/ts/src/presets.ts, not exported there.
const RTP_BP = 9900;

export function payoutBp(winCount: number, outcomeCount: number): number {
    if (winCount < 1) throw new Error("rule leaves no winning outcome");
    return Math.floor((RTP_BP * outcomeCount) / winCount);
}

export function clampTarget(percent: number): number {
    if (!Number.isFinite(percent)) return DEFAULT_TARGET;
    const whole = Math.round(percent);
    return whole < MIN_TARGET ? MIN_TARGET : whole > MAX_TARGET ? MAX_TARGET : whole;
}

export function targetUnits(percent: number): number {
    return clampTarget(percent) * 100;
}

export function winCount(percent: number, mode: Mode): number {
    const target = targetUnits(percent);
    return mode === "over" ? MAX_DRAW - target : target;
}

// Mirrors dice() in packages/ts/src/presets.ts.
export function diceRule(percent: number, mode: Mode): DiceRule {
    return {
        v: 0,
        random: { type: "int", min: 0, max: MAX_DRAW, count: 1 },
        win: { op: mode === "over" ? ">" : "<", l: { r: 0 }, r: { c: targetUnits(percent) } },
        payout_bp: payoutBp(winCount(percent, mode), OUTCOMES),
    };
}

export function isHit(draw: number, percent: number, mode: Mode): boolean {
    const target = targetUnits(percent);
    return mode === "over" ? draw > target : draw < target;
}

export function rollLabel(draw: number): string {
    return `${Math.floor(draw / 100)}.${String(draw % 100).padStart(2, "0")}`;
}

export function rollFraction(draw: number): number {
    return draw / OUTCOMES;
}

export function targetFraction(percent: number): number {
    return clampTarget(percent) / 100;
}

// The thumb centre travels inside the track, so every mark uses this offset.
export function trackOffset(fraction: number): string {
    return `calc(${THUMB_PX / 2}px + ${fraction} * (100% - ${THUMB_PX}px))`;
}

export function offsetPx(fraction: number, trackWidth: number): number {
    return THUMB_PX / 2 + fraction * (trackWidth - THUMB_PX);
}

export function zoneGradient(percent: number, mode: Mode): string {
    const stop = trackOffset(targetFraction(percent));
    const lose = "var(--color-line)";
    const win = "var(--color-primary)";
    return mode === "under"
        ? `linear-gradient(to right, ${win} 0 ${stop}, ${lose} 0)`
        : `linear-gradient(to right, ${lose} 0 ${stop}, ${win} 0)`;
}

export function resultLine(draw: number, percent: number, mode: Mode, betId: bigint, epochId: bigint): string {
    return `Rolled ${rollLabel(draw)} against ${mode} ${clampTarget(percent)}. Determined before you played. Roll ${betId} of epoch ${epochId}.`;
}
