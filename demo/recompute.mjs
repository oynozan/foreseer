import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// FORESEER-SPEC sections 2 and 3, node stdlib only
export function draw(serverSeed, clientSeed, nonce, range) {
    const seed = Buffer.from(serverSeed.replace(/^0x/, ""), "hex");
    const limit = 4294967296 - (4294967296 % range);
    let block = 0;
    let buf = createHmac("sha256", seed).update(`${clientSeed}:${nonce}:0`).digest();
    let off = 0;
    for (;;) {
        if (off === buf.length) {
            buf = createHmac("sha256", seed).update(`${clientSeed}:${nonce}:${++block}`).digest();
            off = 0;
        }
        const x = buf.readUInt32BE(off);
        off += 4;
        // Rejection keeps every pocket exactly equally likely
        if (x < limit) return x % range;
    }
}

const [serverSeed, clientSeed, nonce, range = "37"] = process.argv.slice(2);

if (serverSeed === undefined) {
    const golden = "0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    assert.equal(draw(golden, "alice", 0, 10000), 3725);
    console.log("golden vector PASS: alice, nonce 0, range 10000 rolls 3725");
    console.log("usage: node recompute.mjs <serverSeed> <clientSeed> <nonce> [range=37]");
} else {
    console.log(draw(serverSeed, clientSeed, Number(nonce), Number(range)));
}
