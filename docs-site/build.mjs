// Builds example.json from the golden vectors, then bundles the widget.
// Run: packages/ts/node_modules/.bin/tsx docs-site/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { MerkleTree, toBytes, toHex } from "../packages/ts/src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const e2e = JSON.parse(readFileSync(join(here, "..", "spec", "vectors", "e2e.json"), "utf8"));
const rules = JSON.parse(readFileSync(join(here, "..", "spec", "vectors", "rules.json"), "utf8"));

const entry = e2e.receipts[0];
const rule = rules.valid.find((r) => r.name === entry.ruleName).rule;
const digests = e2e.receipts.map((r) => toBytes(r.digest));
const tree = new MerkleTree(digests);
writeFileSync(
    join(here, "src", "example.json"),
    JSON.stringify(
        {
            teeId: e2e.teeId,
            receipt: entry.receipt,
            signature: entry.signature,
            rule,
            serverSeed: e2e.serverSeed,
            seedCommit: e2e.seedCommit,
            merkleRoot: e2e.merkleRoot,
            proof: tree.proof(0).map(toHex),
        },
        null,
        2,
    ) + "\n",
);

const requireTs = createRequire(join(here, "..", "packages", "ts", "package.json"));
const requireTsup = createRequire(requireTs.resolve("tsup/package.json"));
const esbuild = requireTsup("esbuild");
await esbuild.build({
    entryPoints: [join(here, "src", "widget-entry.mjs")],
    bundle: true,
    format: "iife",
    outfile: join(here, "foreseer-widget.js"),
    minify: true,
    target: "es2022",
    logLevel: "info",
});
console.log("widget built");
