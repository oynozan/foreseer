"use client";

import { forwardRef, useMemo } from "react";
import { GEO, ORDER, POCKET_COUNT, pocketAtCell, toneOf } from "@/lib/roulette";

const TONE_CLASS: Record<string, string> = {
    green: "bg-mint text-mint-ink border-mint",
    primary: "bg-primary text-white border-primary",
    dark: "bg-ink text-white border-ink",
};

// Strip is decorative, the receipt carries the information.
const RouletteStrip = forwardRef<HTMLDivElement>(function RouletteStrip(_props, ref) {
    const cells = useMemo(
        () => Array.from({ length: GEO.cellCount }, (_, i) => ({ i, pocket: pocketAtCell(i) })),
        [],
    );

    return (
        <div
            className="reel-viewport reel-mask relative h-24 overflow-hidden rounded-card border border-line bg-white sm:h-28"
            style={{ touchAction: "pan-y" }}
            aria-hidden="true"
            data-cell-count={GEO.cellCount}
            data-order={ORDER.join(",")}
        >
            <div className="absolute inset-y-0 left-1/2 w-0">
                <span className="reel-marker" />
                <div
                    ref={ref}
                    data-reel-cells
                    className="absolute top-1/2 left-0 flex -translate-y-1/2 gap-0.5"
                    style={{ willChange: "transform" }}
                >
                    {cells.map(({ i, pocket }) => (
                        <span
                            key={i}
                            data-cell={i}
                            data-pocket={pocket}
                            className={`tech grid size-12 shrink-0 place-items-center rounded-chip border text-[15px] sm:size-16 ${
                                TONE_CLASS[toneOf(pocket)]
                            }`}
                        >
                            {pocket}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
});

export default RouletteStrip;
export { POCKET_COUNT };
