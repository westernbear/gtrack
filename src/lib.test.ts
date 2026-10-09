// Run: node --experimental-strip-types src/lib.test.ts
import assert from "node:assert";
import {
  TRANSPARENT_GIF,
  isProxyOpen,
  isSelfOpen,
  summarize,
  type Open,
} from "./lib.ts";

// valid 1x1 GIF header
assert.deepEqual([...TRANSPARENT_GIF.slice(0, 6)], [...Buffer.from("GIF89a")]);
assert.equal(TRANSPARENT_GIF.at(-1), 0x3b); // trailer

const t0 = 1_000_000_000_000;
assert.equal(isProxyOpen(t0, t0 + 5_000), true); // 5s after send → prefetch
assert.equal(isProxyOpen(t0, t0 + 60_000), false); // 1m later → human

assert.equal(isSelfOpen(t0, [t0 + 10_000]), true); // within self window
assert.equal(isSelfOpen(t0, [t0 + 300_000]), false);
assert.equal(isSelfOpen(t0, []), false);

const mails = [
  { id: "a", subject: "Hi", recipient: "x@y.com", sent_at: t0 },
  { id: "b", subject: "Bye", recipient: "z@y.com", sent_at: t0 + 1000 },
];
const opens: Open[] = [
  { id: "a", opened_at: t0 + 60_000, is_proxy: 0, is_self: 0 }, // real
  { id: "a", opened_at: t0 + 90_000, is_proxy: 0, is_self: 0 }, // real
  { id: "a", opened_at: t0 + 2_000, is_proxy: 1, is_self: 0 }, // auto
  { id: "a", opened_at: t0 + 70_000, is_proxy: 0, is_self: 1 }, // self → dropped
  // b: no opens
];
const rows = summarize(mails, opens);
assert.equal(rows[0].id, "b"); // newest first
const a = rows.find((r) => r.id === "a")!;
assert.equal(a.opened, true);
assert.equal(a.open_count, 2);
assert.equal(a.auto_count, 1);
assert.equal(a.first_open, t0 + 60_000);
assert.equal(a.last_open, t0 + 90_000);
const b = rows.find((r) => r.id === "b")!;
assert.equal(b.opened, false);
assert.equal(b.open_count, 0);

console.log("lib.test.ts: all assertions passed");
