import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import {
  createWindowsComRuntime,
  parseWrappedJsxOutput,
  wrapJsxWithRuntime,
  type ExtendScriptResult,
  type IllustratorRuntime,
  type PreviewExportResult
} from "./bridge.js";

interface PendingRequest {
  resolve: (msg: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Manages WebSocket connections from the Adobe Illustrator CEP 12 Plugin
 * and routes ExtendScript / PNG preview requests over the live socket.
 * Automatically falls back to local Windows COM if running locally on Windows.
 */
export class PluginRelayHub implements IllustratorRuntime {
  private activeSocket: WebSocket | null = null;
  private pluginMeta: Record<string, unknown> | null = null;
  private pending = new Map<string, PendingRequest>();
  private comFallback = createWindowsComRuntime();
  private authToken: string | undefined;

  constructor(authToken?: string) {
    this.authToken = authToken || undefined;
  }

  attachWebSocketServer(httpServer: HttpServer, pathName = "/ws"): void {
    const wss = new WebSocketServer({ server: httpServer, path: pathName });

    wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      if (this.authToken) {
        const reqUrl = new URL(req.url ?? "/", "http://localhost");
        const queryToken = reqUrl.searchParams.get("token");
        const headerAuth = req.headers["authorization"];
        const bearerToken = headerAuth?.startsWith("Bearer ")
          ? headerAuth.slice(7).trim()
          : undefined;

        if (queryToken !== this.authToken && bearerToken !== this.authToken) {
          ws.close(4001, "Unauthorized: invalid MCP_AUTH_TOKEN");
          return;
        }
      }

      if (this.activeSocket && this.activeSocket.readyState === WebSocket.OPEN) {
        this.activeSocket.close(1000, "Replaced by newer Illustrator plugin connection");
      }

      this.activeSocket = ws;
      console.error("[Relay] Adobe Illustrator CEP Plugin connected via WebSocket");

      ws.on("message", (rawData) => {
        try {
          const msg = JSON.parse(String(rawData)) as Record<string, unknown>;
          if (msg.type === "hello") {
            this.pluginMeta = msg;
            return;
          }
          const reqId = typeof msg.id === "string" ? msg.id : undefined;
          if (reqId && this.pending.has(reqId)) {
            const entry = this.pending.get(reqId)!;
            clearTimeout(entry.timer);
            this.pending.delete(reqId);
            entry.resolve(msg);
          }
        } catch (err) {
          console.error("[Relay] Invalid JSON message from plugin:", err);
        }
      });

      ws.on("close", () => {
        if (this.activeSocket === ws) {
          this.activeSocket = null;
          this.pluginMeta = null;
          console.error("[Relay] Adobe Illustrator CEP Plugin disconnected");
        }
      });
    });
  }

  isPluginConnected(): boolean {
    return Boolean(this.activeSocket && this.activeSocket.readyState === WebSocket.OPEN);
  }

  getStatus(): Record<string, unknown> {
    const connected = this.isPluginConnected();
    return {
      ok: true,
      pluginConnected: connected,
      activeMode: connected
        ? "cep-plugin-websocket"
        : process.platform === "win32"
          ? "windows-com-fallback"
          : "waiting-for-cep-plugin",
      pluginMeta: this.pluginMeta
    };
  }

  private sendToPlugin(
    payload: Record<string, unknown>,
    timeoutMs: number
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.activeSocket || this.activeSocket.readyState !== WebSocket.OPEN) {
        reject(new Error("Adobe Illustrator CEP Plugin is not connected."));
        return;
      }
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Illustrator CEP Plugin timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.activeSocket.send(JSON.stringify({ ...payload, id }));
    });
  }

  async runJsx(jsxBody: string, timeoutMs = 60_000): Promise<ExtendScriptResult> {
    if (this.isPluginConnected()) {
      try {
        const wrappedScript = wrapJsxWithRuntime(jsxBody);
        const resp = await this.sendToPlugin(
          { type: "eval_jsx", script: wrappedScript },
          timeoutMs
        );
        if (resp.ok === false) {
          return {
            ok: false,
            raw: String(resp.raw ?? ""),
            error: String(resp.error ?? "CEP Plugin execution failed")
          };
        }
        return parseWrappedJsxOutput(String(resp.output ?? ""));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, raw: "", error: msg };
      }
    }

    if (process.platform === "win32") {
      return this.comFallback.runJsx(jsxBody, timeoutMs);
    }

    return {
      ok: false,
      raw: "",
      error:
        "No Adobe Illustrator CEP Plugin connected via WebSocket. Open Illustrator > Window > Extensions > Pixopik MCP Bridge and click Connect."
    };
  }

  async exportPreview(
    scalePercent: number,
    transparency: boolean
  ): Promise<PreviewExportResult> {
    if (this.isPluginConnected()) {
      try {
        const resp = await this.sendToPlugin(
          {
            type: "export_preview",
            scalePercent,
            transparency
          },
          60_000
        );
        if (!resp.ok || typeof resp.base64 !== "string") {
          return {
            ok: false,
            error: String(resp.error ?? "CEP Plugin failed to export PNG preview.")
          };
        }
        return {
          ok: true,
          base64: resp.base64,
          info: resp.info
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    }

    if (process.platform === "win32") {
      return this.comFallback.exportPreview(scalePercent, transparency);
    }

    return {
      ok: false,
      error:
        "No Adobe Illustrator CEP Plugin connected via WebSocket. Open Illustrator > Window > Extensions > Pixopik MCP Bridge and click Connect."
    };
  }
}
