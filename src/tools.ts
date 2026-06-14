/**
 * Tool registry: the single source of truth for the Skill's callable tools.
 *
 * Each tool carries a JSON Schema (reused verbatim by both the MCP server and
 * the OpenAI function-calling export) and a handler that delegates to
 * PharosPaySkill. Zero dependencies, so this layer is unit-testable directly.
 */

import { type PharosPaySkill } from "./skill.ts";
import { type Hex } from "./crypto/hex.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (skill: PharosPaySkill, args: Record<string, unknown>) => Promise<unknown> | unknown;
}

const addressParam = {
  type: "string",
  pattern: "^0x[0-9a-fA-F]{40}$",
  description: "A 0x-prefixed 20-byte address.",
};
const tokenParam = {
  type: "string",
  description: "Token symbol (e.g. \"PHRS\", \"USDC\") or ERC-20 contract address.",
};
const amountParam = {
  type: "string",
  description: "Human-readable decimal amount, e.g. \"1.5\". Never scientific notation.",
};

function obj(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}


export const TOOLS: ToolDefinition[] = [
  {
    name: "get_address",
    description:
      "Return the agent's own wallet address and the Pharos network it is operating on. Call this first to know who you are paying from.",
    inputSchema: obj({}),
    handler: (skill) => skill.getAddress(),
  },
  {
    name: "get_balances",
    description:
      "Get the agent's on-chain balances on Pharos. Returns native PHRS plus any configured ERC-20 tokens. Amounts are returned both human-formatted and as raw base units.",
    inputSchema: obj({
      tokens: {
        type: "array",
        items: tokenParam,
        description: "Optional list of token symbols/addresses to query. Defaults to all configured tokens.",
      },
    }),
    handler: (skill, args) => skill.getBalances(args.tokens as string[] | undefined),
  },
  {
    name: "resolve_token",
    description:
      "Resolve a token symbol or contract address to its on-chain metadata (address, decimals, whether it is the native coin).",
    inputSchema: obj({ token: tokenParam }, ["token"]),
    handler: (skill, args) => skill.resolveToken(args.token as string),
  },
  {
    name: "estimate_transfer",
    description:
      "Preview a payment WITHOUT sending it: estimated gas, network fee, and the guardrail policy decision. Always call this before `pay` to show the user the cost and confirm the spend is allowed.",
    inputSchema: obj(
      { token: tokenParam, to: addressParam, amount: amountParam, confirm: { type: "boolean" } },
      ["token", "to", "amount"],
    ),
    handler: (skill, args) =>
      skill.estimateTransfer({
        token: args.token as string,
        to: args.to as string,
        amount: args.amount as string,
        confirm: args.confirm as boolean | undefined,
      }),
  },


  {
    name: "pay",
    description:
      "Send a payment on Pharos. Works for native PHRS and any configured ERC-20 (selected by the `token` field). EVERY payment is checked against the spending guardrails first; a denied payment is never broadcast. Returns the transaction hash and an explorer link on success.",
    inputSchema: obj(
      {
        token: tokenParam,
        to: addressParam,
        amount: amountParam,
        confirm: {
          type: "boolean",
          description: "Set true to satisfy a policy that requires explicit confirmation.",
        },
      },
      ["token", "to", "amount"],
    ),
    handler: (skill, args) =>
      skill.pay({
        token: args.token as string,
        to: args.to as string,
        amount: args.amount as string,
        confirm: args.confirm as boolean | undefined,
      }),
  },
  {
    name: "get_transaction_status",
    description:
      "Check the status of a previously submitted Pharos transaction by hash: pending, success, or failed.",
    inputSchema: obj(
      { hash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$", description: "Transaction hash." } },
      ["hash"],
    ),
    handler: (skill, args) => skill.getTransactionStatus(args.hash as Hex),
  },
  {
    name: "get_policy",
    description:
      "Return the active spending guardrails (allowlists, per-tx caps, daily budgets) and the remaining daily budget per token. Use this to explain to the user what the agent is and is not allowed to spend.",
    inputSchema: obj({}),
    handler: (skill) => skill.getPolicy(),
  },
];

/** Look up a tool definition by name. */
export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}
