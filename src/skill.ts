/**
 * PharosPaySkill: the high-level orchestrator that ties the chain layer and the
 * policy engine together into the operations an AI agent calls. Returns plain,
 * JSON-serializable results (no bigints leak out) so any tool transport (MCP,
 * OpenAI function calling, plain HTTP) can wrap it directly.
 *
 * Depends only on zero-dependency internal modules, so it is fully unit-testable
 * with a mocked JSON-RPC transport.
 */

import { type Hex, hexToBytes } from "./crypto/hex.ts";
import {
  type ChainConfig,
  resolveChainConfig,
  txExplorerUrl,
  addressExplorerUrl,
} from "./chain/pharos.ts";
import { PharosRpc, type JsonRpcTransport } from "./chain/rpc.ts";
import { privateKeyToAddress, normalizeAddress } from "./chain/account.ts";
import { TokenRegistry, type TokenInfo } from "./chain/tokens.ts";
import { Erc20 } from "./chain/erc20.ts";
import { parseUnits, formatUnits } from "./chain/units.ts";
import { signLegacyTransaction, type LegacyTxParams } from "./chain/tx.ts";
import { PolicyEngine } from "./policy/engine.ts";
import { type PolicyConfig } from "./policy/types.ts";

export interface SkillConfig {
  /** Signing key (0x-prefixed). Keep this in an env var, never in code. */
  privateKey: Hex;
  /** Chain overrides; defaults to Pharos Atlantic testnet. */
  chain?: Partial<ChainConfig>;
  /** Extra ERC-20 tokens to register (symbol -> address/decimals). */
  tokens?: TokenInfo[];
  /** Spending guardrails. */
  policy?: PolicyConfig;
  /** Test-only transport override. */
  transport?: JsonRpcTransport;
}

export interface TransferInput {
  token: string;
  to: string;
  /** Human decimal amount, e.g. "1.5". */
  amount: string;
  confirm?: boolean;
}


export class PharosPaySkill {
  readonly config: ChainConfig;
  readonly address: Hex;
  private readonly privateKey: Hex;
  private readonly rpc: PharosRpc;
  private readonly registry: TokenRegistry;
  private readonly policy: PolicyEngine;

  constructor(opts: SkillConfig) {
    this.privateKey = opts.privateKey;
    this.address = privateKeyToAddress(opts.privateKey);
    this.config = resolveChainConfig(opts.chain ?? {});
    this.rpc = new PharosRpc({
      rpcUrl: this.config.rpcUrl,
      transport: opts.transport,
    });
    this.registry = new TokenRegistry(
      this.config.nativeSymbol,
      this.config.nativeDecimals,
      opts.tokens ?? [],
    );
    this.policy = new PolicyEngine(opts.policy ?? {});
  }

  /** The agent's own address and the network it is operating on. */
  getAddress() {
    return {
      address: this.address,
      chain: this.config.name,
      chainId: this.config.chainId,
      explorer: addressExplorerUrl(this.config, this.address),
    };
  }

  /** Resolve a symbol or contract address to token metadata. */
  resolveToken(symbolOrAddress: string) {
    const t = this.registry.resolve(symbolOrAddress);
    return {
      symbol: t.symbol,
      address: t.address,
      decimals: t.decimals,
      native: t.address === null,
      name: t.name ?? t.symbol,
    };
  }


  /** On-chain balance of one token for the agent's address. */
  private async balanceOf(token: TokenInfo): Promise<bigint> {
    if (token.address === null) {
      return this.rpc.getBalance(this.address);
    }
    const data = Erc20.encodeBalanceOf(this.address);
    const result = await this.rpc.call_(token.address, data);
    return Erc20.decodeUint(result);
  }

  /**
   * Balances for the agent across the requested tokens (defaults to every
   * registered token). Amounts are returned both formatted and as raw base
   * units (string) to avoid precision loss.
   */
  async getBalances(symbols?: string[]) {
    const tokens = symbols
      ? symbols.map((s) => this.registry.resolve(s))
      : this.registry.list();
    const balances = [];
    for (const token of tokens) {
      const raw = await this.balanceOf(token);
      balances.push({
        symbol: token.symbol,
        address: token.address,
        native: token.address === null,
        decimals: token.decimals,
        balance: formatUnits(raw, token.decimals),
        balanceRaw: raw.toString(),
      });
    }
    return { address: this.address, chain: this.config.name, balances };
  }


