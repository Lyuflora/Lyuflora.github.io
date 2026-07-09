const themes = {
  yellow: { label: "Yellow", targetHue: 50, hueSpread: .75, saturationScale: .95, valueScale: 1.05 },
  orange: { label: "Orange", targetHue: 28, hueSpread: .75, saturationScale: 1, valueScale: 1 },
  red: { label: "Red", targetHue: 0, hueSpread: .65, saturationScale: 1.05, valueScale: .95 },
  purple: { label: "Purple", targetHue: 280, hueSpread: .85, saturationScale: 1, valueScale: 1 },
  magenta: { label: "Magenta", targetHue: 315, hueSpread: .8, saturationScale: 1, valueScale: 1 },
  blue: { label: "Blue", targetHue: 210, hueSpread: .85, saturationScale: 1, valueScale: 1 },
  cyan: { label: "Cyan", targetHue: 185, hueSpread: .75, saturationScale: .95, valueScale: 1.05 },
  green: { label: "Green", targetHue: 125, hueSpread: .75, saturationScale: .95, valueScale: .95 }
};

const sources = {
  cool: { label: "Cool Blue/Purple", centerHue: 220, minHue: 190, maxHue: 260, minSaturation: .12, minValue: .05 },
  yellow: { label: "Yellow", centerHue: 50, minHue: 40, maxHue: 65, minSaturation: .12, minValue: .05 },
  orange: { label: "Orange", centerHue: 28, minHue: 15, maxHue: 45, minSaturation: .12, minValue: .05 },
  red: { label: "Red", centerHue: 0, minHue: 345, maxHue: 15, minSaturation: .12, minValue: .05 },
  purple: { label: "Purple", centerHue: 285, minHue: 250, maxHue: 320, minSaturation: .12, minValue: .05 },
  magenta: { label: "Magenta", centerHue: 315, minHue: 300, maxHue: 335, minSaturation: .12, minValue: .05 },
  blue: { label: "Blue", centerHue: 210, minHue: 190, maxHue: 240, minSaturation: .12, minValue: .05 },
  cyan: { label: "Cyan", centerHue: 185, minHue: 170, maxHue: 200, minSaturation: .12, minValue: .05 },
  green: { label: "Green", centerHue: 125, minHue: 90, maxHue: 155, minSaturation: .12, minValue: .05 },
  all: { label: "All Colored", centerHue: 220, minHue: 0, maxHue: 360, minSaturation: .12, minValue: .05 }
};

const colorNameRe = /(^|[^a-z0-9])(yellow|orange|red|purple|magenta|blue|cyan|green)(?=$|[^a-z0-9])/i;
const materialColorNameRe = /(^|[^a-z0-9])(yellow|orange|red|purple|magenta|blue|cyan|green)(?=$|[^a-z0-9])/ig;
const valueRe = /^(\s*"valueY"\s+")(-?\d+(?:\.\d+)?)(".*)$/;
const graphTypeRe = /"variant_type"\s+"Types_ParticleModule(ColorGraph|EmissiveGraph)"/;
const preferencesKey = "vfxAssetRecolor.preferences.v1";
const savedSetupKey = "vfxAssetRecolor.savedColorSetup.v1";
const fileHistoryKey = "vfxAssetRecolor.fileColorHistory.v1";
const maxBatchFiles = 5;
const maxHistoryEntries = 24;

const state = {
  text: "",
  fileName: "vfx_asset.json",
  batchAssets: [],
  emitters: [],
  report: [],
  manualOverrides: {},
  validation: null,
  outputText: ""
};

const els = {
  file: document.querySelector("#assetFile"),
  batchInfo: document.querySelector("#batchInfo"),
  pasteName: document.querySelector("#pasteName"),
  pasteContent: document.querySelector("#pasteContent"),
  usePasted: document.querySelector("#usePastedContent"),
  target: document.querySelector("#targetColor"),
  source: document.querySelector("#sourceColor"),
  targetSelectDot: document.querySelector("#targetSelectDot"),
  targetSwatch: document.querySelector("#targetSwatch"),
  targetRamp: document.querySelector("#targetRamp"),
  sourceSelectDot: document.querySelector("#sourceSelectDot"),
  sourceSwatch: document.querySelector("#sourceSwatch"),
  sourceRamp: document.querySelector("#sourceRamp"),
  savedPaletteSource: document.querySelector("#savedPaletteSource"),
  savedPaletteTarget: document.querySelector("#savedPaletteTarget"),
  savedPaletteRamp: document.querySelector("#savedPaletteRamp"),
  savedSetupStatus: document.querySelector("#savedSetupStatus"),
  saveColorSetup: document.querySelector("#saveColorSetup"),
  applyColorSetup: document.querySelector("#applyColorSetup"),
  fileHistoryCount: document.querySelector("#fileHistoryCount"),
  fileHistoryList: document.querySelector("#fileHistoryList"),
  clearColorHistory: document.querySelector("#clearColorHistory"),
  processDisabled: document.querySelector("#processDisabledEmitters"),
  suffix: document.querySelector("#nameSuffix"),
  outputName: document.querySelector("#outputName"),
  tuningPanel: document.querySelector("#tuningPanel"),
  customHue: document.querySelector("#customHue"),
  customHueNumber: document.querySelector("#customHueNumber"),
  hueSpread: document.querySelector("#hueSpread"),
  hueSpreadValue: document.querySelector("#hueSpreadValue"),
  satScale: document.querySelector("#satScale"),
  satScaleValue: document.querySelector("#satScaleValue"),
  valScale: document.querySelector("#valScale"),
  valScaleValue: document.querySelector("#valScaleValue"),
  tuningPreviewDot: document.querySelector("#tuningPreviewDot"),
  tuningPreviewLow: document.querySelector("#tuningPreviewLow"),
  tuningPreviewMid: document.querySelector("#tuningPreviewMid"),
  tuningPreviewHigh: document.querySelector("#tuningPreviewHigh"),
  tuningPreviewValue: document.querySelector("#tuningPreviewValue"),
  resetThemeTuning: document.querySelector("#resetThemeTuning"),
  preview: document.querySelector("#previewChanges"),
  exportJson: document.querySelector("#exportJson"),
  copyOutput: document.querySelector("#copyOutput"),
  exportAll: document.querySelector("#exportAll"),
  report: document.querySelector("#downloadReport"),
  showOverviewName: document.querySelector("#showOverviewName"),
  overviewTable: document.querySelector(".overview-table"),
  emitterRows: document.querySelector("#emitterRows"),
  rows: document.querySelector("#assetRows"),
  status: document.querySelector("#assetStatus")
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mod(value, base = 360) {
  return ((value % base) + base) % base;
}

function rgbToHsv(rgb) {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: mod(h), s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h, s, v) {
  const hue = mod(h);
  const value = clamp(v, 0, 1);
  const c = value * clamp(s, 0, 1);
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = value - c;
  let r = 0, g = 0, b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m].map(channel => clamp(channel, 0, 1));
}

