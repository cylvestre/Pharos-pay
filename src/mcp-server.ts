#!/usr/bin/env node
/**
 * pharos-pay MCP server (stdio transport).
 *
 * Exposes the guardrailed Pharos payment tools to any MCP-compatible agent
 * (Claude Desktop, Cursor, etc.). Configure via environment variables; see
 * README.md and .env.example.
 *
 * Run: PHAROS_PRIVATE_KEY=0x... node src/mcp-server.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { PharosPaySkill } from "./skill.ts";
import { loadSkillConfigFromEnv } from "./config.ts";
import { TOOLS, getTool } from "./tools.ts";

async function main(): Promise<void> {
  const skill = new PharosPaySkill(loadSkillConfigFromEnv());

  const server = new Server(
    { name: "pharos-pay", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = getTool(request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `unknown tool: ${request.params.name}` }],
      };
    }
    try {
      const result = await tool.handler(skill, request.params.arguments ?? {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: `error: ${message}` }] };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so we don't corrupt the stdio JSON-RPC stream on stdout.
  console.error(
    `pharos-pay MCP server ready on ${skill.config.name} as ${skill.address}`,
  );
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
