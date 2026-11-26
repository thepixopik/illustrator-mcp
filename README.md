# Pixopik Illustrator MCP (`v0.3.0`) — Pro Vector MCP Server & CEP Plugin

Automate **Adobe Illustrator** from **Gemini Enterprise**, **Claude Desktop**, **Cursor**, or **VS Code** using a full **16-Tool Pro Vector Toolkit**:
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
Adobe Illustrator Canvas (Bezier Pen, Pathfinder, Gradients, Masks, SVG, Previews)
```

---

## Quick Setup for Gemini Enterprise (Windows)

### 1. Install the Adobe Illustrator Plugin (1 Command)

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
$env:MCP_AUTH_TOKEN="your-secret-token"
npm run start:http
```

Expose port `3100` over HTTPS (via Cloud Run / Railway / Render, or locally via **Cloudflare Tunnel**):

```powershell
cloudflared tunnel --url http://localhost:3100
```

### 3. Connect Panel & Add to Gemini Enterprise

1. In Illustrator's **Pixopik MCP Bridge** panel, connect to `ws://localhost:3100/ws` (or `wss://your-domain/ws`).
2. In Gemini Enterprise: **Settings & help ➔ Manage team ➔ Connected apps ➔ Add MCP Server** ➔ enter `https://<your-domain>/mcp?token=your-secret-token`.
3. Under **Actions**, click **Reload custom actions** and **Enable** all 16 Illustrator tools!

---

## Pro Vector Toolkit (16 MCP Tools)

| Tool | Illustrator Capability |
|---|---|
| `get_document_info` | Inspect active document dimensions, artboards, layers, item names, and selection |
| `create_document` | Create new `RGB` or `CMYK` documents with custom pixel dimensions |
| `create_shape` | Draw `rectangle`, `rounded_rectangle`, `ellipse`, `polygon`, or `star` primitives |
| `draw_bezier_path` | **Pen Tool:** Draw custom straight or smooth curved Bezier paths with control handles |
| `add_text` | **Type Tool:** Point Text & wrapping Area Text with font family, size, tracking, alignment |
| `place_svg` | Import full `<svg>` markup as **100% live, editable native Illustrator vector paths** |
| `apply_gradient` | **Gradient Tool:** Multi-stop Linear & Radial gradients with angle and stop opacity |
| `apply_pathfinder` | **Pathfinder:** `unite`, `subtract`, `intersect`, `exclude`, `divide`, `trim`, `merge`, `crop` |
| `create_clipping_mask` | **Clipping Mask:** Mask target artwork inside any vector shape |
| `manage_layers` | **Layers Panel:** Create, activate, rename, delete, lock/unlock, and show/hide layers |
| `transform_and_style` | Move, rotate, scale, duplicate, delete, blend modes, opacity, and **Outline Stroke** |
| `align_items` | **Align Panel:** Align left/center/right & top/middle/bottom to Artboard or Selection |
| `execute_menu_command` | Trigger any of Illustrator's 500+ internal `executeMenuCommand` strings or `.aia` Actions |
| `export_document` | Save/export production files in **`.ai`, `.pdf`, `.svg`, `.eps`, `.png`, or `.jpg`** |
| `export_preview` | Return live PNG24 canvas preview to multimodal AI for visual self-correction |
| `run_extendscript` | Escape-hatch runner for arbitrary ES3 ExtendScript inside Illustrator |

---

## License & Disclaimer

Released under the [MIT License](./LICENSE).

> **Disclaimer:** Not affiliated with, sponsored, or endorsed by Adobe. Adobe and Adobe Illustrator are either registered trademarks or trademarks of Adobe in the United States and/or other countries.
