import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
let failures = 0;

function fail(msg) {
    failures++;
    console.error("FAIL " + msg);
}

function ok(msg) {
    console.log("ok   " + msg);
}

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

// no em dashes in authored files
const authored = ["app", "components", "data", "lib", "scripts", "widget"]
    .filter((d) => existsSync(join(root, d)))
    .flatMap((d) => walk(join(root, d)))
    .concat([join(root, "smoke.mjs"), join(root, "next.config.ts")]);
const EM_DASH = String.fromCharCode(8212);
for (const file of authored) {
    if (readFileSync(file, "utf8").includes(EM_DASH)) fail("em dash in " + file);
}
ok("no em dashes in " + authored.length + " files");

// golden receipt must match the spec vectors
const mine = JSON.parse(readFileSync(join(root, "data", "example.json"), "utf8"));
const e2e = JSON.parse(readFileSync(join(root, "..", "spec", "vectors", "e2e.json"), "utf8"));
const drifted =
    JSON.stringify(mine.receipt) !== JSON.stringify(e2e.receipts[0].receipt) ||
    mine.merkleRoot !== e2e.merkleRoot ||
    mine.serverSeed !== e2e.serverSeed;
if (drifted) fail("data/example.json drifted from spec/vectors/e2e.json");
else ok("golden receipt matches spec vectors");

// 1px border discipline
const css = readFileSync(join(root, "app", "globals.css"), "utf8");
if (/\b2px solid\b/.test(css)) fail("2px border in globals.css");
else ok("no 2px borders");

// prerendered page checks
const REQUIRED_IDS = [
    "hero",
    "demo-dice",
    "demo-coinflip",
    "demo-roulette",
    "code",
    "how-it-works",
    "flare",
    "economy",
    "faq",
];
const htmlPath = join(root, ".next", "server", "app", "index.html");
if (existsSync(htmlPath)) {
    const page = readFileSync(htmlPath, "utf8");
    const h1s = page.match(/<h1[\s>]/g) ?? [];
    if (h1s.length !== 1) fail("expected exactly one h1, found " + h1s.length);
    else ok("exactly one h1");
    const missing = REQUIRED_IDS.filter((id) => !page.includes(`id="${id}"`));
    if (missing.length) fail("missing section ids: " + missing.join(", "));
    else ok("all " + REQUIRED_IDS.length + " required ids present");

    // hrefs resolve to ids, public files, or declared doc paths
    const linksSrc = readFileSync(join(root, "lib", "links.ts"), "utf8");
    const declared = [...linksSrc.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
    let broken = 0;
    for (const [, url] of page.matchAll(/(?:href|src)="([^"]+)"/g)) {
        if (/^(https?:|mailto:|data:)/.test(url)) continue;
        if (url.startsWith("#")) {
            if (!page.includes(`id="${url.slice(1)}"`)) {
                fail("dangling anchor " + url);
                broken++;
            }
        } else if (url.startsWith("/") && !url.startsWith("/_next/")) {
            const [path, hash] = url.split("#");
            const clean = path.split("?")[0] || "/";
            if (hash && clean === "/" && !page.includes(`id="${hash}"`)) {
                fail("dangling anchor " + url);
                broken++;
                continue;
            }
            if (clean === "/" || clean === "/icon.png") continue;
            if (existsSync(join(root, "public", clean))) continue;
            if (existsSync(join(root, ".next", "server", "app", clean + ".html"))) continue;
            if (declared.includes(clean)) continue;
            fail("unresolved local url " + url);
            broken++;
        }
    }
    if (!broken) ok("all local hrefs resolve");
} else {
    fail("no prerendered index.html, run pnpm build first");
}

// roulette core, rule hash and landing math, needs the tsx runner
const tsx = join(root, "..", "packages", "ts", "node_modules", ".bin", "tsx");
if (existsSync(tsx) || existsSync(tsx + ".CMD")) {
    const run = spawnSync(tsx, [join(root, "scripts", "roulette-test.mjs")], { shell: true, encoding: "utf8" });
    if (run.status === 0) ok("roulette core test green");
    else fail("roulette core test failed:\n" + (run.stdout ?? "") + (run.stderr ?? ""));
} else {
    fail("tsx runner missing, cannot run the roulette core test");
}

// verify page and widget bundle exist
if (existsSync(join(root, ".next", "server", "app", "verify.html"))) ok("verify page prerendered");
else fail("verify page missing from build");
if (existsSync(join(root, "public", "foreseer-widget.js"))) ok("widget bundle present");
else fail("public/foreseer-widget.js missing, run web/scripts/build-widget.mjs");

if (failures) {
    console.error(failures + " check(s) failed");
    process.exit(1);
}
console.log("smoke green");
