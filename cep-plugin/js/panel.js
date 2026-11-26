(function () {
  var nodeReq = window.cep_node && window.cep_node.require ? window.cep_node.require : window.require;
  var fs = nodeReq ? nodeReq("fs") : null;
  var os = nodeReq ? nodeReq("os") : null;
  var path = nodeReq ? nodeReq("path") : null;

  var ws = null;
  var shouldReconnect = false;
  var reconnectTimer = null;

  var statusDot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var wsUrlInput = document.getElementById("wsUrl");
  var authTokenInput = document.getElementById("authToken");
  var connectBtn = document.getElementById("connectBtn");
  var clearLogBtn = document.getElementById("clearLogBtn");
  var logBox = document.getElementById("logBox");

  try {
    var savedUrl = localStorage.getItem("pixopik_mcp_ws_url");
    var savedToken = localStorage.getItem("pixopik_mcp_token");
    if (savedUrl) wsUrlInput.value = savedUrl;
    if (savedToken) authTokenInput.value = savedToken;
  } catch (_e) {}

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
      addLog("Running MCP ExtendScript command...");
      evalHostScript(callExpr, function (resultStr) {
        try {
          fs.unlinkSync(tempFile);
        } catch (_err) {}
        ws.send(JSON.stringify({ id: msg.id, ok: true, output: resultStr }));
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

    addLog("Exporting artboard PNG preview...");
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

  function connectSocket() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    var rawUrl = wsUrlInput.value.trim();
    var token = authTokenInput.value.trim();
    if (!rawUrl) {
      addLog("Please enter a valid WebSocket URL.");
      return;
    }

    try {
      localStorage.setItem("pixopik_mcp_ws_url", rawUrl);
      localStorage.setItem("pixopik_mcp_token", token);
    } catch (_e) {}

    var finalUrl = rawUrl;
    if (token) {
      finalUrl += (rawUrl.indexOf("?") === -1 ? "?" : "&") + "token=" + encodeURIComponent(token);
    }

    setStatus(false, "Connecting...");
    addLog("Connecting to " + rawUrl);

    try {
      ws = new WebSocket(finalUrl);
    } catch (err) {
      setStatus(false, "Connection Error");
      addLog("WebSocket error: " + String(err));
      return;
    }

    ws.onopen = function () {
      setStatus(true, "Connected to MCP Relay");
      addLog("Connected! Ready for Gemini Enterprise commands.");
      ws.send(
        JSON.stringify({
          type: "hello",
          plugin: "com.thepixopik.illustrator.mcp",
          version: "0.2.0",
          platform: navigator.platform
        })
      );
    };

    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
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
      ws = null;
      setStatus(false, shouldReconnect ? "Reconnecting in 3s..." : "Disconnected");
      addLog("Socket closed.");
      if (shouldReconnect) {
        reconnectTimer = setTimeout(connectSocket, 3000);
      }
    };

    ws.onerror = function () {
      addLog("WebSocket connection failed.");
    };
  }

  connectBtn.addEventListener("click", function () {
    if (ws || shouldReconnect) {
      shouldReconnect = false;
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

  addLog("Panel loaded. Click Connect to link Illustrator.");
})();
