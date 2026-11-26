// Pixopik Illustrator MCP — Cloudflare Worker + SQLite Durable Object Relay (v0.4.0)
// Live URL: https://illustrator-mcp.goutamboronew.workers.dev/mcp
// Live WS : wss://illustrator-mcp.goutamboronew.workers.dev/ws

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id"
};

export class IllustratorRelayDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.activeSocket = null;
    this.pluginMeta = null;
    this.pending = new Map();
  }

  isPluginConnected() {
    return Boolean(this.activeSocket && this.activeSocket.readyState === 1);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "pixopik-illustrator-mcp-cloudflare",
          version: "0.4.0",
          pluginConnected: this.isPluginConnected(),
          pluginMeta: this.pluginMeta
        }, null, 2),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }
    return new Response("Deployed on Cloudflare Workers. Use npx wrangler deploy to update.", { status: 200 });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const id = env.RELAY_DO.idFromName("default");
    return env.RELAY_DO.get(id).fetch(request);
  }
};
