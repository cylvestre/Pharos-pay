# Security

`pharos-pay` signs transactions and moves value on behalf of an autonomous
agent. Security is therefore a primary design goal, not an afterthought. This
document describes the threat model, the controls in place, the cryptographic
guarantees, and the known limitations.

## Threat model

The core risk of giving an AI agent a funded key is **unbounded or misdirected
spending**: prompt injection, a hallucinated recipient, a reasoning error, or a
compromised upstream tool causing the agent to send funds it should not.

`pharos-pay` is built so that **the agent's reasoning is never the last line of
defense before money moves.** A deterministic policy layer sits between the
agent and the signer.


## Controls

### 1. Policy guardrails enforced at the signing boundary

Every `pay` is evaluated by the `PolicyEngine` (`src/policy/engine.ts`) **before
a transaction is constructed or signed**. The checks, in order:

| Control | Deny code |
|---------|-----------|
| Token allowlist | `TOKEN_NOT_ALLOWED` |
| Recipient allowlist | `RECIPIENT_NOT_ALLOWED` |
| Per-transaction cap | `PER_TX_LIMIT_EXCEEDED` |
| Rolling 24h spend budget | `DAILY_LIMIT_EXCEEDED` |
| Explicit confirmation gate | `CONFIRMATION_REQUIRED` |

A denied request returns a structured reason and **is never signed or
broadcast** — verified by the test
`pay refuses a policy-denied transfer and does NOT broadcast`. The daily budget
is only debited *after* the network accepts a transaction, so a failed broadcast
does not consume budget.

### 2. Preview-before-execute

`estimate_transfer` returns the gas cost **and** the policy decision without
sending, so callers (and humans) can see exactly what would happen and catch a
blocked spend early. Evaluation is side-effect free and never mutates spend
history (test: `evaluate does not mutate spend history`).

### 3. Minimal, auditable supply chain

The entire cryptographic and chain core has **zero third-party runtime
dependencies**. Keccak-256, secp256k1 (with RFC 6979 deterministic nonces),
RLP, EIP-155 transaction signing, and the JSON-RPC client are implemented
directly on the Node.js standard library (`src/crypto`, `src/chain`). The only
optional dependency is the MCP transport SDK, which never touches key material.

This removes the npm supply-chain attack surface from the code path that handles
private keys — a deliberate trade-off in favor of auditability for software that
signs transactions.


## Cryptographic correctness

Correctness of the signer is verified against published test vectors, not just
internal consistency:

- **keccak-256** matches the standard empty-string and `"abc"` vectors.
- **secp256k1** signatures are deterministic (RFC 6979), canonical **low-s**
  (EIP-2), and carry a recovery id that is checked by recovering the signer's
  public key.
- **EIP-155 signing** is verified **byte-for-byte against the canonical example
  transaction in the EIP-155 specification** (test: `EIP-155 signed transaction
  is byte-exact with the spec vector`), including the replay-protected `v`.

Run the full suite (no network, no install required beyond the MCP SDK):

```bash
npm test
```

## Key management guidance

- Use a **dedicated key** funded with only what the agent needs. Treat it as hot.
- Provide the key via the `PHAROS_PRIVATE_KEY` environment variable. **Never**
  commit it; `.env` is git-ignored and `.env.example` ships placeholders only.
- The Skill never logs the private key and writes operational logs to stderr so
  they cannot corrupt the MCP stdio channel.
- Scope risk further with a tight `recipientAllowlist` and conservative
  per-tx / daily limits in your policy file.

## Known limitations

- **In-memory budget state.** The rolling 24h spend ledger lives in process
  memory and resets on restart. A production deployment should persist it
  (e.g. to a database) so limits survive restarts and span multiple instances.
- **Single-signer.** There is no multisig or hardware-wallet integration yet;
  the policy layer is defense-in-depth, not a substitute for key custody.
- **Testnet-oriented defaults.** Defaults target Pharos Atlantic testnet
  (chain id 688688). Review all limits before pointing at mainnet value.

## Reporting a vulnerability

Please report security issues privately to the repository maintainer via a
GitHub security advisory or a direct message, rather than opening a public
issue. We aim to acknowledge reports within a few days.
