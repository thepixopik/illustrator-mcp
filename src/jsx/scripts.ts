function jsxStr(value: string): string {
  return JSON.stringify(value);
}

export function buildGetDocumentInfoJsx(): string {
  return `
    if (app.documents.length === 0) {
      return {
        hasDocument: false,
        appVersion: app.version,
        documentCount: 0
      };
    }
    var doc = app.activeDocument;
    var artboards = [];
    for (var i = 0; i < doc.artboards.length; i++) {
      var ab = doc.artboards[i];
      var r = ab.artboardRect;
      artboards.push({
        index: i,
        name: ab.name,
        left: r[0],
        top: r[1],
        right: r[2],
        bottom: r[3],
        width: r[2] - r[0],
        height: r[1] - r[3]
      });
    }
    var layers = [];
    for (var j = 0; j < doc.layers.length; j++) {
      var lyr = doc.layers[j];
      layers.push({
        index: j,
        name: lyr.name,
        visible: lyr.visible,
        locked: lyr.locked,
        pageItemsCount: lyr.pageItems.length
      });
    }
    return {
      hasDocument: true,
      appVersion: app.version,
      documentCount: app.documents.length,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      colorSpace: String(doc.documentColorSpace),
      activeArtboardIndex: doc.artboards.getActiveArtboardIndex(),
      selectionCount: doc.selection ? doc.selection.length : 0,
      artboards: artboards,
      layers: layers
    };
  `;
}

export function buildCreateDocumentJsx(params: {
  title: string;
  width: number;
  height: number;
  colorSpace: "RGB" | "CMYK";
}): string {
  const colorConst =
    params.colorSpace === "CMYK"
      ? "DocumentColorSpace.CMYK"
      : "DocumentColorSpace.RGB";
  return `
    var preset = new DocumentPreset();
    preset.title = ${jsxStr(params.title)};
    preset.width = ${params.width};
    preset.height = ${params.height};
    preset.colorMode = ${colorConst};
    preset.units = RulerUnits.Pixels;
    var doc = app.documents.addDocument(${colorConst}, preset);
    return {
      name: doc.name,
      width: doc.width,
      height: doc.height,
      colorSpace: String(doc.documentColorSpace)
    };
  `;
}

export function buildCreateShapeJsx(params: {
  shape: "rectangle" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  fillHex?: string;
  strokeHex?: string;
  strokeWidth?: number;
  name?: string;
}): string {
  return `
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    function hexToRgb(hex) {
      var clean = hex.replace(/^#/, "");
      if (clean.length === 3) {
        clean = clean.charAt(0) + clean.charAt(0) + clean.charAt(1) + clean.charAt(1) + clean.charAt(2) + clean.charAt(2);
      }
      var c = new RGBColor();
      c.red = parseInt(clean.substring(0, 2), 16) || 0;
      c.green = parseInt(clean.substring(2, 4), 16) || 0;
      c.blue = parseInt(clean.substring(4, 6), 16) || 0;
      return c;
    }

    var doc = app.activeDocument;
    var abIdx = doc.artboards.getActiveArtboardIndex();
    var abRect = doc.artboards[abIdx].artboardRect;
    var left = abRect[0] + (${params.x});
    var top = abRect[1] - (${params.y});

    var item;
    if (${jsxStr(params.shape)} === "ellipse") {
      item = doc.activeLayer.pathItems.ellipse(top, left, ${params.width}, ${params.height});
    } else {
      item = doc.activeLayer.pathItems.rectangle(top, left, ${params.width}, ${params.height});
    }

    ${params.name ? `item.name = ${jsxStr(params.name)};` : ""}

    ${
      params.fillHex
        ? `item.filled = true; item.fillColor = hexToRgb(${jsxStr(params.fillHex)});`
        : `item.filled = false;`
    }

    ${
      params.strokeHex
        ? `item.stroked = true; item.strokeColor = hexToRgb(${jsxStr(params.strokeHex)}); item.strokeWidth = ${params.strokeWidth ?? 1};`
        : `item.stroked = false;`
    }

    app.redraw();
    return {
      created: ${jsxStr(params.shape)},
      name: item.name,
      layer: doc.activeLayer.name,
      x: ${params.x},
      y: ${params.y},
      width: ${params.width},
      height: ${params.height}
    };
  `;
}

