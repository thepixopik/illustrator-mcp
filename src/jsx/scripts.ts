function jsxStr(value: string): string {
  return JSON.stringify(value);
}

function jsxJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Pure ES3 helper functions shared across Illustrator scripts.
 * Avoids ES5+ methods (.map, .forEach, .indexOf, const/let) for ExtendScript compatibility.
 */
const ES3_DOM_HELPERS = `
function __hexToRgb(hex) {
  var clean = String(hex).replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.charAt(0) + clean.charAt(0) + clean.charAt(1) + clean.charAt(1) + clean.charAt(2) + clean.charAt(2);
  }
  var c = new RGBColor();
  c.red = parseInt(clean.substring(0, 2), 16) || 0;
  c.green = parseInt(clean.substring(2, 4), 16) || 0;
  c.blue = parseInt(clean.substring(4, 6), 16) || 0;
  return c;
}

function __abOrigin(doc) {
  var idx = doc.artboards.getActiveArtboardIndex();
  var r = doc.artboards[idx].artboardRect;
  return { left: r[0], top: r[1], right: r[2], bottom: r[3], width: r[2] - r[0], height: r[1] - r[3] };
}

function __findByName(doc, targetName) {
  for (var i = 0; i < doc.pageItems.length; i++) {
    if (doc.pageItems[i].name === targetName) {
      return doc.pageItems[i];
    }
  }
  return null;
}

function __resolveItems(doc, namesArray) {
  var found = [];
  if (namesArray && namesArray.length > 0) {
    for (var i = 0; i < namesArray.length; i++) {
      var it = __findByName(doc, namesArray[i]);
      if (!it) {
        throw new Error("PageItem not found with name: " + namesArray[i]);
      }
      found.push(it);
    }
    return found;
  }
  if (doc.selection && doc.selection.length > 0) {
    for (var j = 0; j < doc.selection.length; j++) {
      found.push(doc.selection[j]);
    }
    return found;
  }
  throw new Error("No itemNames provided and nothing is currently selected in Illustrator.");
}
`;

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
      var topItems = [];
      var maxItems = lyr.pageItems.length < 25 ? lyr.pageItems.length : 25;
      for (var k = 0; k < maxItems; k++) {
        var pi = lyr.pageItems[k];
        topItems.push({ name: pi.name, typename: pi.typename });
      }
      layers.push({
        index: j,
        name: lyr.name,
        visible: lyr.visible,
        locked: lyr.locked,
        pageItemsCount: lyr.pageItems.length,
        itemsPreview: topItems
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
      activeLayer: doc.activeLayer.name,
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
  shape: "rectangle" | "rounded_rectangle" | "ellipse" | "polygon" | "star";
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
  sides?: number;
  innerRadiusRatio?: number;
  fillHex?: string;
  strokeHex?: string;
  strokeWidth?: number;
  opacity?: number;
  name?: string;
}): string {
  return `
    ${ES3_DOM_HELPERS}
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var ab = __abOrigin(doc);
    var left = ab.left + (${params.x});
    var top = ab.top - (${params.y});
    var w = ${params.width};
    var h = ${params.height};
    var cx = left + w / 2;
    var cy = top - h / 2;
    var radius = (w < h ? w : h) / 2;
    var kind = ${jsxStr(params.shape)};

    var item;
    if (kind === "ellipse") {
      item = doc.activeLayer.pathItems.ellipse(top, left, w, h);
    } else if (kind === "rounded_rectangle") {
      var cr = ${params.cornerRadius ?? 16};
      item = doc.activeLayer.pathItems.roundedRectangle(top, left, w, h, cr, cr);
    } else if (kind === "polygon") {
      item = doc.activeLayer.pathItems.polygon(cx, cy, radius, ${params.sides ?? 6});
    } else if (kind === "star") {
      var innerR = radius * (${params.innerRadiusRatio ?? 0.5});
      item = doc.activeLayer.pathItems.star(cx, cy, radius, innerR, ${params.sides ?? 5});
    } else {
      item = doc.activeLayer.pathItems.rectangle(top, left, w, h);
    }

    ${params.name ? `item.name = ${jsxStr(params.name)};` : ""}
    ${
      params.fillHex
        ? `item.filled = true; item.fillColor = __hexToRgb(${jsxStr(params.fillHex)});`
        : `item.filled = false;`
    }
    ${
      params.strokeHex
        ? `item.stroked = true; item.strokeColor = __hexToRgb(${jsxStr(params.strokeHex)}); item.strokeWidth = ${params.strokeWidth ?? 1};`
        : `item.stroked = false;`
    }
    ${params.opacity !== undefined ? `item.opacity = ${params.opacity};` : ""}

    app.redraw();
    return {
      created: kind,
      name: item.name,
      layer: doc.activeLayer.name,
      bounds: item.geometricBounds
    };
  `;
}

