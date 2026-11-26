#!/usr/bin/env node
import * as http from "node:http";
import express, { type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { PluginRelayHub } from "./relay.js";
import { createIllustratorMcpServer } from "./tools.js";

const PORT = Number(process.env.PORT ?? 3100);
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN?.trim() || undefined;

const app = express();
app.use(express.json({ limit: "15mb" }));

const relayHub = new PluginRelayHub(AUTH_TOKEN);

function checkAuth(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_TOKEN) {
    next();
    return;
  }
  const headerAuth = req.headers["authorization"];
  const bearerToken = headerAuth?.startsWith("Bearer ")
    ? headerAuth.slice(7).trim()
    : undefined;
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;

  if (bearerToken === AUTH_TOKEN || queryToken === AUTH_TOKEN) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized: invalid or missing Bearer token" });
}

app.get("/health", (_req: Request, res: Response) => {
  res.json(relayHub.getStatus());
});

app.post("/mcp", checkAuth, async (req: Request, res: Response) => {
  const server = createIllustratorMcpServer(relayHub);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  res.on("close", () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: unknown) {
    console.error("[HTTP MCP] Error handling /mcp request:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal MCP server error" },
        id: null
      });
    }
  }
});

app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed in stateless StreamableHTTP mode." },
    id: null
  });
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed in stateless StreamableHTTP mode." },
    id: null
  });
});

const httpServer = http.createServer(app);
relayHub.attachWebSocketServer(httpServer, "/ws");

httpServer.listen(PORT, () => {
  console.error(`========================================================`);
  console.error(`Pixopik Illustrator StreamableHTTP + WS Relay is running!`);
  console.error(`  MCP Endpoint (Gemini Enterprise): http://localhost:${PORT}/mcp`);
  console.error(`  CEP Plugin WebSocket Endpoint   : ws://localhost:${PORT}/ws`);
  console.error(`  Health & Connection Check       : http://localhost:${PORT}/health`);
  console.error(`  Auth Protection                 : ${AUTH_TOKEN ? "ENABLED (Bearer token)" : "DISABLED (Preview mode)"}`);
  console.error(`========================================================`);
});
