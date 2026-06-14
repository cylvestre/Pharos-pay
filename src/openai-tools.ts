/**
 * OpenAI function-calling adapter.
 *
 * Exports the same tools as the MCP server in the shape the OpenAI Chat
 * Completions / Responses APIs expect, plus a dispatcher to execute a tool call
 * against a PharosPaySkill instance. This lets the exact same Skill power both
 * MCP agents and OpenAI-based agents with no behavioral drift.
 */

import { type PharosPaySkill } from "./skill.ts";
import { TOOLS, getTool } from "./tools.ts";

export interface OpenAiFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict: boolean;
  };
}

/** Tool definitions formatted for the OpenAI `tools` parameter. */
export function openAiTools(): OpenAiFunctionTool[] {
  return TOOLS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
      strict: false,
    },
  }));
}

/**
 * Execute one OpenAI tool call. Pass the `name` and already-parsed `arguments`
 * object from the model's tool call; returns a JSON string suitable for a
 * `tool` role message.
 */
export async function runOpenAiToolCall(
  skill: PharosPaySkill,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tool = getTool(name);
  if (!tool) return JSON.stringify({ error: `unknown tool: ${name}` });
  try {
    const result = await tool.handler(skill, args ?? {});
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}
