/**
 * Pharos network configuration.
 *
 * Pharos is a fully EVM-equivalent Layer 1 with standard Ethereum JSON-RPC.
 * The Atlantic testnet (chain id 688688) is the default target for this Skill;
 * mainnet/other endpoints can be supplied via configuration.
 */

export interface ChainConfig {
  name: string;
  chainId: number;
  /** Native currency symbol (PHRS on testnet). */
  nativeSymbol: string;
  nativeDecimals: number;
  rpcUrl: string;
  explorerUrl: string;
}

/** Pharos Atlantic testnet (chain id 688688). */
export const PHAROS_TESTNET: ChainConfig = {
  name: "Pharos Atlantic Testnet",
  chainId: 688688,
  nativeSymbol: "PHRS",
  nativeDecimals: 18,
  rpcUrl: "https://testnet.dplabs-internal.com",
  explorerUrl: "https://testnet.pharosscan.xyz",
};

/**
 * Build a ChainConfig from environment-style overrides. Falls back to the
 * Atlantic testnet defaults. Lets operators point the Skill at a private RPC
 * or at mainnet without code changes.
 */
export function resolveChainConfig(
  overrides: Partial<ChainConfig> & { rpcUrl?: string } = {},
): ChainConfig {
  return { ...PHAROS_TESTNET, ...stripUndefined(overrides) };
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== ""),
  ) as Partial<T>;
}

/** Build an explorer link for a transaction hash. */
export function txExplorerUrl(config: ChainConfig, hash: string): string {
  return `${config.explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}

/** Build an explorer link for an address. */
export function addressExplorerUrl(config: ChainConfig, address: string): string {
  return `${config.explorerUrl.replace(/\/$/, "")}/address/${address}`;
}