function rgbHex(rgb) {
  return "#" + rgb.map(channel => Math.round(clamp(channel, 0, 1) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function fmt(value) {
  const text = Number(value).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return text === "-0" ? "0" : text;
}

function splitLines(text) {
  return text.match(/.*(?:\r\n|\n|$)/g).filter((line, index, arr) => !(index === arr.length - 1 && line === ""));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function hueDelta(hue, center) {
  return ((hue - center + 540) % 360) - 180;
}

function selectedSource(rgb, source) {
  const hsv = rgbToHsv(rgb);
  if (hsv.s < source.minSaturation || hsv.v < source.minValue) return false;
  if (source.minHue <= source.maxHue) return hsv.h >= source.minHue && hsv.h <= source.maxHue;
  return hsv.h >= source.minHue || hsv.h <= source.maxHue;
}

function remap(rgb, source, theme) {
  const hsv = rgbToHsv(rgb);
  const h = theme.targetHue + hueDelta(hsv.h, source.centerHue) * theme.hueSpread;
  return hsvToRgb(h, hsv.s * theme.saturationScale, hsv.v * theme.valueScale);
}

function remapToHue(rgb, hue, theme) {
  const hsv = rgbToHsv(rgb);
  return hsvToRgb(hue, hsv.s * theme.saturationScale, hsv.v * theme.valueScale);
}

function colorChip(color) {
  const theme = themes[color];
  return rgbHex(hsvToRgb(theme?.targetHue ?? 0, .78, .95));
}

function braceDelta(line) {
  let inQuote = false;
  let escaped = false;
  let delta = 0;
  for (const char of line) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inQuote) {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (char === "{") delta++;
    if (char === "}") delta--;
  }
  return delta;
}

function findBlockEnd(lines, start, limit = lines.length) {
  let depth = braceDelta(lines[start]);
  let index = start + 1;
  while (index < limit && depth > 0) {
    depth += braceDelta(lines[index]);
    index++;
  }
  return index;
}

function topLevelStringInBlock(lines, start, end, key, last = false) {
  let depth = braceDelta(lines[start]);
  let found = "";
  for (let index = start + 1; index < end; index++) {
    if (depth === 1) {
      const match = lines[index].match(/^\s*"([^"]+)"\s+"([^"]*)"/);
      if (match?.[1] === key) {
        if (!last) return match[2];
        found = match[2];
      }
    }
    depth += braceDelta(lines[index]);
  }
  return found;
}

function materialColorKeywords(material) {
  const colors = new Set();
  materialColorNameRe.lastIndex = 0;
  let match = materialColorNameRe.exec(material);
  while (match) {
    colors.add(match[2].toLowerCase());
    match = materialColorNameRe.exec(material);
  }
  return [...colors];
}

function materialHintsInBlock(lines, start, end) {
  const hints = [];
  for (let index = start + 1; index < end; index++) {
    const match = lines[index].match(/^\s*"material"\s+"([^"]+)"/);
    if (!match) continue;
    const colors = materialColorKeywords(match[1]);
    if (colors.length) hints.push({ material: match[1], colors });
  }
  return hints;
}

function collectEmitterEntries(lines, start, end, targetDepth, initialDepth) {
  const emitters = [];
  const entryRe = /^\s*"\[\d+\]"\s*\{/;
  let depth = initialDepth;
  let index = start;
  while (index < end) {
    if (depth === targetDepth && entryRe.test(lines[index])) {
      const emitterStart = index;
      const emitterEnd = findBlockEnd(lines, emitterStart, end);
      const name = topLevelStringInBlock(lines, emitterStart, emitterEnd, "name") || "<unnamed>";
      const label = topLevelStringInBlock(lines, emitterStart, emitterEnd, "label", true);
      const disabled = topLevelStringInBlock(lines, emitterStart, emitterEnd, "disable") === "1";
      const materialHints = materialHintsInBlock(lines, emitterStart, emitterEnd);
      emitters.push({ index: emitters.length, start: emitterStart, end: emitterEnd, label, name, disabled, materialHints });
      index = emitterEnd;
      depth = targetDepth;
      continue;
    }
    depth += braceDelta(lines[index]);
    index++;
  }
  return emitters;
}

function collectEmitters(lines) {
  const start = lines.findIndex(line => line.includes("\"emitters\"") && line.includes("{"));
  if (start >= 0) {
    const end = findBlockEnd(lines, start);
    return collectEmitterEntries(lines, start + 1, end, 1, braceDelta(lines[start]));
  }
  return collectEmitterEntries(lines, 0, lines.length, 0, 0);
}

function emitterMap(emitters) {
  const labels = new Map();
  emitters.forEach(emitter => {
    for (let lineIndex = emitter.start; lineIndex < emitter.end; lineIndex++) {
      labels.set(lineIndex, emitter);
    }
  });
  return labels;
}

function lineEnding(line) {
  return line.endsWith("\r\n") ? "\r\n" : line.endsWith("\n") ? "\n" : "";
}

function collectKeyframeValue(lines, keyframeStart, keyframeEnd) {
  const openIndent = lines[keyframeStart].match(/^\s*/)?.[0] || "";
  let insertIndent = `${openIndent}\t`;
  for (let index = keyframeStart + 1; index < keyframeEnd; index++) {
    const value = lines[index].replace(/\r?\n$/, "").match(valueRe);
    if (value) return { index, value: Number(value[2]) };
    if (/^\s*"/.test(lines[index])) {
      insertIndent = lines[index].match(/^\s*/)?.[0] || insertIndent;
    }
  }
  return {
    index: null,
    value: 0,
    insertAt: keyframeEnd - 1,
    indent: insertIndent,
    newline: lineEnding(lines[keyframeEnd - 1] || lines[keyframeStart])
  };
}

function collectChannelKeyframes(lines, channelStart, channelEnd) {
  const items = [];
  const keyframeRe = /^\s*"\[\d+\]"\s*\{/;
  for (let index = channelStart + 1; index < channelEnd; index++) {
    if (!keyframeRe.test(lines[index])) continue;
    const keyframeEnd = findBlockEnd(lines, index, channelEnd);
    items.push(collectKeyframeValue(lines, index, keyframeEnd));
    index = keyframeEnd - 1;
  }
  return items;
}

function collectChannels(lines, curveStart, curveEnd) {
  const channels = { 0: [], 1: [], 2: [] };
  for (let index = curveStart; index < curveEnd; index++) {
    const channel = lines[index].match(/"channel([0-3])"\s*\{/);
    if (channel) {
      const current = Number(channel[1]);
      const channelEnd = findBlockEnd(lines, index, curveEnd);
      if (channels[current]) {
        channels[current] = collectChannelKeyframes(lines, index, channelEnd);
      }
      index = channelEnd - 1;
      continue;
    }
  }
  return channels;
}

function replaceValue(line, value) {
  const newline = line.endsWith("\r\n") ? "\r\n" : line.endsWith("\n") ? "\n" : "";
  const body = newline ? line.slice(0, -newline.length) : line;
  return body.replace(valueRe, `$1${fmt(value)}$3`) + newline;
}

function queueInsertion(insertions, index, line) {
  if (!insertions.has(index)) insertions.set(index, []);
  insertions.get(index).push(line);
}

function setCollectedValue(out, insertions, item, value) {
  if (item.index !== null) {
    out[item.index] = replaceValue(out[item.index], value);
    return;
  }
  if (fmt(value) === "0") return;
  queueInsertion(insertions, item.insertAt, `${item.indent}"valueY" "${fmt(value)}"${item.newline}`);
}

function joinWithInsertions(out, insertions) {
  const result = [];
  out.forEach((line, index) => {
    if (insertions.has(index)) result.push(...insertions.get(index));
    result.push(line);
  });
  if (insertions.has(out.length)) result.push(...insertions.get(out.length));
  return result.join("");
}

function graphLabel(type) {
  return type === "EmissiveGraph" ? "Emissive Graph" : "Color Graph";
}

function collectColorCurves(lines, objectStart, objectEnd) {
  const curves = [];
  for (let index = objectStart; index < objectEnd; index++) {
    const match = lines[index].match(/"colorCurve([12])"\s*\{/);
    if (!match) continue;
    const curveEnd = findBlockEnd(lines, index, objectEnd);
    const channels = collectChannels(lines, index, curveEnd);
    if (channels[0].length && channels[1].length && channels[2].length) {
      curves.push({ name: `colorCurve${match[1]}`, channels });
    }
    index = curveEnd - 1;
  }
  return curves;
}

function countColorCurves(lines) {
  let count = 0;
  for (let index = 0; index < lines.length; index++) {
    const typeMatch = lines[index].match(graphTypeRe);
    if (!typeMatch) continue;
    let objectStart = index;
    while (objectStart < lines.length && !lines[objectStart].includes("\"variant_object\"")) objectStart++;
    if (objectStart >= lines.length) continue;
    const objectEnd = findBlockEnd(lines, objectStart);
    count += collectColorCurves(lines, objectStart, objectEnd).length;
    index = objectEnd;
  }
  return count;
}

function braceBalance(lines) {
  return lines.reduce((sum, line) => sum + braceDelta(line), 0);
}

function validationSummary(validation) {
  if (!validation) return "";
  const inserted = validation.insertedLineCount ? `, +${validation.insertedLineCount} inserted lines` : "";
  return `Format OK: lines ${validation.sourceLineCount} -> ${validation.outputLineCount}${inserted}; braces, emitters, and curves match.`;
}

function validateRecolorOutput(sourceText, result) {
  const sourceLines = splitLines(sourceText);
  const outputLines = splitLines(result.text);
  const sourceEmitters = collectEmitters(sourceLines);
  const outputEmitters = collectEmitters(outputLines);
  const validation = {
    ok: true,
    errors: [],
    sourceLineCount: sourceLines.length,
    outputLineCount: outputLines.length,
    insertedLineCount: result.insertedLineCount || 0,
    sourceBraceBalance: braceBalance(sourceLines),
    outputBraceBalance: braceBalance(outputLines),
    sourceEmitterCount: sourceEmitters.length,
    outputEmitterCount: outputEmitters.length,
    sourceCurveCount: countColorCurves(sourceLines),
    outputCurveCount: countColorCurves(outputLines)
  };
  validation.expectedLineCount = validation.sourceLineCount + validation.insertedLineCount;
  if (validation.outputLineCount !== validation.expectedLineCount) {
    validation.errors.push(`Line count mismatch: expected ${validation.expectedLineCount}, got ${validation.outputLineCount}.`);
  }
  if (validation.outputLineCount < validation.sourceLineCount) {
    validation.errors.push(`Output is shorter than source: source ${validation.sourceLineCount}, output ${validation.outputLineCount}.`);
  }
  if (validation.outputBraceBalance !== validation.sourceBraceBalance) {
    validation.errors.push(`Brace balance changed: source ${validation.sourceBraceBalance}, output ${validation.outputBraceBalance}.`);
  }
  if (validation.outputEmitterCount !== validation.sourceEmitterCount) {
    validation.errors.push(`Emitter count changed: source ${validation.sourceEmitterCount}, output ${validation.outputEmitterCount}.`);
  }
  if (validation.outputCurveCount !== validation.sourceCurveCount) {
    validation.errors.push(`Color curve count changed: source ${validation.sourceCurveCount}, output ${validation.outputCurveCount}.`);
  }
  validation.ok = validation.errors.length === 0;
  return validation;
}

function recolorText(text, theme, source, manualOverrides = {}, options = {}) {
  const lines = splitLines(text);
  const out = [...lines];
  const insertions = new Map();
  const emitters = collectEmitters(lines);
  const labels = emitterMap(emitters);
  const report = [];
  const processDisabled = options.processDisabled !== false;
  for (let index = 0; index < lines.length; index++) {
    const typeMatch = lines[index].match(graphTypeRe);
    if (!typeMatch) continue;
    let objectStart = index;
    while (objectStart < lines.length && !lines[objectStart].includes("\"variant_object\"")) objectStart++;
    if (objectStart >= lines.length) continue;
    const objectEnd = findBlockEnd(lines, objectStart);
    const block = lines.slice(objectStart, objectEnd).join("");
    const moduleName = block.match(/"name"\s+"([^"]+)"/)?.[1] || "<unnamed>";
    const moduleType = graphLabel(typeMatch[1]);
    const emitterInfo = labels.get(objectStart);
    const emitter = emitterInfo?.label || "<no label>";
    const omittedDisabled = Boolean(emitterInfo?.disabled && !processDisabled);
    const curves = collectColorCurves(lines, objectStart, objectEnd);
    curves.forEach(curve => {
      const rowId = `${objectStart}:${curve.name}`;
      const manualHue = manualOverrides[rowId];
      const original = [curve.channels[0][0].value, curve.channels[1][0].value, curve.channels[2][0].value];
      const hsv = rgbToHsv(original);
      const baseRow = { rowId, manual: false, emitter, emitterName: emitterInfo?.name || "", emitterStart: emitterInfo?.start ?? -1, disabled: Boolean(emitterInfo?.disabled), omittedDisabled, materialHints: emitterInfo?.materialHints || [], moduleName, moduleType, curveName: curve.name, original, hsv };
      if (omittedDisabled) {
        report.push({ ...baseRow, changed: false, target: null });
      } else if (manualHue !== undefined || selectedSource(original, source)) {
        const target = manualHue !== undefined ? remapToHue(original, manualHue, theme) : remap(original, source, theme);
        target.forEach((value, channel) => curve.channels[channel].forEach(item => setCollectedValue(out, insertions, item, value)));
        report.push({ ...baseRow, changed: true, manual: manualHue !== undefined, manualHue, target });
      } else {
        report.push({ ...baseRow, changed: false, target: null });
      }
    });
    if (curves.length) {
      index = objectEnd;
    }
  }
  const insertedLineCount = [...insertions.values()].reduce((sum, linesForIndex) => sum + linesForIndex.length, 0);
  return { text: joinWithInsertions(out, insertions), report, emitters, insertedLineCount };
}

function themeKey() {
  return els.target.value || "yellow";
}

function sourceKey() {
  return els.source.value || "cool";
}

function readPreferences() {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(preferencesKey) || "{}") || {};
  } catch {
    return {};
  }
}

function preferenceNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, min, max) : fallback;
}

function applyPreferences(preferences) {
  const target = preferences.target === "custom" || themes[preferences.target] ? preferences.target : "yellow";
  const source = sources[preferences.source] ? preferences.source : "cool";
  els.target.value = target;
  els.source.value = source;

  const defaults = themeDefaults(target);
  setTuningControls({
    ...defaults,
    targetHue: preferenceNumber(preferences.targetHue, defaults.targetHue, 0, 360),
    hueSpread: preferenceNumber(preferences.hueSpread, defaults.hueSpread, 0, 1.5),
    saturationScale: preferenceNumber(preferences.saturationScale, defaults.saturationScale, 0, 1.5),
    valueScale: preferenceNumber(preferences.valueScale, defaults.valueScale, 0, 1.5)
  });

  if (typeof preferences.processDisabled === "boolean") {
    els.processDisabled.checked = preferences.processDisabled;
  }
  if (typeof preferences.showOverviewName === "boolean") {
    els.showOverviewName.checked = preferences.showOverviewName;
  }
}

function currentColorSetup() {
  return {
    target: themeKey(),
    source: sourceKey(),
    targetHue: Number(els.customHue.value),
    hueSpread: Number(els.hueSpread.value) / 100,
    saturationScale: Number(els.satScale.value) / 100,
    valueScale: Number(els.valScale.value) / 100
  };
}

function savePreferences() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(preferencesKey, JSON.stringify({
      ...currentColorSetup(),
      processDisabled: els.processDisabled.checked,
      showOverviewName: els.showOverviewName.checked
    }));
  } catch {
    // localStorage can be disabled in strict browser modes; the tool still works without persistence.
  }
}

