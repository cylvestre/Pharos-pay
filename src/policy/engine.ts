/**
 * PolicyEngine: the guardrail layer that every spend passes through before it
 * is signed. This is what makes it safe to give an autonomous agent a funded
 * key. Pure, deterministic, and dependency-free so it is fully unit-testable.
 *
 * Checks performed, in order:
 *   1. token allowlist       (is this token permitted at all?)
 *   2. recipient allowlist   (is this destination permitted?)
 *   3. per-transaction cap   (is this single amount within the limit?)
 *   4. rolling 24h budget    (would this exceed the daily spend for the token?)
 *   5. confirmation gate      (does this spend require explicit confirmation?)
 *
 * Spend history is tracked in-memory per token as (timestamp, amount) entries
 * and pruned to a rolling 24h window.
 */

import { type Hex } from "../crypto/hex.ts";
import { parseUnits, formatUnits } from "../chain/units.ts";
import {
  type PolicyConfig,
  type PolicyDecision,
  type PolicyDenyCode,
  type SpendRequest,
} from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

interface SpendEntry {
  at: number;
  amount: bigint;
}


export class PolicyEngine {
  private readonly recipientAllow: Set<string>;
  private readonly tokenAllow: Set<string>;
  private readonly history = new Map<string, SpendEntry[]>();
  private readonly config: PolicyConfig;
  private readonly now: () => number;

  constructor(config: PolicyConfig = {}, now: () => number = Date.now) {
    this.config = config;
    this.now = now;
    this.recipientAllow = new Set(
      (config.recipientAllowlist ?? []).map((a) => a.toLowerCase()),
    );
    this.tokenAllow = new Set(
      (config.tokenAllowlist ?? []).map((t) => t.toLowerCase()),
    );
  }

  /** Limit config for a token symbol, if any. */
  private limitFor(symbol: string) {
    return (this.config.limits ?? []).find(
      (l) => l.symbol.toLowerCase() === symbol.toLowerCase(),
    );
  }

  private spentLast24h(symbol: string): bigint {
    const key = symbol.toLowerCase();
    const cutoff = this.now() - DAY_MS;
    const entries = (this.history.get(key) ?? []).filter((e) => e.at >= cutoff);
    this.history.set(key, entries);
    return entries.reduce((sum, e) => sum + e.amount, 0n);
  }


  /**
   * Evaluate a spend request WITHOUT recording it. Safe to call for previews
   * (e.g. estimate_transfer). Returns an allow/deny decision plus warnings.
   */
  evaluate(req: SpendRequest): PolicyDecision {
    const warnings: string[] = [];
    const symbol = req.token;
    const tokenKey = symbol.toLowerCase();
    const toKey = req.to.toLowerCase();

    // 1. token allowlist
    if (this.tokenAllow.size > 0 && !this.tokenAllow.has(tokenKey)) {
      return deny(
        "TOKEN_NOT_ALLOWED",
        `token ${symbol} is not in the allowlist`,
        warnings,
      );
    }

    // 2. recipient allowlist
    if (this.recipientAllow.size > 0 && !this.recipientAllow.has(toKey)) {
      return deny(
        "RECIPIENT_NOT_ALLOWED",
        `recipient ${req.to} is not in the allowlist`,
        warnings,
      );
    }

    const limit = this.limitFor(symbol);

    // 3. per-transaction cap
    if (limit?.maxPerTx !== undefined) {
      const cap = parseUnits(limit.maxPerTx, req.decimals);
      if (req.amount > cap) {
        return deny(
          "PER_TX_LIMIT_EXCEEDED",
          `amount ${formatUnits(req.amount, req.decimals)} ${symbol} exceeds per-tx cap of ${limit.maxPerTx} ${symbol}`,
          warnings,
        );
      }
    }


    // 4. rolling 24h budget
    if (limit?.maxPerDay !== undefined) {
      const dailyCap = parseUnits(limit.maxPerDay, req.decimals);
      const alreadySpent = this.spentLast24h(symbol);
      if (alreadySpent + req.amount > dailyCap) {
        const remaining = dailyCap > alreadySpent ? dailyCap - alreadySpent : 0n;
        return deny(
          "DAILY_LIMIT_EXCEEDED",
          `daily budget for ${symbol} would be exceeded: ${formatUnits(alreadySpent, req.decimals)} already spent, ${formatUnits(remaining, req.decimals)} remaining, requested ${formatUnits(req.amount, req.decimals)}`,
          warnings,
        );
      }
      // Warn when approaching the daily cap (>= 80%).
      if ((alreadySpent + req.amount) * 100n >= dailyCap * 80n) {
        warnings.push(
          `this spend brings 24h ${symbol} usage to >= 80% of the daily budget`,
        );
      }
    }

    // 5. confirmation gate
    if (this.config.requireConfirmation && !req.confirmed) {
      return deny(
        "CONFIRMATION_REQUIRED",
        `this spend requires explicit confirmation (pass confirm=true)`,
        warnings,
      );
    }

    if (this.recipientAllow.size === 0) {
      warnings.push("no recipient allowlist configured: any address may be paid");
    }

    return { allowed: true, warnings };
  }


  /**
   * Record a spend against the rolling 24h history. Call this only AFTER a
   * transaction has been successfully broadcast.
   */
  record(symbol: string, amount: bigint): void {
    const key = symbol.toLowerCase();
    const entries = this.history.get(key) ?? [];
    entries.push({ at: this.now(), amount });
    this.history.set(key, entries);
  }

  /** Snapshot of the policy and current 24h usage, for reporting to the agent. */
  describe(symbols: string[]): {
    config: PolicyConfig;
    usage: { symbol: string; spent24h: string; decimals: number }[];
  } {
    const usage = symbols.map((symbol) => {
      const limit = this.limitFor(symbol);
      // decimals are not known to the engine for arbitrary symbols; default 18
      // for native-style display. Callers that know decimals can format better.
      const decimals = 18;
      const spent = this.spentLast24h(symbol);
      return { symbol, spent24h: formatUnits(spent, decimals), decimals };
    });
    return { config: this.config, usage };
  }

  /** Remaining daily budget for a token in base units (null if no daily cap). */
  remainingDaily(symbol: string, decimals: number): bigint | null {
    const limit = this.limitFor(symbol);
    if (limit?.maxPerDay === undefined) return null;
    const cap = parseUnits(limit.maxPerDay, decimals);
    const spent = this.spentLast24h(symbol);
    return cap > spent ? cap - spent : 0n;
  }
}

function deny(
  code: PolicyDenyCode,
  reason: string,
  warnings: string[],
): PolicyDecision {
  return { allowed: false, code, reason, warnings };
}
