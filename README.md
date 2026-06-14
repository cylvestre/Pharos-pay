# pharos-pay

**A guardrailed on-chain payments Skill for AI agents on [Pharos](https://pharosnetwork.xyz).**

Give an autonomous agent a wallet without giving it a blank cheque. `pharos-pay`
exposes a small set of payment tools (check balance, estimate, pay, track) over
both **MCP** and **OpenAI function calling**, and routes **every** spend through
a policy engine — per-transaction caps, rolling 24h budgets, and recipient /
token allowlists — so a denied payment is refused *before* it is ever signed.

Built for the **Pharos Skill-to-Agent Dual Cascade Hackathon (Phase 1)**.

> Pharos is a fully EVM-equivalent L1 for the AI-agent economy. The single most
> reusable building block an agent economy needs is the ability to **hold value
> and pay safely**. That is exactly what this Skill provides — and it is designed
> to be the payments primitive other Phase 2 Agents compose on top of.

---

## Highlights

- **Safety-first.** A spending-policy engine gates every payment. Caps, daily
  budgets, and allowlists are enforced at the point of signing — not as an
  afterthought.
- **Two transports, one core.** The same tools power an **MCP server** (Claude
  Desktop, Cursor, any MCP client) and **OpenAI function calling**, with zero
  behavioral drift.
- **Zero runtime dependencies in the core.** Keccak-256, secp256k1 (RFC 6979),
  RLP, EIP-155 signing, and the JSON-RPC client are implemented from scratch on
  the Node standard library. No supply chain to trust with your keys. (The MCP
  transport is the only optional dependency.)
- **Provably correct crypto.** The signer is verified byte-for-byte against the
  canonical EIP-155 specification test vector. `npm test` runs 30+ checks with
  no network and no install.
- **Composable.** Resolve tokens by symbol, return both human and raw amounts,
  and emit explorer links — everything an upstream Agent needs.


## The tools

| Tool | What it does |
|------|--------------|
| `get_address` | Returns the agent's address and the Pharos network it is on. |
| `get_balances` | Native **PHRS** + any configured ERC-20 balances (human + raw). |
| `resolve_token` | Resolve a symbol or contract address to token metadata. |
| `estimate_transfer` | Preview gas, fee, and the **policy decision** — no send. |
| `pay` | Send PHRS or an ERC-20. Enforces guardrails; denied = never broadcast. |
| `get_transaction_status` | `pending` / `success` / `failed` for a tx hash. |
| `get_policy` | Active guardrails and remaining daily budget per token. |

## Quick start

```bash
git clone <your-fork-url> pharos-pay && cd pharos-pay
npm install                 # installs only @modelcontextprotocol/sdk
cp .env.example .env        # then edit .env

npm test                    # 30+ tests, no network required
```

Requires **Node >= 22.6** (the project runs TypeScript directly via Node's
built-in type stripping — no build step).

### Configure

Set at least `PHAROS_PRIVATE_KEY` (a dedicated, low-value testnet key). Fund it
from a Pharos Atlantic faucet. All other settings are optional — see
[`.env.example`](./.env.example).

| Variable | Default | Purpose |
|----------|---------|---------|
| `PHAROS_PRIVATE_KEY` | — (required) | 0x signing key |
| `PHAROS_RPC_URL` | Atlantic public RPC | RPC endpoint |
| `PHAROS_CHAIN_ID` | `688688` | chain id |
| `PHAROS_POLICY_FILE` | none | path to a JSON policy ([example](./policy.example.json)) |
| `PHAROS_TOKENS_FILE` | none | path to a JSON ERC-20 list ([example](./tokens.example.json)) |


## Use it as an MCP server

Add to your MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pharos-pay": {
      "command": "node",
      "args": ["/absolute/path/to/pharos-pay/src/mcp-server.ts"],
      "env": {
        "PHAROS_PRIVATE_KEY": "0x...",
        "PHAROS_POLICY_FILE": "/absolute/path/to/pharos-pay/policy.example.json"
      }
    }
  }
}
```

The agent can now call `get_balances`, `estimate_transfer`, `pay`, etc.

## Use it with OpenAI function calling

```ts
import OpenAI from "openai";
import { PharosPaySkill, loadSkillConfigFromEnv, openAiTools, runOpenAiToolCall } from "pharos-pay";