function readSavedColorSetup() {
  if (typeof localStorage === "undefined") return null;
  try {
    const setup = JSON.parse(localStorage.getItem(savedSetupKey) || "null");
    if (!setup || typeof setup !== "object") return null;
    if (!(setup.target === "custom" || themes[setup.target]) || !sources[setup.source]) return null;
    return setup;
  } catch {
    return null;
  }
}

function colorSetupSummary(setup) {
  const target = setup.target === "custom" ? "Custom" : themes[setup.target]?.label || "Unknown";
  const source = sources[setup.source]?.label || "Unknown";
  const hue = Math.round(mod(Number(setup.targetHue) || 0));
  const spread = Math.round(preferenceNumber(setup.hueSpread, .75, 0, 1.5) * 100);
  const saturation = Math.round(preferenceNumber(setup.saturationScale, 1, 0, 1.5) * 100);
  const brightness = Math.round(preferenceNumber(setup.valueScale, 1, 0, 1.5) * 100);
  return `${source} -> ${target}, H ${hue}, spread ${spread}%, sat ${saturation}%, bright ${brightness}%`;
}

function colorSetupSwatches(setup) {
  const source = sources[setup.source] || sources.cool;
  const defaults = themeDefaults(setup.target);
  const targetHue = preferenceNumber(setup.targetHue, defaults.targetHue, 0, 360);
  const sourceRampColor = rgbHex(hsvToRgb(source.centerHue, .78, .95));
  const sourceColor = setup.source === "all"
    ? "linear-gradient(135deg, #e24444, #e8c948, #45c768, #36b7d6, #7866df, #d752b8)"
    : sourceRampColor;
  const targetColor = rgbHex(hsvToRgb(targetHue, .78, .95));
  return { sourceColor, sourceRampColor, targetColor };
}

