// Pure core, no imports, no Math.random, no Date.now.

export type Tone = "green" | "primary" | "dark";

export interface RouletteRule {
    v: 0;
    random: { type: "int"; min: number; max: number; count: number };
    win: {
        op: "and";
        args: [
            { op: ">="; l: { r: number }; r: { c: number } },
            { op: "<="; l: { r: number }; r: { c: number } },
        ];
    };
    payout_bp: number;
}

export const POCKET_COUNT = 15;

// Green, then strict orange and dark alternation across the wrap.
export const ORDER: readonly number[] = [0, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13, 7, 14];

export const SLOT: readonly number[] = (() => {
    const slots = new Array<number>(POCKET_COUNT);
    ORDER.forEach((pocket, index) => {
        slots[pocket] = index;
    });
    return slots;
})();

export const BAND = { min: 1, max: 7 } as const;

export function toneOf(pocket: number): Tone {
    if (pocket === 0) return "green";
    return pocket <= BAND.max ? "primary" : "dark";
}

// Mirrors RTP_BP in packages/ts/src/presets.ts, not exported there.
const RTP_BP = 9900;

export function payoutBp(winCount: number, outcomeCount: number): number {
    if (winCount < 1) throw new Error("rule leaves no winning outcome");
    return Math.floor((RTP_BP * outcomeCount) / winCount);
}

// The wheel's rule document, bound into every receipt.
export const WHEEL_RULE: RouletteRule = Object.freeze({
    v: 0,
    random: { type: "int", min: 0, max: POCKET_COUNT - 1, count: 1 },
    win: {
        op: "and",
        args: [
            { op: ">=", l: { r: 0 }, r: { c: BAND.min } },
            { op: "<=", l: { r: 0 }, r: { c: BAND.max } },
        ],
    },
    payout_bp: payoutBp(BAND.max - BAND.min + 1, POCKET_COUNT),
}) as RouletteRule;

// Pinned so an accidental rule edit fails the test loudly.
export const WHEEL_RULE_HASH = "0x16e58af8e0ba6717dadcb49de1f953fc13434f536ee5d7ec2d859dce8bb1cf6d";

export const GEO = {
    cell: 64,
    gap: 2,
    pitch: 66,
    cellNarrow: 48,
    gapNarrow: 2,
    pitchNarrow: 50,
    cellCount: 240,
    baseCell: 45,
    initialCell: 47,
    loops: 8,
    maxJitter: 0.3,
} as const;

export const SPIN_MS = 4200;
export const SPIN_EASE = "cubic-bezier(0.10, 0.80, 0.12, 1)";
export const MAX_SPINS = 10;

export function pocketAtCell(index: number): number {
    return ORDER[((index % POCKET_COUNT) + POCKET_COUNT) % POCKET_COUNT];
}

export function jitterFromSignature(signature: string): number {
    const byte = parseInt(signature.slice(-2), 16);
    const safe = Number.isFinite(byte) ? byte : 0;
    return (safe / 255 - 0.5) * 2 * GEO.maxJitter;
}

export function spinTarget(input: { startCell: number; pocket: number; signature: string }): {
    targetCell: number;
    jitter: number;
    travelCells: number;
} {
    const startSlot = ((input.startCell % POCKET_COUNT) + POCKET_COUNT) % POCKET_COUNT;
    const wantSlot = SLOT[input.pocket];
    const delta = ((wantSlot - startSlot) % POCKET_COUNT + POCKET_COUNT) % POCKET_COUNT;
    const targetCell = input.startCell + GEO.loops * POCKET_COUNT + delta;
    return {
        targetCell,
        jitter: jitterFromSignature(input.signature),
        travelCells: targetCell - input.startCell,
    };
}

export function translateXFor(input: { cell: number; jitter: number; pitch: number; cellWidth: number }): number {
    return -((input.cell + input.jitter) * input.pitch + input.cellWidth / 2);
}

export function cellUnderMarker(input: { translateX: number; pitch: number; cellWidth: number }): number {
    return (-input.translateX - input.cellWidth / 2) / input.pitch;
}

export function restAfterSettle(targetCell: number): number {
    return GEO.baseCell + (((targetCell % POCKET_COUNT) + POCKET_COUNT) % POCKET_COUNT);
}

export function resultLine(pocket: number, betId: bigint, epochId: bigint): string {
    return `Pocket ${pocket}. Determined before you spun. Spin ${betId} of epoch ${epochId}.`;
}
