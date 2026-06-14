---
name: pharos-pay
version: 0.1.0
description: >-
  Make and manage on-chain payments on the Pharos network (EVM L1) safely. Use
  when an agent needs to check its wallet balance, estimate a transfer fee, or
  send PHRS or ERC-20 tokens to an address. Every payment is checked against
  configurable spending guardrails (per-transaction caps, rolling daily budgets,
  recipient and token allowlists) before it is signed, so an autonomous agent
  cannot overspend or pay an unapproved address.
license: MIT
allowed-tools:
  - get_address
  - get_balances
  - resolve_token
  - estimate_transfer
  - pay
  - get_transaction_status
  - get_policy
metadata:
  category: onchain-payments
  network: Pharos Atlantic Testnet
  chainId: 688688
  transports:
    - mcp
    - openai-tools
  homepage: https://github.com/your-org/pharos-pay
---

# pharos-pay

A guardrailed payments skill for AI agents operating on **Pharos** (a fully
EVM-equivalent Layer 1, Atlantic testnet chain id `688688`).

## When to use this skill

Use it whenever the task involves **moving or inspecting value on Pharos**:

- "What's my balance?" / "How much PHRS do I have?"
- "Send 2 PHRS to 0x..." / "Pay this invoice in USDC"
- "How much gas will this transfer cost?"
- "What am I allowed to spend?"

## How to use it (recommended flow)

1. **`get_address`** - confirm which wallet and network you are acting on.
2. **`get_policy`** - learn the spending guardrails and remaining daily budget.
3. **`estimate_transfer`** - ALWAYS preview before paying. It returns the gas
   fee AND the policy decision, so you can tell the user the cost and catch a
   blocked payment before attempting it.
4. **`pay`** - execute the transfer. A payment that violates the guardrails is
   refused and never broadcast; the response explains why (`code` + `reason`).
5. **`get_transaction_status`** - confirm the transaction landed.

## Rules for the agent

- Treat amounts as decimal strings (e.g. `"1.5"`), never floats or scientific
  notation. The skill converts to base units safely.
- Never invent a recipient address. Use one the user provided or that
  `resolve_token` / context supplies.
- If `pay` returns `denied: true`, do NOT retry with a workaround. Report the
  reason to the user and ask how to proceed (e.g. raise the limit, allowlist the
  address, or reduce the amount).
- Surface the explorer link from a successful payment so the user can verify it.
- The fee is always paid in the native coin (PHRS), regardless of the token sent.

## Tools

| Tool | Purpose |
|------|---------|
| `get_address` | The agent's address + network. |
| `get_balances` | Native PHRS and configured ERC-20 balances. |
| `resolve_token` | Symbol/address -> token metadata. |
| `estimate_transfer` | Preview gas, fee, and the policy decision (no send). |
| `pay` | Send PHRS or an ERC-20, enforcing the guardrails. |
| `get_transaction_status` | pending / success / failed for a tx hash. |
| `get_policy` | Active guardrails and remaining daily budget. |

See `README.md` for installation, MCP/OpenAI wiring, and configuration.
