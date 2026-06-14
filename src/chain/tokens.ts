/**
 * Token registry. Maps human-friendly symbols to on-chain token definitions so
 * an agent can say "pay 5 USDC" without knowing contract addresses.
 *
 * The native coin (PHRS) is represented with `address: null`. Additional ERC-20
 * tokens can be supplied via configuration at runtime.
 */

import { type Hex } from "../crypto/hex.ts";
import { normalizeAddress } from "./account.ts";

export interface TokenInfo {
  symbol: string;
  /** null = native coin; otherwise the ERC-20 contract address. */
  address: Hex | null;
  decimals: number;
  name?: string;
}

export class TokenRegistry {
  private readonly bySymbol = new Map<string, TokenInfo>();
  private readonly byAddress = new Map<string, TokenInfo>();

  constructor(
    nativeSymbol: string,
    nativeDecimals: number,
    tokens: TokenInfo[] = [],
  ) {
    this.add({ symbol: nativeSymbol, address: null, decimals: nativeDecimals, name: nativeSymbol });
    for (const t of tokens) this.add(t);
  }

  add(token: TokenInfo): void {
    const normalized: TokenInfo = {
      ...token,
      address: token.address ? normalizeAddress(token.address) : null,
    };
    this.bySymbol.set(token.symbol.toUpperCase(), normalized);
    if (normalized.address) this.byAddress.set(normalized.address.toLowerCase(), normalized);
  }

  isNative(symbolOrAddress: string): boolean {
    const t = this.tryResolve(symbolOrAddress);
    return t?.address === null;
  }

  tryResolve(symbolOrAddress: string): TokenInfo | undefined {
    if (symbolOrAddress.startsWith("0x") && symbolOrAddress.length === 42) {
      return this.byAddress.get(symbolOrAddress.toLowerCase());
    }
    return this.bySymbol.get(symbolOrAddress.toUpperCase());
  }

  /** Resolve a symbol or address to a TokenInfo, throwing if unknown. */
  resolve(symbolOrAddress: string): TokenInfo {
    const t = this.tryResolve(symbolOrAddress);
    if (!t) {
      throw new Error(
        `unknown token "${symbolOrAddress}". Known: ${[...this.bySymbol.keys()].join(", ")}`,
      );
    }
    return t;
  }

  list(): TokenInfo[] {
    return [...this.bySymbol.values()];
  }
}
