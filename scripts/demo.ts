/**
 * End-to-end demo against the live Pharos Atlantic testnet.
 *
 * Drives the Skill exactly as an agent would: identify self -> read balances ->
 * preview a payment (with policy) -> attempt a payment that the guardrails
 * BLOCK -> send an allowed payment -> poll its status.
 *
 * Usage:
 *   PHAROS_PRIVATE_KEY=0x... \
 *   PHAROS_POLICY_FILE=./policy.example.json \
 *   node scripts/demo.ts [recipient] [amount]
 *
 * Get testnet PHRS from a Pharos Atlantic faucet first. This is the script to
 * screen-record for the hackathon demo video.
 */

import { PharosPaySkill } from "../src/skill.ts";
import { loadSkillConfigFromEnv } from "../src/config.ts";

const log = (label: string, value: unknown) =>
  console.log(`\n=== ${label} ===\n` + JSON.stringify(value, null, 2));

async function main() {
  const recipient = process.argv[2] ?? "0x000000000000000000000000000000000000dEaD";
  const amount = process.argv[3] ?? "0.001";

  const skill = new PharosPaySkill(loadSkillConfigFromEnv());

  log("1. Who am I? (get_address)", skill.getAddress());
  log("2. My balances (get_balances)", await skill.getBalances());
  log("3. Active guardrails (get_policy)", skill.getPolicy());

  log(
    `4. Preview paying ${amount} PHRS -> ${recipient} (estimate_transfer)`,
    await skill.estimateTransfer({ token: "PHRS", to: recipient, amount }),
  );

  // Deliberately trip a guardrail to show enforcement (huge amount).
  log(
    "5. Guardrail in action: attempt an over-limit payment",
    await skill.pay({ token: "PHRS", to: recipient, amount: "1000000" }),
  );

  log(
    `6. Send the allowed payment (pay)`,
    await sendAndReport(skill, recipient, amount),
  );
}

async function sendAndReport(skill: PharosPaySkill, to: string, amount: string) {
  const res = await skill.pay({ token: "PHRS", to, amount, confirm: true });
  if (res.sent) {
    // Give the network a moment, then report status.
    await new Promise((r) => setTimeout(r, 4000));
    const status = await skill.getTransactionStatus(res.hash);
    return { payment: res, status };
  }
  return { payment: res };
}

main().catch((err) => {
  console.error("demo failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
