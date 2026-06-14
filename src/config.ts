/**
 * Configuration loading from environment variables and optional JSON files.
 * Zero dependencies (uses node:fs). Shared by the MCP server and the demo.
 *
 * Environment variables:
 *   PHAROS_PRIVATE_KEY   (required) 0x-prefixed signing key
 *   PHAROS_RPC_URL       (optional) override RPC endpoint
 *   PHAROS_CHAIN_ID      (optional) override chain id
 *   PHAROS_NATIVE_SYMBOL (optional) override native symbol (default PHRS)
 *   PHAROS_POLICY_FILE   (optional) path to a JSON PolicyConfig
 *   PHAROS_TOKENS_FILE   (optional) path to a JSON array of TokenInfo
 */

import { readFileSync } from "node:fs";
import { type Hex } from "./crypto/hex.ts";
import { type SkillConfig } from "./skill.ts";
import { type TokenInfo } from "./chain/tokens.ts";
import { type PolicyConfig } from "./policy/types.ts";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadSkillConfigFromEnv(env = process.env): SkillConfig {
  const privateKey = env.PHAROS_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(
      "PHAROS_PRIVATE_KEY must be set to a 0x-prefixed 32-byte hex private key",
    );
  }

  const chain: SkillConfig["chain"] = {};
  if (env.PHAROS_RPC_URL) chain.rpcUrl = env.PHAROS_RPC_URL;
  if (env.PHAROS_CHAIN_ID) chain.chainId = Number(env.PHAROS_CHAIN_ID);
  if (env.PHAROS_NATIVE_SYMBOL) chain.nativeSymbol = env.PHAROS_NATIVE_SYMBOL;

  const tokens = env.PHAROS_TOKENS_FILE
    ? readJson<TokenInfo[]>(env.PHAROS_TOKENS_FILE)
    : [];
  const policy = env.PHAROS_POLICY_FILE
    ? readJson<PolicyConfig>(env.PHAROS_POLICY_FILE)
    : {};

  return { privateKey: privateKey as Hex, chain, tokens, policy };
}