function paintSetupPalette(setup) {
  const empty = !setup;
  const swatches = empty
    ? { sourceColor: "#343840", targetColor: "#343840" }
    : colorSetupSwatches(setup);
  els.savedPaletteSource.style.background = swatches.sourceColor;
  els.savedPaletteSource.style.color = swatches.sourceColor;
  els.savedPaletteTarget.style.background = swatches.targetColor;
  els.savedPaletteTarget.style.color = swatches.targetColor;
  els.savedPaletteRamp.style.background = empty
    ? "linear-gradient(90deg, #343840, #343840)"
    : `linear-gradient(90deg, ${swatches.sourceRampColor}, ${swatches.targetColor})`;
}

function updateSavedSetupStatus() {
  const setup = readSavedColorSetup();
  if (!setup) {
    els.savedSetupStatus.textContent = "No saved setup yet.";
    els.applyColorSetup.disabled = true;
    paintSetupPalette(null);
    return;
  }
  els.savedSetupStatus.textContent = colorSetupSummary(setup);
  els.applyColorSetup.disabled = false;
  paintSetupPalette(setup);
}

function saveCurrentColorSetup() {
  if (typeof localStorage === "undefined") {
    els.status.textContent = "Saved setup is unavailable because localStorage is disabled.";
    return;
  }
  const setup = { ...currentColorSetup(), savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(savedSetupKey, JSON.stringify(setup));
    updateSavedSetupStatus();
    els.status.textContent = `Saved color setup: ${colorSetupSummary(setup)}.`;
  } catch {
    els.status.textContent = "Saved setup is unavailable because localStorage is blocked.";
  }
}

function applyColorSetupValues(setup) {
  applyPreferences(setup);
  paintVisuals();
}

function applySavedColorSetup() {
  const setup = readSavedColorSetup();
  if (!setup) {
    els.status.textContent = "No saved color setup yet.";
    return;
  }
  applyColorSetupValues(setup);
  if (state.text && state.report.length) {
    try {
      previewRecolor();
    } catch (error) {
      els.status.textContent = error.message;
      return;
    }
  }
  els.status.textContent = `Applied saved color setup: ${colorSetupSummary(setup)}.`;
}

function readFileHistory() {
  if (typeof localStorage === "undefined") return [];
  try {
    const entries = JSON.parse(localStorage.getItem(fileHistoryKey) || "[]");
    if (!Array.isArray(entries)) return [];
    return entries.filter(entry => entry?.fileName && entry?.setup && sources[entry.setup.source] && (entry.setup.target === "custom" || themes[entry.setup.target]));
  } catch {
    return [];
  }
}

function writeFileHistory(entries) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(fileHistoryKey, JSON.stringify(entries.slice(0, maxHistoryEntries)));
  } catch {
    // History is a convenience layer; recoloring still works if storage is blocked.
  }
}

function formatHistoryTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderFileHistory() {
  const entries = readFileHistory();
  els.fileHistoryCount.textContent = entries.length ? `${entries.length} file${entries.length === 1 ? "" : "s"}` : "No records";
  els.clearColorHistory.disabled = !entries.length;
  if (!entries.length) {
    els.fileHistoryList.innerHTML = `<p>No file color history yet.</p>`;
    return;
  }
  els.fileHistoryList.innerHTML = entries.map(entry => {
    const swatches = colorSetupSwatches(entry.setup);
    return `<article class="history-item">
      <div class="history-file">
        <strong title="${escapeHtml(entry.fileName)}">${escapeHtml(entry.fileName)}</strong>
        <span>${escapeHtml(formatHistoryTime(entry.updatedAt))}${entry.action ? ` / ${escapeHtml(entry.action)}` : ""}</span>
      </div>
      <div class="history-palette" aria-label="${escapeHtml(colorSetupSummary(entry.setup))}">
        <span class="history-dot" style="background:${swatches.sourceColor}; color:${swatches.sourceRampColor}"></span>
        <span class="history-ramp" style="background:linear-gradient(90deg, ${swatches.sourceRampColor}, ${swatches.targetColor})"></span>
        <span class="history-dot" style="background:${swatches.targetColor}; color:${swatches.targetColor}"></span>
      </div>
      <small>${escapeHtml(colorSetupSummary(entry.setup))}</small>
      <button type="button" data-apply-history="${escapeHtml(entry.id)}">Apply</button>
    </article>`;
  }).join("");
}

