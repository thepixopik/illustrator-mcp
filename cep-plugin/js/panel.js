(function () {
  var DEFAULT_CLOUDFLARE_WS = "wss://illustrator-mcp.goutamboronew.workers.dev/ws";

  var nodeReq = window.cep_node && window.cep_node.require ? window.cep_node.require : window.require;
  var fs = nodeReq ? nodeReq("fs") : null;
  var os = nodeReq ? nodeReq("os") : null;
  var path = nodeReq ? nodeReq("path") : null;
  var BufferRef = window.cep_node && window.cep_node.Buffer ? window.cep_node.Buffer : (typeof Buffer !== "undefined" ? Buffer : null);

  var ws = null;
  var shouldReconnect = true;
  var reconnectTimer = null;
  var pingTimer = null;
  var activeRef = null;

  var statusDot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var wsUrlInput = document.getElementById("wsUrl");
  var connectBtn = document.getElementById("connectBtn");
  var clearLogBtn = document.getElementById("clearLogBtn");
  var reloadUiBtn = document.getElementById("reloadUiBtn");
  var logBox = document.getElementById("logBox");

  var refDropzone = document.getElementById("refDropzone");
  var refFileInput = document.getElementById("refFileInput");
  var refEmptyState = document.getElementById("refEmptyState");
  var refPreviewWrap = document.getElementById("refPreviewWrap");
  var refThumb = document.getElementById("refThumb");
  var refDims = document.getElementById("refDims");
  var refSwatches = document.getElementById("refSwatches");
  var clearRefBtn = document.getElementById("clearRefBtn");
  var tracePreset = document.getElementById("tracePreset");
  var traceBtn = document.getElementById("traceBtn");
  var overlayBtn = document.getElementById("overlayBtn");

  function evalHostScript(expr, cb) {
    if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
      window.__adobe_cep__.evalScript(expr, cb || function () {});
    } else if (cb) {
      cb('{"ok":false,"error":"Adobe CEP runtime not detected."}');
    }
  }

  /* Hot-reload host.jsx automatically whenever panel loads */
  try {
    if (path && __dirname) {
      var hostPath = path.resolve(__dirname, "..", "jsx", "host.jsx").replace(/\\/g, "/");
      if (!fs.existsSync(hostPath)) {
        hostPath = path.resolve(__dirname, "jsx", "host.jsx").replace(/\\/g, "/");
      }
      if (fs && fs.existsSync(hostPath)) {
        evalHostScript('$.evalFile("' + hostPath.replace(/"/g, '\\"') + '")');
      }
    }
  } catch (_hostErr) {}

  try {
    var savedUrl = localStorage.getItem("pixopik_mcp_ws_url");
    if (savedUrl && savedUrl.indexOf("localhost") === -1) {
      wsUrlInput.value = savedUrl;
    } else {
      wsUrlInput.value = DEFAULT_CLOUDFLARE_WS;
    }
  } catch (_e) {
    wsUrlInput.value = DEFAULT_CLOUDFLARE_WS;
  }

  function addLog(msg) {
    var time = new Date().toLocaleTimeString();
    var div = document.createElement("div");
    div.textContent = "[" + time + "] " + msg;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function setStatus(connected, label) {
    if (connected) {
      statusDot.classList.add("connected");
      connectBtn.textContent = "Disconnect";
      connectBtn.classList.add("danger");
    } else {
      statusDot.classList.remove("connected");
      connectBtn.textContent = "Connect";
      connectBtn.classList.remove("danger");
    }
    statusText.textContent = label;
  }

  function analyzeAndSaveReference(dataUrl, fileName) {
    var img = new Image();
    img.onload = function () {
      var origW = img.naturalWidth || img.width;
      var origH = img.naturalHeight || img.height;

      var fullCanvas = document.createElement("canvas");
      fullCanvas.width = origW;
      fullCanvas.height = origH;
      var fullCtx = fullCanvas.getContext("2d");
      fullCtx.drawImage(img, 0, 0);
      var pngDataUrl = fullCanvas.toDataURL("image/png");
      var b64 = pngDataUrl.split(",")[1];

      var maxScan = 360;
      var sc = Math.min(1, maxScan / Math.max(origW, origH));
      var sw = Math.max(1, Math.round(origW * sc));
      var sh = Math.max(1, Math.round(origH * sc));
      var scanCanvas = document.createElement("canvas");
      scanCanvas.width = sw;
      scanCanvas.height = sh;
      var sctx = scanCanvas.getContext("2d");
      sctx.drawImage(img, 0, 0, sw, sh);
      var pixels = sctx.getImageData(0, 0, sw, sh).data;

      var colorCounts = {};
      var mask = new Uint8Array(sw * sh);
      for (var i = 0; i < sw * sh; i++) {
        var r = pixels[i * 4];
        var g = pixels[i * 4 + 1];
        var b = pixels[i * 4 + 2];
        var a = pixels[i * 4 + 3];
        var isBg = a < 40 || (r > 242 && g > 242 && b > 242);
        if (!isBg) {
          mask[i] = 1;
          var qr = Math.min(255, Math.round(r / 16) * 16);
          var qg = Math.min(255, Math.round(g / 16) * 16);
          var qb = Math.min(255, Math.round(b / 16) * 16);
          var hex = "#" + ((1 << 24) + (qr << 16) + (qg << 8) + qb).toString(16).slice(1).toUpperCase();
          colorCounts[hex] = (colorCounts[hex] || 0) + 1;
        }
      }

      var sortedColors = Object.keys(colorCounts).sort(function (a, b) {
        return colorCounts[b] - colorCounts[a];
      }).slice(0, 6);

      var visited = new Uint8Array(sw * sh);
      var regions = [];
      var pad = 4;
      for (var y = 0; y < sh; y++) {
        for (var x = 0; x < sw; x++) {
          var idx = y * sw + x;
          if (mask[idx] && !visited[idx]) {
            var queue = [idx];
            visited[idx] = 1;
            var minX = x, maxX = x, minY = y, maxY = y;
            while (queue.length > 0) {
              var cur = queue.pop();
              var cx = cur % sw;
              var cy = (cur - cx) / sw;
              if (cx < minX) minX = cx;
              if (cx > maxX) maxX = cx;
              if (cy < minY) minY = cy;
              if (cy > maxY) maxY = cy;
              for (var dy = -pad; dy <= pad; dy++) {
                var ny = cy + dy;
                if (ny < 0 || ny >= sh) continue;
                for (var dx = -pad; dx <= pad; dx++) {
                  var nx = cx + dx;
                  if (nx < 0 || nx >= sw) continue;
                  var nIdx = ny * sw + nx;
                  if (mask[nIdx] && !visited[nIdx]) {
                    visited[nIdx] = 1;
                    queue.push(nIdx);
                  }
                }
              }
            }
            var rw = (maxX - minX + 1) / sc;
            var rh = (maxY - minY + 1) / sc;
            if (rw >= 18 && rh >= 14 && !(rw > origW * 0.92 && rh > origH * 0.92)) {
              var rx = Math.round(minX / sc);
              var ry = Math.round(minY / sc);
              regions.push({
                x: rx,
                y: ry,
                width: Math.round(rw),
                height: Math.round(rh),
                centerX: Math.round(rx + rw / 2),
                centerY: Math.round(ry + rh / 2)
              });
            }
          }
        }
      }

      var savedPngPath = "";
      var savedJsonPath = "";
      if (fs && os && path && BufferRef) {
        savedPngPath = path.join(os.tmpdir(), "pixopik_active_reference.png");
        savedJsonPath = path.join(os.tmpdir(), "pixopik_active_reference.json");
        fs.writeFileSync(savedPngPath, BufferRef.from(b64, "base64"));
        var metaPayload = {
          fileName: fileName || "reference.png",
          pngPath: savedPngPath.replace(/\\/g, "/"),
          width: origW,
          height: origH,
          palette: sortedColors,
          regionsCount: regions.length,
          regions: regions.slice(0, 60),
          updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(savedJsonPath, JSON.stringify(metaPayload, null, 2), "utf8");
        activeRef = metaPayload;
      }

      refThumb.src = pngDataUrl;
      refDims.textContent = origW + "x" + origH + "px | " + regions.length + " elements";
      refSwatches.innerHTML = "";
      sortedColors.forEach(function (hexCol) {
        var sp = document.createElement("span");
        sp.className = "swatch";
        sp.style.background = hexCol;
        sp.title = hexCol;
        refSwatches.appendChild(sp);
      });
      refEmptyState.style.display = "none";
      refPreviewWrap.style.display = "flex";
      clearRefBtn.style.display = "inline-block";
      traceBtn.disabled = false;
      overlayBtn.disabled = false;
      addLog("Reference loaded (" + origW + "x" + origH + ", " + regions.length + " objects). Ready for Trace or Gemini!");
    };
    img.src = dataUrl;
  }

  function handleFileObj(file) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) {
      addLog("Please drop a valid PNG/JPG/WebP image.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      analyzeAndSaveReference(ev.target.result, file.name);
    };
    reader.readAsDataURL(file);
  }

  refDropzone.addEventListener("click", function () {
    refFileInput.click();
  });
  refFileInput.addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) {
      handleFileObj(e.target.files[0]);
      refFileInput.value = "";
    }
  });
  refDropzone.addEventListener("dragover", function (e) {
    e.preventDefault();
    refDropzone.classList.add("dragover");
  });
  refDropzone.addEventListener("dragleave", function () {
    refDropzone.classList.remove("dragover");
  });
  refDropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    refDropzone.classList.remove("dragover");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileObj(e.dataTransfer.files[0]);
    }
  });
  window.addEventListener("paste", function (e) {
    if (!e.clipboardData || !e.clipboardData.items) return;
    for (var i = 0; i < e.clipboardData.items.length; i++) {
      var it = e.clipboardData.items[i];
      if (it.type && it.type.indexOf("image/") === 0) {
        handleFileObj(it.getAsFile());
        break;
      }
    }
  });

  clearRefBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    activeRef = null;
    refPreviewWrap.style.display = "none";
    refEmptyState.style.display = "block";
    clearRefBtn.style.display = "none";
    traceBtn.disabled = true;
    overlayBtn.disabled = true;
    addLog("Reference cleared.");
  });

  traceBtn.addEventListener("click", function () {
    if (!activeRef || !activeRef.pngPath) return;
    var mode = tracePreset.value || "color_pro";
    addLog("Running Exact Vector Trace (" + mode + ")...");
    var callExpr = '__pixopikTraceReference("' + activeRef.pngPath.replace(/"/g, '\\"') + '", "' + mode + '", ' + activeRef.width + ', ' + activeRef.height + ')';
    evalHostScript(callExpr, function (resStr) {
      try {
        var parsed = JSON.parse(resStr || "{}");
        if (parsed.ok) {
          addLog("Exact Trace complete! " + parsed.paths + " live vector paths created.");
        } else {
          addLog("Trace error: " + (parsed.error || resStr));
        }
      } catch (_e) {
        addLog("Trace finished.");
      }
    });
  });

  overlayBtn.addEventListener("click", function () {
    if (!activeRef || !activeRef.pngPath) return;
    addLog("Placing 35% Locked Ghost Overlay Guide...");
    var callExpr = '__pixopikPlaceOverlay("' + activeRef.pngPath.replace(/"/g, '\\"') + '", ' + activeRef.width + ', ' + activeRef.height + ', 35)';
    evalHostScript(callExpr, function (resStr) {
      try {
        var parsed = JSON.parse(resStr || "{}");
        if (parsed.ok) {
          addLog("Ghost Guide locked at 35%! Ask Gemini to draw on top.");
        } else {
          addLog("Overlay error: " + (parsed.error || resStr));
        }
      } catch (_e) {
        addLog("Overlay placed.");
      }
    });
  });

  reloadUiBtn.addEventListener("click", function () {
    window.location.reload();
  });

  function handleEvalJsx(msg) {
    if (!fs || !os || !path) {
      ws.send(JSON.stringify({ id: msg.id, ok: false, error: "CEP Node.js context unavailable." }));
      return;
    }
    var tempFile = path.join(
      os.tmpdir(),
      "pixopik_cep_" + Date.now() + "_" + Math.floor(Math.random() * 10000) + ".jsx"
    );
    try {
      fs.writeFileSync(tempFile, String(msg.script || ""), "utf8");
      var forwardPath = tempFile.replace(/\\/g, "/");
      var callExpr = '__pixopikRunFile("' + forwardPath.replace(/"/g, '\\"') + '")';
      addLog("Drawing in Illustrator...");
      evalHostScript(callExpr, function (resultStr) {
        try { fs.unlinkSync(tempFile); } catch (_err) {}
        ws.send(JSON.stringify({ id: msg.id, ok: true, output: resultStr }));
        addLog("Done!");
      });
    } catch (err) {
      ws.send(JSON.stringify({ id: msg.id, ok: false, error: String(err) }));
    }
  }

  function handleExportPreview(msg) {
    if (!fs || !os || !path) {
      ws.send(JSON.stringify({ id: msg.id, ok: false, error: "CEP Node.js context unavailable." }));
      return;
    }
    var tempPng = path.join(
      os.tmpdir(),
      "pixopik_preview_" + Date.now() + "_" + Math.floor(Math.random() * 10000) + ".png"
    );
    var forwardPng = tempPng.replace(/\\/g, "/");
    var scale = Number(msg.scalePercent) || 100;
    var transp = msg.transparency !== false ? "true" : "false";
    var callExpr =
      '__pixopikExportPng("' + forwardPng.replace(/"/g, '\\"') + '", ' + scale + ', "' + transp + '")';

    addLog("Sending artboard preview...");
    evalHostScript(callExpr, function (resStr) {
      try {
        var parsed = JSON.parse(resStr || "{}");
        if (!parsed.ok) {
          ws.send(JSON.stringify({ id: msg.id, ok: false, error: parsed.error || "PNG export failed" }));
          return;
        }
        var bytes = fs.readFileSync(tempPng);
        var b64 = bytes.toString("base64");
        try { fs.unlinkSync(tempPng); } catch (_e) {}
        ws.send(JSON.stringify({ id: msg.id, ok: true, base64: b64, info: parsed }));
      } catch (err) {
        ws.send(JSON.stringify({ id: msg.id, ok: false, error: String(err) }));
      }
    });
  }

  function stopHeartbeat() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function connectSocket() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stopHeartbeat();

    var finalUrl = wsUrlInput.value.trim() || DEFAULT_CLOUDFLARE_WS;
    try { localStorage.setItem("pixopik_mcp_ws_url", finalUrl); } catch (_e) {}

    setStatus(false, "Connecting...");

    try {
      ws = new WebSocket(finalUrl);
    } catch (err) {
      setStatus(false, "Connection Error");
      addLog("Error: " + String(err));
      return;
    }

    ws.onopen = function () {
      setStatus(true, "Connected & Ready!");
      addLog("Connected to Cloudflare! Ready for Gemini commands.");
      ws.send(
        JSON.stringify({
          type: "hello",
          plugin: "com.thepixopik.illustrator.mcp",
          version: "0.4.0",
          platform: navigator.platform
        })
      );
      pingTimer = setInterval(function () {
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === "pong") return;
        if (msg.type === "eval_jsx") {
          handleEvalJsx(msg);
        } else if (msg.type === "export_preview") {
          handleExportPreview(msg);
        }
      } catch (err) {
        addLog("Message error: " + String(err));
      }
    };

    ws.onclose = function () {
      stopHeartbeat();
      ws = null;
      setStatus(false, shouldReconnect ? "Reconnecting..." : "Disconnected");
      if (shouldReconnect) {
        reconnectTimer = setTimeout(connectSocket, 3000);
      }
    };

    ws.onerror = function () {};
  }

  connectBtn.addEventListener("click", function () {
    if (ws || shouldReconnect) {
      shouldReconnect = false;
      stopHeartbeat();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
      setStatus(false, "Disconnected");
    } else {
      shouldReconnect = true;
      connectSocket();
    }
  });

  clearLogBtn.addEventListener("click", function () {
    logBox.innerHTML = "";
  });

  connectSocket();
})();
