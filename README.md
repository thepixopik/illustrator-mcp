# Pixopik Illustrator MCP — MCP Server & CEP Plugin for Adobe Illustrator

Automate **Adobe Illustrator** from **Gemini Enterprise**, **Claude Desktop**, **Cursor**, or **VS Code** using either:
1. **Cloud / Remote `StreamableHTTP` + Illustrator CEP Plugin (`cep-plugin/`)** — Draw live vector artwork directly from **Gemini Enterprise** web chat!
2. **Local `stdio` Windows COM Bridge** — Zero-plugin local desktop setup for Claude Desktop & Cursor on Windows.

---

## Architecture: Gemini Enterprise ➔ Adobe Illustrator

```text
Gemini Enterprise Chat (Cloud)
       │  HTTPS POST /mcp (StreamableHTTP)
       ▼
Illustrator MCP HTTP Server (src/http-server.ts)
       │  WebSocket (/ws)
       ▼
Illustrator CEP Panel Plugin (cep-plugin/ inside Illustrator)
       │  __adobe_cep__.evalScript + Node fs
       ▼
Adobe Illustrator Canvas (Live Vectors, SVG Groups, Text & PNG Previews)
```

---

## Option A: Connect Directly to Gemini Enterprise (CEP Plugin + HTTP Relay)

### 1. Install the Adobe Illustrator Plugin on Windows (1 Command)

```powershell
git clone https://github.com/thepixopik/illustrator-mcp.git
cd illustrator-mcp
powershell -ExecutionPolicy Bypass -File .\cep-plugin\install-windows.ps1
```

Restart Adobe Illustrator and open **`Window > Extensions > Pixopik MCP Bridge`**.

### 2. Start the `StreamableHTTP` + WebSocket Server

```powershell
npm install
npm run build

# Optional security token (recommended when exposing over HTTPS):
$env:MCP_AUTH_TOKEN="your-secret-token"
npm run start:http
```

Expose port `3100` over HTTPS (for example by deploying `src/http-server.ts` to Cloud Run / Railway / Render, or running **Cloudflare Tunnel** locally):

```powershell
cloudflared tunnel --url http://localhost:3100
```

### 3. Connect the Illustrator Panel

Inside Illustrator's **Pixopik MCP Bridge** panel:
* **WebSocket URL:** `ws://localhost:3100/ws` (if running tunnel locally) or `wss://your-deployed-url.com/ws` (if deployed in the cloud)
* **Auth Token:** Same `MCP_AUTH_TOKEN` (if set)
* Click **Connect** ➔ Status turns **🟢 Connected to MCP Relay**!

### 4. Add to Gemini Enterprise

1. In Gemini Enterprise, go to **Settings & help ➔ Manage team ➔ Connected apps ➔ Add MCP Server**.
2. Enter your HTTPS endpoint: `https://<your-tunnel-or-cloud-domain>/mcp` (append `?token=your-secret-token` or configure OAuth/Bearer auth).
3. Go to the **Actions** tab, click **Reload custom actions**, and **Enable** all Illustrator tools.
4. Ask Gemini Enterprise right in chat: *"Create a 1080x1080 document in Illustrator and place a modern geometric rocket SVG logo!"*

---

## Option B: Local Desktop `stdio` Mode (Claude Desktop / Cursor on Windows)

```json
{
  "mcpServers": {
    "illustrator": {
      "command": "node",
      "args": ["C:\\path\\to\\illustrator-mcp\\dist\\index.js"]
    }
  }
}
```

---

## Included MCP Tools (7 Tools)

| Tool | Description |
|---|---|
| `get_document_info` | Inspect active document dimensions, color mode, artboards, layers, and selection count |
| `create_document` | Create a new Illustrator document (`RGB` or `CMYK`) with custom pixel dimensions |
| `create_shape` | Draw editable vector `rectangle` or `ellipse` items using top-left coordinates |
| `add_text` | Add live, editable point text frames with custom font size and hex color |
| `place_svg` | Import full `<svg>` vector artwork as **native editable Illustrator vector paths & groups** |
| `export_preview` | Export the active artboard as a PNG24 image so Gemini can visually inspect its design |
| `run_extendscript` | Run custom ES3 ExtendScript inside Illustrator and return structured JSON |

---

## License & Disclaimer

Released under the [MIT License](./LICENSE).

> **Disclaimer:** Not affiliated with, sponsored, or endorsed by Adobe. Adobe and Adobe Illustrator are either registered trademarks or trademarks of Adobe in the United States and/or other countries.