export interface BezierVertex {
  x: number;
  y: number;
  inX?: number;
  inY?: number;
  outX?: number;
  outY?: number;
}

export function buildDrawBezierPathJsx(params: {
  points: BezierVertex[];
  closed: boolean;
  fillHex?: string;
  strokeHex?: string;
  strokeWidth?: number;
  strokeCap?: "butt" | "round" | "projecting";
  strokeJoin?: "miter" | "round" | "bevel";
  opacity?: number;
  name?: string;
}): string {
  return `
    ${ES3_DOM_HELPERS}
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var ab = __abOrigin(doc);
    var pts = ${jsxJson(params.points)};
    var pathItem = doc.activeLayer.pathItems.add();

    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var pp = pathItem.pathPoints.add();
      var ax = ab.left + p.x;
      var ay = ab.top - p.y;
      pp.anchor = [ax, ay];
      pp.leftDirection = [
        typeof p.inX === "number" ? ab.left + p.inX : ax,
        typeof p.inY === "number" ? ab.top - p.inY : ay
      ];
      pp.rightDirection = [
        typeof p.outX === "number" ? ab.left + p.outX : ax,
        typeof p.outY === "number" ? ab.top - p.outY : ay
      ];
      var hasHandles =
        typeof p.inX === "number" ||
        typeof p.inY === "number" ||
        typeof p.outX === "number" ||
        typeof p.outY === "number";
      pp.pointType = hasHandles ? PointType.SMOOTH : PointType.CORNER;
    }

    pathItem.closed = ${params.closed ? "true" : "false"};
    ${params.name ? `pathItem.name = ${jsxStr(params.name)};` : ""}
    ${
      params.fillHex
        ? `pathItem.filled = true; pathItem.fillColor = __hexToRgb(${jsxStr(params.fillHex)});`
        : `pathItem.filled = false;`
    }
    ${
      params.strokeHex
        ? `pathItem.stroked = true; pathItem.strokeColor = __hexToRgb(${jsxStr(params.strokeHex)}); pathItem.strokeWidth = ${params.strokeWidth ?? 2};`
        : `pathItem.stroked = false;`
    }
    ${
      params.strokeCap === "round"
        ? `pathItem.strokeCap = StrokeCap.ROUNDENDCAP;`
        : params.strokeCap === "projecting"
          ? `pathItem.strokeCap = StrokeCap.PROJECTINGENDCAP;`
          : ""
    }
    ${
      params.strokeJoin === "round"
        ? `pathItem.strokeJoin = StrokeJoin.ROUNDENDJOIN;`
        : params.strokeJoin === "bevel"
          ? `pathItem.strokeJoin = StrokeJoin.BEVELENDJOIN;`
          : ""
    }
    ${params.opacity !== undefined ? `pathItem.opacity = ${params.opacity};` : ""}

    app.redraw();
    return {
      name: pathItem.name,
      pointCount: pathItem.pathPoints.length,
      closed: pathItem.closed,
      layer: doc.activeLayer.name
    };
  `;
}

