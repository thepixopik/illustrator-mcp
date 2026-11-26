import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";

const execFileAsync = promisify(execFile);

/**
 * ES3-compatible JSON serializer injected into every ExtendScript execution.
 * Adobe Illustrator's ExtendScript engine runs ECMAScript 3 and lacks native JSON.stringify.
 */
const ES3_RUNTIME_HEADER = `
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

export interface ExtendScriptResult {
  ok: boolean;
  result?: unknown;
  raw: string;
  error?: string;
}

/**
 * Executes ExtendScript (.jsx) inside Adobe Illustrator on Windows via COM Automation.
 * Writes the script to a temporary UTF-8 file and invokes PowerShell with -EncodedCommand
 * to avoid Windows command-line escaping and length limits.
 */
export async function runExtendScript(
  jsxBody: string,
  timeoutMs = 60_000
): Promise<ExtendScriptResult> {
  if (process.platform !== "win32") {
    return {
      ok: false,
      raw: "",
      error: `This MCP server is configured for Windows COM Automation (detected platform: ${process.platform}).`
    };
  }

  const tempId = crypto.randomBytes(8).toString("hex");
  const tempJsxPath = path.join(os.tmpdir(), `illustrator_mcp_${tempId}.jsx`);

  const wrappedScript = `${ES3_RUNTIME_HEADER}
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

    const trimmed = stdout.trim();
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      raw: "",
      error: `Windows COM execution failed: ${message}. Make sure Adobe Illustrator is installed and running under the same Windows user permissions.`
    };
  } finally {
    await fs.unlink(tempJsxPath).catch(() => undefined);
  }
}
