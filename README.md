# Pixopik Illustrator MCP — MCP Server for Adobe Illustrator (Windows)

A lightweight, zero-plugin **Model Context Protocol (MCP)** server for automating **Adobe Illustrator on Windows** using **COM Automation (`Illustrator.Application`)** and **ExtendScript (`.jsx`)**.

No CEP extension or panel installation required—connect Claude Desktop, Cursor, VS Code, or any MCP-compatible AI client directly to your running Adobe Illustrator instance on Windows.

---

## Architecture

```text
MCP Client (Claude / Cursor / Inspector)
       │  JSON-RPC over stdio
       ▼
Node.js / TypeScript MCP Server (src/index.ts)
       │  Temp UTF-8 .jsx + PowerShell -EncodedCommand
       ▼
Windows COM Bridge (Illustrator.Application.DoJavaScript)
       │
       ▼
Adobe Illustrator (ES3 ExtendScript DOM + PNG24 Preview Export)
```

* **Zero Quoting Bugs:** Scripts are written to temporary UTF-8 `.jsx` files and invoked via base64 UTF-16LE `-EncodedCommand`, completely avoiding PowerShell quoting and Windows command-line length limits.
* **Built-in ES3 JSON Serializer:** Automatically injects an ES3-compatible `toJson()` helper so ExtendScript (which lacks native `JSON.stringify`) returns clean JSON back to your AI client.
* **Thin ExtendScript Layer:** Keeps validation in TypeScript (`zod`) and host scripts isolated in `src/jsx/` for easy future migration to Adobe UXP.

---

## Prerequisites

* **OS:** Windows 10 / 11
* **Node.js:** v18+
* **Adobe Illustrator:** Installed and running under the same Windows user privilege level as your terminal/MCP client

---

## Quick Start

```powershell
git clone https://github.com/thepixopik/illustrator-mcp.git
cd illustrator-mcp
npm install
npm run build
```

### Test with MCP Inspector

Open Adobe Illustrator on Windows, then run:

```powershell
npm run inspect
```

---

## Configure in MCP Clients (Windows)

### Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`)

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

### Cursor / VS Code (`.cursor/mcp.json` or `.vscode/mcp.json`)

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

## Included MCP Tools

| Tool | Description |
|---|---|
| `get_document_info` | Inspect active document dimensions, color mode, artboards, layers, and selection count |
| `create_document` | Create a new Illustrator document (`RGB` or `CMYK`) with custom pixel dimensions |
| `create_shape` | Draw editable vector `rectangle` or `ellipse` items using intuitive top-left coordinates |
| `add_text` | Add live, editable point text frames with custom font size and hex color |
| `export_preview` | Export the active artboard as a PNG24 image so multimodal AI models can inspect their own work |
| `run_extendscript` | Escape-hatch tool to run arbitrary ES3 ExtendScript inside Illustrator and return structured data |

---

## ExtendScript (ES3) Tips

Adobe Illustrator's ExtendScript engine runs **ECMAScript 3**:
* Use `var` instead of `const` or `let`.
* Use traditional `function() {}` syntax instead of arrow functions (`=>`).
* Inside `run_extendscript`, simply `return { ... };`—the bridge automatically serializes objects via `toJson()`.

---

## License & Disclaimer

Released under the [MIT License](./LICENSE).

> **Disclaimer:** Not affiliated with, sponsored, or endorsed by Adobe. Adobe and Adobe Illustrator are either registered trademarks or trademarks of Adobe in the United States and/or other countries.