export function buildAddTextJsx(params: {
  contents: string;
  x: number;
  y: number;
  fontSize: number;
  fillHex: string;
  fontName?: string;
  alignment?: "left" | "center" | "right";
  areaWidth?: number;
  areaHeight?: number;
  tracking?: number;
  name?: string;
}): string {
  return `
    ${ES3_DOM_HELPERS}
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var ab = __abOrigin(doc);
    var left = ab.left + (${params.x});
    var top = ab.top - (${params.y});

    var tf;
    ${
      params.areaWidth && params.areaHeight
        ? `
    var rectPath = doc.activeLayer.pathItems.rectangle(top, left, ${params.areaWidth}, ${params.areaHeight});
    tf = doc.activeLayer.textFrames.areaText(rectPath);
        `
        : `
    tf = doc.activeLayer.textFrames.add();
    tf.position = [left, top];
        `
    }

    tf.contents = ${jsxStr(params.contents)};
    var ca = tf.textRange.characterAttributes;
    ca.size = ${params.fontSize};
    ca.fillColor = __hexToRgb(${jsxStr(params.fillHex)});
    ${params.tracking !== undefined ? `ca.tracking = ${params.tracking};` : ""}

    ${
      params.fontName
        ? `
    var wantedFont = ${jsxStr(params.fontName)};
    for (var fi = 0; fi < app.textFonts.length; fi++) {
      if (app.textFonts[fi].name === wantedFont || app.textFonts[fi].family === wantedFont) {
        ca.textFont = app.textFonts[fi];
        break;
      }
    }
        `
        : ""
    }

    ${
      params.alignment === "center"
        ? `tf.textRange.paragraphAttributes.justification = Justification.CENTER;`
        : params.alignment === "right"
          ? `tf.textRange.paragraphAttributes.justification = Justification.RIGHT;`
          : ""
    }

    ${params.name ? `tf.name = ${jsxStr(params.name)};` : ""}
    app.redraw();
    return {
      name: tf.name,
      contents: tf.contents,
      layer: doc.activeLayer.name,
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
    ${ES3_DOM_HELPERS}
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var ab = __abOrigin(doc);

    var tempSvg = new File(Folder.temp.fsName + "/pixopik_mcp_" + (new Date().getTime()) + ".svg");
    tempSvg.encoding = "UTF-8";
    if (!tempSvg.open("w")) {
      throw new Error("Unable to create temporary SVG file in Illustrator.");
    }
    tempSvg.write(${jsxStr(params.svgCode)});
    tempSvg.close();

    try {
      var grp = doc.groupItems.createFromFile(tempSvg);
      grp.position = [ab.left + (${params.x}), ab.top - (${params.y})];
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

export function buildApplyGradientJsx(params: {
  itemNames?: string[];
  gradientType: "linear" | "radial";
  angle?: number;
  stops: Array<{ colorHex: string; position: number; opacity?: number }>;
  gradientName?: string;
}): string {
  return `
    ${ES3_DOM_HELPERS}
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var targets = __resolveItems(doc, ${jsxJson(params.itemNames ?? [])});
    var stopsInput = ${jsxJson(params.stops)};

    var grad = doc.gradients.add();
    if (${jsxStr(params.gradientName ?? "")}) {
      try { grad.name = ${jsxStr(params.gradientName ?? "")}; } catch (_e) {}
    }
    grad.type = ${
      params.gradientType === "radial"
        ? "GradientType.RADIAL"
        : "GradientType.LINEAR"
    };

    while (grad.gradientStops.length < stopsInput.length) {
      grad.gradientStops.add();
    }
    while (grad.gradientStops.length > stopsInput.length && grad.gradientStops.length > 2) {
      grad.gradientStops[grad.gradientStops.length - 1].remove();
    }

    for (var s = 0; s < stopsInput.length; s++) {
      var st = grad.gradientStops[s];
      st.color = __hexToRgb(stopsInput[s].colorHex);
      st.rampPoint = stopsInput[s].position;
      if (typeof stopsInput[s].opacity === "number") {
        st.opacity = stopsInput[s].opacity;
      }
    }

    var gColor = new GradientColor();
    gColor.gradient = grad;

    var appliedCount = 0;
    function applyGradToItem(it) {
      if (it.typename === "PathItem") {
        it.filled = true;
        it.fillColor = gColor;
        ${
          params.angle !== undefined && params.angle !== 0
            ? `it.rotate(${params.angle}, false, false, true, false, Transformation.CENTER);`
            : ""
        }
        appliedCount++;
      } else if (it.typename === "CompoundPathItem") {
        for (var c = 0; c < it.pathItems.length; c++) {
          applyGradToItem(it.pathItems[c]);
        }
      } else if (it.typename === "GroupItem") {
        for (var g = 0; g < it.pageItems.length; g++) {
          applyGradToItem(it.pageItems[g]);
        }
      }
    }

    for (var i = 0; i < targets.length; i++) {
      applyGradToItem(targets[i]);
    }

    app.redraw();
    return {
      gradientName: grad.name,
      type: ${jsxStr(params.gradientType)},
      appliedPaths: appliedCount
    };
  `;
}

const PATHFINDER_CMD_MAP: Record<string, string> = {
  unite: "Live Pathfinder Add",
  subtract: "Live Pathfinder Subtract",
  intersect: "Live Pathfinder Intersect",
  exclude: "Live Pathfinder Exclude",
  divide: "Live Pathfinder Divide",
  trim: "Live Pathfinder Trim",
  merge: "Live Pathfinder Merge",
  crop: "Live Pathfinder Crop",
  outline: "Live Pathfinder Outline",
  minus_back: "Live Pathfinder Minus Back"
};

export function buildApplyPathfinderJsx(params: {
  operation: keyof typeof PATHFINDER_CMD_MAP;
  itemNames?: string[];
  expand: boolean;
  resultName?: string;
}): string {
  const menuCmd = PATHFINDER_CMD_MAP[params.operation] ?? "Live Pathfinder Add";
  return `
    ${ES3_DOM_HELPERS}
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var targets = __resolveItems(doc, ${jsxJson(params.itemNames ?? [])});
    if (targets.length < 2) {
      throw new Error("Pathfinder requires at least 2 overlapping vector items.");
    }

    doc.selection = null;
    for (var i = 0; i < targets.length; i++) {
      targets[i].selected = true;
    }

    app.executeMenuCommand("group");
    app.executeMenuCommand(${jsxStr(menuCmd)});
    app.redraw();
    ${params.expand ? `app.executeMenuCommand("expandStyle"); app.redraw();` : ""}

    var resName = ${jsxStr(params.resultName ?? "")};
    if (resName && doc.selection && doc.selection.length > 0) {
      doc.selection[0].name = resName;
    }

    return {
      operation: ${jsxStr(String(params.operation))},
      menuCommand: ${jsxStr(menuCmd)},
      expanded: ${params.expand ? "true" : "false"},
      resultingSelectionCount: doc.selection ? doc.selection.length : 0,
      resultName: doc.selection && doc.selection.length > 0 ? doc.selection[0].name : ""
    };
  `;
}

export function buildCreateClippingMaskJsx(params: {
  maskItemName?: string;
  targetItemNames?: string[];
  groupName?: string;
}): string {
  return `
    ${ES3_DOM_HELPERS}
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var maskName = ${jsxStr(params.maskItemName ?? "")};
    var targetNames = ${jsxJson(params.targetItemNames ?? [])};

    var grp = doc.activeLayer.groupItems.add();
    ${params.groupName ? `grp.name = ${jsxStr(params.groupName)};` : ""}

    if (maskName && targetNames.length > 0) {
      var maskItem = __findByName(doc, maskName);
      if (!maskItem) throw new Error("Mask item not found: " + maskName);
      for (var i = 0; i < targetNames.length; i++) {
        var t = __findByName(doc, targetNames[i]);
        if (!t) throw new Error("Target item not found: " + targetNames[i]);
        t.move(grp, ElementPlacement.PLACEATEND);
      }
      maskItem.move(grp, ElementPlacement.PLACEATBEGINNING);
      if (maskItem.typename === "PathItem") {
        maskItem.clipping = true;
      }
      grp.clipped = true;
    } else {
      if (!doc.selection || doc.selection.length < 2) {
        grp.remove();
        throw new Error("Provide maskItemName + targetItemNames, or select at least 2 items (topmost item acts as mask).");
      }
      for (var s = doc.selection.length - 1; s >= 0; s--) {
        doc.selection[s].move(grp, ElementPlacement.PLACEATBEGINNING);
      }
      grp.clipped = true;
    }

    app.redraw();
    return {
      clipped: grp.clipped,
      groupName: grp.name,
      itemCount: grp.pageItems.length
    };
  `;
}

export function buildManageLayersJsx(params: {
  action: "create" | "activate" | "rename" | "delete" | "lock" | "unlock" | "show" | "hide";
  layerName: string;
  newName?: string;
}): string {
  return `
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var act = ${jsxStr(params.action)};
    var targetName = ${jsxStr(params.layerName)};

    function findLayer(nm) {
      for (var i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].name === nm) return doc.layers[i];
      }
      return null;
    }

    if (act === "create") {
      var created = doc.layers.add();
      created.name = targetName;
      return { action: act, layer: created.name, totalLayers: doc.layers.length };
    }

    var lyr = findLayer(targetName);
    if (!lyr) {
      throw new Error("Layer not found: " + targetName);
    }

    if (act === "activate") {
      doc.activeLayer = lyr;
    } else if (act === "rename") {
      if (!${jsxStr(params.newName ?? "")}) throw new Error("newName is required for rename.");
      lyr.name = ${jsxStr(params.newName ?? "")};
    } else if (act === "delete") {
      lyr.locked = false;
      lyr.remove();
      return { action: act, deleted: targetName, totalLayers: doc.layers.length };
    } else if (act === "lock") {
      lyr.locked = true;
    } else if (act === "unlock") {
      lyr.locked = false;
    } else if (act === "show") {
      lyr.visible = true;
    } else if (act === "hide") {
      lyr.visible = false;
    }

    app.redraw();
    return {
      action: act,
      layer: lyr.name,
      visible: lyr.visible,
      locked: lyr.locked
    };
  `;
}

export function buildTransformAndStyleJsx(params: {
  itemNames?: string[];
  moveDeltaX?: number;
  moveDeltaY?: number;
  rotateDegrees?: number;
  scalePercentX?: number;
  scalePercentY?: number;
  opacity?: number;
  blendMode?: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color_dodge" | "color_burn" | "hard_light" | "soft_light" | "difference" | "exclusion";
  outlineStroke?: boolean;
  duplicate?: boolean;
  deleteItems?: boolean;
}): string {
  return `
    ${ES3_DOM_HELPERS}
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var targets = __resolveItems(doc, ${jsxJson(params.itemNames ?? [])});

    if (${params.deleteItems ? "true" : "false"}) {
      var delCount = targets.length;
      for (var d = 0; d < targets.length; d++) {
        targets[d].remove();
      }
      app.redraw();
      return { deletedCount: delCount };
    }

    var blendMap = {
      normal: BlendModes.NORMAL,
      multiply: BlendModes.MULTIPLY,
      screen: BlendModes.SCREEN,
      overlay: BlendModes.OVERLAY,
      darken: BlendModes.DARKEN,
      lighten: BlendModes.LIGHTEN,
      color_dodge: BlendModes.COLORDODGE,
      color_burn: BlendModes.COLORBURN,
      hard_light: BlendModes.HARDLIGHT,
      soft_light: BlendModes.SOFTLIGHT,
      difference: BlendModes.DIFFERENCE,
      exclusion: BlendModes.EXCLUSION
    };

    var workList = [];
    for (var i = 0; i < targets.length; i++) {
      var item = ${params.duplicate ? "targets[i].duplicate()" : "targets[i]"};
      ${
        params.moveDeltaX !== undefined || params.moveDeltaY !== undefined
          ? `item.translate(${params.moveDeltaX ?? 0}, ${-(params.moveDeltaY ?? 0)});`
          : ""
      }
      ${
        params.rotateDegrees !== undefined
          ? `item.rotate(${params.rotateDegrees});`
          : ""
      }
      ${
        params.scalePercentX !== undefined || params.scalePercentY !== undefined
          ? `item.resize(${params.scalePercentX ?? 100}, ${params.scalePercentY ?? params.scalePercentX ?? 100});`
          : ""
      }
      ${params.opacity !== undefined ? `item.opacity = ${params.opacity};` : ""}
      ${
        params.blendMode
          ? `if (blendMap[${jsxStr(params.blendMode)}]) item.blendingMode = blendMap[${jsxStr(params.blendMode)}];`
          : ""
      }
      workList.push(item);
    }

    if (${params.outlineStroke ? "true" : "false"}) {
      doc.selection = null;
      for (var s = 0; s < workList.length; s++) {
        workList[s].selected = true;
      }
      app.executeMenuCommand("OffsetPath v22");
    }

    app.redraw();
    return {
      modifiedCount: workList.length,
      duplicated: ${params.duplicate ? "true" : "false"},
      outlinedStroke: ${params.outlineStroke ? "true" : "false"}
    };
  `;
}

export function buildAlignItemsJsx(params: {
  itemNames?: string[];
  horizontal?: "left" | "center" | "right";
  vertical?: "top" | "middle" | "bottom";
  relativeTo: "artboard" | "selection";
}): string {
  return `
    ${ES3_DOM_HELPERS}
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var targets = __resolveItems(doc, ${jsxJson(params.itemNames ?? [])});
    var refBox;

    if (${jsxStr(params.relativeTo)} === "artboard" || targets.length === 1) {
      var ab = __abOrigin(doc);
      refBox = { left: ab.left, top: ab.top, right: ab.right, bottom: ab.bottom };
    } else {
      var b0 = targets[0].visibleBounds;
      refBox = { left: b0[0], top: b0[1], right: b0[2], bottom: b0[3] };
      for (var i = 1; i < targets.length; i++) {
        var bi = targets[i].visibleBounds;
        if (bi[0] < refBox.left) refBox.left = bi[0];
        if (bi[1] > refBox.top) refBox.top = bi[1];
        if (bi[2] > refBox.right) refBox.right = bi[2];
        if (bi[3] < refBox.bottom) refBox.bottom = bi[3];
      }
    }

    var hAlign = ${jsxStr(params.horizontal ?? "")};
    var vAlign = ${jsxStr(params.vertical ?? "")};
    var refCenterX = (refBox.left + refBox.right) / 2;
    var refCenterY = (refBox.top + refBox.bottom) / 2;

    for (var j = 0; j < targets.length; j++) {
      var it = targets[j];
      var ib = it.visibleBounds;
      var iw = ib[2] - ib[0];
      var ih = ib[1] - ib[3];
      var dx = 0;
      var dy = 0;

      if (hAlign === "left") dx = refBox.left - ib[0];
      else if (hAlign === "center") dx = refCenterX - (ib[0] + iw / 2);
      else if (hAlign === "right") dx = refBox.right - ib[2];

      if (vAlign === "top") dy = refBox.top - ib[1];
      else if (vAlign === "middle") dy = refCenterY - (ib[1] - ih / 2);
      else if (vAlign === "bottom") dy = refBox.bottom - ib[3];

      it.translate(dx, dy);
    }

    app.redraw();
    return {
      alignedCount: targets.length,
      relativeTo: ${jsxStr(params.relativeTo)},
      horizontal: hAlign || null,
      vertical: vAlign || null
    };
  `;
}

export function buildExecuteMenuOrActionJsx(params: {
  menuCommand?: string;
  actionName?: string;
  actionSetName?: string;
  selectItemNames?: string[];
}): string {
  return `
    ${ES3_DOM_HELPERS}
    if (app.documents.length === 0 && !${jsxStr(params.menuCommand ?? "")}) {
      throw new Error("No active document open in Illustrator.");
    }
    var selNames = ${jsxJson(params.selectItemNames ?? [])};
    if (app.documents.length > 0 && selNames.length > 0) {
      var doc = app.activeDocument;
      var items = __resolveItems(doc, selNames);
      doc.selection = null;
      for (var i = 0; i < items.length; i++) {
        items[i].selected = true;
      }
    }

    var menuCmd = ${jsxStr(params.menuCommand ?? "")};
    var actName = ${jsxStr(params.actionName ?? "")};
    var setName = ${jsxStr(params.actionSetName ?? "")};

    if (menuCmd) {
      app.executeMenuCommand(menuCmd);
    }
    if (actName && setName) {
      app.doScript(actName, setName);
    }
    app.redraw();
    return {
      executedMenuCommand: menuCmd || null,
      executedAction: actName && setName ? (setName + " > " + actName) : null
    };
  `;
}

export function buildExportDocumentJsx(params: {
  outputPath: string;
  format: "ai" | "pdf" | "svg" | "eps" | "png" | "jpg";
}): string {
  return `
    if (app.documents.length === 0) {
      throw new Error("No active document open in Illustrator.");
    }
    var doc = app.activeDocument;
    var outFile = new File(${jsxStr(params.outputPath.replace(/\\/g, "/"))});
    var fmt = ${jsxStr(params.format)};

    if (fmt === "ai") {
      var aiOpts = new IllustratorSaveOptions();
      doc.saveAs(outFile, aiOpts);
    } else if (fmt === "pdf") {
      var pdfOpts = new PDFSaveOptions();
      doc.saveAs(outFile, pdfOpts);
    } else if (fmt === "eps") {
      var epsOpts = new EPSSaveOptions();
      doc.saveAs(outFile, epsOpts);
    } else if (fmt === "svg") {
      var svgOpts = new ExportOptionsSVG();
      svgOpts.embedRasterImages = true;
      doc.exportFile(outFile, ExportType.SVG, svgOpts);
    } else if (fmt === "jpg") {
      var jpgOpts = new ExportOptionsJPEG();
      jpgOpts.qualitySetting = 95;
      jpgOpts.artBoardClipping = true;
      doc.exportFile(outFile, ExportType.JPEG, jpgOpts);
    } else {
      var pngOpts = new ExportOptionsPNG24();
      pngOpts.antiAliasing = true;
      pngOpts.transparency = true;
      pngOpts.artBoardClipping = true;
      doc.exportFile(outFile, ExportType.PNG24, pngOpts);
    }

    return {
      saved: outFile.exists,
      format: fmt,
      path: outFile.fsName
    };
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
