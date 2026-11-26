/* Host ExtendScript helpers loaded into Adobe Illustrator by CEP */

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
