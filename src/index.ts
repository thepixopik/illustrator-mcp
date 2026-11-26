#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWindowsComRuntime } from "./bridge.js";
import { createIllustratorMcpServer } from "./tools.js";

async function main() {
  const runtime = createWindowsComRuntime();
  const server = createIllustratorMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Illustrator MCP Server (Windows COM stdio) running");
}

main().catch((err) => {
  console.error("Fatal error starting Illustrator MCP Server:", err);
  process.exit(1);
});
