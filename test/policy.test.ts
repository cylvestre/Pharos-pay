import test from "node:test";
import assert from "node:assert/strict";

import { PolicyEngine } from "../src/policy/engine.ts";
import { parseEther } from "../src/chain/units.ts";

const ALICE = "0x3535353535353535353535353535353535353535";
const BOB = "0x0000000000000000000000000000000000000009";

function req(amount: string, to = ALICE, token = "PHRS", decimals = 18, confirmed?: boolean) {
  return { token, to: to as `0x${string}`, amount: parseEther(amount), decimals, confirmed };
}

test("allows spend within all limits", () => {
  const eng = new PolicyEngine({
    recipientAllowlist: [ALICE],
    tokenAllowlist: ["PHRS"],
    limits: [{ symbol: "PHRS", maxPerTx: "10", maxPerDay: "20" }],
  });
  const d = eng.evaluate(req("5"));
  assert.equal(d.allowed, true);
});

test("denies token not in allowlist", () => {
  const eng = new PolicyEngine({ tokenAllowlist: ["PHRS"] });
  const d = eng.evaluate(req("1", ALICE, "USDC", 6));
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.code, "TOKEN_NOT_ALLOWED");
});

test("denies recipient not in allowlist", () => {
  const eng = new PolicyEngine({ recipientAllowlist: [ALICE] });
  const d = eng.evaluate(req("1", BOB));
  assert.equal(d.allowed === false && d.code, "RECIPIENT_NOT_ALLOWED");
});

test("denies amount over per-tx cap", () => {
  const eng = new PolicyEngine({ limits: [{ symbol: "PHRS", maxPerTx: "10" }] });
  const d = eng.evaluate(req("11"));
  assert.equal(d.allowed === false && d.code, "PER_TX_LIMIT_EXCEEDED");
});


test("enforces rolling 24h daily budget and expires the window", () => {
  let now = 1_000_000_000;
  const eng = new PolicyEngine(
    { limits: [{ symbol: "PHRS", maxPerDay: "15" }] },
    () => now,
  );
  assert.equal(eng.evaluate(req("10")).allowed, true);
  eng.record("PHRS", parseEther("10"));
  // 10 spent; another 10 would exceed 15
  const d = eng.evaluate(req("10"));
  assert.equal(d.allowed === false && d.code, "DAILY_LIMIT_EXCEEDED");
  // but 5 is fine (brings to 15)
  assert.equal(eng.evaluate(req("5")).allowed, true);
  // advance > 24h: budget resets
  now += 25 * 60 * 60 * 1000;
  assert.equal(eng.evaluate(req("15")).allowed, true);
});

test("warns at >= 80% of daily budget", () => {
  let now = 0;
  const eng = new PolicyEngine({ limits: [{ symbol: "PHRS", maxPerDay: "10" }] }, () => now);
  eng.record("PHRS", parseEther("7"));
  const d = eng.evaluate(req("1")); // 8/10 = 80%
  assert.equal(d.allowed, true);
  assert.ok(d.warnings.some((w) => w.includes("80%")));
});

test("confirmation gate", () => {
  const eng = new PolicyEngine({ requireConfirmation: true });
  assert.equal(eng.evaluate(req("1")).allowed, false);
  assert.equal(eng.evaluate(req("1", ALICE, "PHRS", 18, true)).allowed, true);
});

test("remainingDaily reflects recorded spend", () => {
  let now = 0;
  const eng = new PolicyEngine({ limits: [{ symbol: "PHRS", maxPerDay: "20" }] }, () => now);
  eng.record("PHRS", parseEther("5"));
  assert.equal(eng.remainingDaily("PHRS", 18), parseEther("15"));
  assert.equal(eng.remainingDaily("USDC", 6), null);
});

test("evaluate does not mutate spend history (preview-safe)", () => {
  let now = 0;
  const eng = new PolicyEngine({ limits: [{ symbol: "PHRS", maxPerDay: "10" }] }, () => now);
  eng.evaluate(req("9"));
  eng.evaluate(req("9"));
  // nothing recorded yet, so a 10 spend is still allowed
  assert.equal(eng.evaluate(req("10")).allowed, true);
});