const skill = new PharosPaySkill(loadSkillConfigFromEnv());
const client = new OpenAI();

const res = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Pay 0.5 PHRS to 0x...dEaD" }],
  tools: openAiTools(),
});

const call = res.choices[0].message.tool_calls?.[0];
if (call) {
  const result = await runOpenAiToolCall(
    skill,
    call.function.name,
    JSON.parse(call.function.arguments),
  );
  // feed `result` back as a tool message...
}
```

## Use it as a library

```ts
import { PharosPaySkill } from "pharos-pay";

const skill = new PharosPaySkill({
  privateKey: process.env.PHAROS_PRIVATE_KEY,
  policy: { limits: [{ symbol: "PHRS", maxPerTx: "1", maxPerDay: "5" }] },
});

await skill.estimateTransfer({ token: "PHRS", to: "0x...", amount: "0.5" });
const res = await skill.pay({ token: "PHRS", to: "0x...", amount: "0.5" });
console.log(res.sent ? res.explorer : res.reason);
```


## Spending guardrails (the policy engine)

Every `pay` is evaluated in order: **token allowlist -> recipient allowlist ->
per-tx cap -> rolling 24h budget -> confirmation gate**. A failure returns a
machine-readable `code` and a human `reason`, and the transaction is never
signed.

```json
{
  "recipientAllowlist": ["0x...dEaD"],
  "tokenAllowlist": ["PHRS", "USDC"],
  "limits": [
    { "symbol": "PHRS", "maxPerTx": "1", "maxPerDay": "5" },
    { "symbol": "USDC", "maxPerTx": "100", "maxPerDay": "500" }
  ],
  "requireConfirmation": false
}
```

Deny codes: `TOKEN_NOT_ALLOWED`, `RECIPIENT_NOT_ALLOWED`, `PER_TX_LIMIT_EXCEEDED`,
`DAILY_LIMIT_EXCEEDED`, `CONFIRMATION_REQUIRED`. An empty allowlist means "no
restriction" (and the Skill warns you when no recipient allowlist is set).

## Live demo (for the video)

```bash
PHAROS_PRIVATE_KEY=0x... PHAROS_POLICY_FILE=./policy.example.json \
  node scripts/demo.ts 0xRecipientAddress 0.001
```

The demo identifies the wallet, reads balances, previews a payment, shows a
guardrail **blocking** an over-limit payment, sends an allowed payment, and polls
its status — the full agent payment loop on live Pharos.

## Architecture

```
src/
  crypto/    keccak256, secp256k1 (RFC 6979 + recovery), rlp, hex   <- zero deps
  chain/     pharos config, json-rpc client, accounts, units, erc20, eip-155 tx
  policy/    the guardrail engine (pure, fully tested)
  skill.ts   PharosPaySkill: the orchestrator agents call
  tools.ts   tool registry (JSON Schema) — single source of truth
  mcp-server.ts / openai-tools.ts   the two transports
```

## Security notes

- Use a **dedicated testnet key** with minimal funds. Never commit `.env`.
- The policy engine is defense-in-depth, not a replacement for key hygiene.
- Daily-budget state is in-memory (resets on restart); production deployments
  should persist it. Documented as a known limitation.

## Testing

```bash
npm test   # node:test, 30+ assertions, no network, no install beyond the MCP SDK
```

Crypto is validated against published vectors, including the canonical EIP-155
signed-transaction vector. The policy engine and the full pay/deny flow are
tested with an injected mock RPC transport.

## License

MIT — see [LICENSE](./LICENSE).
