import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IllustratorRuntime } from "./bridge.js";
import {
  buildAddTextJsx,
  buildCreateDocumentJsx,
  buildCreateShapeJsx,
  buildGetDocumentInfoJsx,
  buildPlaceSvgJsx
} from "./jsx/scripts.js";

export function createIllustratorMcpServer(runtime: IllustratorRuntime): McpServer {
  const server = new McpServer({
    name: "illustrator-mcp",
    version: "0.2.0"
  });

  server.tool(
    "get_document_info",
    "Get active Adobe Illustrator document details, artboards, layers, and selection count.",
    {},
    async () => {
      const res = await runtime.runJsx(buildGetDocumentInfoJsx());
      if (!res.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: res.error ?? "Failed to inspect Illustrator document." }]
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }]
      };
    }
  );

  server.tool(
    "create_document",
    "Create a new document in Adobe Illustrator with custom pixel dimensions and color mode.",
    {
      title: z.string().default("Untitled-MCP").describe("Title for the new Illustrator document"),
      width: z.number().positive().default(1080).describe("Artboard width in pixels"),
      height: z.number().positive().default(1080).describe("Artboard height in pixels"),
      colorSpace: z.enum(["RGB", "CMYK"]).default("RGB").describe("Document color mode")
    },
    async ({ title, width, height, colorSpace }) => {
      const res = await runtime.runJsx(
        buildCreateDocumentJsx({ title, width, height, colorSpace })
      );
      if (!res.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: res.error ?? "Failed to create Illustrator document." }]
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }]
      };
    }
  );

  server.tool(
    "create_shape",
    "Create a vector rectangle or ellipse on the active artboard using top-left pixel coordinates.",
    {
      shape: z.enum(["rectangle", "ellipse"]).describe("Vector primitive shape type"),
      x: z.number().describe("Horizontal offset from the active artboard top-left corner"),
      y: z.number().describe("Vertical offset downward from the active artboard top-left corner"),
      width: z.number().positive().describe("Shape width in points/pixels"),
      height: z.number().positive().describe("Shape height in points/pixels"),
      fillHex: z
        .string()
        .regex(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
        .optional()
        .describe("Optional fill hex color (e.g. #FF5733)"),
      strokeHex: z
        .string()
        .regex(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
        .optional()
        .describe("Optional stroke hex color (e.g. #111827)"),
      strokeWidth: z.number().positive().optional().describe("Stroke width in points (default 1)"),
      name: z.string().optional().describe("Optional layer item name")
    },
    async (params) => {
      const res = await runtime.runJsx(buildCreateShapeJsx(params));
      if (!res.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: res.error ?? "Failed to create shape." }]
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }]
      };
    }
  );

  server.tool(
    "add_text",
    "Add live editable point text to the active Illustrator artboard.",
    {
      contents: z.string().min(1).describe("Text string to render"),
      x: z.number().describe("Horizontal offset from the active artboard top-left corner"),
      y: z.number().describe("Vertical offset downward from the active artboard top-left corner"),
      fontSize: z.number().positive().default(36).describe("Font size in points"),
      fillHex: z
        .string()
        .regex(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
        .default("#111111")
        .describe("Text fill hex color"),
      name: z.string().optional().describe("Optional text frame item name")
    },
    async (params) => {
      const res = await runtime.runJsx(buildAddTextJsx(params));
      if (!res.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: res.error ?? "Failed to add text." }]
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }]
      };
    }
  );

  server.tool(
    "place_svg",
    "Import clean SVG markup onto the active Illustrator artboard as live, editable native Illustrator vector paths and groups.",
    {
      svgCode: z
        .string()
        .min(10)
        .describe("Complete valid <svg xmlns='http://www.w3.org/2000/svg' ...>...</svg> markup"),
      x: z.number().default(0).describe("Horizontal offset from active artboard top-left corner"),
      y: z.number().default(0).describe("Vertical offset downward from active artboard top-left corner"),
      name: z.string().optional().describe("Optional group name in Illustrator Layers panel")
    },
    async (params) => {
      const res = await runtime.runJsx(buildPlaceSvgJsx(params));
      if (!res.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: res.error ?? "Failed to place SVG vector artwork." }]
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }]
      };
    }
  );

  server.tool(
    "export_preview",
    "Export the active artboard as a PNG image so the AI client can visually inspect the artwork.",
    {
      scalePercent: z
        .number()
        .min(10)
        .max(400)
        .default(100)
        .describe("Export scale percentage (100 = 1x)"),
      transparency: z.boolean().default(true).describe("Keep transparent artboard background")
    },
    async ({ scalePercent, transparency }) => {
      const preview = await runtime.exportPreview(scalePercent, transparency);
      if (!preview.ok || !preview.base64) {
        return {
          isError: true,
          content: [{ type: "text", text: preview.error ?? "Failed to export artboard preview." }]
        };
      }
      return {
        content: [
          {
            type: "image",
            data: preview.base64,
            mimeType: "image/png"
          },
          {
            type: "text",
            text: JSON.stringify(preview.info ?? { exported: true }, null, 2)
          }
        ]
      };
    }
  );

  server.tool(
    "run_extendscript",
    "Execute custom ExtendScript (ES3 JavaScript) inside Adobe Illustrator and return the result. Use ES3 syntax (`var`, `function() {}`) and `return ...;` to return data.",
    {
      script: z
        .string()
        .min(1)
        .describe(
          "Body of an ES3 ExtendScript function to run inside Illustrator (e.g. `var doc = app.activeDocument; return doc.name;`)"
        ),
      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .max(300000)
        .default(60000)
        .describe("Execution timeout in milliseconds")
    },
    async ({ script, timeoutMs }) => {
      const res = await runtime.runJsx(script, timeoutMs);
      if (!res.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: res.error ?? "ExtendScript execution failed." }]
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }]
      };
    }
  );

  return server;
}