  /**
   * Build the unsigned transaction shape for a transfer and gather live gas
   * data. Shared by estimate (preview) and pay (execute). Does NOT sign or send.
   */
  private async prepareTransfer(input: TransferInput) {
    const token = this.registry.resolve(input.token);
    const recipient = normalizeAddress(input.to);
    const amount = parseUnits(input.amount, token.decimals);

    let to: Hex;
    let value: bigint;
    let data: Hex;
    if (token.address === null) {
      to = recipient;
      value = amount;
      data = "0x";
    } else {
      to = token.address;
      value = 0n;
      data = Erc20.encodeTransfer(recipient, amount);
    }

    const [gasEstimate, gasPrice] = await Promise.all([
      this.rpc.estimateGas({
        from: this.address,
        to,
        value: value === 0n ? undefined : (`0x${value.toString(16)}` as Hex),
        data: data === "0x" ? undefined : data,
      }),
      this.rpc.gasPrice(),
    ]);
    // 20% headroom so ERC-20 transfers with cold storage writes don't under-gas.
    const gasLimit = (gasEstimate * 12n) / 10n;
    const fee = gasLimit * gasPrice;

    return { token, recipient, amount, to, value, data, gasLimit, gasPrice, fee };
  }


  /**
   * Preview a transfer: gas, fee, and the policy decision, WITHOUT signing or
   * sending. Agents should call this before `pay` to show the user what will
   * happen and surface any guardrail violations early.
   */
  async estimateTransfer(input: TransferInput) {
    const p = await this.prepareTransfer(input);
    const decision = this.policy.evaluate({
      token: p.token.symbol,
      to: p.recipient,
      amount: p.amount,
      decimals: p.token.decimals,
      confirmed: input.confirm,
    });
    return {
      token: p.token.symbol,
      to: p.recipient,
      amount: input.amount,
      estimatedGas: p.gasLimit.toString(),
      gasPrice: formatUnits(p.gasPrice, 9) + " gwei",
      estimatedFee: formatUnits(p.fee, this.config.nativeDecimals),
      feeToken: this.config.nativeSymbol,
      policy: decision,
    };
  }


  /**
   * Execute a transfer. The policy engine is enforced here: a denied spend is
   * NEVER signed or broadcast. On success the spend is recorded against the
   * rolling daily budget and the transaction hash + explorer link are returned.
   */
  async pay(input: TransferInput) {
    const p = await this.prepareTransfer(input);
    const decision = this.policy.evaluate({
      token: p.token.symbol,
      to: p.recipient,
      amount: p.amount,
      decimals: p.token.decimals,
      confirmed: input.confirm,
    });
    if (!decision.allowed) {
      return {
        sent: false as const,
        denied: true as const,
        code: decision.code,
        reason: decision.reason,
        warnings: decision.warnings,
      };
    }

    const nonce = await this.rpc.getTransactionCount(this.address);
    const txParams: LegacyTxParams = {
      nonce,
      gasPrice: p.gasPrice,
      gasLimit: p.gasLimit,
      to: p.to,
      value: p.value,
      data: hexToBytes(p.data),
      chainId: BigInt(this.config.chainId),
    };
    const signed = signLegacyTransaction(txParams, this.privateKey);
    const hash = await this.rpc.sendRawTransaction(signed.raw);

    // Only record against the budget once the network has accepted the tx.
    this.policy.record(p.token.symbol, p.amount);

    return {
      sent: true as const,
      denied: false as const,
      hash,
      explorer: txExplorerUrl(this.config, hash),
      token: p.token.symbol,
      to: p.recipient,
      amount: input.amount,
      warnings: decision.warnings,
    };
  }


  /** Status of a previously submitted transaction. */
  async getTransactionStatus(hash: Hex) {
    const receipt = await this.rpc.getTransactionReceipt(hash);
    if (!receipt) {
      const pending = await this.rpc.getTransactionByHash(hash);
      return {
        hash,
        status: pending ? ("pending" as const) : ("unknown" as const),
        explorer: txExplorerUrl(this.config, hash),
      };
    }
    return {
      hash,
      status: receipt.status === "0x1" ? ("success" as const) : ("failed" as const),
      blockNumber: Number(BigInt(receipt.blockNumber)),
      gasUsed: BigInt(receipt.gasUsed).toString(),
      explorer: txExplorerUrl(this.config, hash),
    };
  }

  /** Current guardrail configuration and rolling 24h usage. */
  getPolicy() {
    const symbols = this.registry.list().map((t) => t.symbol);
    const usage = this.registry.list().map((t) => {
      const remaining = this.policy.remainingDaily(t.symbol, t.decimals);
      return {
        symbol: t.symbol,
        remainingDailyBudget: remaining === null ? null : formatUnits(remaining, t.decimals),
      };
    });
    return {
      address: this.address,
      chain: this.config.name,
      policy: this.policy.describe(symbols).config,
      usage,
    };
  }
}
