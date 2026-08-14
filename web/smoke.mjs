import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
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
const authored = ["app", "components", "data", "lib"]
    .filter((d) => existsSync(join(root, d)))
    .flatMap((d) => walk(join(root, d)))
    .concat([join(root, "smoke.mjs"), join(root, "next.config.ts")]);
const EM_DASH = String.fromCharCode(8212);
for (const file of authored) {
    if (readFileSync(file, "utf8").includes(EM_DASH)) fail("em dash in " + file);
}
ok("no em dashes in " + authored.length + " files");

// golden receipt must match docs-site source
const mine = JSON.parse(readFileSync(join(root, "data", "example.json"), "utf8"));
const theirs = JSON.parse(readFileSync(join(root, "..", "docs-site", "src", "example.json"), "utf8"));
if (JSON.stringify(mine) !== JSON.stringify(theirs)) fail("data/example.json drifted from docs-site/src/example.json");
else ok("golden receipt matches docs-site");

// 1px border discipline
const css = readFileSync(join(root, "app", "globals.css"), "utf8");
if (/\b2px solid\b/.test(css)) fail("2px border in globals.css");
else ok("no 2px borders");

// prerendered page checks
const REQUIRED_IDS = ["hero", "demo-dice", "demo-coinflip", "demo-roulette", "code", "how-it-works", "faq"];
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
            if (!page.includes(`id="${url.slice(1)}"`)) fail("dangling anchor " + url) || broken++;
        } else if (url.startsWith("/") && !url.startsWith("/_next/")) {
            const clean = url.split("?")[0];
            if (clean === "/" || clean === "/icon.png") continue;
            if (existsSync(join(root, "public", clean))) continue;
            if (declared.includes(clean)) continue;
            fail("unresolved local url " + url);
            broken++;
        }
    }
    if (!broken) ok("all local hrefs resolve");
} else {
    fail("no prerendered index.html, run pnpm build first");
}

if (failures) {
    console.error(failures + " check(s) failed");
    process.exit(1);
}
console.log("smoke green");
