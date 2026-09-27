/**
 * Pure-logic tests for the editor caret math (web/studio/caret_math.mjs).
 * Child lists mirror what the editor renders:
 *   text     → docLen = characters contributed
 *   sentinel → docLen = 0 (zero-width caret anchor)
 *   token    → docLen = serialized marker length
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { offsetOfPoint, pointForOffset, totalLength } = await import(
  pathToFileURL(path.join(root, "web", "studio", "caret_math.mjs"))
);

// "word " + {{krea2:a|A}} (12 chars) + " end"  → doc is `word {{krea2:a|A}} end`
const children = [
  { kind: "text", docLen: 5 },     // "word "
  { kind: "sentinel", docLen: 0 },
  { kind: "token", docLen: 12 },   // {{krea2:a|A}}
  { kind: "text", docLen: 4 },     // " end"
];

assert.equal(totalLength(children), 21);

// --- offsetOfPoint ----------------------------------------------------------

assert.equal(offsetOfPoint(children, 0, 0), 0);
assert.equal(offsetOfPoint(children, 0, 3), 3, "plain text offsets pass through");
assert.equal(offsetOfPoint(children, 0, 99), 5, "clamped to child length");
assert.equal(offsetOfPoint(children, 1, 0), 5, "sentinel maps to its doc position");
assert.equal(offsetOfPoint(children, 2, 0), 5, "token start boundary");
assert.equal(offsetOfPoint(children, 2, 1), 17, "token end boundary");
// Selecting *into* a token expands outward.
assert.equal(offsetOfPoint(children, 2, 1, false), 5, "start point inside token retracts to token start");
assert.equal(offsetOfPoint(children, 2, 1, true), 17, "end point inside token extends to token end");
assert.equal(offsetOfPoint(children, 3, 1), 18);
assert.equal(offsetOfPoint(children, 99, 0), 21, "past-the-end clamps to doc length");

// --- pointForOffset ---------------------------------------------------------

assert.deepEqual(pointForOffset(children, 0), { index: 0, offsetInChild: 0 });
assert.deepEqual(pointForOffset(children, 3), { index: 0, offsetInChild: 3 });
assert.deepEqual(pointForOffset(children, 5), { index: 1, offsetInChild: 0 }, "boundary lands on the sentinel");
assert.deepEqual(pointForOffset(children, 10), { index: 2, offsetInChild: 1 }, "offset strictly inside a token collapses to after it (natural typing position)");
assert.deepEqual(pointForOffset(children, 17), { index: 3, offsetInChild: 0 }, "token end maps to the following text start");
assert.deepEqual(pointForOffset(children, 18), { index: 3, offsetInChild: 1 });
assert.deepEqual(pointForOffset(children, 21), { index: children.length, offsetInChild: 0 });
assert.deepEqual(pointForOffset(children, 999), { index: children.length, offsetInChild: 0 });

// --- round-trip -------------------------------------------------------------

// Every doc offset must map to a point whose offsetOfPoint round-trips,
// except offsets strictly inside a token (those collapse to its end by
// design — pills are atomic).
const insideToken = (offset) => offset > 5 && offset < 17;
for (let offset = 0; offset <= 21; offset++) {
  const point = pointForOffset(children, offset);
  const back = offsetOfPoint(children, point.index, point.offsetInChild, point.offsetInChild > 0);
  if (insideToken(offset)) continue;
  assert.equal(back, offset, `round-trip failed at ${offset}`);
}
// Strictly-inside offsets collapse to the token end boundary.
assert.equal(
  offsetOfPoint(children, 2, 1, true),
  17,
  "collapsed-inside-token point round-trips to the token end"
);

// Token-only document with sentinels on both sides.
const tokenOnly = [
  { kind: "sentinel", docLen: 0 },
  { kind: "token", docLen: 12 },
  { kind: "sentinel", docLen: 0 },
];
assert.equal(totalLength(tokenOnly), 12);
assert.deepEqual(pointForOffset(tokenOnly, 0), { index: 0, offsetInChild: 0 });
assert.deepEqual(pointForOffset(tokenOnly, 12), { index: 2, offsetInChild: 0 });
assert.equal(offsetOfPoint(tokenOnly, 2, 0), 12, "trailing sentinel maps to doc end");

console.log("frontend_studio_caret_math: all assertions passed");
