/* Host ExtendScript helpers loaded into Adobe Illustrator by Pixopik CEP v0.4.0 */

function __pixopikRunFile(jsxFilePath) {
  var f = new File(jsxFilePath);
  if (!f.exists) {
    return '{"ok":false,"error":"Temporary JSX script file not found"}';
  }
  return String($.evalFile(f));
}

function __pixopikExportPng(outFilePath, scalePercent, transparencyFlag) {
  try {
    if (app.documents.length === 0) {
      return '{"ok":false,"error":"No active document open in Illustrator."}';
    }
    var doc = app.activeDocument;
    var outFile = new File(outFilePath);
    var opts = new ExportOptionsPNG24();
    opts.antiAliasing = true;
    opts.transparency = transparencyFlag === "true" || transparencyFlag === true;
    opts.artBoardClipping = true;
    opts.horizontalScale = Number(scalePercent) || 100;
    opts.verticalScale = Number(scalePercent) || 100;
    doc.exportFile(outFile, ExportType.PNG24, opts);
    return '{"ok":true,"documentName":"' + String(doc.name).replace(/"/g, '\\"') + '"}';
  } catch (e) {
    var msg = String(e && e.message ? e.message : e).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return '{"ok":false,"error":"' + msg + '"}';
  }
}

function __pixopikTraceReference(imgFilePath, mode, imgW, imgH) {
  try {
    var imgFile = new File(imgFilePath);
    if (!imgFile.exists) {
      return '{"ok":false,"error":"Reference image file not found."}';
    }
    var w = Number(imgW) || 1200;
    var h = Number(imgH) || 1200;
    var doc;
    if (app.documents.length === 0) {
      var preset = new DocumentPreset();
      preset.title = "Pixopik_Exact_Trace";
      preset.width = w;
      preset.height = h;
      preset.colorMode = DocumentColorSpace.RGB;
      preset.units = RulerUnits.Pixels;
      doc = app.documents.addDocument(DocumentColorSpace.RGB, preset);
    } else {
      doc = app.activeDocument;
    }

    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
    var abLeft = ab[0];
    var abTop = ab[1];
    var abW = ab[2] - ab[0];
    var abH = ab[1] - ab[3];

    var traceLayer = null;
    for (var i = 0; i < doc.layers.length; i++) {
      if (doc.layers[i].name === "Traced_Vectors") {
        traceLayer = doc.layers[i];
        break;
      }
    }
    if (!traceLayer) {
      traceLayer = doc.layers.add();
      traceLayer.name = "Traced_Vectors";
    }
    traceLayer.locked = false;
    traceLayer.visible = true;
    doc.activeLayer = traceLayer;

    var placed = traceLayer.placedItems.add();
    placed.file = imgFile;
    var scaleX = (abW * 0.92) / placed.width;
    var scaleY = (abH * 0.92) / placed.height;
    var scale = scaleX < scaleY ? scaleX : scaleY;
    placed.width = placed.width * scale;
    placed.height = placed.height * scale;
    placed.position = [
      abLeft + (abW - placed.width) / 2,
      abTop - (abH - placed.height) / 2
    ];
    var tracedW = placed.width;
    var tracedH = placed.height;

    var pluginItem = placed.trace();
    var opts = pluginItem.tracing.tracingOptions;
    try { opts.tracingMethod = TracingMethodType.TRACINGMETHODABUTTING; } catch (_e1) {}
    if (mode === "line_art") {
      try { opts.tracingMode = TracingModeType.TRACINGMODEBLACKANDWHITE; } catch (_e2) {}
      try { opts.threshold = 148; } catch (_e3) {}
      try { opts.fills = true; } catch (_e4) {}
      try { opts.strokes = false; } catch (_e5) {}
    } else if (mode === "high_detail") {
      try { opts.tracingMode = TracingModeType.TRACINGMODECOLOR; } catch (_e6) {}
      try { opts.tracingColorTypeValue = TracingColorType.TRACINGFULLCOLOR; } catch (_e7) {}
      try { opts.colorFidelity = 95; } catch (_e8) {}
    } else {
      try { opts.tracingMode = TracingModeType.TRACINGMODECOLOR; } catch (_e9) {}
      try { opts.tracingColorTypeValue = TracingColorType.TRACINGLIMITEDCOLOR; } catch (_e10) {}
      try { opts.tracingColors = 14; } catch (_e11) {}
      try { opts.maxColors = 14; } catch (_e12) {}
    }
    try { opts.pathFidelity = 88; } catch (_e13) {}
    try { opts.cornerFidelity = 82; } catch (_e14) {}
    try { opts.noiseFidelity = 5; } catch (_e15) {}
    try { opts.snapCurveToLines = true; } catch (_e16) {}
    try { opts.ignoreWhite = true; } catch (_e17) {}

    app.redraw();
    var grp = pluginItem.tracing.expandTracing();
    grp.name = "Pixopik_Traced_Artwork";

    var removedBg = 0;
    for (var p = grp.pathItems.length - 1; p >= 0; p--) {
      var pi = grp.pathItems[p];
      if (pi.filled && pi.fillColor && pi.fillColor.typename === "RGBColor") {
        if (pi.fillColor.red > 246 && pi.fillColor.green > 246 && pi.fillColor.blue > 246) {
          if (pi.width > tracedW * 0.86 && pi.height > tracedH * 0.86) {
            pi.remove();
            removedBg++;
          }
        }
      }
    }

    app.redraw();
    return '{"ok":true,"paths":' + grp.pathItems.length + ',"removedBackdrop":' + removedBg + '}';
  } catch (e) {
    var msg = String(e && e.message ? e.message : e).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return '{"ok":false,"error":"' + msg + '"}';
  }
}

function __pixopikPlaceOverlay(imgFilePath, imgW, imgH, opacityVal) {
  try {
    var imgFile = new File(imgFilePath);
    if (!imgFile.exists) {
      return '{"ok":false,"error":"Reference image file not found."}';
    }
    var w = Number(imgW) || 1200;
    var h = Number(imgH) || 1200;
    var doc;
    if (app.documents.length === 0) {
      var preset = new DocumentPreset();
      preset.title = "Pixopik_Guided_Design";
      preset.width = w;
      preset.height = h;
      preset.colorMode = DocumentColorSpace.RGB;
      preset.units = RulerUnits.Pixels;
      doc = app.documents.addDocument(DocumentColorSpace.RGB, preset);
    } else {
      doc = app.activeDocument;
    }

    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
    var abLeft = ab[0];
    var abTop = ab[1];
    var abW = ab[2] - ab[0];
    var abH = ab[1] - ab[3];

    var guideLayer = null;
    for (var i = 0; i < doc.layers.length; i++) {
      if (doc.layers[i].name === "Reference_Guide") {
        guideLayer = doc.layers[i];
        break;
      }
    }
    if (!guideLayer) {
      guideLayer = doc.layers.add();
      guideLayer.name = "Reference_Guide";
    }
    guideLayer.locked = false;
    guideLayer.visible = true;
    for (var k = guideLayer.pageItems.length - 1; k >= 0; k--) {
      guideLayer.pageItems[k].remove();
    }

    doc.activeLayer = guideLayer;
    var placed = guideLayer.placedItems.add();
    placed.file = imgFile;
    var scaleX = abW / placed.width;
    var scaleY = abH / placed.height;
    var scale = scaleX < scaleY ? scaleX : scaleY;
    placed.width = placed.width * scale;
    placed.height = placed.height * scale;
    var px = abLeft + (abW - placed.width) / 2;
    var py = abTop - (abH - placed.height) / 2;
    placed.position = [px, py];
    placed.opacity = Number(opacityVal) || 35;
    placed.name = "Reference_Ghost_Overlay";
    guideLayer.locked = true;

    var drawLayer = null;
    for (var d = 0; d < doc.layers.length; d++) {
      if (doc.layers[d].name === "AI_Vectors" || doc.layers[d].name === "Icons") {
        drawLayer = doc.layers[d];
        break;
      }
    }
    if (!drawLayer) {
      drawLayer = doc.layers.add();
      drawLayer.name = "AI_Vectors";
    }
    drawLayer.locked = false;
    drawLayer.visible = true;
    doc.activeLayer = drawLayer;
    app.redraw();

    return '{"ok":true,"left":' + Math.round(px) + ',"top":' + Math.round(py) + ',"width":' + Math.round(placed.width) + ',"height":' + Math.round(placed.height) + '}';
  } catch (e) {
    var msg = String(e && e.message ? e.message : e).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return '{"ok":false,"error":"' + msg + '"}';
  }
}
