(function () {
  var DEFAULT_CLOUDFLARE_WS = "wss://illustrator-mcp.goutamboronew.workers.dev/ws";

  var nodeReq = window.cep_node && window.cep_node.require ? window.cep_node.require : window.require;
  var fs = nodeReq ? nodeReq("fs") : null;
  var os = nodeReq ? nodeReq("os") : null;
  var path = nodeReq ? nodeReq("path") : null;

  var ws = null;
  var shouldReconnect = true;
  var reconnectTimer = null;
  var pingTimer = null;

  var statusDot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var wsUrlInput = document.getElementById("wsUrl");
  var connectBtn = document.getElementById("connectBtn");
  var clearLogBtn = document.getElementById("clearLogBtn");
  var logBox = document.getElementById("logBox");

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

  function evalHostScript(expr, cb) {
    if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
      window.__adobe_cep__.evalScript(expr, cb);
    } else {
      cb('{"ok":false,"error":"Adobe CEP runtime not detected."}');
    }
  }

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
        try {
          fs.unlinkSync(tempFile);
        } catch (_err) {}
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
        try {
          fs.unlinkSync(tempPng);
        } catch (_e) {}
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
    try {
      localStorage.setItem("pixopik_mcp_ws_url", finalUrl);
    } catch (_e) {}

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

  /* Auto-connect immediately when Illustrator opens the panel! */
  connectSocket();
})();
