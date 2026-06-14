/**
 * Public entry point for using pharos-pay as a library.
 *
 * The Skill ships in three forms, all backed by the same core:
 *   - MCP server         -> src/mcp-server.ts
 *   - OpenAI tools        -> openAiTools() / runOpenAiToolCall()
 *   - direct library API  -> PharosPaySkill
 */

export { PharosPaySkill } from "./skill.ts";
export type { SkillConfig, TransferInput } from "./skill.ts";
export { loadSkillConfigFromEnv } from "./config.ts";
export { TOOLS, getTool } from "./tools.ts";
export type { ToolDefinition } from "./tools.ts";
export { openAiTools, runOpenAiToolCall } from "./openai-tools.ts";
export type { OpenAiFunctionTool } from "./openai-tools.ts";

export { PolicyEngine } from "./policy/engine.ts";
export type {
  PolicyConfig,
  PolicyDecision,
  PolicyDenyCode,
  TokenLimit,
} from "./policy/types.ts";
export {
  PHAROS_TESTNET,
  resolveChainConfig,
  type ChainConfig,
} from "./chain/pharos.ts";
export { TokenRegistry, type TokenInfo } from "./chain/tokens.ts";

// Low-level building blocks, exported for advanced/composed Skills.
export { keccak256 } from "./crypto/keccak.ts";
export { signLegacyTransaction } from "./chain/tx.ts";
export { privateKeyToAddress, toChecksumAddress } from "./chain/account.ts";
export { parseUnits, formatUnits, parseEther, formatEther } from "./chain/units.ts";
