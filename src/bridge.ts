import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { buildExportPreviewJsx } from "./jsx/scripts.js";

const execFileAsync = promisify(execFile);

/**
 * ES3-compatible JSON serializer injected into every ExtendScript execution.
 * Adobe Illustrator's ExtendScript engine runs ECMAScript 3 and lacks native JSON.stringify.
 */
export const ES3_RUNTIME_HEADER = `
function __escapeStr(str) {
  return String(str)
    .replace(/\\\\/g, "\\\\\\\\")
    .replace(/"/g, '\\\\"')
    .replace(/\\r/g, "\\\\r")
    .replace(/\\n/g, "\\\\n")
    .replace(/\\t/g, "\\\\t");
}

function toJson(val) {
  if (val === null || typeof val === "undefined") return "null";
  var t = typeof val;
  if (t === "number") return isFinite(val) ? String(val) : "null";
  if (t === "boolean") return val ? "true" : "false";
  if (t === "string") return '"' + __escapeStr(val) + '"';
  if (val instanceof Array) {
    var arr = [];
    for (var i = 0; i < val.length; i++) {
      arr.push(toJson(val[i]));
    }
    return "[" + arr.join(",") + "]";
  }
  if (t === "object") {
    var pairs = [];
    for (var k in val) {
      if (val.hasOwnProperty(k) && typeof val[k] !== "function" && typeof val[k] !== "undefined") {
        pairs.push('"' + __escapeStr(k) + '":' + toJson(val[k]));
      }
    }
    return "{" + pairs.join(",") + "}";
  }
  return '"' + __escapeStr(String(val)) + '"';
}
`;

export function wrapJsxWithRuntime(jsxBody: string): string {
  return `${ES3_RUNTIME_HEADER}
(function() {
  try {
    var __out = (function() {
${jsxBody}
    })();
    return toJson({ ok: true, result: __out });
  } catch (err) {
    return toJson({
      ok: false,
      error: String(err && err.message ? err.message : err),
      line: err && err.line ? err.line : null
    });
  }
})();
`;
}

export interface ExtendScriptResult {
  ok: boolean;
  result?: unknown;
  raw: string;
  error?: string;
}

export interface PreviewExportResult {
  ok: boolean;
  base64?: string;
  info?: unknown;
  error?: string;
}

export interface IllustratorRuntime {
  runJsx(jsxBody: string, timeoutMs?: number): Promise<ExtendScriptResult>;
  exportPreview(scalePercent: number, transparency: boolean): Promise<PreviewExportResult>;
}

export function parseWrappedJsxOutput(rawOutput: string): ExtendScriptResult {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    return { ok: true, result: null, raw: "" };
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      ok: boolean;
      result?: unknown;
      error?: string;
      line?: number | null;
    };
    if (!parsed.ok) {
      const lineInfo = parsed.line ? ` (line ${parsed.line})` : "";
      return {
        ok: false,
        raw: trimmed,
        error: `ExtendScript Error${lineInfo}: ${parsed.error ?? "Unknown error"}`
      };
    }
    return {
      ok: true,
      result: parsed.result,
      raw: trimmed
    };
  } catch {
    return {
      ok: true,
      result: trimmed,
      raw: trimmed
    };
  }
}

/**
 * Executes ExtendScript (.jsx) inside Adobe Illustrator on Windows via COM Automation.
 */
export async function runExtendScript(
  jsxBody: string,
  timeoutMs = 60_000
): Promise<ExtendScriptResult> {
  if (process.platform !== "win32") {
    return {
      ok: false,
      raw: "",
      error: `Local COM Automation requires Windows (detected: ${process.platform}). Connect the Adobe Illustrator CEP Plugin via WebSocket instead.`
    };
  }

  const tempId = crypto.randomBytes(8).toString("hex");
  const tempJsxPath = path.join(os.tmpdir(), `illustrator_mcp_${tempId}.jsx`);
  const wrappedScript = wrapJsxWithRuntime(jsxBody);

  await fs.writeFile(tempJsxPath, wrappedScript, "utf8");

  const psSafePath = tempJsxPath.replace(/'/g, "''");
  const psScript = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$jsxPath = '${psSafePath}'
$code = [System.IO.File]::ReadAllText($jsxPath, [System.Text.Encoding]::UTF8)
$app = New-Object -ComObject Illustrator.Application
$res = $app.DoJavaScript($code)
if ($null -ne $res) {
  [Console]::Write($res.ToString())
}
`;

  const encodedCommand = Buffer.from(psScript, "utf16le").toString("base64");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodedCommand
      ],
      {
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true
      }
    );
    return parseWrappedJsxOutput(stdout);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      raw: "",
      error: `Windows COM execution failed: ${message}. Make sure Adobe Illustrator is running under the same Windows user permissions.`
    };
  } finally {
    await fs.unlink(tempJsxPath).catch(() => undefined);
  }
}

export function createWindowsComRuntime(): IllustratorRuntime {
  return {
    runJsx: (jsxBody, timeoutMs) => runExtendScript(jsxBody, timeoutMs),
    async exportPreview(scalePercent, transparency) {
      const tempPng = path.join(
        os.tmpdir(),
        `illustrator_preview_${crypto.randomBytes(6).toString("hex")}.png`
      );
      try {
        const jsxPathForward = tempPng.replace(/\\/g, "/");
        const res = await runExtendScript(
          buildExportPreviewJsx({
            outputPath: jsxPathForward,
            scalePercent,
            transparency
          })
        );
        if (!res.ok) {
          return { ok: false, error: res.error ?? "Failed to export artboard preview." };
        }
        const bytes = await fs.readFile(tempPng);
        return {
          ok: true,
          base64: bytes.toString("base64"),
          info: res.result
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Preview export failed: ${msg}` };
      } finally {
        await fs.unlink(tempPng).catch(() => undefined);
      }
    }
  };
}
