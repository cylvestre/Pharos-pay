/**
 * Types for the spending-policy / guardrail layer.
 *
 * Amounts in policy config are expressed as human decimal strings (e.g. "10")
 * and are interpreted per-token using each token's decimals. This keeps config
 * human-authored and auditable.
 */

import { type Hex } from "../crypto/hex.ts";

export interface TokenLimit {
  /** Token symbol (e.g. "PHRS", "USDC"). Case-insensitive. */
  symbol: string;
  /** Max amount per single transaction, human decimal string. Omit = no cap. */
  maxPerTx?: string;
  /** Max cumulative amount per rolling 24h window. Omit = no daily cap. */
  maxPerDay?: string;
}

export interface PolicyConfig {
  /** If non-empty, only these recipient addresses may receive funds. */
  recipientAllowlist?: string[];
  /** If non-empty, only these token symbols/addresses may be spent. */
  tokenAllowlist?: string[];
  /** Per-token spending limits. */
  limits?: TokenLimit[];
  /** Require an explicit confirm flag for any spend above this many tx. */
  requireConfirmation?: boolean;
}

export type PolicyDecision =
  | { allowed: true; warnings: string[] }
  | { allowed: false; reason: string; code: PolicyDenyCode; warnings: string[] };

export type PolicyDenyCode =
  | "RECIPIENT_NOT_ALLOWED"
  | "TOKEN_NOT_ALLOWED"
  | "PER_TX_LIMIT_EXCEEDED"
  | "DAILY_LIMIT_EXCEEDED"
  | "CONFIRMATION_REQUIRED";

export interface SpendRequest {
  token: string;
  /** Recipient address (checksummed or lowercase). */
  to: Hex;
  /** Amount in base units. */
  amount: bigint;
  /** Token decimals, for limit comparison and reporting. */
  decimals: number;
  /** Whether the caller explicitly confirmed this spend. */
  confirmed?: boolean;
}