function recordFileHistory(assets, setup = currentColorSetup(), action = "Preview") {
  const fileAssets = (assets || []).filter(asset => asset?.name);
  if (!fileAssets.length) return;
  const timestamp = new Date().toISOString();
  const existing = readFileHistory();
  const byFileName = new Map(existing.map(entry => [entry.fileName, entry]));
  fileAssets.forEach(asset => {
    byFileName.set(asset.name, {
      id: `${asset.name}:${timestamp}`,
      fileName: asset.name,
      action,
      updatedAt: timestamp,
      setup: { ...setup }
    });
  });
  const updated = [...byFileName.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  writeFileHistory(updated);
  renderFileHistory();
}

function applyHistorySetup(id) {
  const entry = readFileHistory().find(item => item.id === id);
  if (!entry) {
    els.status.textContent = "That history entry is no longer available.";
    renderFileHistory();
    return;
  }
  applyColorSetupValues(entry.setup);
  if (state.text && state.report.length) {
    try {
      previewRecolor();
    } catch (error) {
      els.status.textContent = error.message;
      return;
    }
  }
  els.status.textContent = `Applied ${entry.fileName} history: ${colorSetupSummary(entry.setup)}.`;
}

function clearFileHistory() {
  writeFileHistory([]);
  renderFileHistory();
  els.status.textContent = "Cleared file color history.";
}

function themeDefaults(key = themeKey()) {
  return themes[key] || { label: "Custom", targetHue: 50, hueSpread: .75, saturationScale: .95, valueScale: 1.05 };
}

function setTuningControls(theme) {
  els.customHue.value = String(Math.round(mod(theme.targetHue)));
  els.customHueNumber.value = els.customHue.value;
  els.hueSpread.value = String(Math.round(theme.hueSpread * 100));
  els.satScale.value = String(Math.round(theme.saturationScale * 100));
  els.valScale.value = String(Math.round(theme.valueScale * 100));
  syncTuningLabels();
}

function syncTuningLabels() {
  els.customHueNumber.value = String(Math.round(mod(Number(els.customHue.value) || 0)));
  els.hueSpreadValue.textContent = `${els.hueSpread.value}%`;
  els.satScaleValue.textContent = `${els.satScale.value}%`;
  els.valScaleValue.textContent = `${els.valScale.value}%`;
}

function setHue(value) {
  const hue = Math.round(mod(Number(value) || 0));
  els.customHue.value = String(hue);
  els.customHueNumber.value = String(hue);
  paintVisuals();
}

function currentTheme() {
  const defaults = themeDefaults();
  return {
    label: defaults.label,
    targetHue: Number(els.customHue.value),
    hueSpread: Number(els.hueSpread.value) / 100,
    saturationScale: Number(els.satScale.value) / 100,
    valueScale: Number(els.valScale.value) / 100
  };
}

function outputNameFor(key = themeKey(), fileName = state.fileName) {
  const suffix = els.suffix.value.trim();
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : ".json";
  if (suffix) return `${stem}${suffix.startsWith("_") || suffix.startsWith("-") ? suffix : "_" + suffix}${ext}`;
  if (colorNameRe.test(stem)) {
    return stem.replace(colorNameRe, (match, prefix, color) => {
      const replacement = color.toUpperCase() === color ? key.toUpperCase() : color[0] === color[0].toUpperCase() ? key[0].toUpperCase() + key.slice(1) : key;
      return `${prefix}${replacement}`;
    }) + ext;
  }
  return `${stem}_${key}${ext}`;
}

function updateOutputName() {
  els.outputName.value = outputNameFor(themeKey() === "custom" ? "custom" : themeKey());
}

function paintVisuals() {
  syncTuningLabels();
  const theme = currentTheme();
  const source = sources[sourceKey()];
  const targetColors = [theme.targetHue - 10, theme.targetHue, theme.targetHue + 10].map((h, index) => rgbHex(hsvToRgb(h, [.65, .75, .9][index] * theme.saturationScale, [.34, .7, 1][index] * theme.valueScale)));
  const tuningSpread = 24 * theme.hueSpread;
  const tuningColors = [theme.targetHue - tuningSpread, theme.targetHue, theme.targetHue + tuningSpread].map((h, index) => rgbHex(hsvToRgb(h, [.72, .8, .9][index] * theme.saturationScale, [.58, .82, 1][index] * theme.valueScale)));
  const sourceColors = sourceKey() === "all"
    ? [0, 45, 90, 160, 220, 285, 330].map(h => rgbHex(hsvToRgb(h, .78, .95)))
    : [source.minHue, source.centerHue, source.maxHue].map((h, index) => rgbHex(hsvToRgb(h, [.65, .75, .9][index], [.4, .72, .98][index])));
  const targetSwatch = rgbHex(hsvToRgb(theme.targetHue, .78, .95));
  const sourceSwatch = rgbHex(hsvToRgb(source.centerHue, .78, .95));
  els.targetSwatch.style.background = targetSwatch;
  els.targetSelectDot.style.background = targetSwatch;
  els.targetSelectDot.style.color = targetSwatch;
  els.sourceSwatch.style.background = sourceSwatch;
  els.sourceSelectDot.style.background = sourceSwatch;
  els.sourceSelectDot.style.color = sourceSwatch;
  els.targetRamp.style.background = `linear-gradient(90deg, ${targetColors.join(", ")})`;
  els.sourceRamp.style.background = `linear-gradient(90deg, ${sourceColors.join(", ")})`;
  els.tuningPreviewDot.style.background = targetSwatch;
  els.tuningPreviewDot.style.color = targetSwatch;
  els.tuningPreviewLow.style.background = tuningColors[0];
  els.tuningPreviewMid.style.background = tuningColors[1];
  els.tuningPreviewHigh.style.background = tuningColors[2];
  els.tuningPreviewValue.textContent = `${Math.round(mod(theme.targetHue))} deg`;
  updateOutputName();
  savePreferences();
}

function overviewRows(report, emitters = state.emitters, processed = true) {
  const byEmitter = new Map();
  emitters.forEach(emitter => {
    byEmitter.set(emitter.start, {
      label: emitter.label,
      name: emitter.name,
      disabled: Boolean(emitter.disabled),
      materialHints: emitter.materialHints || [],
      colorTotal: 0,
      colorChanged: 0,
      emissiveTotal: 0,
      emissiveChanged: 0,
      total: 0,
      changed: 0,
      skipped: 0,
      omittedDisabled: 0
    });
  });
  report.forEach(row => {
    const key = row.emitterStart;
    if (!byEmitter.has(key)) {
      byEmitter.set(key, {
        label: row.emitter,
        name: row.emitterName || "",
        disabled: Boolean(row.disabled),
        materialHints: row.materialHints || [],
        colorTotal: 0,
        colorChanged: 0,
        emissiveTotal: 0,
        emissiveChanged: 0,
        total: 0,
        changed: 0,
        skipped: 0,
        omittedDisabled: 0
      });
    }
    const item = byEmitter.get(key);
    item.disabled = item.disabled || Boolean(row.disabled);
    if (!item.materialHints.length && row.materialHints?.length) item.materialHints = row.materialHints;
    const graphKey = row.moduleType === "Emissive Graph" ? "emissive" : "color";
    item[`${graphKey}Total`]++;
    item.total++;
    if (row.changed) {
      item[`${graphKey}Changed`]++;
      item.changed++;
    } else {
      item.skipped++;
      if (row.omittedDisabled) item.omittedDisabled++;
    }
  });
  return [...byEmitter.values()].map(row => {
    let status = "Waiting";
    if (processed) {
      if (!row.total) status = "No color modules";
      else if (row.disabled && row.omittedDisabled === row.total) status = "Omitted disabled";
      else if (row.changed === row.total) status = "Processed";
      else if (row.changed) status = "Partial";
      else status = "Unchanged";
    }
    return { ...row, status };
  });
}

function renderOverview(report = [], emitters = state.emitters, processed = false) {
  const rows = overviewRows(report, emitters, processed);
  if (!rows.length) {
    els.emitterRows.innerHTML = `<tr class="unprocessed"><td colspan="10">No emitters found yet.</td></tr>`;
    return;
  }
  els.emitterRows.innerHTML = rows.map(row => {
    const cls = processed && row.omittedDisabled && row.omittedDisabled === row.total ? "omitted" : processed && row.total && row.changed ? "changed" : processed && !row.changed ? "unprocessed" : "";
    return `<tr class="${cls}">
      <td class="optional-name">${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.label || "<no label>")}</td>
      <td>${disabledCell(row.disabled)}</td>
      <td>${materialHintCell(row.materialHints)}</td>
      <td>${row.colorChanged}/${row.colorTotal}</td>
      <td>${row.emissiveChanged}/${row.emissiveTotal}</td>
      <td>${row.total}</td>
      <td>${row.changed}</td>
      <td>${row.skipped}</td>
      <td>${row.status}</td>
    </tr>`;
  }).join("");
}

function syncOverviewNameColumn() {
  els.overviewTable.classList.toggle("show-name", els.showOverviewName.checked);
}

function manualHueCell(row) {
  if (row.omittedDisabled) return "Omitted";
  if (row.manual) {
    return `<div class="manual-active">
      <span>${fmt(row.manualHue)} deg</span>
      <button class="clear-manual" type="button" data-row-id="${escapeHtml(row.rowId)}">Clear</button>
    </div>`;
  }
  if (row.changed) return "Auto";
  const hue = Math.round(mod(Number(els.customHue.value) || currentTheme().targetHue));
  return `<div class="manual-hue">
    <input type="number" min="0" max="360" step="1" value="${hue}" data-row-id="${escapeHtml(row.rowId)}" aria-label="Manual hue for ${escapeHtml(row.moduleName)}">
    <button type="button" data-apply-manual="${escapeHtml(row.rowId)}">Apply</button>
  </div>`;
}

function disabledCell(disabled) {
  return disabled ? `<span class="tag warn">Disabled</span>` : `<span class="tag muted">Active</span>`;
}

function rowFlagsCell(row) {
  const flags = [];
  if (row.disabled) flags.push(`<span class="tag warn">Disabled</span>`);
  if (row.omittedDisabled) flags.push(`<span class="tag muted">Omitted</span>`);
  return flags.length ? `<span class="tag-list">${flags.join(" ")}</span>` : `<span class="tag muted">Active</span>`;
}

function uniqueHintColors(hints = []) {
  return [...new Set(hints.flatMap(hint => hint.colors || []))];
}

function materialHintTitle(hints = []) {
  return hints.map(hint => `${hint.material}: ${(hint.colors || []).join(", ")}`).join("; ");
}

function materialHintCell(hints = []) {
  const colors = uniqueHintColors(hints);
  if (!colors.length) return `<span class="tag muted">None</span>`;
  const title = escapeHtml(materialHintTitle(hints));
  return `<span class="tag-list" title="${title}">
    ${colors.map(color => `<span class="tag"><span class="mini-dot" style="background:${colorChip(color)}; color:${colorChip(color)}"></span>${escapeHtml(color)}</span>`).join("")}
  </span>`;
}

function renderReport(report, validation = state.validation) {
  els.rows.innerHTML = report.map(row => {
    const target = row.target || row.original;
    const cls = row.omittedDisabled ? "omitted" : row.changed ? "changed" : "skipped";
    const status = row.omittedDisabled ? "Omitted disabled" : row.manual ? "Manual" : row.changed ? "Changed" : "Skipped";
    const hsv = `H ${fmt(row.hsv.h)} / S ${fmt(row.hsv.s)} / V ${fmt(row.hsv.v)}`;
    return `<tr class="${cls}">
      <td data-label="Status">${status}</td>
      <td data-label="Module">${escapeHtml(row.moduleName)}</td>
      <td data-label="Emitter Name">${escapeHtml(row.emitterName || "")}</td>
      <td data-label="Emitter Label">${escapeHtml(row.emitter || "<no label>")}</td>
      <td data-label="Flags">${rowFlagsCell(row)}</td>
      <td data-label="Material Hints">${materialHintCell(row.materialHints)}</td>
      <td data-label="Type">${escapeHtml(row.moduleType)}</td>
      <td data-label="Curve">${escapeHtml(row.curveName)}</td>
      <td data-label="Original"><span class="color-cell"><span class="color-dot" style="background:${rgbHex(row.original)}; color:${rgbHex(row.original)}"></span>${row.original.map(fmt).join(", ")}</span></td>
      <td data-label="Target"><span class="color-cell"><span class="color-dot" style="background:${rgbHex(target)}; color:${rgbHex(target)}"></span>${row.changed ? target.map(fmt).join(", ") : "Unchanged"}</span></td>
      <td data-label="Manual Hue">${manualHueCell(row)}</td>
      <td data-label="HSV">${hsv}</td>
    </tr>`;
  }).join("");
  const changed = report.filter(row => row.changed).length;
  const emitterCount = state.emitters.length;
  const emissiveChanged = report.filter(row => row.changed && row.moduleType === "Emissive Graph").length;
  const emissiveTotal = report.filter(row => row.moduleType === "Emissive Graph").length;
  const disabledEmitters = state.emitters.filter(emitter => emitter.disabled).length;
  const omittedCurves = report.filter(row => row.omittedDisabled).length;
  const materialHintEmitters = state.emitters.filter(emitter => emitter.materialHints?.length).length;
  const integrity = validation ? ` ${validationSummary(validation)}` : "";
  const disabledText = els.processDisabled.checked ? `${disabledEmitters} disabled emitters processed` : `${omittedCurves} curves omitted from disabled emitters`;
  els.status.textContent = `${changed} changed / ${report.length} color curves detected across ${emitterCount} emitters (${emissiveChanged}/${emissiveTotal} emissive). ${disabledText}. ${materialHintEmitters} emitters with material color hints.${integrity}`;
}

function previewRecolor(key = themeKey()) {
  if (!state.text) throw new Error("Choose a VFX asset file first.");
  const theme = key === themeKey() || key === "custom" ? currentTheme() : themes[key];
  const result = recolorText(state.text, theme, sources[sourceKey()], state.manualOverrides, { processDisabled: els.processDisabled.checked });
  const validation = validateRecolorOutput(state.text, result);
  if (!validation.ok) {
    throw new Error(`Output validation failed: ${validation.errors.join(" ")}`);
  }
  result.validation = validation;
  state.outputText = result.text;
  state.report = result.report;
  state.emitters = result.emitters;
  state.validation = validation;
  renderOverview(result.report, result.emitters, true);
  renderReport(result.report, validation);
  recordFileHistory([{ name: state.fileName }], currentColorSetup(), "Preview");
  return result;
}

function applyManualOverride(rowId, value) {
  const hue = Number(value);
  if (!Number.isFinite(hue)) throw new Error("Enter a valid hue from 0 to 360.");
  state.manualOverrides[rowId] = Math.round(mod(hue));
  previewRecolor();
}

function clearManualOverride(rowId) {
  delete state.manualOverrides[rowId];
  previewRecolor();
}

function download(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsText(file);
  });
}

