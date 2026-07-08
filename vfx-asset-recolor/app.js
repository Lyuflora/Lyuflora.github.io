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
const valueRe = /^(\s*"valueY"\s+")(-?\d+(?:\.\d+)?)(".*)$/;
const graphTypeRe = /"variant_type"\s+"Types_ParticleModule(ColorGraph|EmissiveGraph)"/;

const state = {
  text: "",
  fileName: "vfx_asset.json",
  emitters: [],
  report: [],
  validation: null,
  outputText: ""
};

const els = {
  file: document.querySelector("#assetFile"),
  pasteName: document.querySelector("#pasteName"),
  pasteContent: document.querySelector("#pasteContent"),
  usePasted: document.querySelector("#usePastedContent"),
  target: document.querySelector("#targetColor"),
  source: document.querySelector("#sourceColor"),
  targetSwatch: document.querySelector("#targetSwatch"),
  targetRamp: document.querySelector("#targetRamp"),
  sourceSwatch: document.querySelector("#sourceSwatch"),
  sourceRamp: document.querySelector("#sourceRamp"),
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
  resetThemeTuning: document.querySelector("#resetThemeTuning"),
  preview: document.querySelector("#previewChanges"),
  exportJson: document.querySelector("#exportJson"),
  copyOutput: document.querySelector("#copyOutput"),
  exportAll: document.querySelector("#exportAll"),
  report: document.querySelector("#downloadReport"),
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
      emitters.push({ index: emitters.length, start: emitterStart, end: emitterEnd, label, name });
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

function recolorText(text, theme, source) {
  const lines = splitLines(text);
  const out = [...lines];
  const insertions = new Map();
  const emitters = collectEmitters(lines);
  const labels = emitterMap(emitters);
  const report = [];
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
    const curves = collectColorCurves(lines, objectStart, objectEnd);
    curves.forEach(curve => {
      const original = [curve.channels[0][0].value, curve.channels[1][0].value, curve.channels[2][0].value];
      const hsv = rgbToHsv(original);
      if (selectedSource(original, source)) {
        const target = remap(original, source, theme);
        target.forEach((value, channel) => curve.channels[channel].forEach(item => setCollectedValue(out, insertions, item, value)));
        report.push({ changed: true, emitter, emitterName: emitterInfo?.name || "", emitterStart: emitterInfo?.start ?? -1, moduleName, moduleType, curveName: curve.name, original, target, hsv });
      } else {
        report.push({ changed: false, emitter, emitterName: emitterInfo?.name || "", emitterStart: emitterInfo?.start ?? -1, moduleName, moduleType, curveName: curve.name, original, target: null, hsv });
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

function outputNameFor(key = themeKey()) {
  const suffix = els.suffix.value.trim();
  const dot = state.fileName.lastIndexOf(".");
  const stem = dot > 0 ? state.fileName.slice(0, dot) : state.fileName;
  const ext = dot > 0 ? state.fileName.slice(dot) : ".json";
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
  const sourceColors = sourceKey() === "all"
    ? [0, 45, 90, 160, 220, 285, 330].map(h => rgbHex(hsvToRgb(h, .78, .95)))
    : [source.minHue, source.centerHue, source.maxHue].map((h, index) => rgbHex(hsvToRgb(h, [.65, .75, .9][index], [.4, .72, .98][index])));
  els.targetSwatch.style.background = rgbHex(hsvToRgb(theme.targetHue, .78, .95));
  els.sourceSwatch.style.background = rgbHex(hsvToRgb(source.centerHue, .78, .95));
  els.targetRamp.style.background = `linear-gradient(90deg, ${targetColors.join(", ")})`;
  els.sourceRamp.style.background = `linear-gradient(90deg, ${sourceColors.join(", ")})`;
  updateOutputName();
}

function overviewRows(report, emitters = state.emitters, processed = true) {
  const byEmitter = new Map();
  emitters.forEach(emitter => {
    byEmitter.set(emitter.start, {
      label: emitter.label,
      name: emitter.name,
      colorTotal: 0,
      colorChanged: 0,
      emissiveTotal: 0,
      emissiveChanged: 0,
      total: 0,
      changed: 0,
      skipped: 0
    });
  });
  report.forEach(row => {
    const key = row.emitterStart;
    if (!byEmitter.has(key)) {
      byEmitter.set(key, {
        label: row.emitter,
        name: row.emitterName || "",
        colorTotal: 0,
        colorChanged: 0,
        emissiveTotal: 0,
        emissiveChanged: 0,
        total: 0,
        changed: 0,
        skipped: 0
      });
    }
    const item = byEmitter.get(key);
    const graphKey = row.moduleType === "Emissive Graph" ? "emissive" : "color";
    item[`${graphKey}Total`]++;
    item.total++;
    if (row.changed) {
      item[`${graphKey}Changed`]++;
      item.changed++;
    } else {
      item.skipped++;
    }
  });
  return [...byEmitter.values()].map(row => {
    let status = "Waiting";
    if (processed) {
      if (!row.total) status = "No color modules";
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
    els.emitterRows.innerHTML = `<tr class="unprocessed"><td colspan="8">No emitters found yet.</td></tr>`;
    return;
  }
  els.emitterRows.innerHTML = rows.map(row => {
    const cls = processed && row.total && row.changed ? "changed" : processed && !row.changed ? "unprocessed" : "";
    return `<tr class="${cls}">
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.label || "<no label>")}</td>
      <td>${row.colorChanged}/${row.colorTotal}</td>
      <td>${row.emissiveChanged}/${row.emissiveTotal}</td>
      <td>${row.total}</td>
      <td>${row.changed}</td>
      <td>${row.skipped}</td>
      <td>${row.status}</td>
    </tr>`;
  }).join("");
}

function renderReport(report, validation = state.validation) {
  els.rows.innerHTML = report.map(row => {
    const target = row.target || row.original;
    const cls = row.changed ? "changed" : "skipped";
    const status = row.changed ? "Changed" : "Skipped";
    const hsv = `H ${fmt(row.hsv.h)} / S ${fmt(row.hsv.s)} / V ${fmt(row.hsv.v)}`;
    return `<tr class="${cls}">
      <td>${status}</td>
      <td>${escapeHtml(row.moduleName)}</td>
      <td>${escapeHtml(row.emitterName || "")}</td>
      <td>${escapeHtml(row.emitter || "<no label>")}</td>
      <td>${escapeHtml(row.moduleType)}</td>
      <td>${escapeHtml(row.curveName)}</td>
      <td><span class="color-cell"><span class="color-dot" style="background:${rgbHex(row.original)}; color:${rgbHex(row.original)}"></span>${row.original.map(fmt).join(", ")}</span></td>
      <td><span class="color-cell"><span class="color-dot" style="background:${rgbHex(target)}; color:${rgbHex(target)}"></span>${row.changed ? target.map(fmt).join(", ") : "Unchanged"}</span></td>
      <td>${hsv}</td>
    </tr>`;
  }).join("");
  const changed = report.filter(row => row.changed).length;
  const emitterCount = state.emitters.length;
  const emissiveChanged = report.filter(row => row.changed && row.moduleType === "Emissive Graph").length;
  const emissiveTotal = report.filter(row => row.moduleType === "Emissive Graph").length;
  const integrity = validation ? ` ${validationSummary(validation)}` : "";
  els.status.textContent = `${changed} changed / ${report.length} color curves detected across ${emitterCount} emitters (${emissiveChanged}/${emissiveTotal} emissive).${integrity}`;
}

function previewRecolor(key = themeKey()) {
  if (!state.text) throw new Error("Choose a VFX asset file first.");
  const theme = key === themeKey() || key === "custom" ? currentTheme() : themes[key];
  const result = recolorText(state.text, theme, sources[sourceKey()]);
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
  return result;
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

function setAssetText(text, name, sourceLabel) {
  state.fileName = name;
  state.text = text;
  state.emitters = collectEmitters(splitLines(text));
  state.report = [];
  state.validation = null;
  state.outputText = "";
  renderOverview([], state.emitters, false);
  els.rows.innerHTML = "";
  els.status.textContent = `${name} loaded ${sourceLabel} (${text.length.toLocaleString()} chars, ${state.emitters.length} emitters)`;
  updateOutputName();
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
  return [`Theme: ${key}`, `Source: ${sources[sourceKey()].label}`, `Changed curves: ${report.filter(row => row.changed).length}`, "",
    `Emissive curves changed: ${emissiveChanged}/${emissiveTotal}`,
    "",
    "Emitter overview:",
    ...overview.map(row => `${row.status.toUpperCase()} ${row.label} / ${row.name}: ${row.changed} changed, ${row.skipped} skipped, ${row.total} curves, Color Graph ${row.colorChanged}/${row.colorTotal}, Emissive Graph ${row.emissiveChanged}/${row.emissiveTotal}`),
    "",
    "Color and emissive curves:",
    ...report.map(row => {
    const base = `${row.changed ? "CHANGED" : "SKIPPED"} ${row.emitter} / ${row.moduleName} / ${row.moduleType} / ${row.curveName}: RGB (${row.original.map(fmt).join(", ")})`;
    return row.changed ? `${base} -> (${row.target.map(fmt).join(", ")})` : base;
  })].join("\n");
}

function init() {
  els.target.innerHTML = Object.entries(themes).map(([key, theme]) => `<option value="${key}">${theme.label}</option>`).join("") + `<option value="custom">Custom...</option>`;
  els.source.innerHTML = Object.entries(sources).map(([key, source]) => `<option value="${key}">${source.label}</option>`).join("");
  els.source.value = "cool";
  setTuningControls(themeDefaults("yellow"));
  renderOverview();
  els.file.addEventListener("change", () => {
    const file = els.file.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAssetText(String(reader.result || ""), file.name, "locally");
    };
    reader.readAsText(file);
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
  els.exportJson.addEventListener("click", () => {
    try {
      const key = themeKey();
      const result = previewRecolor(key);
      download(els.outputName.value.trim() || outputNameFor(key), result.text);
      els.status.textContent = `Exported ${els.outputName.value.trim() || outputNameFor(key)}. ${validationSummary(result.validation)}`;
    } catch (error) {
      els.status.textContent = error.message;
    }
  });
  els.copyOutput.addEventListener("click", async () => {
    try {
      const key = themeKey();
      const result = previewRecolor(key);
      await copyText(result.text);
      els.status.textContent = `Copied ${els.outputName.value.trim() || outputNameFor(key)} to clipboard. ${validationSummary(result.validation)}`;
    } catch (error) {
      els.status.textContent = error.message;
    }
  });
  els.exportAll.addEventListener("click", () => {
    try {
      Object.keys(themes).forEach(key => {
        const result = previewRecolor(key);
        download(outputNameFor(key), result.text);
      });
      els.status.textContent = `Exported all presets. ${validationSummary(state.validation)}`;
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
  paintVisuals();
}

init();
