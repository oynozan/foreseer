// Widget smoke: golden vector through the exact widget logic.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runChecks } from "../widget/widget-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const example = JSON.parse(readFileSync(join(here, "..", "data", "example.json"), "utf8"));

const good = runChecks({ ...example, expectedTeeId: example.teeId, chainId: 114 });
console.log("golden example:", JSON.stringify({ allGreen: good.allGreen, teeId: good.teeId }));
if (!good.allGreen) throw new Error("golden example must verify");

const forged = structuredClone(example);
forged.receipt.win = !forged.receipt.win;
const bad = runChecks({ ...forged, expectedTeeId: example.teeId, chainId: 114 });
const failing = Object.entries(bad.checks)
    .filter(([, c]) => !c.ok)
    .map(([k]) => k)
    .sort();
console.log("forged receipt fails:", failing.join(", "));
if (bad.allGreen || failing.join(",") !== "merkle,outcome,signature") {
    throw new Error("forged receipt must fail signature, outcome, merkle");
}
console.log("widget smoke PASSED");
