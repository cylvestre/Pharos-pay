/**
 * Minimal Ethereum JSON-RPC client over the global `fetch` (Node >= 18).
 * Zero dependencies. Only the methods this Skill needs are exposed.
 *
 * The transport is injectable so the client can be unit-tested without a live
 * network connection.
 */

import { type Hex } from "../crypto/hex.ts";

export type JsonRpcTransport = (
  method: string,
  params: unknown[],
) => Promise<unknown>;

export interface RpcClientOptions {
  rpcUrl?: string;
  /** Override the transport (used in tests). */
  transport?: JsonRpcTransport;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

export class RpcError extends Error {
  readonly code?: number;
  readonly data?: unknown;
  constructor(message: string, code?: number, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

export class PharosRpc {
  private readonly transport: JsonRpcTransport;
  private id = 0;

  constructor(opts: RpcClientOptions) {
    if (opts.transport) {
      this.transport = opts.transport;
    } else {
      if (!opts.rpcUrl) throw new Error("rpcUrl is required when no transport is provided");
      this.transport = this.httpTransport(opts.rpcUrl, opts.timeoutMs ?? 20_000);
    }
  }

  private httpTransport(rpcUrl: string, timeoutMs: number): JsonRpcTransport {
    return async (method, params) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new RpcError(`HTTP ${res.status} from RPC endpoint`);
        }
        const body = (await res.json()) as {
          result?: unknown;
          error?: { code: number; message: string; data?: unknown };
        };
        if (body.error) {
          throw new RpcError(body.error.message, body.error.code, body.error.data);
        }
        return body.result;
      } finally {
        clearTimeout(timer);
      }
    };
  }

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    return (await this.transport(method, params)) as T;
  }

  // --- typed helpers -------------------------------------------------------

  async chainId(): Promise<number> {
    return Number(BigInt(await this.call<string>("eth_chainId", [])));
  }

  async blockNumber(): Promise<bigint> {
    return BigInt(await this.call<string>("eth_blockNumber", []));
  }

  async getBalance(address: Hex, block = "latest"): Promise<bigint> {
    return BigInt(await this.call<string>("eth_getBalance", [address, block]));
  }

  async getTransactionCount(address: Hex, block = "pending"): Promise<bigint> {
    return BigInt(await this.call<string>("eth_getTransactionCount", [address, block]));
  }

  async gasPrice(): Promise<bigint> {
    return BigInt(await this.call<string>("eth_gasPrice", []));
  }

  async estimateGas(tx: {
    from: Hex;
    to?: Hex;
    value?: Hex;
    data?: Hex;
  }): Promise<bigint> {
    return BigInt(await this.call<string>("eth_estimateGas", [tx]));
  }

  async call_(to: Hex, data: Hex, block = "latest"): Promise<Hex> {
    return this.call<Hex>("eth_call", [{ to, data }, block]);
  }

  async sendRawTransaction(raw: Hex): Promise<Hex> {
    return this.call<Hex>("eth_sendRawTransaction", [raw]);
  }

  async getTransactionByHash(hash: Hex): Promise<RpcTransaction | null> {
    return this.call<RpcTransaction | null>("eth_getTransactionByHash", [hash]);
  }

  async getTransactionReceipt(hash: Hex): Promise<RpcReceipt | null> {
    return this.call<RpcReceipt | null>("eth_getTransactionReceipt", [hash]);
  }
}

export interface RpcTransaction {
  hash: Hex;
  blockNumber: Hex | null;
  from: Hex;
  to: Hex | null;
  value: Hex;
  nonce: Hex;
}

export interface RpcReceipt {
  transactionHash: Hex;
  blockNumber: Hex;
  status: Hex; // 0x1 success, 0x0 failed
  gasUsed: Hex;
  from: Hex;
  to: Hex | null;
}