export function buildAddTextJsx(params: {
  contents: string;
  x: number;
  y: number;
  fontSize: number;
  fillHex: string;
  name?: string;
}): string {
  return `
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    function hexToRgb(hex) {
      var clean = hex.replace(/^#/, "");
      if (clean.length === 3) {
        clean = clean.charAt(0) + clean.charAt(0) + clean.charAt(1) + clean.charAt(1) + clean.charAt(2) + clean.charAt(2);
      }
      var c = new RGBColor();
      c.red = parseInt(clean.substring(0, 2), 16) || 0;
      c.green = parseInt(clean.substring(2, 4), 16) || 0;
      c.blue = parseInt(clean.substring(4, 6), 16) || 0;
      return c;
    }

    var doc = app.activeDocument;
    var abIdx = doc.artboards.getActiveArtboardIndex();
    var abRect = doc.artboards[abIdx].artboardRect;

    var tf = doc.activeLayer.textFrames.add();
    tf.contents = ${jsxStr(params.contents)};
    tf.position = [abRect[0] + (${params.x}), abRect[1] - (${params.y})];
    tf.textRange.characterAttributes.size = ${params.fontSize};
    tf.textRange.characterAttributes.fillColor = hexToRgb(${jsxStr(params.fillHex)});
    ${params.name ? `tf.name = ${jsxStr(params.name)};` : ""}

    app.redraw();
    return {
      name: tf.name,
      contents: tf.contents,
      layer: doc.activeLayer.name,
      x: ${params.x},
      y: ${params.y},
      fontSize: ${params.fontSize}
    };
  `;
}

export function buildPlaceSvgJsx(params: {
  svgCode: string;
  x: number;
  y: number;
  name?: string;
}): string {
  return `
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var abIdx = doc.artboards.getActiveArtboardIndex();
    var abRect = doc.artboards[abIdx].artboardRect;

    var tempSvg = new File(Folder.temp.fsName + "/pixopik_mcp_" + (new Date().getTime()) + ".svg");
    tempSvg.encoding = "UTF-8";
    if (!tempSvg.open("w")) {
      throw new Error("Unable to create temporary SVG file in Illustrator.");
    }
    tempSvg.write(${jsxStr(params.svgCode)});
    tempSvg.close();

    try {
      var grp = doc.groupItems.createFromFile(tempSvg);
      grp.position = [abRect[0] + (${params.x}), abRect[1] - (${params.y})];
      ${params.name ? `grp.name = ${jsxStr(params.name)};` : ""}
      app.redraw();
      return {
        placed: true,
        name: grp.name,
        layer: doc.activeLayer.name,
        width: grp.width,
        height: grp.height,
        x: ${params.x},
        y: ${params.y}
      };
    } finally {
      if (tempSvg.exists) {
        tempSvg.remove();
      }
    }
  `;
}

export function buildExportPreviewJsx(params: {
  outputPath: string;
  scalePercent: number;
  transparency: boolean;
}): string {
  return `
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var outFile = new File(${jsxStr(params.outputPath)});
    var opts = new ExportOptionsPNG24();
    opts.antiAliasing = true;
    opts.transparency = ${params.transparency ? "true" : "false"};
    opts.artBoardClipping = true;
    opts.horizontalScale = ${params.scalePercent};
    opts.verticalScale = ${params.scalePercent};

    doc.exportFile(outFile, ExportType.PNG24, opts);
    return {
      exported: outFile.exists,
      path: outFile.fsName,
      documentName: doc.name,
      activeArtboardIndex: doc.artboards.getActiveArtboardIndex()
    };
  `;
}