function queuedAssets() {
  return state.batchAssets.length ? state.batchAssets : state.text ? [{ name: state.fileName, text: state.text }] : [];
}

function updateBatchInfo(limitMessage = "") {
  const assets = queuedAssets();
  if (!assets.length) {
    els.batchInfo.innerHTML = `<span>No files queued.</span>`;
    return;
  }
  const fileItems = assets.map((asset, index) => `<li${index === 0 ? " class=\"active\"" : ""}>${escapeHtml(asset.name)}</li>`).join("");
  const exportNote = assets.length > 1
    ? "Export JSON downloads each queued file separately. Output Name is for single-file export; suffix applies to every file."
    : "Export JSON downloads the active file.";
  els.batchInfo.innerHTML = `<strong>${assets.length} / ${maxBatchFiles} file${assets.length === 1 ? "" : "s"} queued</strong>
    <span>Previewing ${escapeHtml(state.fileName)}.</span>
    <ul>${fileItems}</ul>
    <small>${escapeHtml(exportNote)}${limitMessage ? ` ${escapeHtml(limitMessage)}` : ""}</small>`;
}

function setAssetText(text, name, sourceLabel, batchAssets = null, limitMessage = "") {
  state.fileName = name;
  state.text = text;
  state.batchAssets = batchAssets || [{ name, text }];
  state.emitters = collectEmitters(splitLines(text));
  state.report = [];
  state.manualOverrides = {};
  state.validation = null;
  state.outputText = "";
  renderOverview([], state.emitters, false);
  els.rows.innerHTML = "";
  els.status.textContent = `${name} loaded ${sourceLabel} (${text.length.toLocaleString()} chars, ${state.emitters.length} emitters)`;
  updateBatchInfo(limitMessage);
  updateOutputName();
}

async function setAssetFiles(files) {
  const selected = Array.from(files || []);
  if (!selected.length) return;
  const picked = selected.slice(0, maxBatchFiles);
  const assets = await Promise.all(picked.map(async file => ({
    name: file.name,
    text: await readFileText(file)
  })));
  const skipped = selected.length - picked.length;
  const limitMessage = skipped > 0 ? `${skipped} extra file${skipped === 1 ? "" : "s"} ignored by the ${maxBatchFiles}-file limit.` : "";
  setAssetText(assets[0].text, assets[0].name, assets.length > 1 ? "as batch preview" : "locally", assets, limitMessage);
  if (assets.length > 1) {
    els.status.textContent += `. Batch export ready for ${assets.length} files separately${skipped > 0 ? `; ${limitMessage}` : ""}.`;
  }
}

function recolorAsset(asset, key, manualOverrides = {}) {
  const theme = key === themeKey() || key === "custom" ? currentTheme() : themes[key];
  const result = recolorText(asset.text, theme, sources[sourceKey()], manualOverrides, { processDisabled: els.processDisabled.checked });
  const validation = validateRecolorOutput(asset.text, result);
  if (!validation.ok) {
    throw new Error(`${asset.name}: output validation failed: ${validation.errors.join(" ")}`);
  }
  result.validation = validation;
  return result;
}

function prepareBatchExport(key = themeKey()) {
  const assets = queuedAssets();
  if (!assets.length) throw new Error("Choose one or more VFX asset files first.");
  return assets.map((asset, index) => {
    const manualOverrides = index === 0 ? state.manualOverrides : {};
    const result = recolorAsset(asset, key, manualOverrides);
    const name = assets.length === 1
      ? els.outputName.value.trim() || outputNameFor(key, asset.name)
      : outputNameFor(key, asset.name);
    return { asset, result, name };
  });
}

function batchSummary(results) {
  const changed = results.reduce((sum, item) => sum + item.result.report.filter(row => row.changed).length, 0);
  const curves = results.reduce((sum, item) => sum + item.result.report.length, 0);
  return `${changed} changed / ${curves} color curves across ${results.length} file${results.length === 1 ? "" : "s"}`;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Clipboard copy was blocked by the browser.");
}

function reportText(key, report) {
  const overview = overviewRows(report, state.emitters, true);
  const emissiveChanged = report.filter(row => row.changed && row.moduleType === "Emissive Graph").length;
  const emissiveTotal = report.filter(row => row.moduleType === "Emissive Graph").length;
  const processDisabled = els.processDisabled.checked ? "Yes" : "No";
  return [`Theme: ${key}`, `Source: ${sources[sourceKey()].label}`, `Changed curves: ${report.filter(row => row.changed).length}`, "",
    `Process disabled emitters: ${processDisabled}`,
    `Emissive curves changed: ${emissiveChanged}/${emissiveTotal}`,
    "",
    "Emitter overview:",
    ...overview.map(row => `${row.status.toUpperCase()} ${row.label} / ${row.name}: ${row.changed} changed, ${row.skipped} skipped, ${row.total} curves, disabled ${row.disabled ? "yes" : "no"}, material hints ${materialHintTitle(row.materialHints) || "none"}, Color Graph ${row.colorChanged}/${row.colorTotal}, Emissive Graph ${row.emissiveChanged}/${row.emissiveTotal}`),
    "",
    "Color and emissive curves:",
  ...report.map(row => {
    const rowState = row.omittedDisabled ? "OMITTED DISABLED" : row.changed ? "CHANGED" : "SKIPPED";
    const hints = materialHintTitle(row.materialHints);
    const base = `${rowState} ${row.emitter} / ${row.moduleName} / ${row.moduleType} / ${row.curveName}: RGB (${row.original.map(fmt).join(", ")})${hints ? `, material hints ${hints}` : ""}`;
    return row.changed ? `${base} -> (${row.target.map(fmt).join(", ")})` : base;
  })].join("\n");
}

