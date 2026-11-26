# Pixopik Illustrator MCP (`v0.4.0`) — No-Code Setup Guide

Connect **Gemini Enterprise** directly to **Adobe Illustrator on Windows** in **3 simple clicks**—no terminal, no coding, and no server commands needed!

---

## Super Simple 3-Step Setup (Windows)

### Step 1: Install the Illustrator Plugin
1. On this GitHub page, click the green **`<> Code`** button ➔ **`Download ZIP`**.
2. Extract (Unzip) the downloaded folder on your Windows PC.
3. Double-click **`INSTALL_PLUGIN.bat`**.

### Step 2: Open the Panel in Adobe Illustrator
1. Restart **Adobe Illustrator**.
2. Go to top menu: **`Window` ➔ `Extensions` ➔ `Pixopik MCP Bridge`**.
3. It will **automatically connect** to your live Cloudflare server and show a **🟢 Green dot (`Connected & Ready!`)**!

### Step 3: Add Your Live Link in Gemini Enterprise (One Time Only)
1. In Gemini Enterprise, click **Settings & help** ➔ **Manage team** ➔ **Connected apps** ➔ **Add MCP Server**.
2. Paste your live MCP Server URL:
   ```text
   https://illustrator-mcp.goutamboronew.workers.dev/mcp
   ```
3. Choose **No authentication** (or default), save, then open the **Actions** tab, click **Reload custom actions**, and **turn ON** the tools!

Done! Now just type in Gemini Enterprise chat (e.g. *"Create a 1080x1080 artboard in Illustrator and draw a modern colorful geometric logo"*) and watch it draw live in Illustrator!

---

## Live Endpoints
* **MCP Server URL (for Gemini Enterprise):** `https://illustrator-mcp.goutamboronew.workers.dev/mcp`
* **Health Check URL (open in browser to check status):** `https://illustrator-mcp.goutamboronew.workers.dev/health`
* **Plugin WebSocket URL (pre-filled automatically):** `wss://illustrator-mcp.goutamboronew.workers.dev/ws`

---

## License & Disclaimer
Released under the [MIT License](./LICENSE).
> **Disclaimer:** Not affiliated with, sponsored, or endorsed by Adobe. Adobe and Adobe Illustrator are either registered trademarks or trademarks of Adobe in the United States and/or other countries.
