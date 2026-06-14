import test from "node:test";
import assert from "node:assert/strict";

import { PharosPaySkill } from "../src/skill.ts";
import { runOpenAiToolCall, openAiTools } from "../src/openai-tools.ts";
import { TOOLS } from "../src/tools.ts";

const ALICE = "0x3535353535353535353535353535353535353535";
const KEY = "0x4646464646464646464646464646464646464646464646464646464646464646";

function mockTransport(overrides: Record<string, unknown> = {}) {
  const sent: string[] = [];
  const base: Record<string, unknown> = {
    eth_chainId: "0xa8230",
    eth_gasPrice: "0x3b9aca00",
    eth_estimateGas: "0x5208",
    eth_getTransactionCount: "0x0",
    eth_getBalance: "0x3635c9adc5dea00000", // 1000 PHRS
    eth_sendRawTransaction: "0x" + "ab".repeat(32),
    ...overrides,
  };
  const transport = async (method: string, params: unknown[]) => {
    if (method === "eth_sendRawTransaction") sent.push(params[0] as string);
    if (!(method in base)) throw new Error(`unexpected RPC ${method}`);
    return base[method];
  };
  return { transport, sent };
}

function makeSkill(policy = {}, overrides = {}) {
  const { transport, sent } = mockTransport(overrides);
  const skill = new PharosPaySkill({ privateKey: KEY, policy, transport });
  return { skill, sent };
}

test("getAddress derives the right address and chain", () => {
  const { skill } = makeSkill();
  const a = skill.getAddress();
  assert.equal(a.address, "0x9d8A62f656a8d1615C1294fd71e9CFb3E4855A4F");
  assert.equal(a.chainId, 688688);
});


test("estimateTransfer previews fee and policy without sending", async () => {
  const { skill, sent } = makeSkill({ limits: [{ symbol: "PHRS", maxPerTx: "10" }] });
  const est = await skill.estimateTransfer({ token: "PHRS", to: ALICE, amount: "5" });
  assert.equal(est.policy.allowed, true);
  assert.equal(est.feeToken, "PHRS");
  assert.equal(sent.length, 0, "estimate must not broadcast");
});

test("pay broadcasts an allowed transfer and returns a hash", async () => {
  const { skill, sent } = makeSkill({ recipientAllowlist: [ALICE] });
  const res = await skill.pay({ token: "PHRS", to: ALICE, amount: "1" });
  assert.equal(res.sent, true);
  assert.equal(res.sent === true && res.hash, "0x" + "ab".repeat(32));
  assert.equal(sent.length, 1);
  // a real, signed, EIP-155 raw tx was broadcast
  assert.ok(sent[0]!.startsWith("0x"));
});

test("pay refuses a policy-denied transfer and does NOT broadcast", async () => {
  const { skill, sent } = makeSkill({ recipientAllowlist: [ALICE] });
  const res = await skill.pay({
    token: "PHRS",
    to: "0x0000000000000000000000000000000000000009",
    amount: "1",
  });
  assert.equal(res.sent, false);
  assert.equal(res.denied === true && res.code, "RECIPIENT_NOT_ALLOWED");
  assert.equal(sent.length, 0, "denied spend must never be signed/broadcast");
});

test("daily budget is enforced across successive pays", async () => {
  const { skill, sent } = makeSkill({ limits: [{ symbol: "PHRS", maxPerDay: "10" }] });
  await skill.pay({ token: "PHRS", to: ALICE, amount: "7" });
  const second = await skill.pay({ token: "PHRS", to: ALICE, amount: "7" });
  assert.equal(second.sent, false);
  assert.equal(second.denied === true && second.code, "DAILY_LIMIT_EXCEEDED");
  assert.equal(sent.length, 1, "only the first pay should broadcast");
});


test("tool registry exposes the expected tools with valid schemas", () => {
  const names = TOOLS.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "estimate_transfer",
    "get_address",
    "get_balances",
    "get_policy",
    "get_transaction_status",
    "pay",
    "resolve_token",
  ]);
  for (const t of TOOLS) {
    assert.equal(typeof t.description, "string");
    assert.equal((t.inputSchema as { type: string }).type, "object");
  }
});

test("OpenAI export mirrors the tools and dispatches", async () => {
  const { skill } = makeSkill();
  const oa = openAiTools();
  assert.equal(oa.length, TOOLS.length);
  assert.equal(oa[0]!.type, "function");
  const out = await runOpenAiToolCall(skill, "get_address", {});
  assert.match(out, /0x9d8A62f656a8d1615C1294fd71e9CFb3E4855A4F/);
  const err = await runOpenAiToolCall(skill, "does_not_exist", {});
  assert.match(err, /unknown tool/);
});
