import test from "node:test";
import assert from "node:assert/strict";

import { parseUnits, formatUnits, parseEther, formatEther } from "../src/chain/units.ts";

test("parseUnits / parseEther", () => {
  assert.equal(parseEther("1.5"), 1_500_000_000_000_000_000n);
  assert.equal(parseEther("0"), 0n);
  assert.equal(parseUnits("0.000001", 6), 1n);
  assert.equal(parseUnits("12.345678", 6), 12_345_678n);
  assert.equal(parseUnits("100", 0), 100n);
});

test("parseUnits rejects invalid and over-precise amounts", () => {
  assert.throws(() => parseUnits("1.2345", 2));
  assert.throws(() => parseUnits("abc", 18));
  assert.throws(() => parseUnits("-1", 18));
  assert.throws(() => parseUnits("1e18", 18));
});

test("formatUnits / formatEther round-trip", () => {
  assert.equal(formatEther(1_500_000_000_000_000_000n), "1.5");
  assert.equal(formatUnits(123_456n, 6), "0.123456");
  assert.equal(formatUnits(1_000_000n, 6), "1");
  assert.equal(formatUnits(0n, 18), "0");
  // round trip
  for (const v of ["0", "1", "0.5", "1234.000001", "999999999"]) {
    assert.equal(formatUnits(parseUnits(v, 18), 18), v === "1234.000001" ? "1234.000001" : v.replace(/\.0+$/, ""));
  }
});