function init() {
  els.target.innerHTML = Object.entries(themes).map(([key, theme]) => `<option value="${key}">${theme.label}</option>`).join("") + `<option value="custom">Custom...</option>`;
  els.source.innerHTML = Object.entries(sources).map(([key, source]) => `<option value="${key}">${source.label}</option>`).join("");
  applyPreferences(readPreferences());
  renderOverview();
  updateBatchInfo();
  updateSavedSetupStatus();
  renderFileHistory();
  els.file.addEventListener("change", async () => {
    try {
      await setAssetFiles(els.file.files);
    } catch (error) {
      els.status.textContent = error.message;
    }
  });

  els.usePasted.addEventListener("click", () => {
    const pasted = els.pasteContent.value;
    if (!pasted.trim()) {
      els.status.textContent = "Paste VFX asset text first.";
      return;
    }
    const name = els.pasteName.value.trim() || "pasted_vfx_asset.json";
    const fileName = /\.[^./\\]+$/.test(name) ? name : `${name}.json`;
    setAssetText(pasted, fileName, "from pasted text");
  });

  els.target.addEventListener("change", () => {
    setTuningControls(themeDefaults(themeKey()));
    paintVisuals();
  });
  els.source.addEventListener("input", paintVisuals);
  els.source.addEventListener("change", paintVisuals);
  els.saveColorSetup.addEventListener("click", saveCurrentColorSetup);
  els.applyColorSetup.addEventListener("click", applySavedColorSetup);
  els.fileHistoryList.addEventListener("click", event => {
    const button = event.target.closest("[data-apply-history]");
    if (button) applyHistorySetup(button.dataset.applyHistory);
  });
  els.clearColorHistory.addEventListener("click", clearFileHistory);
  els.showOverviewName.addEventListener("change", () => {
    syncOverviewNameColumn();
    savePreferences();
  });
  els.processDisabled.addEventListener("change", () => {
    savePreferences();
    if (!state.text || !state.report.length) return;
    try {
      previewRecolor();
    } catch (error) {
      els.status.textContent = error.message;
    }
  });
  [els.suffix, els.customHue, els.hueSpread, els.satScale, els.valScale].forEach(el => {
    el.addEventListener("input", paintVisuals);
    el.addEventListener("change", paintVisuals);
  });
  els.customHueNumber.addEventListener("input", () => setHue(els.customHueNumber.value));
  els.resetThemeTuning.addEventListener("click", () => {
    setTuningControls(themeDefaults(themeKey()));
    paintVisuals();
  });
  document.querySelectorAll("[data-hue-step]").forEach(button => {
    button.addEventListener("click", () => setHue(Number(els.customHue.value) + Number(button.dataset.hueStep)));
  });
  els.preview.addEventListener("click", () => {
    try {
      previewRecolor();
    } catch (error) {
      els.status.textContent = error.message;
    }
  });
  els.rows.addEventListener("click", event => {
    const applyButton = event.target.closest("[data-apply-manual]");
    const clearButton = event.target.closest(".clear-manual");
    try {
      if (applyButton) {
        const control = applyButton.closest(".manual-hue");
        const input = control?.querySelector("input");
        applyManualOverride(applyButton.dataset.applyManual, input?.value);
      } else if (clearButton) {
        clearManualOverride(clearButton.dataset.rowId);
      }
    } catch (error) {
      els.status.textContent = error.message;
    }
  });
  els.rows.addEventListener("keydown", event => {
    if (event.key !== "Enter" || !event.target.matches(".manual-hue input")) return;
    try {
      applyManualOverride(event.target.dataset.rowId, event.target.value);
    } catch (error) {
      els.status.textContent = error.message;
    }
  });
  els.exportJson.addEventListener("click", () => {
    try {
      const key = themeKey();
      const assets = queuedAssets();
      const results = prepareBatchExport(key);
      if (assets.length === 1) {
        const item = results[0];
        state.outputText = item.result.text;
        state.report = item.result.report;
        state.emitters = item.result.emitters;
        state.validation = item.result.validation;
        renderOverview(item.result.report, item.result.emitters, true);
        renderReport(item.result.report, item.result.validation);
        recordFileHistory([item.asset], currentColorSetup(), "Export");
        download(item.name, item.result.text);
        els.status.textContent = `Exported ${item.name}. ${validationSummary(item.result.validation)}`;
        return;
      }
      const first = results[0];
      state.outputText = first.result.text;
      state.report = first.result.report;
      state.emitters = first.result.emitters;
      state.validation = first.result.validation;
      renderOverview(first.result.report, first.result.emitters, true);
      renderReport(first.result.report, first.result.validation);
      recordFileHistory(results.map(item => item.asset), currentColorSetup(), "Batch export");
      results.forEach(item => download(item.name, item.result.text));
      els.status.textContent = `Exported ${results.length} files separately. ${batchSummary(results)}. Manual hue overrides apply only to the preview file.`;
    } catch (error) {
      els.status.textContent = error.message;
    }
  });
  els.copyOutput.addEventListener("click", async () => {
    try {
      const key = themeKey();
      const result = previewRecolor(key);
      await copyText(result.text);
      recordFileHistory([{ name: state.fileName }], currentColorSetup(), "Copy");
      els.status.textContent = `Copied ${els.outputName.value.trim() || outputNameFor(key)} to clipboard. ${validationSummary(result.validation)}`;
    } catch (error) {
      els.status.textContent = error.message;
    }
  });
  els.exportAll.addEventListener("click", () => {
    try {
      const assets = queuedAssets();
      if (!assets.length) throw new Error("Choose one or more VFX asset files first.");
      const exports = [];
      Object.keys(themes).forEach(key => {
        prepareBatchExport(key).forEach(item => {
          exports.push({ ...item, preset: key, name: assets.length === 1 ? outputNameFor(key, item.asset.name) : outputNameFor(key, item.asset.name) });
        });
      });
      exports.forEach(item => download(item.name, item.result.text));
      els.status.textContent = `Exported ${exports.length} preset file${exports.length === 1 ? "" : "s"} separately from ${assets.length} source file${assets.length === 1 ? "" : "s"}.`;
    } catch (error) {
      els.status.textContent = error.message;
    }
  });
  els.report.addEventListener("click", () => {
    if (!state.report.length) {
      try {
        previewRecolor();
      } catch (error) {
        els.status.textContent = error.message;
        return;
      }
    }
    download(outputNameFor(themeKey()).replace(/\.[^.]+$/, "_report.txt"), reportText(themeKey(), state.report), "text/plain");
  });
  syncOverviewNameColumn();
  paintVisuals();
}

init();
