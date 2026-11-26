import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IllustratorRuntime } from "./bridge.js";
import {
  buildAddTextJsx,
  buildAlignItemsJsx,
  buildApplyGradientJsx,
  buildApplyPathfinderJsx,
  buildCreateClippingMaskJsx,
  buildCreateDocumentJsx,
  buildCreateShapeJsx,
  buildDrawBezierPathJsx,
  buildExecuteMenuOrActionJsx,
  buildExportDocumentJsx,
  buildGetDocumentInfoJsx,
  buildManageLayersJsx,
  buildPlaceSvgJsx,
  buildTransformAndStyleJsx
} from "./jsx/scripts.js";

const hexColorSchema = z
  .string()
  .regex(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a 3 or 6 digit hex color");

export function createIllustratorMcpServer(runtime: IllustratorRuntime): McpServer {
  const server = new McpServer({
    name: "illustrator-mcp",
    version: "0.3.0"
  });

  server.tool(
    "get_document_info",
    "Get active Adobe Illustrator document details, artboards, layers, item names, and selection count.",
    {},
    async () => {
      const res = await runtime.runJsx(buildGetDocumentInfoJsx());
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Failed to inspect document." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
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
    async (params) => {
      const res = await runtime.runJsx(buildCreateDocumentJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Failed to create document." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "create_shape",
    "Create editable vector primitives (rectangle, rounded_rectangle, ellipse, polygon, or star) using top-left artboard coordinates.",
    {
      shape: z
        .enum(["rectangle", "rounded_rectangle", "ellipse", "polygon", "star"])
        .describe("Vector shape primitive"),
      x: z.number().describe("Horizontal offset from active artboard top-left"),
      y: z.number().describe("Vertical offset downward from active artboard top-left"),
      width: z.number().positive().describe("Bounding width in pixels"),
      height: z.number().positive().describe("Bounding height in pixels"),
      cornerRadius: z.number().nonnegative().optional().describe("Corner radius for rounded_rectangle"),
      sides: z.number().int().min(3).max(60).optional().describe("Number of sides/points for polygon or star"),
      innerRadiusRatio: z.number().min(0.05).max(0.95).optional().describe("Star inner radius ratio (default 0.5)"),
      fillHex: hexColorSchema.optional().describe("Optional fill hex color"),
      strokeHex: hexColorSchema.optional().describe("Optional stroke hex color"),
      strokeWidth: z.number().positive().optional().describe("Stroke width in points"),
      opacity: z.number().min(0).max(100).optional().describe("Item opacity (0-100)"),
      name: z.string().optional().describe("Layer item name (recommended so Pathfinder/Gradients can reference it)")
    },
    async (params) => {
      const res = await runtime.runJsx(buildCreateShapeJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Failed to create shape." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "draw_bezier_path",
    "Pen Tool: Draw custom straight or smooth Bezier vector paths using anchor coordinates and optional incoming/outgoing control handles.",
    {
      points: z
        .array(
          z.object({
            x: z.number().describe("Anchor X from active artboard left"),
            y: z.number().describe("Anchor Y downward from active artboard top"),
            inX: z.number().optional().describe("Incoming Bezier handle X"),
            inY: z.number().optional().describe("Incoming Bezier handle Y"),
            outX: z.number().optional().describe("Outgoing Bezier handle X"),
            outY: z.number().optional().describe("Outgoing Bezier handle Y")
          })
        )
        .min(2)
        .describe("Ordered list of anchor points and optional Bezier handles"),
      closed: z.boolean().default(true).describe("Whether to close the vector path"),
      fillHex: hexColorSchema.optional().describe("Optional fill hex color"),
      strokeHex: hexColorSchema.optional().describe("Optional stroke hex color"),
      strokeWidth: z.number().positive().optional().describe("Stroke width in points"),
      strokeCap: z.enum(["butt", "round", "projecting"]).optional().describe("Stroke cap style"),
      strokeJoin: z.enum(["miter", "round", "bevel"]).optional().describe("Stroke corner join style"),
      opacity: z.number().min(0).max(100).optional().describe("Opacity (0-100)"),
      name: z.string().optional().describe("Optional path item name")
    },
    async (params) => {
      const res = await runtime.runJsx(buildDrawBezierPathJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Failed to draw Bezier path." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "add_text",
    "Type Tool: Add live editable Point Text or Area Text with font family, size, tracking, alignment, and color.",
    {
      contents: z.string().min(1).describe("Text string to render"),
      x: z.number().describe("Horizontal offset from active artboard top-left"),
      y: z.number().describe("Vertical offset downward from active artboard top-left"),
      fontSize: z.number().positive().default(36).describe("Font size in points"),
      fillHex: hexColorSchema.default("#111111").describe("Text hex color"),
      fontName: z.string().optional().describe("Optional PostScript font name or font family (e.g. 'ArialMT' or 'Segoe UI')"),
      alignment: z.enum(["left", "center", "right"]).optional().describe("Paragraph alignment"),
      areaWidth: z.number().positive().optional().describe("Optional box width for wrapping Area Text"),
      areaHeight: z.number().positive().optional().describe("Optional box height for wrapping Area Text"),
      tracking: z.number().optional().describe("Character letter-spacing / tracking"),
      name: z.string().optional().describe("Optional text frame name")
    },
    async (params) => {
      const res = await runtime.runJsx(buildAddTextJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Failed to add text." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "place_svg",
    "Import full <svg> vector markup onto the active artboard as 100% live, editable native Illustrator vector paths and groups.",
    {
      svgCode: z.string().min(10).describe("Complete valid <svg xmlns='http://www.w3.org/2000/svg' ...>...</svg> markup"),
      x: z.number().default(0).describe("Horizontal offset from active artboard top-left"),
      y: z.number().default(0).describe("Vertical offset downward from active artboard top-left"),
      name: z.string().optional().describe("Optional group name in Layers panel")
    },
    async (params) => {
      const res = await runtime.runJsx(buildPlaceSvgJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Failed to place SVG." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "apply_gradient",
    "Gradient Tool: Create and apply a multi-stop Linear or Radial gradient to named items (or the current selection).",
    {
      itemNames: z.array(z.string()).optional().describe("Target item names (uses current selection if omitted)"),
      gradientType: z.enum(["linear", "radial"]).default("linear").describe("Linear or radial gradient"),
      angle: z.number().optional().describe("Optional rotation angle in degrees"),
      stops: z
        .array(
          z.object({
            colorHex: hexColorSchema.describe("Stop hex color"),
            position: z.number().min(0).max(100).describe("Stop ramp position from 0 to 100"),
            opacity: z.number().min(0).max(100).optional().describe("Stop opacity (0-100)")
          })
        )
        .min(2)
        .describe("At least 2 gradient color stops"),
      gradientName: z.string().optional().describe("Optional swatch name for the gradient")
    },
    async (params) => {
      const res = await runtime.runJsx(buildApplyGradientJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Failed to apply gradient." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "apply_pathfinder",
    "Pathfinder Boolean Tool: Combine 2 or more shapes using unite, subtract, intersect, exclude, divide, trim, merge, crop, outline, or minus_back.",
    {
      operation: z
        .enum([
          "unite",
          "subtract",
          "intersect",
          "exclude",
          "divide",
          "trim",
          "merge",
          "crop",
          "outline",
          "minus_back"
        ])
        .describe("Boolean Pathfinder operation"),
      itemNames: z
        .array(z.string())
        .optional()
        .describe("Names of 2+ items to combine (uses current selection if omitted)"),
      expand: z.boolean().default(true).describe("Expand live Pathfinder effect into permanent vector paths"),
      resultName: z.string().optional().describe("Name to assign to the resulting vector group/shape")
    },
    async (params) => {
      const res = await runtime.runJsx(buildApplyPathfinderJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Pathfinder operation failed." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "create_clipping_mask",
    "Clipping Mask Tool: Clip target artwork inside a vector mask shape.",
    {
      maskItemName: z.string().optional().describe("Name of the vector path to use as the mask"),
      targetItemNames: z.array(z.string()).optional().describe("Names of items to be clipped inside the mask"),
      groupName: z.string().optional().describe("Optional name for the resulting clipped group")
    },
    async (params) => {
      const res = await runtime.runJsx(buildCreateClippingMaskJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Failed to create clipping mask." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "manage_layers",
    "Layers Panel Tool: Create, activate, rename, delete, lock, unlock, show, or hide Illustrator layers.",
    {
      action: z
        .enum(["create", "activate", "rename", "delete", "lock", "unlock", "show", "hide"])
        .describe("Layer operation to perform"),
      layerName: z.string().min(1).describe("Target layer name (or name for new layer)"),
      newName: z.string().optional().describe("New layer name when action is 'rename'")
    },
    async (params) => {
      const res = await runtime.runJsx(buildManageLayersJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Layer operation failed." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "transform_and_style",
    "Transform & Appearance Tool: Move, rotate, scale, duplicate, delete, set opacity/blend mode, or Outline Stroke on items.",
    {
      itemNames: z.array(z.string()).optional().describe("Target item names (uses current selection if omitted)"),
      moveDeltaX: z.number().optional().describe("Horizontal move offset in pixels (positive = right)"),
      moveDeltaY: z.number().optional().describe("Vertical move offset in pixels (positive = downward)"),
      rotateDegrees: z.number().optional().describe("Rotation angle in degrees"),
      scalePercentX: z.number().positive().optional().describe("Horizontal scale percentage (100 = unchanged)"),
      scalePercentY: z.number().positive().optional().describe("Vertical scale percentage (100 = unchanged)"),
      opacity: z.number().min(0).max(100).optional().describe("Opacity percentage (0-100)"),
      blendMode: z
        .enum([
          "normal",
          "multiply",
          "screen",
          "overlay",
          "darken",
          "lighten",
          "color_dodge",
          "color_burn",
          "hard_light",
          "soft_light",
          "difference",
          "exclusion"
        ])
        .optional()
        .describe("Transparency blending mode"),
      outlineStroke: z.boolean().optional().describe("Convert stroke into filled vector outlines"),
      duplicate: z.boolean().optional().describe("Apply transformation onto a duplicate copy"),
      deleteItems: z.boolean().optional().describe("Delete the target items")
    },
    async (params) => {
      const res = await runtime.runJsx(buildTransformAndStyleJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Transform operation failed." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "align_items",
    "Align Tool: Align items horizontally (left/center/right) and/or vertically (top/middle/bottom) relative to the active artboard or selection bounds.",
    {
      itemNames: z.array(z.string()).optional().describe("Target item names (uses current selection if omitted)"),
      horizontal: z.enum(["left", "center", "right"]).optional().describe("Horizontal alignment"),
      vertical: z.enum(["top", "middle", "bottom"]).optional().describe("Vertical alignment"),
      relativeTo: z.enum(["artboard", "selection"]).default("artboard").describe("Alignment reference box")
    },
    async (params) => {
      const res = await runtime.runJsx(buildAlignItemsJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Alignment failed." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "execute_menu_command",
    "Menu & Actions Runner: Trigger any of Adobe Illustrator's 500+ internal menu commands (app.executeMenuCommand) or recorded Actions (app.doScript).",
    {
      menuCommand: z
        .string()
        .optional()
        .describe("Internal Illustrator menu command string (e.g. 'OffsetPath v22', 'outline', 'Live DropShadow2', 'undo')"),
      actionName: z.string().optional().describe("Optional recorded Action name in Illustrator Actions panel"),
      actionSetName: z.string().optional().describe("Action Set folder name containing actionName"),
      selectItemNames: z.array(z.string()).optional().describe("Optional item names to select before running the command")
    },
    async (params) => {
      if (!params.menuCommand && !(params.actionName && params.actionSetName)) {
        return {
          isError: true,
          content: [{ type: "text", text: "Provide either menuCommand or both actionName and actionSetName." }]
        };
      }
      const res = await runtime.runJsx(buildExecuteMenuOrActionJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Menu/Action execution failed." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "export_document",
    "Save or export the active Illustrator artwork as AI, PDF, SVG, EPS, PNG, or JPG to a local file path.",
    {
      outputPath: z.string().min(3).describe("Destination file path on the machine running Illustrator (e.g. C:/Designs/logo.svg)"),
      format: z.enum(["ai", "pdf", "svg", "eps", "png", "jpg"]).describe("Target vector or raster file format")
    },
    async (params) => {
      const res = await runtime.runJsx(buildExportDocumentJsx(params));
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "Export failed." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  server.tool(
    "export_preview",
    "Export the active artboard as a PNG image so the AI client can visually inspect its own design.",
    {
      scalePercent: z.number().min(10).max(400).default(100).describe("Export scale percentage (100 = 1x)"),
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
          { type: "image", data: preview.base64, mimeType: "image/png" },
          { type: "text", text: JSON.stringify(preview.info ?? { exported: true }, null, 2) }
        ]
      };
    }
  );

  server.tool(
    "run_extendscript",
    "Escape Hatch: Execute custom ES3 ExtendScript inside Adobe Illustrator (`var`, `function() {}`, `return ...;`).",
    {
      script: z
        .string()
        .min(1)
        .describe("Body of an ES3 ExtendScript function to run inside Illustrator"),
      timeoutMs: z.number().int().min(1000).max(300000).default(60000).describe("Timeout in milliseconds")
    },
    async ({ script, timeoutMs }) => {
      const res = await runtime.runJsx(script, timeoutMs);
      if (!res.ok) {
        return { isError: true, content: [{ type: "text", text: res.error ?? "ExtendScript execution failed." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
    }
  );

  return server;
}
