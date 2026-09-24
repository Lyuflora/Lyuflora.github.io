import {LibraryDB as DB} from "./db.js";
import {DriveService, userFacingError} from "./drive.js";

const $ = function(selector, root) { return (root || document).querySelector(selector); };
const $$ = function(selector, root) { return Array.from((root || document).querySelectorAll(selector)); };
const GAMEPLAY_FUNCTIONS = {
  "Weapon": ["Muzzle", "Projectile", "Impact", "Tracer"],
  "Feedback": ["Hit", "Armor Break", "Critical", "Damage", "Pickup", "Interaction"],
  "Ability": ["Cast", "Charge", "Travel", "Impact", "Persistent"],
  "Objective": ["Activation", "Progress", "Completion", "Failure"],
  "World": ["Hazard", "Destruction", "Interaction"]
};
const RHYTHM_GROUPS = {
  "Impulse": ["Hard Hit", "Soft Hit", "Hit + Echo", "Double Hit"],
  "Build": ["Linear Build", "Accelerating Build", "Staircase Build", "Build → Burst"],
  "Pulse": ["Regular Pulse", "Breathing", "Irregular Pulse", "Escalating Pulse"],
  "Sequence": ["Multi-hit", "Cascade", "Alternating", "Chain Reaction"],
  "Transition": ["Appear", "Dissolve", "Materialize", "Collapse", "Transform"]
};
const TAXONOMY = {
  phenomenon: ["Fire", "Smoke", "Dust", "Water", "Electricity", "Sparks", "Debris", "Blood", "Energy", "Light", "Fog", "Wind", "Other"],
  style: ["Realistic", "Stylized", "Magical", "Supernatural", "Sci-fi", "Graphic"],
  motion: ["Explosive", "Snappy", "Heavy", "Floaty", "Viscous", "Turbulent", "Chaotic", "Smooth", "Mechanical", "Organic"],
  context: ["Bright Exterior", "Dark Interior", "Night", "Foggy", "High Visual Noise", "Low Visual Noise"]
};
const BUILTIN_PATTERNS = [
  {id:"builtin-single-impact",name:"Single Impact",rhythmFamily:"Impulse · Hard Hit",description:"A tight, high-contrast hit with a fast rise and clean recovery.",uses:["Hit","Armor Break","Critical"],curve:[[0,0.04],[0.16,0.18],[0.28,1],[0.43,0.34],[0.7,0.08],[1,0.02]]},
  {id:"builtin-impact-echo",name:"Impact + Echo",rhythmFamily:"Impulse · Hit + Echo",description:"A dominant first hit followed by a smaller, spaced rebound.",uses:["Armor Break","Critical","Impact","Interaction Feedback"],curve:[[0,0.04],[0.15,0.22],[0.31,1],[0.45,0.32],[0.64,0.09],[0.76,0.46],[0.9,0.19],[1,0.03]]},
  {id:"builtin-build-burst",name:"Build → Burst",rhythmFamily:"Build · Build → Burst",description:"A rising anticipation that resolves into a brief, high-energy event.",uses:["Charge","Objective Completion","Ability Cast"],curve:[[0,0.04],[0.26,0.16],[0.49,0.34],[0.72,0.62],[0.84,1],[0.94,0.26],[1,0.04]]},
  {id:"builtin-regular-pulse",name:"Regular Pulse",rhythmFamily:"Pulse · Regular Pulse",description:"Evenly spaced beats that make sustained states easy to read.",uses:["Hazard","Progress","Persistent Ability"],curve:[[0,0.08],[0.12,0.78],[0.24,0.12],[0.38,0.78],[0.5,0.12],[0.64,0.78],[0.76,0.12],[0.9,0.78],[1,0.08]]}
];
const DEFAULT_SMART = [
  {id:"smart-punchy",name:"Punchy gameplay feedback",kind:"smart",description:"Quick, readable feedback with a compact duration.",rules:[{field:"category",operator:"equals",value:"Gameplay"},{field:"gameplayFunction",operator:"contains",value:"Feedback"},{field:"attackType",operator:"equals",value:"Fast"},{field:"duration",operator:"lessThan",value:1}]},
  {id:"smart-buildup",name:"Good build-up references",kind:"smart",description:"Late peaks with a strong artist rating.",rules:[{field:"climaxPosition",operator:"greaterThan",value:60},{field:"rating",operator:"greaterThanOrEqual",value:4}]},
  {id:"smart-realistic-environment",name:"Realistic environment",kind:"smart",description:"Atmospheric references with a grounded rendering style.",rules:[{field:"category",operator:"equals",value:"Environment"},{field:"renderingStyle",operator:"equals",value:"Realistic"}]}
];
const PALETTES = [
  "radial-gradient(ellipse at 51% 70%,#d07f5e 0,#563e50 23%,#20202a 72%)",
  "radial-gradient(ellipse at 50% 67%,#779c94 0,#354a4d 27%,#1d2027 72%)",
  "radial-gradient(ellipse at 52% 68%,#9281cf 0,#403b62 26%,#1d1d27 73%)",
  "radial-gradient(ellipse at 49% 68%,#cbab6c 0,#59483f 26%,#1d1e25 72%)",
  "radial-gradient(ellipse at 50% 68%,#bf738c 0,#553849 24%,#1b1d24 73%)",
  "radial-gradient(ellipse at 50% 68%,#6f91bd 0,#35425b 25%,#1d1e27 72%)"
];
let references = [];
let patterns = [];
let collections = [];
let thumbUrls = new Map();
let thumbnailLoading = new Set();
let thumbnailObserver;
let currentPage = "library";
let currentFilter = "all";
let currentCollectionId = "";
let currentSmartId = "";
let currentDetailId = "";
let selectedRefs = new Set();
let pendingFiles = [];
let pickedDriveFiles = [];
let importMode = "file";
let currentFilters = {};
let currentQuery = "";
let viewMode = "grid";
let visibleLimit = 48;
let currentRating = 0;
let metadataSyncTimer;
let inFlightSync = false;

function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function(char) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char];
  });
}
function escapeAttr(value) { return escapeHTML(value); }
function safeLink(value) {
  try { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") ? url.href : ""; }
  catch (_) { return ""; }
}
function humanBytes(size) {
  if (!size) return "0 KB";
  if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + " KB";
  return (size / (1024 * 1024)).toFixed(1) + " MB";
}
function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return "Duration n/a";
  const value = Number(seconds);
  return value < 1 ? value.toFixed(2) + " sec" : (value < 10 ? value.toFixed(1) : Math.round(value)) + " sec";
}
function sourceLabel(ref) {
  if (ref.sourceType) return ref.sourceType;
  if (ref.driveFileId) return "Google Drive";
  try {
    const host = new URL(ref.sourceUrl).hostname.replace(/^www\./, "");
    if (host.includes("youtube")) return "YouTube";
    if (host.includes("artstation")) return "ArtStation";
    if (host.includes("vimeo")) return "Vimeo";
    return host;
  } catch (_) { return "Reference"; }
}
function colorFor(ref) {
  const value = String(ref.id || ref.title || "1");
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(hash) % PALETTES.length];
}
function iconFor(ref) {
  const list = ref.phenomena || [];
  const first = list[0] || "";
  const icons = {Fire:"✦",Smoke:"◌",Dust:"✳",Water:"◒",Electricity:"⌁",Sparks:"✧",Debris:"✣",Blood:"◉",Energy:"✦",Light:"☼",Fog:"◌",Wind:"≈",Other:"✦"};
  if (icons[first]) return icons[first];
  if ((ref.category || "") === "Environment") return "◌";
  if ((ref.gameplayFunction || "").includes("Weapon")) return "✦";
  return "✧";
}
function curveFor(item) {
  if (Array.isArray(item && item.rhythmCurve) && item.rhythmCurve.length >= 2) {
    return item.rhythmCurve.map(function(point) {
      if (Array.isArray(point)) return {t:Number(point[0]),v:Number(point[1]),ease:"smooth"};
      return {t:Number(point.t),v:Number(point.v),ease:point.ease || "smooth",tag:point.tag || ""};
    }).filter(function(point) { return Number.isFinite(point.t) && Number.isFinite(point.v); }).sort(function(a,b) { return a.t-b.t; });
  }
  if (Array.isArray(item && item.curve)) return item.curve.map(function(point) { return {t:point[0],v:point[1],ease:"smooth"}; });
  const peak = Math.max(0.15, Math.min(0.9, (Number(item && item.climaxPosition) || 40) / 100));
  return [{t:0,v:0.04},{t:Math.max(0.06,peak-0.14),v:0.2},{t:peak,v:0.95},{t:Math.min(0.98,peak+0.12),v:0.25},{t:1,v:0.03}];
}
function hasCurve(item) {
  return !!(item && ((Array.isArray(item.rhythmCurve) && item.rhythmCurve.length >= 2) || (Array.isArray(item.curve) && item.curve.length >= 2)));
}
function curveValue(points, t) {
  if (!points.length) return 0;
  if (t <= points[0].t) return points[0].v;
  if (t >= points[points.length-1].t) return points[points.length-1].v;
  let i = 0;
  while (i < points.length - 2 && points[i+1].t < t) i++;
  const a = points[i], b = points[i+1], u = (t-a.t) / Math.max(0.0001,b.t-a.t);
  let k = u;
  if (a.ease === "ease-in") k = u*u;
  else if (a.ease === "ease-out") k = 1-(1-u)*(1-u);
  else if (a.ease === "hold") k = 0;
  else k = u*u*(3-2*u);
  return a.v + (b.v-a.v)*k;
}
function signatureSVG(item, color) {
  if (!hasCurve(item)) {
    return '<svg class="signature-svg signature-empty" viewBox="0 0 104 28" role="img" aria-label="Rhythm has not been analyzed"><path d="M2 24 L102 24" fill="none" stroke="#686b76" stroke-width="1.5" stroke-dasharray="3 4" stroke-linecap="round"></path></svg>';
  }
  const points = curveFor(item), coords = [];
  for (let i = 0; i <= 52; i++) {
    const t = i/52, x = 2 + 100*t, y = 24 - curveValue(points,t)*20;
    coords.push((i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1));
  }
  const path = coords.join(" ");
  const stroke = color || "#b9adff";
  return '<svg class="signature-svg" viewBox="0 0 104 28" role="img" aria-label="Normalized rhythm signature"><path d="' + path + ' L 102 26 L 2 26 Z" fill="' + stroke + '" opacity=".12"></path><path d="' + path + '" fill="none" stroke="' + stroke + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
}
function toast(message, kind) {
  const node = document.createElement("div");
  node.className = "toast " + (kind || "info");
  node.textContent = message;
  $("#toastRegion").appendChild(node);
  setTimeout(function() { node.remove(); }, 4300);
}
function showMessage(title, body, eyebrow) {
  $("#messageTitle").textContent = title;
  $("#messageBody").textContent = body;
  $("#messageEyebrow").textContent = eyebrow || "NOTICE";
  $("#messageDialog").showModal();
}
function closeDialogs() { $$("dialog[open]").forEach(function(dialog) { dialog.close(); }); }
function fillOptions(select, values, prompt) {
  if (!select) return;
  const old = select.value;
  select.innerHTML = '<option value="">' + escapeHTML(prompt || "Unclassified") + '</option>' + values.map(function(value) {
    return '<option value="' + escapeAttr(value) + '">' + escapeHTML(value) + '</option>';
  }).join("");
  if (values.includes(old)) select.value = old;
}
function allRhythms() {
  const values = [];
  Object.keys(RHYTHM_GROUPS).forEach(function(group) { RHYTHM_GROUPS[group].forEach(function(name) { values.push(group + " · " + name); }); });
  return values;
}
function allFunctions() {
  const values = [];
  Object.keys(GAMEPLAY_FUNCTIONS).forEach(function(group) { GAMEPLAY_FUNCTIONS[group].forEach(function(name) { values.push(group + " / " + name); }); });
  return values;
}
function functionGroup(value) { return String(value || "").split(" / ")[0]; }
function initTaxonomy() {
  fillOptions($("#editFunction"), allFunctions(), "Choose function");
  fillOptions($("#editRhythmFamily"), allRhythms(), "Unclassified");
  fillOptions($("#filterFunction"), allFunctions(), "Any function");
  fillOptions($("#filterRhythm"), allRhythms(), "Any rhythm");
  fillOptions($("#filterPhenomenon"), TAXONOMY.phenomenon, "Any phenomenon");
  fillOptions($("#filterStyle"), TAXONOMY.style, "Any style");
  fillOptions($("#filterMotion"), TAXONOMY.motion, "Any motion");
  fillOptions($("#editStyle"), TAXONOMY.style, "Unclassified");
  fillOptions($("#editMotion"), TAXONOMY.motion, "Unclassified");
  fillOptions($("#editContext"), TAXONOMY.context, "Unclassified");
  $("#editPhenomena").innerHTML = TAXONOMY.phenomenon.map(function(value) { return '<option value="' + escapeAttr(value) + '">' + escapeHTML(value) + '</option>'; }).join("");
  fillOptions($("#patternFamilyInput"), allRhythms(), "Choose family");
  $("#smartFieldInput").addEventListener("change", updateSmartValueInput);
  updateSmartValueInput();
}
function collectionName(id) {
  const found = collections.find(function(item) { return item.id === id; });
  return found ? found.name : "";
}
function mediaPoster(ref, large) {
  const imageUrl = thumbUrls.get(ref.id);
  const className = large ? "poster-card detail-poster" : "poster-card";
  const image = imageUrl ? '<img class="poster-image" src="' + escapeAttr(imageUrl) + '" alt="" loading="lazy">' : "";
  return '<div class="' + className + '"><div class="poster-backdrop" style="--poster-bg:' + colorFor(ref) + '"></div>' + image + '<span class="poster-symbol" aria-hidden="true">' + escapeHTML(iconFor(ref)) + '</span><span class="poster-caption">' + escapeHTML(ref.category || "VFX REFERENCE") + '</span></div>';
}
function addThumbnailUrl(refId, blob) {
  if (!blob) return;
  if (thumbUrls.has(refId)) URL.revokeObjectURL(thumbUrls.get(refId));
  thumbUrls.set(refId, URL.createObjectURL(blob));
}
async function loadThumbnailUrls() {
  for (const ref of references) {
    if (thumbUrls.has(ref.id)) continue;
    try {
      const record = await DB.getThumbnail(ref.id);
      if (record && record.blob) addThumbnailUrl(ref.id, record.blob);
    } catch (_) {}
  }
}
function attachPosterImage(refId, url) {
  const cards = $$('[data-ref-card="' + CSS.escape(refId) + '"]');
  cards.forEach(function(card) {
    const poster = $(".poster-card",card);
    if (!poster || $(".poster-image",poster)) return;
    const image = document.createElement("img");
    image.className = "poster-image";
    image.loading = "lazy";
    image.alt = "";
    image.src = url;
    const symbol = $(".poster-symbol",poster);
    poster.insertBefore(image,symbol || null);
  });
  if (currentPage === "detail" && currentDetailId === refId) {
    const poster = $(".detail-poster",$("#page-detail"));
    if (poster && !$(".poster-image",poster)) {
      const image = document.createElement("img");
      image.className = "poster-image";
      image.alt = "";
      image.src = url;
      const symbol = $(".poster-symbol",poster);
      poster.insertBefore(image,symbol || null);
    }
  }
}
function observeDriveThumbnails() {
  if (thumbnailObserver) thumbnailObserver.disconnect();
  if (!DriveService.connected || !("IntersectionObserver" in window)) return;
  thumbnailObserver = new IntersectionObserver(function(entries) {
    entries.forEach(async function(entry) {
      if (!entry.isIntersecting) return;
      const id = entry.target.getAttribute("data-ref-card");
      const ref = references.find(function(item) { return item.id === id; });
      if (!ref || !ref.driveThumbnailId || thumbnailLoading.has(id) || thumbUrls.has(id)) {
        thumbnailObserver.unobserve(entry.target);
        return;
      }
      thumbnailLoading.add(id);
      thumbnailObserver.unobserve(entry.target);
      try {
        const blob = await DriveService.downloadMedia(ref.driveThumbnailId);
        if (!blob.type.startsWith("image/") || blob.size > 5*1024*1024) return;
        await DB.saveThumbnail(ref.id,blob);
        addThumbnailUrl(ref.id,blob);
        attachPosterImage(ref.id,thumbUrls.get(ref.id));
      } catch (_) {
      } finally {
        thumbnailLoading.delete(id);
      }
    });
  },{rootMargin:"320px 0px",threshold:0.01});
  $$(".reference-card[data-ref-card]").forEach(function(card) {
    const ref = references.find(function(item) { return item.id === card.getAttribute("data-ref-card"); });
    if (ref && ref.driveThumbnailId && !thumbUrls.has(ref.id)) thumbnailObserver.observe(card);
  });
}
async function reloadData() {
  references = await DB.getReferences();
  patterns = await DB.getPatterns();
  collections = await DB.getCollections();
  await loadThumbnailUrls();
}
function buildReferenceCard(ref) {
  const isSelected = selectedRefs.has(ref.id);
  const tags = (ref.tags || []).filter(Boolean).slice(0,2).map(function(tag) { return '<span class="mini-tag">' + escapeHTML(tag) + '</span>'; }).join("");
  const title = escapeHTML(ref.title || "Untitled reference");
  const family = escapeHTML(ref.rhythmFamily || "Rhythm unclassified");
  const selectedClass = isSelected ? " selected" : "";
  return '<article class="reference-card' + selectedClass + '" data-ref-card="' + escapeAttr(ref.id) + '">' +
    '<input type="checkbox" class="compare-select" data-compare-ref="' + escapeAttr(ref.id) + '" aria-label="Select ' + title + ' for rhythm comparison" ' + (isSelected ? "checked" : "") + '>' +
    '<button class="favorite-toggle' + (ref.favorite ? " is-favorite" : "") + '" data-favorite-ref="' + escapeAttr(ref.id) + '" aria-label="' + (ref.favorite ? "Remove from favorites" : "Add to favorites") + '">' + (ref.favorite ? "★" : "☆") + '</button>' +
    '<div class="card-poster" data-open-ref="' + escapeAttr(ref.id) + '">' + mediaPoster(ref, false) + '<div class="poster-hover"><button class="poster-action" data-preview-ref="' + escapeAttr(ref.id) + '">Preview</button><button class="poster-action" data-edit-ref="' + escapeAttr(ref.id) + '">Edit details</button></div></div>' +
    '<div class="card-body"><div class="card-title-row"><h3 class="card-title" data-open-ref="' + escapeAttr(ref.id) + '">' + title + '</h3><span class="card-rating" aria-label="' + Number(ref.rating || 0) + ' out of 5 stars">' + (ref.rating ? "★".repeat(Math.min(5,Number(ref.rating))) : "") + '</span></div>' +
    '<div class="card-game">' + escapeHTML(ref.game || (ref.sourceUrl ? sourceLabel(ref) : "Game or project not set")) + '</div>' +
    '<div class="card-signature-row">' + signatureSVG(ref) + '<span class="signature-caption">' + (hasCurve(ref) ? family : "Not analyzed") + '</span></div>' +
    '<div class="card-meta-row"><span class="card-category"><span class="category-dot ' + escapeAttr((ref.category || "").toLowerCase()) + '"></span>' + escapeHTML(ref.category || "Unclassified") + '</span><span class="card-duration">' + escapeHTML(formatDuration(ref.duration)) + '</span></div>' +
    (tags ? '<div class="card-tags">' + tags + '</div>' : "") +
    '<div class="card-footer"><span class="source-dot">' + escapeHTML(sourceLabel(ref)) + '</span><span>' + (ref.sourceMissing ? "ORIGINAL MISSING" : ref.driveFileId ? "DRIVE" : "LOCAL METADATA") + '</span></div></div></article>';
}
function matchesRule(ref, rule) {
  let actual = ref[rule.field];
  const expected = rule.value;
  if (Array.isArray(actual)) actual = actual.join(" ");
  if (rule.operator === "contains") return String(actual || "").toLowerCase().includes(String(expected || "").toLowerCase());
  if (rule.operator === "lessThan") return actual != null && actual !== "" && Number(actual) < Number(expected);
  if (rule.operator === "greaterThan") return actual != null && actual !== "" && Number(actual) > Number(expected);
  if (rule.operator === "greaterThanOrEqual") return actual != null && actual !== "" && Number(actual) >= Number(expected);
  return String(actual || "").toLowerCase() === String(expected || "").toLowerCase();
}
function refMatches(ref) {
  if (currentFilter === "favorites" && !ref.favorite) return false;
  if (currentFilter === "recent") {
    const date = new Date(ref.createdAt || ref.updatedAt || 0).getTime();
    if (Date.now() - date > 30*24*60*60*1000) return false;
  }
  if (currentFilter.startsWith("category:") && ref.category !== currentFilter.split(":")[1]) return false;
  if (currentFilter === "collection" && !(ref.collectionIds || []).includes(currentCollectionId)) return false;
  if (currentFilter === "smart") {
    const smart = DEFAULT_SMART.concat(collections.filter(function(item) { return item.kind === "smart"; })).find(function(item) { return item.id === currentSmartId; });
    if (smart && !(smart.rules || []).every(function(rule) { return matchesRule(ref, rule); })) return false;
  }
  if (currentQuery) {
    const text = String(ref.searchText || [ref.title,ref.game,ref.studio,ref.category,ref.gameplayFunction,ref.functionGroup,ref.rhythmFamily,ref.renderingStyle,ref.motionCharacter,ref.sourceType,ref.sourceUrl,ref.notes,ref.whyItWorks,ref.principleToReuse,ref.whatToAvoid].concat(ref.tags || [],ref.phenomena || []).join(" ").toLowerCase());
    if (!text.includes(currentQuery.toLowerCase())) return false;
  }
  const f = currentFilters;
  if (f.category && ref.category !== f.category) return false;
  if (f.gameplayFunction && ref.gameplayFunction !== f.gameplayFunction) return false;
  if (f.rhythmFamily && ref.rhythmFamily !== f.rhythmFamily) return false;
  if (f.attackType && ref.attackType !== f.attackType) return false;
  if (f.decayType && ref.decayType !== f.decayType) return false;
  if (f.duration && !(ref.duration != null && Number(ref.duration) < Number(f.duration))) return false;
  if (f.climaxPosition && !(ref.climaxPosition != null && Number(ref.climaxPosition) > Number(f.climaxPosition))) return false;
  if (f.peakCount && !(Number(ref.peakCount || 0) >= Number(f.peakCount))) return false;
  if (f.phenomenon && !(ref.phenomena || []).includes(f.phenomenon)) return false;
  if (f.renderingStyle && ref.renderingStyle !== f.renderingStyle) return false;
  if (f.motionCharacter && ref.motionCharacter !== f.motionCharacter) return false;
  if (f.cameraDistance && ref.cameraDistance !== f.cameraDistance) return false;
  if (f.rating && Number(ref.rating || 0) < Number(f.rating)) return false;
  return true;
}
function getSortedReferences() {
  let items = references.filter(refMatches);
  if ($("#sortSelect").value === "title") items.sort(function(a,b) { return String(a.title).localeCompare(String(b.title)); });
  else if ($("#sortSelect").value === "rating") items.sort(function(a,b) { return Number(b.rating || 0)-Number(a.rating || 0); });
  else if ($("#sortSelect").value === "duration") items.sort(function(a,b) { return Number(a.duration || 99999)-Number(b.duration || 99999); });
  else items.sort(function(a,b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
  return items;
}
function currentScopeTitle() {
  if (currentFilter === "favorites") return "FAVORITES";
  if (currentFilter === "recent") return "RECENTLY ADDED";
  if (currentFilter === "collection") return (collectionName(currentCollectionId) || "COLLECTION").toUpperCase();
  if (currentFilter === "smart") {
    const smart = DEFAULT_SMART.concat(collections.filter(function(item) { return item.kind === "smart"; })).find(function(item) { return item.id === currentSmartId; });
    return (smart ? smart.name : "SMART COLLECTION").toUpperCase();
  }
  if (currentFilter.startsWith("category:")) return currentFilter.split(":")[1].toUpperCase();
  return "ALL REFERENCES";
}
function renderLibrary() {
  const grid = $("#referenceGrid");
  grid.classList.toggle("compact", viewMode === "compact");
  const items = getSortedReferences();
  $("#resultCount").textContent = items.length + (items.length === 1 ? " reference" : " references");
  $("#scopeLabel").textContent = currentScopeTitle();
  $("#pageTitle").textContent = items.length ? currentScopeTitle().toLowerCase().replace(/\b\w/g, function(c) { return c.toUpperCase(); }) : "A library for how effects feel.";
  $("#pageSubtitle").textContent = items.length ? "Search and compare references by behavior, function, and rhythm." : "Find VFX by behavior, function, and rhythm — then study the timing behind the image.";
  grid.innerHTML = items.slice(0,visibleLimit).map(buildReferenceCard).join("");
  $("#loadMoreWrap").hidden = items.length <= visibleLimit;
  if (items.length > visibleLimit) $("#loadMoreButton").textContent = "Show more references · " + Math.min(48,items.length-visibleLimit) + " of " + items.length;
  $("#emptyState").hidden = references.length > 0 || currentQuery !== "" || Object.keys(currentFilters).length > 0;
  if (!items.length && (references.length || currentQuery || Object.keys(currentFilters).length)) {
    grid.innerHTML = '<div class="no-matches"><span>⌕</span><strong>No references match this view.</strong><p>Try removing a filter or using a broader search.</p><button class="text-button" id="clearSearchFromEmpty">Clear search and filters</button></div>';
  }
  $("#allCount").textContent = references.length;
  $("#favoriteCount").textContent = references.filter(function(ref) { return ref.favorite; }).length;
  $("#patternCount").textContent = patterns.length + BUILTIN_PATTERNS.length;
  renderFilterChips();
  updateCompareButton();
  observeDriveThumbnails();
}
function renderCollectionNav() {
  const manual = collections.filter(function(item) { return item.kind !== "smart"; });
  $("#collectionNav").innerHTML = manual.map(function(collection) {
    return '<button class="nav-item collection-nav-item" data-filter="collection" data-collection-id="' + escapeAttr(collection.id) + '"><span class="nav-icon">◦</span><span>' + escapeHTML(collection.name) + '</span><span class="nav-count">' + references.filter(function(ref) { return (ref.collectionIds || []).includes(collection.id); }).length + '</span></button>';
  }).join("");
}
function renderFilterChips() {
  const chips = [];
  const names = {category:"Category",gameplayFunction:"Function",rhythmFamily:"Rhythm",attackType:"Attack",decayType:"Decay",duration:"Duration <",climaxPosition:"Climax >",peakCount:"Peaks ≥",phenomenon:"Phenomenon",renderingStyle:"Style",motionCharacter:"Motion",cameraDistance:"Camera",rating:"Rating ≥"};
  Object.keys(currentFilters).forEach(function(key) {
    let value = currentFilters[key];
    if (key === "duration") value = value + " sec";
    if (key === "climaxPosition") value = value + "%";
    if (key === "rating") value = value + " stars";
    chips.push('<span class="filter-chip">' + escapeHTML(names[key] || key) + ': ' + escapeHTML(value) + '<button data-remove-filter="' + escapeAttr(key) + '" aria-label="Remove filter">×</button></span>');
  });
  if (currentQuery) chips.push('<span class="filter-chip">Search: ' + escapeHTML(currentQuery) + '<button data-clear-query aria-label="Clear search">×</button></span>');
  $("#filterChips").innerHTML = chips.join("");
  const count = Object.keys(currentFilters).length;
  $("#filterCount").textContent = count;
  $("#filterCount").hidden = count === 0;
}
function renderPatternCard(pattern, builtin) {
  const count = references.filter(function(ref) { return (ref.patternIds || []).includes(pattern.id); }).length;
  const curve = pattern.rhythmCurve || (pattern.curve || []).map(function(point) { return {t:point[0],v:point[1]}; });
  return '<article class="pattern-card" data-open-pattern="' + escapeAttr(pattern.id) + '">' +
    '<div class="pattern-card-top"><div><h3>' + escapeHTML(pattern.name) + '</h3><div class="pattern-family">' + escapeHTML(pattern.rhythmFamily || "Unclassified family") + '</div></div><span class="pattern-ref-count">' + count + (count === 1 ? " reference" : " references") + '</span></div>' +
    '<div class="pattern-curve">' + signatureSVG({rhythmCurve:curve}, "#b9adff") + '</div>' +
    '<div class="pattern-use-label">COMMON USES</div><div class="pattern-uses">' + escapeHTML((pattern.uses || []).join(" · ") || "Add typical use cases") + '</div>' +
    '<p class="pattern-description">' + escapeHTML(pattern.description || "Reusable timing principle") + '</p>' +
    (builtin ? '<div class="card-footer"><span class="source-dot">STARTER PATTERN</span><span>BUILT IN</span></div>' : "") + '</article>';
}
function renderPatterns() {
  const list = BUILTIN_PATTERNS.concat(patterns);
  $("#patternGrid").innerHTML = list.map(function(pattern) { return renderPatternCard(pattern, String(pattern.id).startsWith("builtin-")); }).join("");
  $("#patternEmpty").hidden = list.length > 0;
}
function renderSmartCollections() {
  const all = DEFAULT_SMART.concat(collections.filter(function(item) { return item.kind === "smart"; }));
  $("#smartGrid").innerHTML = all.map(function(smart) {
    const count = references.filter(function(ref) { return (smart.rules || []).every(function(rule) { return matchesRule(ref, rule); }); }).length;
    return '<article class="smart-card" data-open-smart="' + escapeAttr(smart.id) + '"><div class="pattern-card-top"><div><h3>' + escapeHTML(smart.name) + '</h3><p class="pattern-description">' + escapeHTML(smart.description || "Saved rules") + '</p></div><span class="pattern-ref-count">' + count + ' matches</span></div><div class="rule-list">' + (smart.rules || []).map(function(rule) { return '<div class="rule-line"><span>' + escapeHTML(rule.field.replace(/([A-Z])/g," $1")) + '</span><b>' + escapeHTML(rule.operator.replace(/([A-Z])/g," $1")) + ' ' + escapeHTML(rule.value) + '</b></div>'; }).join("") + '</div><div class="smart-footer"><span>UPDATES AS YOUR LIBRARY GROWS</span><span>' + count + ' REFERENCES</span></div></article>';
  }).join("");
}
function setActiveNav() {
  $$(".nav-item").forEach(function(button) {
    let active = false;
    if (currentPage === "patterns") active = button.dataset.route === "patterns";
    else if (currentPage === "smart") active = button.dataset.route === "smart";
    else if (currentPage === "library") {
      const sameLibrary = !button.dataset.route || button.dataset.route === "library" || (currentFilter === "smart" && button.dataset.route === "smart");
      const matchesFilter = button.dataset.filter === currentFilter && (currentFilter !== "collection" || button.dataset.collectionId === currentCollectionId);
      active = sameLibrary && matchesFilter;
    }
    button.classList.toggle("active", active);
  });
}
function showPage(page) {
  currentPage = page;
  ["library","patterns","detail","compare","smart"].forEach(function(name) { $("#page-" + name).hidden = name !== page; });
  setActiveNav();
  if (page === "library") renderLibrary();
  if (page === "patterns") renderPatterns();
  if (page === "smart") renderSmartCollections();
  $("#sidebar").classList.remove("open");
  window.scrollTo({top:0,behavior:"smooth"});
}
function navigateFilter(filter, collectionId) {
  currentFilter = filter || "all";
  currentCollectionId = collectionId || "";
  currentSmartId = "";
  visibleLimit = 48;
  showPage("library");
}
function updateCompareButton() {
  $("#selectionCount").textContent = selectedRefs.size;
  $("#compareButton").disabled = selectedRefs.size < 2;
  $("#compareButton").classList.toggle("active", selectedRefs.size >= 2);
  document.body.classList.toggle("compare-mode", selectedRefs.size > 0);
}
function drawTimeline(ref) {
  if (!hasCurve(ref)) {
    return '<svg class="detail-timeline" viewBox="0 0 600 100" role="img" aria-label="Rhythm has not been analyzed"><line x1="14" y1="20" x2="586" y2="20" stroke="#343640"/><line x1="14" y1="53" x2="586" y2="53" stroke="#343640"/><line x1="14" y1="87" x2="586" y2="87" stroke="#343640"/><path d="M14 86 L586 86" fill="none" stroke="#686b76" stroke-width="1.5" stroke-dasharray="4 6"/><text x="14" y="99" fill="#777985" font-size="8">0%</text><text x="570" y="99" fill="#777985" font-size="8">100%</text><text x="300" y="56" text-anchor="middle" fill="#747783" font-size="10">Analyze rhythm to save a normalized timing curve</text></svg>';
  }
  const points = curveFor(ref), path = [];
  for (let i = 0; i <= 100; i++) {
    const t = i / 100, x = 14 + t * 572, y = 87 - curveValue(points,t) * 67;
    path.push((i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1));
  }
  return '<svg class="detail-timeline" viewBox="0 0 600 100" role="img" aria-label="Normalized rhythm curve">' +
    '<line x1="14" y1="20" x2="586" y2="20" stroke="#343640"/><line x1="14" y1="53" x2="586" y2="53" stroke="#343640"/><line x1="14" y1="87" x2="586" y2="87" stroke="#343640"/>' +
    '<path d="' + path.join(" ") + ' L 586 87 L 14 87 Z" fill="#b9adff" opacity=".09"></path><path d="' + path.join(" ") + '" fill="none" stroke="#b9adff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path><text x="14" y="99" fill="#777985" font-size="8">0%</text><text x="570" y="99" fill="#777985" font-size="8">100%</text></svg>';
}
function detailFacts(ref) {
  const facts = [
    ["Game / project",ref.game],["Studio",ref.studio],["Category",ref.category],["Gameplay function",ref.gameplayFunction],
    ["Rhythm family",ref.rhythmFamily],["Duration",ref.duration == null ? "" : formatDuration(ref.duration)],["Attack",ref.attackType],["Decay",ref.decayType],
    ["Climax position",ref.climaxPosition == null ? "" : ref.climaxPosition + "%"],["Peak count",ref.peakCount],["Spacing",ref.spacingType],
    ["Camera distance",ref.cameraDistance],["Gameplay importance",ref.gameplayImportance],["Visual priority",ref.visualPriority],
    ["Rendering style",ref.renderingStyle],["Motion character",ref.motionCharacter],["Source type",ref.sourceType || "Not set"],
    ["Capture date",ref.captureDate],["Source timestamp",ref.sourceTimestamp]
  ].filter(function(item) { return item[1] != null && item[1] !== ""; });
  const tags = (ref.tags || []).concat(ref.phenomena || []).filter(Boolean);
  return '<div class="detail-facts">' + facts.map(function(item) {
    return '<div><div class="detail-fact-label">' + escapeHTML(item[0]) + '</div><div class="detail-fact-value">' + escapeHTML(item[1]) + '</div></div>';
  }).join("") + '</div>' + (tags.length ? '<div class="detail-tags">' + tags.map(function(tag) { return '<span class="mini-tag">' + escapeHTML(tag) + '</span>'; }).join("") + '</div>' : "");
}
function noteBlock(label, value) {
  if (!value) return "";
  return '<div class="detail-note-block"><span>' + escapeHTML(label) + '</span><p>' + escapeHTML(value) + '</p></div>';
}
function renderDetail(ref) {
  if (!ref) { showPage("library"); toast("That reference is no longer in the local library.", "error"); return; }
  currentDetailId = ref.id;
  const media = mediaPoster(ref, true);
  const mediaBlock = '<div class="detail-media-wrap"><div class="detail-media" id="detailMedia">' + media + '</div><div class="detail-media-meta"><span>' + escapeHTML(ref.sourceMissing ? "Original file not available in Drive" : ref.driveFileId ? "Original media stays in Google Drive" : ref.sourceUrl ? "Source link saved" : "Reference metadata saved locally") + '</span>' + (safeLink(ref.sourceUrl) ? '<a href="' + escapeAttr(safeLink(ref.sourceUrl)) + '" target="_blank" rel="noopener noreferrer">Open source ↗</a>' : "") + '</div></div>';
  const patternLinks = (ref.patternIds || []).map(function(id) { const pattern = getPatternById(id); return pattern ? '<span class="collection-pill">' + escapeHTML(pattern.name) + '</span>' : ""; }).join("");
  const collectionLinks = (ref.collectionIds || []).map(function(id) { const collection = collections.find(function(item) { return item.id === id; }); return collection ? '<span class="collection-pill">' + escapeHTML(collection.name) + '</span>' : ""; }).join("");
  const notes = [noteBlock("Why it works",ref.whyItWorks),noteBlock("Principle to reuse",ref.principleToReuse),noteBlock("What to avoid",ref.whatToAvoid),noteBlock("General notes",ref.notes)].filter(Boolean).join("") || '<div class="detail-empty-note">No notes yet. Capture what makes this effect useful in your own work.</div>';
  $("#page-detail").innerHTML =
    '<a href="#" class="detail-back" id="detailBack">← Back to library</a>' +
    '<div class="detail-heading"><div><div class="eyebrow">' + escapeHTML(ref.category || "VFX REFERENCE") + ' <span class="eyebrow-line"></span> ' + escapeHTML(sourceLabel(ref).toUpperCase()) + '</div><h1>' + escapeHTML(ref.title || "Untitled reference") + '</h1><p>' + escapeHTML([ref.game,ref.studio].filter(Boolean).join(" · ") || "Add a game or project when it helps you find this again.") + '</p></div>' +
    '<div class="detail-actions"><button class="button" id="favoriteDetailButton">' + (ref.favorite ? "★ Favorited" : "☆ Favorite") + '</button><button class="button" id="addPatternDetailButton">＋ Add to pattern</button><button class="button" id="editDetailButton">Edit metadata</button><button class="button primary" id="analyzeDetailButton">Analyze rhythm ↗</button></div></div>' +
    '<div class="detail-layout"><div>' + mediaBlock +
    '<div class="detail-panel"><div class="detail-panel-heading"><h2>Timing map</h2><button id="analyzeFromTimeline">Open analyzer ↗</button></div><div class="rhythm-summary">' + signatureSVG(ref) + '<span class="rhythm-summary-text">' + escapeHTML(ref.rhythmFamily || "Unclassified rhythm family") + '</span></div>' + drawTimeline(ref) +
    '<div class="rhythm-stats"><div class="rhythm-stat"><span>Attack</span><b>' + escapeHTML(ref.attackType || "Not classified") + '</b></div><div class="rhythm-stat"><span>Peak</span><b>' + escapeHTML(ref.climaxPosition == null ? "Not set" : ref.climaxPosition + "%") + '</b></div><div class="rhythm-stat"><span>Peaks</span><b>' + escapeHTML(ref.peakCount == null ? "Not set" : ref.peakCount) + '</b></div></div></div>' +
    '<div class="detail-panel"><div class="detail-panel-heading"><h2>Notes</h2><button id="editNotesButton">Add notes ↗</button></div><div class="detail-notes">' + notes + '</div></div></div>' +
    '<div><div class="detail-panel"><div class="detail-panel-heading"><h2>Reference details</h2><button id="editMetadataButton">Edit ↗</button></div>' + detailFacts(ref) + '</div>' +
    '<div class="detail-panel"><div class="detail-panel-heading"><h2>Patterns</h2><button id="addPatternDetailButton2">＋ Link pattern</button></div><div class="detail-collections">' + (patternLinks || '<span class="detail-empty-note">No pattern linked yet.</span>') + '</div></div>' +
    '<div class="detail-panel"><div class="detail-panel-heading"><h2>Collections</h2><button id="editCollectionsButton">Edit ↗</button></div><div class="detail-collections">' + (collectionLinks || '<span class="detail-empty-note">No collection yet.</span>') + '</div></div></div></div>';
  showPage("detail");
  $("#detailBack").addEventListener("click", function(event) { event.preventDefault(); showPage("library"); });
  $("#favoriteDetailButton").addEventListener("click", function() { toggleFavorite(ref.id); });
  $("#editDetailButton").addEventListener("click", function() { openEdit(ref); });
  $("#editMetadataButton").addEventListener("click", function() { openEdit(ref); });
  $("#editNotesButton").addEventListener("click", function() { openEdit(ref, true); });
  $("#editCollectionsButton").addEventListener("click", function() { openEdit(ref, false, true); });
  $("#analyzeDetailButton").addEventListener("click", function() { openAnalyzer(ref); });
  $("#analyzeFromTimeline").addEventListener("click", function() { openAnalyzer(ref); });
  $("#addPatternDetailButton").addEventListener("click", function() { openPatternDialog(ref); });
  $("#addPatternDetailButton2").addEventListener("click", function() { openPatternDialog(ref); });
  const mediaButton = document.createElement("button");
  mediaButton.className = "button media-preview-button";
  mediaButton.textContent = ref.driveFileId ? "Load original media" : "Preview source";
  mediaButton.id = "mediaPreviewButton";
  $("#detailMedia").appendChild(mediaButton);
  mediaButton.addEventListener("click", function() { previewOriginal(ref); });
}
function openAnalyzer(ref) {
  const target = ref ? "analyzer.html?reference=" + encodeURIComponent(ref.id) : "analyzer.html";
  window.location.href = target;
}
async function renderCompare() {
  const items = Array.from(selectedRefs).map(function(id) { return references.find(function(ref) { return ref.id === id; }); }).filter(Boolean);
  $("#page-compare").innerHTML = '<div class="compare-head"><div><div class="eyebrow">NORMALIZED TO 0–100% OF DURATION</div><h1>Compare rhythm.</h1><p>Compare the timing shape independently from each clip length.</p></div><button class="button" id="backFromCompare">← Back to library</button></div>' +
    '<div class="comparison-table"><div class="comparison-row header"><span>REFERENCE</span><span>INTENSITY CURVE</span><span>DURATION</span><span>ATTACK</span><span>PEAK</span></div>' +
    items.map(function(ref) { return '<div class="comparison-row"><span class="comparison-name">' + escapeHTML(ref.title) + '<small>' + escapeHTML(ref.game || ref.category || "VFX reference") + '</small></span><span>' + signatureSVG(ref, "#c1b6fa") + '</span><span class="comparison-value">' + escapeHTML(formatDuration(ref.duration)) + '</span><span class="comparison-value">' + escapeHTML(ref.attackType || "—") + '</span><span class="comparison-value">' + escapeHTML(ref.climaxPosition == null ? "—" : ref.climaxPosition + "%") + '</span></div>'; }).join("") + '</div>';
  showPage("compare");
  $("#backFromCompare").addEventListener("click", function() { showPage("library"); });
}
async function toggleFavorite(id) {
  const ref = references.find(function(item) { return item.id === id; });
  if (!ref) return;
  ref.favorite = !ref.favorite;
  ref.updatedAt = new Date().toISOString();
  await DB.saveReference(ref);
  await reloadData();
  if (currentPage === "detail") renderDetail(references.find(function(item) { return item.id === id; }));
  else renderLibrary();
  scheduleMetadataSync();
}

function getPatternById(id) {
  return patterns.find(function(item) { return item.id === id; }) || BUILTIN_PATTERNS.find(function(item) { return item.id === id; });
}
function updateEditChoice(container, items, selectedIds) {
  container.innerHTML = items.map(function(item) {
    const selected = selectedIds.includes(item.id) ? " selected" : "";
    return '<button type="button" class="pattern-choice' + selected + '" data-choice-id="' + escapeAttr(item.id) + '">' + escapeHTML(item.name) + '</button>';
  }).join("") || '<span class="quiet-note">Create a collection first.</span>';
}
function fillRating(value) {
  currentRating = Number(value || 0);
  $("#editRating").innerHTML = [1,2,3,4,5].map(function(number) {
    return '<button type="button" data-rating="' + number + '" class="' + (number <= currentRating ? "selected" : "") + '" aria-label="' + number + ' stars">★</button>';
  }).join("");
}
function openEdit(ref, openNotes, openCollection) {
  if (!ref) return;
  $("#editReferenceId").value = ref.id;
  $("#editDialogTitle").textContent = ref.title || "Edit reference";
  $("#editTitle").value = ref.title || "";
  $("#editGame").value = ref.game || "";
  $("#editCategory").value = ref.category || "Gameplay";
  $("#editFunction").value = ref.gameplayFunction || "";
  $("#editRhythmFamily").value = ref.rhythmFamily || "";
  $("#editDuration").value = ref.duration == null ? "" : ref.duration;
  $("#editAttack").value = ref.attackType || "";
  $("#editDecay").value = ref.decayType || "";
  $("#editClimax").value = ref.climaxPosition == null ? "" : ref.climaxPosition;
  $("#editPeaks").value = ref.peakCount == null ? "" : ref.peakCount;
  $("#editSpacing").value = ref.spacingType || "";
  $("#editPhenomena").querySelectorAll("option").forEach(function(option) { option.selected = (ref.phenomena || []).includes(option.value); });
  $("#editStyle").value = ref.renderingStyle || "";
  $("#editMotion").value = ref.motionCharacter || "";
  $("#editTags").value = (ref.tags || []).join(", ");
  $("#editCamera").value = ref.cameraDistance || "";
  $("#editImportance").value = ref.gameplayImportance || "";
  $("#editPriority").value = ref.visualPriority || "";
  $("#editContext").value = ref.environmentContext || "";
  $("#editLoop").value = ref.loopType || "";
  $("#editDensity").value = ref.ambientDensity || "";
  $("#editScale").value = ref.spatialScale || "";
  $("#editRole").value = ref.environmentalRole || "";
  $("#editWhy").value = ref.whyItWorks || "";
  $("#editPrinciple").value = ref.principleToReuse || "";
  $("#editAvoid").value = ref.whatToAvoid || "";
  $("#editNotes").value = ref.notes || "";
  $("#editStudio").value = ref.studio || "";
  $("#editSourceType").value = ref.sourceType || "";
  $("#editSourceUrl").value = ref.sourceUrl || "";
  $("#editTimestamp").value = ref.sourceTimestamp || "";
  $("#editCaptureDate").value = ref.captureDate || "";
  fillRating(ref.rating);
  updateEditChoice($("#editPatternChoices"), BUILTIN_PATTERNS.concat(patterns), ref.patternIds || []);
  updateEditChoice($("#editCollectionChoices"), collections.filter(function(item) { return item.kind !== "smart"; }), ref.collectionIds || []);
  $("#editPatternChoices").querySelectorAll("[data-choice-id]").forEach(function(button) {
    button.addEventListener("click", function() { button.classList.toggle("selected"); });
  });
  $("#editCollectionChoices").querySelectorAll("[data-choice-id]").forEach(function(button) {
    button.addEventListener("click", function() { button.classList.toggle("selected"); });
  });
  $("#editRating").querySelectorAll("[data-rating]").forEach(function(button) {
    button.addEventListener("click", function() { fillRating(Number(button.dataset.rating)); });
  });
  $("#editError").hidden = true;
  $("#editDialog").showModal();
  if (openNotes || openCollection) {
    const sections = $$(".metadata-section", $("#editDialog"));
    if (openNotes) sections[4].open = true;
    if (openCollection) sections[0].open = true;
    setTimeout(function() { $(".edit-scroll").scrollTo({top:openNotes ? sections[4].offsetTop : 0,behavior:"smooth"}); }, 0);
  }
}
async function saveEdit() {
  const id = $("#editReferenceId").value;
  const ref = references.find(function(item) { return item.id === id; });
  if (!ref) return;
  const title = $("#editTitle").value.trim();
  const category = $("#editCategory").value;
  if (!title || !category) {
    $("#editError").textContent = "Title and category are required.";
    $("#editError").hidden = false;
    return;
  }
  const numberValue = function(selector) {
    const value = $(selector).value;
    return value === "" ? null : Number(value);
  };
  ref.title = title;
  ref.game = $("#editGame").value.trim();
  ref.category = category;
  ref.gameplayFunction = $("#editFunction").value;
  ref.functionGroup = functionGroup(ref.gameplayFunction);
  ref.rhythmFamily = $("#editRhythmFamily").value;
  ref.duration = numberValue("#editDuration");
  ref.attackType = $("#editAttack").value;
  ref.decayType = $("#editDecay").value;
  ref.climaxPosition = numberValue("#editClimax");
  ref.peakCount = numberValue("#editPeaks");
  ref.spacingType = $("#editSpacing").value;
  ref.phenomena = Array.from($("#editPhenomena").selectedOptions).map(function(option) { return option.value; });
  ref.renderingStyle = $("#editStyle").value;
  ref.motionCharacter = $("#editMotion").value;
  ref.tags = $("#editTags").value.split(",").map(function(value) { return value.trim(); }).filter(Boolean);
  ref.cameraDistance = $("#editCamera").value;
  ref.gameplayImportance = $("#editImportance").value;
  ref.visualPriority = $("#editPriority").value;
  ref.environmentContext = $("#editContext").value;
  ref.loopType = $("#editLoop").value;
  ref.ambientDensity = $("#editDensity").value;
  ref.spatialScale = $("#editScale").value;
  ref.environmentalRole = $("#editRole").value;
  ref.whyItWorks = $("#editWhy").value.trim();
  ref.principleToReuse = $("#editPrinciple").value.trim();
  ref.whatToAvoid = $("#editAvoid").value.trim();
  ref.notes = $("#editNotes").value.trim();
  ref.studio = $("#editStudio").value.trim();
  ref.sourceType = $("#editSourceType").value || ref.sourceType || "";
  ref.sourceUrl = $("#editSourceUrl").value.trim() || ref.sourceUrl || "";
  ref.sourceTimestamp = $("#editTimestamp").value.trim();
  ref.captureDate = $("#editCaptureDate").value;
  ref.rating = currentRating;
  ref.patternIds = Array.from($("#editPatternChoices").querySelectorAll(".selected")).map(function(button) { return button.dataset.choiceId; });
  ref.collectionIds = Array.from($("#editCollectionChoices").querySelectorAll(".selected")).map(function(button) { return button.dataset.choiceId; });
  ref.updatedAt = new Date().toISOString();
  try {
    await DB.saveReference(ref);
    await synchronizeMemberships();
    closeDialogs();
    await reloadData();
    renderCollectionNav();
    renderDetail(ref);
    scheduleMetadataSync();
    toast("Reference details saved.", "success");
  } catch (error) {
    $("#editError").textContent = error.message || "Could not save reference details.";
    $("#editError").hidden = false;
  }
}
async function synchronizeMemberships() {
  const date = new Date().toISOString();
  for (const pattern of patterns) {
    const ids = references.filter(function(ref) { return (ref.patternIds || []).includes(pattern.id); }).map(function(ref) { return ref.id; });
    if (JSON.stringify(ids.slice().sort()) !== JSON.stringify((pattern.referenceIds || []).slice().sort())) {
      pattern.referenceIds = ids;
      pattern.updatedAt = date;
      await DB.savePattern(pattern);
    }
  }
  for (const collection of collections) {
    if (collection.kind === "smart") continue;
    const ids = references.filter(function(ref) { return (ref.collectionIds || []).includes(collection.id); }).map(function(ref) { return ref.id; });
    if (JSON.stringify(ids.slice().sort()) !== JSON.stringify((collection.referenceIds || []).slice().sort())) {
      collection.referenceIds = ids;
      collection.updatedAt = date;
      await DB.saveCollection(collection);
    }
  }
}
function openCollectionDialog() {
  $("#collectionNameInput").value = "";
  $("#collectionDialog").showModal();
  $("#collectionNameInput").focus();
}
async function saveCollection() {
  const name = $("#collectionNameInput").value.trim();
  if (!name) { $("#collectionNameInput").focus(); return; }
  if (collections.some(function(item) { return item.kind !== "smart" && item.name.toLowerCase() === name.toLowerCase(); })) {
    toast("A collection with that name already exists.", "error");
    return;
  }
  const date = new Date().toISOString();
  const collection = {id:DB.newId("collection"),name:name,kind:"manual",referenceIds:[],createdAt:date,updatedAt:date};
  await DB.saveCollection(collection);
  await reloadData();
  closeDialogs();
  renderCollectionNav();
  if (currentPage === "library") renderLibrary();
  toast("Collection created.", "success");
  scheduleMetadataSync();
}
function openPatternDialog(ref) {
  $("#patternNameInput").value = "";
  $("#patternFamilyInput").value = ref && ref.rhythmFamily ? ref.rhythmFamily : "";
  $("#patternDescriptionInput").value = "";
  $("#patternUsesInput").value = "";
  const options = ['<option value="">No source reference</option>'].concat(references.map(function(item) {
    return '<option value="' + escapeAttr(item.id) + '">' + escapeHTML(item.title) + '</option>';
  }));
  $("#patternSourceInput").innerHTML = options.join("");
  if (ref && hasCurve(ref)) $("#patternSourceInput").value = ref.id;
  $("#patternDialog").showModal();
  $("#patternNameInput").focus();
}
async function savePattern() {
  const name = $("#patternNameInput").value.trim();
  if (!name) { $("#patternNameInput").focus(); return; }
  const sourceId = $("#patternSourceInput").value;
  const source = references.find(function(item) { return item.id === sourceId; });
  const curve = source && hasCurve(source) ? curveFor(source).map(function(point) { return {t:point.t,v:point.v,ease:point.ease || "smooth",tag:point.tag || ""}; }) : BUILTIN_PATTERNS[1].curve.map(function(point) { return {t:point[0],v:point[1],ease:"smooth"}; });
  const date = new Date().toISOString();
  const pattern = {
    id:DB.newId("pattern"),name:name,rhythmFamily:$("#patternFamilyInput").value || (source && source.rhythmFamily) || "",
    description:$("#patternDescriptionInput").value.trim(),uses:$("#patternUsesInput").value.split(",").map(function(value) { return value.trim(); }).filter(Boolean),
    rhythmCurve:curve,referenceIds:source && hasCurve(source) ? [source.id] : [],createdAt:date,updatedAt:date
  };
  try {
    await DB.savePattern(pattern);
    if (source && hasCurve(source)) {
      source.patternIds = Array.from(new Set((source.patternIds || []).concat(pattern.id)));
      source.updatedAt = date;
      await DB.saveReference(source);
    }
    await reloadData();
    renderCollectionNav();
    closeDialogs();
    if (currentPage === "detail" && source) renderDetail(source);
    if (currentPage === "patterns") renderPatterns();
    toast("Pattern saved to your library.", "success");
    scheduleMetadataSync();
  } catch (error) { toast(error.message || "Could not save the pattern.", "error"); }
}
function openPatternDetails(patternId) {
  const pattern = getPatternById(patternId);
  if (!pattern) return;
  const linked = references.filter(function(ref) { return (ref.patternIds || []).includes(patternId); });
  const uses = (pattern.uses || []).join(", ") || "No use cases added.";
  showMessage(pattern.name, (pattern.description || "A reusable timing principle.") + "\n\nRhythm family: " + (pattern.rhythmFamily || "Unclassified") + "\nReferences: " + linked.length + "\nTypical uses: " + uses, String(patternId).startsWith("builtin-") ? "STARTER PATTERN" : "PATTERN DETAIL");
}
function updateSmartValueInput() {
  const field = $("#smartFieldInput").value;
  const input = $("#smartValueInput");
  const choices = {category:["Gameplay","Environment","Cinematic"],attackType:["Fast","Measured","Slow"],renderingStyle:TAXONOMY.style,rhythmFamily:allRhythms(),gameplayFunction:allFunctions()};
  input.type = ["duration","rating","climaxPosition"].includes(field) ? "number" : "text";
  input.placeholder = field === "duration" ? "Seconds" : field === "rating" ? "1–5" : "A value";
  if (choices[field]) {
    input.setAttribute("list","smartValueOptions");
    let datalist = $("#smartValueOptions");
    if (!datalist) { datalist = document.createElement("datalist"); datalist.id = "smartValueOptions"; document.body.appendChild(datalist); }
    datalist.innerHTML = choices[field].map(function(value) { return '<option value="' + escapeAttr(value) + '"></option>'; }).join("");
  } else input.removeAttribute("list");
}
async function saveSmartCollection() {
  const name = $("#smartNameInput").value.trim(), field = $("#smartFieldInput").value, value = $("#smartValueInput").value.trim(), operator = $("#smartOperatorInput").value;
  if (!name || !value) { toast("Add a collection name and a rule value.", "error"); return; }
  const date = new Date().toISOString();
  const collection = {id:DB.newId("smart"),name:name,kind:"smart",description:"Matches references when this saved rule is true.",rules:[{field:field,operator:operator,value:["duration","rating","climaxPosition"].includes(field) ? Number(value) : value}],createdAt:date,updatedAt:date};
  await DB.saveCollection(collection);
  await reloadData();
  closeDialogs();
  renderSmartCollections();
  toast("Smart collection saved.", "success");
  scheduleMetadataSync();
}
function openSmartDialog() {
  $("#smartNameInput").value = "";
  $("#smartFieldInput").value = "category";
  $("#smartOperatorInput").value = "equals";
  $("#smartValueInput").value = "";
  updateSmartValueInput();
  $("#smartDialog").showModal();
}
function openSmartCollection(id) {
  currentSmartId = id;
  currentFilter = "smart";
  currentCollectionId = "";
  showPage("library");
}
function syncFilterDialog() {
  const selectors = {category:"#filterCategory",gameplayFunction:"#filterFunction",rhythmFamily:"#filterRhythm",attackType:"#filterAttack",decayType:"#filterDecay",duration:"#filterDuration",climaxPosition:"#filterClimax",peakCount:"#filterPeaks",phenomenon:"#filterPhenomenon",renderingStyle:"#filterStyle",motionCharacter:"#filterMotion",cameraDistance:"#filterCamera",rating:"#filterRating"};
  Object.keys(selectors).forEach(function(key) { $(selectors[key]).value = currentFilters[key] || ""; });
}
function readFilterDialog() {
  const selectors = {category:"#filterCategory",gameplayFunction:"#filterFunction",rhythmFamily:"#filterRhythm",attackType:"#filterAttack",decayType:"#filterDecay",duration:"#filterDuration",climaxPosition:"#filterClimax",peakCount:"#filterPeaks",phenomenon:"#filterPhenomenon",renderingStyle:"#filterStyle",motionCharacter:"#filterMotion",cameraDistance:"#filterCamera",rating:"#filterRating"};
  const result = {};
  Object.keys(selectors).forEach(function(key) {
    const value = $(selectors[key]).value;
    if (value !== "") result[key] = value;
  });
  currentFilters = result;
  visibleLimit = 48;
  renderLibrary();
  closeDialogs();
}
function clearFilters() {
  currentFilters = {};
  currentQuery = "";
  $("#searchInput").value = "";
  Object.keys(currentFilters).forEach(function(key) { currentFilters[key] = ""; });
  renderLibrary();
}
function fillImportTabs(mode) {
  importMode = mode;
  $$(".import-tab").forEach(function(button) { button.classList.toggle("active", button.dataset.importmode === mode); });
  $("#fileImportPanel").hidden = mode !== "file";
  $("#urlImportPanel").hidden = mode !== "url";
  $("#driveImportPanel").hidden = mode !== "drive";
  $("#titleFieldWrap").hidden = mode !== "file" || pendingFiles.length > 1;
  $("#saveImportButton").textContent = mode === "file" ? pendingFiles.length > 1 ? "Upload " + pendingFiles.length + " references" : "Upload reference" : mode === "drive" ? pickedDriveFiles.length ? "Add " + pickedDriveFiles.length + " references" : "Add selected files" : "Save URL reference";
  $("#driveUploadHint").hidden = DriveService.connected;
}
function updateFileQueue() {
  const queue = $("#fileQueue");
  $("#titleFieldWrap").hidden = importMode !== "file" || pendingFiles.length > 1;
  if (!pendingFiles.length) {
    queue.hidden = true;
    queue.innerHTML = "";
    $("#saveImportButton").textContent = "Upload reference";
    return;
  }
  queue.hidden = false;
  queue.innerHTML = pendingFiles.map(function(file) {
    return '<div class="queue-item"><span>◈</span><span>' + escapeHTML(file.name) + '</span><span class="queue-size">' + humanBytes(file.size) + '</span><button type="button" class="tiny-add" data-remove-file="' + pendingFiles.indexOf(file) + '" aria-label="Remove file">×</button></div>';
  }).join("");
  $("#saveImportButton").textContent = pendingFiles.length > 1 ? "Upload " + pendingFiles.length + " references" : "Upload reference";
}
function openImportDialog(mode) {
  pendingFiles = [];
  pickedDriveFiles = [];
  $("#fileInput").value = "";
  $("#importTitle").value = "";
  $("#importCategory").value = "";
  $("#sourceUrlInput").value = "";
  $("#urlTitleInput").value = "";
  $("#importError").hidden = true;
  $("#uploadProgressWrap").hidden = true;
  $("#pickedDriveFiles").hidden = true;
  $("#fileQueue").hidden = true;
  fillImportTabs(mode || "file");
  $("#importDialog").showModal();
}
function sourceTypeFor(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("youtube")) return "YouTube";
    if (host.includes("artstation")) return "ArtStation";
    if (host.includes("vimeo")) return "Vimeo";
  } catch (_) {}
  return "Other";
}
function emptyReference(title, category) {
  const date = new Date().toISOString();
  return {
    id:DB.newId("ref"),driveFileId:"",driveThumbnailId:"",title:title,game:"",studio:"",category:category,gameplayFunction:"",functionGroup:"",
    rhythmFamily:"",duration:null,climaxPosition:null,peakCount:null,attackType:"",decayType:"",spacingType:"",phenomena:[],renderingStyle:"",
    motionCharacter:"",cameraDistance:"",gameplayImportance:"",visualPriority:"",environmentContext:"",loopType:"",ambientDensity:"",
    spatialScale:"",environmentalRole:"",rating:0,favorite:false,tags:[],sourceType:"",sourceUrl:"",sourceTimestamp:"",
    captureDate:new Date().toISOString().slice(0,10),notes:"",whyItWorks:"",principleToReuse:"",whatToAvoid:"",rhythmCurve:[],
    layerCurves:[],patternIds:[],collectionIds:[],sourceMissing:false,createdAt:date,updatedAt:date
  };
}
async function makePoster(file) {
  let duration = null;
  try {
    if (file.type && file.type.startsWith("image/")) {
      const image = await createImageBitmap(file);
      const scale = Math.min(1,480/image.width,320/image.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width*scale); canvas.height = Math.round(image.height*scale);
      canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
      image.close();
      return await new Promise(function(resolve) { canvas.toBlob(function(blob) { resolve(blob); },"image/jpeg",0.78); });
    }
    if (file.type && file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file), video = document.createElement("video");
      video.muted = true; video.playsInline = true; video.preload = "metadata"; video.src = url;
      const meta = await new Promise(function(resolve) {
        video.onloadedmetadata = function() { resolve({width:video.videoWidth||640,height:video.videoHeight||360,duration:video.duration}); };
        video.onerror = function() { resolve(null); };
      });
      if (!meta) { URL.revokeObjectURL(url); return null; }
      duration = Number.isFinite(meta.duration) ? meta.duration : null;
      await new Promise(function(resolve) {
        let settled = false;
        const done = function() { if (!settled) { settled = true; resolve(); } };
        video.onseeked = done;
        video.currentTime = Math.min(0.12, Math.max(0, (meta.duration || 0)/5));
        setTimeout(done,1800);
      });
      const scale = Math.min(1,480/meta.width,320/meta.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(meta.width*scale); canvas.height = Math.round(meta.height*scale);
      try { canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height); }
      catch (_) { URL.revokeObjectURL(url); return {blob:null,duration:duration}; }
      URL.revokeObjectURL(url);
      const blob = await new Promise(function(resolve) { canvas.toBlob(function(imageBlob) { resolve(imageBlob); },"image/jpeg",0.78); });
      return {blob:blob,duration:duration};
    }
  } catch (_) {}
  return {blob:null,duration:duration};
}
function showUploadProgress(label, current, total, fileLabel) {
  $("#uploadProgressWrap").hidden = false;
  const percent = Math.max(0,Math.min(100,Math.round((current/Math.max(1,total))*100)));
  $("#uploadProgressLabel").textContent = label + (fileLabel ? " · " + fileLabel : "");
  $("#uploadProgressPct").textContent = percent + "%";
  $("#uploadProgressBar").style.width = percent + "%";
}
async function importDriveSelections() {
  if (!DriveService.connected) throw new Error("Connect Google Drive before choosing existing Drive files.");
  if (!pickedDriveFiles.length) throw new Error("Choose one or more Drive files first.");
  const category = $("#importCategory").value;
  if (!category) throw new Error("Choose a category before adding references.");
  const folders = await DriveService.ensureFolders();
  let added = 0;
  for (const picked of pickedDriveFiles) {
    if (references.some(function(ref) { return ref.driveFileId === picked.id; })) continue;
    const file = await DriveService.getFile(picked.id);
    const ref = emptyReference(file.name.replace(/\.[^.]+$/, ""), category);
    ref.driveFileId = file.id;
    ref.mimeType = file.mimeType;
    ref.sourceType = "";
    ref.sourceUrl = file.webViewLink || picked.url || "";
    ref.driveModifiedTime = file.modifiedTime || "";
    try {
      const poster = await DriveService.downloadThumbnail(file);
      if (poster) {
        await DB.saveThumbnail(ref.id,poster);
        addThumbnailUrl(ref.id,poster);
        const cloudPoster = await DriveService.uploadThumbnail(poster,"poster-" + ref.id + ".jpg",folders.thumbnails);
        ref.driveThumbnailId = cloudPoster.id;
      }
    } catch (_) {}
    await DB.saveReference(ref);
    added++;
  }
  await reloadData();
  closeDialogs();
  renderCollectionNav();
  renderLibrary();
  toast(added ? added + " Drive reference" + (added === 1 ? " added." : "s added.") : "Those Drive files are already in this library.", added ? "success" : "info");
  scheduleMetadataSync();
}
async function importLocalFiles() {
  if (!pendingFiles.length) throw new Error("Choose a media file first.");
  if (!DriveService.connected) throw new Error("Connect Google Drive before uploading original media. Your library metadata remains local.");
  const category = $("#importCategory").value;
  if (!category) throw new Error("Choose a category before uploading.");
  const titleValue = $("#importTitle").value.trim();
  let added = 0;
  const processed = new Set();
  const folders = await DriveService.ensureFolders();
  for (let index = 0; index < pendingFiles.length; index++) {
    const file = pendingFiles[index];
    const duplicateKey = [file.name,file.size,file.type,file.lastModified].join("|");
    const alreadyAdded = references.some(function(ref) {
      return ref.originalName === file.name && Number(ref.originalSize) === Number(file.size) && String(ref.originalMimeType || "") === String(file.type || "") && Number(ref.originalLastModified || 0) === Number(file.lastModified || 0);
    });
    if (alreadyAdded || processed.has(duplicateKey)) {
      toast(file.name + " is already in this library; skipped the duplicate.","info");
      continue;
    }
    processed.add(duplicateKey);
    const title = pendingFiles.length === 1 && titleValue ? titleValue : file.name.replace(/\.[^.]+$/, "");
    $("#uploadProgressWrap").hidden = false;
    showUploadProgress("Uploading " + (index+1) + " of " + pendingFiles.length,0,1,file.name);
    const driveFile = await DriveService.uploadFile(file, folders.category[category], null, function(loaded,total) {
      const overall = ((index + loaded/Math.max(1,total))/pendingFiles.length)*100;
      $("#uploadProgressLabel").textContent = "Uploading " + (index+1) + " of " + pendingFiles.length + " · " + file.name;
      $("#uploadProgressPct").textContent = Math.round(overall) + "%";
      $("#uploadProgressBar").style.width = overall + "%";
    });
    const posterResult = await makePoster(file);
    const poster = posterResult && posterResult.blob !== undefined ? posterResult.blob : posterResult;
    const ref = emptyReference(title,category);
    ref.driveFileId = driveFile.id;
    ref.driveThumbnailId = "";
    ref.mimeType = file.type;
    ref.sourceType = "";
    ref.sourceUrl = driveFile.webViewLink || "";
    ref.driveModifiedTime = driveFile.modifiedTime || "";
    ref.originalName = file.name;
    ref.originalSize = file.size;
    ref.originalMimeType = file.type;
    ref.originalLastModified = file.lastModified;
    ref.duration = posterResult && posterResult.duration != null ? posterResult.duration : null;
    if (poster) {
      try {
        await DB.saveThumbnail(ref.id,poster);
        addThumbnailUrl(ref.id,poster);
        const cloudPoster = await DriveService.uploadThumbnail(poster,"poster-" + ref.id + ".jpg",folders.thumbnails);
        ref.driveThumbnailId = cloudPoster.id;
      } catch (error) { toast("Reference added; its preview thumbnail will stay on this device until Drive is available.", "info"); }
    }
    await DB.saveReference(ref);
    added++;
  }
  await reloadData();
  renderCollectionNav();
  renderLibrary();
  closeDialogs();
  toast(added + " reference" + (added === 1 ? " uploaded." : "s uploaded."), "success");
  scheduleMetadataSync();
}
async function saveUrlReference() {
  const url = $("#sourceUrlInput").value.trim();
  const title = $("#urlTitleInput").value.trim() || $("#importTitle").value.trim();
  const category = $("#importCategory").value;
  if (!safeLink(url)) throw new Error("Enter a valid http or https source URL.");
  if (!title || !category) throw new Error("Add a title and category to save this reference.");
  const ref = emptyReference(title,category);
  ref.sourceUrl = url;
  ref.sourceType = sourceTypeFor(url);
  await DB.saveReference(ref);
  await reloadData();
  closeDialogs();
  renderCollectionNav();
  renderLibrary();
  toast("Source reference saved.", "success");
  scheduleMetadataSync();
}
async function saveImport() {
  $("#importError").hidden = true;
  $("#saveImportButton").disabled = true;
  try {
    if (importMode === "file") await importLocalFiles();
    else if (importMode === "drive") await importDriveSelections();
    else await saveUrlReference();
  } catch (error) {
    $("#importError").textContent = userFacingError(error);
    $("#importError").hidden = false;
    $("#uploadProgressWrap").hidden = false;
    $("#saveImportButton").disabled = false;
  } finally {
    if (!$("#importDialog").open) $("#saveImportButton").disabled = false;
  }
}
async function chooseDriveFiles() {
  $("#importError").hidden = true;
  try {
    const docs = await DriveService.openPicker();
    pickedDriveFiles = docs;
    $("#pickedDriveFiles").hidden = docs.length === 0;
    $("#pickedDriveFiles").innerHTML = docs.map(function(doc) { return '<div class="queue-item"><span>◫</span><span>' + escapeHTML(doc.name || "Drive media") + '</span><span class="queue-size">Google Drive</span></div>'; }).join("");
    $("#saveImportButton").textContent = docs.length ? "Add " + docs.length + " references" : "Add selected files";
  } catch (error) { $("#importError").textContent = userFacingError(error); $("#importError").hidden = false; }
}
async function toggleReference(refId, field) {
  const ref = references.find(function(item) { return item.id === refId; });
  if (!ref) return;
  ref[field] = !ref[field];
  ref.updatedAt = new Date().toISOString();
  await DB.saveReference(ref);
  await reloadData();
  if (currentPage === "detail") renderDetail(ref);
  else renderLibrary();
  scheduleMetadataSync();
}
async function previewOriginal(ref) {
  if (ref.driveFileId) {
    if (!DriveService.connected) {
      showMessage("Reconnect Drive to preview the original", "The reference details and cached thumbnail remain available here. Connect Google Drive, then load the full-resolution source when you need it.", "ORIGINAL MEDIA");
      return;
    }
    const button = $("#mediaPreviewButton");
    if (button) { button.disabled = true; button.textContent = "Loading original…"; }
    try {
      const blob = await DriveService.downloadMedia(ref.driveFileId);
      const url = URL.createObjectURL(blob);
      const media = $("#detailMedia");
      const mediaType = ref.mimeType || blob.type;
      const node = mediaType.startsWith("video/") ? document.createElement("video") : document.createElement("img");
      node.className = "loaded-original";
      if (node.tagName === "VIDEO") { node.controls = true; node.autoplay = true; node.muted = true; node.loop = true; node.playsInline = true; }
      else node.alt = ref.title;
      node.src = url;
      media.insertBefore(node,media.firstChild);
      if (button) button.remove();
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = "Try original again"; }
      toast(userFacingError(error),"error");
    }
  } else if (safeLink(ref.sourceUrl)) window.open(safeLink(ref.sourceUrl),"_blank","noopener,noreferrer");
  else toast("This reference does not have an original media file or source link yet.","info");
}

function setDriveStatus(state, detail) {
  const dot = $("#driveStatusDot"), settingsDot = $("#settingsStatusDot");
  dot.className = "drive-status-dot" + (state === "connected" ? " connected" : state === "syncing" ? " syncing" : state === "error" || state === "offline" ? " error" : "");
  settingsDot.className = dot.className;
  const label = state === "connected" ? "Synced · Drive" : state === "syncing" ? "Syncing library" : state === "offline" ? "Offline · local cache" : state === "error" ? "Sync error" : "Drive not connected";
  $("#driveStatusText").textContent = label;
  $("#syncLabel").textContent = state === "syncing" ? "Syncing" : state === "connected" ? "Synced" : state === "offline" ? "Offline · cached" : "Local library";
  $("#settingsStatusTitle").textContent = state === "connected" ? "Drive is connected" : state === "syncing" ? "Syncing your library" : state === "offline" ? "Drive is unavailable" : "Drive is not connected";
  $("#settingsStatusDescription").textContent = state === "connected" ? (detail || "Original media is stored in the VFX Rhythm Library folder.") : state === "syncing" ? (detail || "Saving the library metadata backup.") : state === "offline" ? "Your cached metadata and thumbnails are still available in this browser." : "Connect to store original media and synchronize metadata.";
  $("#driveButtonLabel").textContent = state === "connected" ? "Drive connected" : state === "syncing" ? "Syncing…" : "Connect Drive";
  $("#driveButton").classList.toggle("active",state === "connected");
  const lastSync = $("#lastSyncText");
  lastSync.textContent = detail || (state === "offline" ? "Cached references remain available on this device." : "Your library is stored in this browser.");
  $("#disconnectDriveButton").hidden = !DriveService.connected;
  $("#connectDriveButton").hidden = DriveService.connected;
  $("#syncTimeLabel").textContent = detail || "Metadata sync is manual and incremental.";
}
async function updateLastSyncLabel() {
  const last = await DB.getSetting("drive-last-sync","");
  if (last) {
    const date = new Date(last);
    const label = "Last synced " + date.toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
    $("#lastSyncText").textContent = label;
    $("#syncTimeLabel").textContent = label + " · Incremental Drive sync";
    if (!DriveService.connected && navigator.onLine) $("#settingsStatusDescription").textContent = "Reconnect to Drive to sync. This browser has a local metadata copy.";
  }
}
async function openSettings() {
  const config = await DB.getSetting("drive-config",{clientId:"",apiKey:"",projectNumber:""});
  $("#clientIdInput").value = config.clientId || "";
  $("#apiKeyInput").value = config.apiKey || "";
  $("#projectNumberInput").value = config.projectNumber || "";
  $("#originText").textContent = window.location.origin;
  $("#settingsError").hidden = true;
  $("#settingsDialog").showModal();
  await updateLastSyncLabel();
}
async function saveDriveSettings() {
  const config = {
    clientId:$("#clientIdInput").value.trim(),
    apiKey:$("#apiKeyInput").value.trim(),
    projectNumber:$("#projectNumberInput").value.trim()
  };
  await DB.saveSetting("drive-config",config);
  DriveService.configure(config);
  $("#settingsError").hidden = true;
  toast("Drive settings saved on this device.","success");
}
async function connectDrive() {
  $("#settingsError").hidden = true;
  try {
    const config = {
      clientId:$("#clientIdInput").value.trim(),
      apiKey:$("#apiKeyInput").value.trim(),
      projectNumber:$("#projectNumberInput").value.trim()
    };
    if (!config.clientId) {
      $("#settingsError").textContent = "Add the OAuth client ID, save settings, then connect.";
      $("#settingsError").hidden = false;
      return;
    }
    await DB.saveSetting("drive-config",config);
    DriveService.configure(config);
    await DriveService.connect();
    setDriveStatus("connected","Google Drive is connected. Original media will use the VFX Rhythm Library folder.");
    await runSync();
  } catch (error) {
    const message = userFacingError(error);
    $("#settingsError").textContent = message + (message.includes("OAuth client") ? " This app only requests the drive.file scope." : "");
    $("#settingsError").hidden = false;
    setDriveStatus("error",message);
  }
}
async function disconnectDrive() {
  DriveService.disconnect();
  setDriveStatus(navigator.onLine ? "disconnected" : "offline","Drive access removed. Your local metadata and cached thumbnails stay on this device.");
  closeDialogs();
  toast("Google Drive disconnected.","info");
}
async function runSync() {
  if (!DriveService.connected) {
    await openSettings();
    toast("Connect Drive to run a library sync.","info");
    return;
  }
  if (inFlightSync) return;
  inFlightSync = true;
  setDriveStatus("syncing","Syncing app-created Drive folders and metadata…");
  $("#manualSyncButton").textContent = "Syncing…";
  try {
    const result = await DriveService.sync(function(label) { setDriveStatus("syncing",label); });
    await reloadData();
    renderCollectionNav();
    if (currentPage === "library") renderLibrary();
    else if (currentPage === "patterns") renderPatterns();
    else if (currentPage === "smart") renderSmartCollections();
    const summary = ["Drive synced",result.imported ? result.imported + " new" : "",result.removed ? result.removed + " original missing" : "",result.conflicts ? result.conflicts + " newer local/Drive edits merged" : ""].filter(Boolean).join(" · ");
    setDriveStatus("connected",summary);
    await updateLastSyncLabel();
    toast(summary + ".","success");
  } catch (error) {
    const message = userFacingError(error);
    setDriveStatus("error",message + " Local metadata remains available.");
    toast(message,"error");
  } finally {
    inFlightSync = false;
    $("#manualSyncButton").textContent = "Manual sync ↗";
  }
}
function scheduleMetadataSync() {
  if (!DriveService.connected) return;
  clearTimeout(metadataSyncTimer);
  metadataSyncTimer = setTimeout(async function() {
    try {
      setDriveStatus("syncing","Saving a Drive metadata backup…");
      const date = await DriveService.syncMetadata();
      setDriveStatus("connected","Metadata backed up " + new Date(date).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}) + ".");
      await updateLastSyncLabel();
    } catch (error) {
      setDriveStatus("error",userFacingError(error) + " The local save is safe.");
    }
  },1200);
}
function showUploadError(error) {
  $("#importError").textContent = userFacingError(error);
  $("#importError").hidden = false;
}
function fillSettingsFromStore() {
  return DB.getSetting("drive-config",{clientId:"",apiKey:"",projectNumber:""}).then(function(config) {
    DriveService.configure(config);
  });
}
function bindEvents() {
  $("#importButton").addEventListener("click",function() { openImportDialog("file"); });
  $("#importButtonTop").addEventListener("click",function() { openImportDialog("file"); });
  $("#emptyImportButton").addEventListener("click",function() { openImportDialog("file"); });
  $("#emptyUrlButton").addEventListener("click",function() { openImportDialog("url"); });
  $("#settingsButton").addEventListener("click",openSettings);
  $("#configureDriveFromImport").addEventListener("click",function() { closeDialogs(); openSettings(); });
  $("#driveButton").addEventListener("click",function() {
    if (DriveService.connected) runSync();
    else openSettings();
  });
  $("#manualSyncButton").addEventListener("click",runSync);
  $("#saveDriveSettingsButton").addEventListener("click",saveDriveSettings);
  $("#connectDriveButton").addEventListener("click",connectDrive);
  $("#disconnectDriveButton").addEventListener("click",disconnectDrive);
  $("#mobileMenu").addEventListener("click",function() { $("#sidebar").classList.toggle("open"); });
  $("#newCollectionButton").addEventListener("click",openCollectionDialog);
  $("#saveCollectionButton").addEventListener("click",saveCollection);
  $("#newPatternButton").addEventListener("click",function() { openPatternDialog(null); });
  $("#createPatternTop").addEventListener("click",function() { openPatternDialog(null); });
  $("#emptyPatternButton").addEventListener("click",function() { openPatternDialog(null); });
  $("#savePatternButton").addEventListener("click",savePattern);
  $("#createSmartButton").addEventListener("click",openSmartDialog);
  $("#saveSmartButton").addEventListener("click",saveSmartCollection);
  $("#filterButton").addEventListener("click",function() { syncFilterDialog(); $("#filterDialog").showModal(); });
  $("#applyFiltersButton").addEventListener("click",readFilterDialog);
  $("#clearFiltersButton").addEventListener("click",function() { currentFilters = {}; currentQuery = ""; visibleLimit = 48; $("#searchInput").value = ""; $$(".filter-dialog-body select").forEach(function(select) { select.value = ""; }); readFilterDialog(); });
  $("#compareButton").addEventListener("click",renderCompare);
  $("#sortSelect").addEventListener("change",function() { visibleLimit = 48; renderLibrary(); });
  $("#loadMoreButton").addEventListener("click",function() { visibleLimit += 48; renderLibrary(); });
  $("#searchInput").addEventListener("input",function() { currentQuery = this.value.trim(); visibleLimit = 48; if (currentPage !== "library") showPage("library"); else renderLibrary(); });
  $("#searchInput").addEventListener("keydown",function(event) { if (event.key === "Escape") { this.value = ""; currentQuery = ""; renderLibrary(); } });
  document.addEventListener("keydown",function(event) {
    if (event.key === "/" && !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName) && !$("dialog[open]")) { event.preventDefault(); $("#searchInput").focus(); }
  });
  $("#searchInput").addEventListener("focus",function() {
    if (currentPage !== "library") showPage("library");
  });
  $$(".view-choice").forEach(function(button) {
    button.addEventListener("click",function() {
      viewMode = button.dataset.viewmode;
      $$(".view-choice").forEach(function(choice) { choice.classList.toggle("active",choice === button); });
      renderLibrary();
    });
  });
  document.addEventListener("click",function(event) {
    const close = event.target.closest("[data-close-dialog],.close-dialog");
    if (close) { event.preventDefault(); closeDialogs(); return; }
    const nav = event.target.closest(".nav-item");
    if (nav) {
      if (nav.dataset.route === "patterns") showPage("patterns");
      else if (nav.dataset.route === "smart") showPage("smart");
      else navigateFilter(nav.dataset.filter || "all",nav.dataset.collectionId || "");
      return;
    }
    const removeFilter = event.target.closest("[data-remove-filter]");
    if (removeFilter) { delete currentFilters[removeFilter.dataset.removeFilter]; renderLibrary(); return; }
    if (event.target.closest("[data-clear-query]")) { currentQuery = ""; $("#searchInput").value = ""; renderLibrary(); return; }
    const removeFile = event.target.closest("[data-remove-file]");
    if (removeFile) { pendingFiles.splice(Number(removeFile.dataset.removeFile),1); updateFileQueue(); return; }
    const favorite = event.target.closest("[data-favorite-ref]");
    if (favorite) { toggleReference(favorite.dataset.favoriteRef,"favorite"); return; }
    const edit = event.target.closest("[data-edit-ref]");
    if (edit) { const ref = references.find(function(item) { return item.id === edit.dataset.editRef; }); openEdit(ref); return; }
    const preview = event.target.closest("[data-preview-ref]");
    if (preview) { const ref = references.find(function(item) { return item.id === preview.dataset.previewRef; }); if (ref) { renderDetail(ref); previewOriginal(ref); } return; }
    const compare = event.target.closest("[data-compare-ref]");
    if (compare) {
      if (compare.checked) selectedRefs.add(compare.dataset.compareRef); else selectedRefs.delete(compare.dataset.compareRef);
      updateCompareButton();
      const card = compare.closest(".reference-card");
      if (card) card.classList.toggle("selected",compare.checked);
      return;
    }
    const openRef = event.target.closest("[data-open-ref]");
    if (openRef) { const ref = references.find(function(item) { return item.id === openRef.dataset.openRef; }); if (ref) renderDetail(ref); return; }
    const pattern = event.target.closest("[data-open-pattern]");
    if (pattern) { openPatternDetails(pattern.dataset.openPattern); return; }
    const smart = event.target.closest("[data-open-smart]");
    if (smart) { openSmartCollection(smart.dataset.openSmart); return; }
    if (event.target.closest("#clearSearchFromEmpty")) { currentQuery = ""; currentFilters = {}; visibleLimit = 48; $("#searchInput").value = ""; navigateFilter("all"); return; }
  });
  $("#fileInput").addEventListener("change",function() {
    pendingFiles = Array.from(this.files || []);
    updateFileQueue();
  });
  const dropZone = $("#dropZone");
  ["dragenter","dragover"].forEach(function(name) {
    dropZone.addEventListener(name,function(event) { event.preventDefault(); dropZone.classList.add("drag-over"); });
  });
  ["dragleave","drop"].forEach(function(name) {
    dropZone.addEventListener(name,function(event) {
      event.preventDefault(); dropZone.classList.remove("drag-over");
      if (name === "drop") {
        pendingFiles = Array.from(event.dataTransfer.files || []).filter(function(file) { return /\.(mp4|mov|webm|gif|png|jpe?g)$/i.test(file.name); });
        updateFileQueue();
        if (!pendingFiles.length) toast("Choose MP4, MOV, WEBM, GIF, PNG, JPG, or JPEG files.","error");
      }
    });
  });
  $$(".import-tab").forEach(function(tab) {
    tab.addEventListener("click",function() { fillImportTabs(tab.dataset.importmode); });
  });
  $("#openPickerButton").addEventListener("click",chooseDriveFiles);
  $("#saveImportButton").addEventListener("click",saveImport);
  $("#importTitle").addEventListener("input",function() { if (importMode === "file" && pendingFiles.length === 1) $("#titleFieldWrap").hidden = false; });
  $("#urlTitleInput").addEventListener("input",function() { $("#importTitle").value = this.value; });
  $("#saveEditButton").addEventListener("click",saveEdit);
  $("#editForm").addEventListener("submit",function(event) { event.preventDefault(); saveEdit(); });
  $("#collectionNameInput").addEventListener("keydown",function(event) { if (event.key === "Enter") { event.preventDefault(); saveCollection(); } });
  $("#patternNameInput").addEventListener("keydown",function(event) { if (event.key === "Enter") { event.preventDefault(); savePattern(); } });
  $("#smartNameInput").addEventListener("keydown",function(event) { if (event.key === "Enter") { event.preventDefault(); saveSmartCollection(); } });
  window.addEventListener("online",function() { setDriveStatus(DriveService.connected ? "connected" : "disconnected",DriveService.connected ? "Network is available. Drive sync can resume." : "Network is available. Reconnect to sync."); });
  window.addEventListener("offline",function() { setDriveStatus("offline","Cached metadata and thumbnails remain available."); });
}
async function init() {
  initTaxonomy();
  bindEvents();
  try {
    await DB.open();
    await reloadData();
    renderCollectionNav();
    renderLibrary();
    renderPatterns();
    renderSmartCollections();
    await fillSettingsFromStore();
    setDriveStatus(navigator.onLine ? "disconnected" : "offline");
    await updateLastSyncLabel();
    if (!navigator.onLine) setDriveStatus("offline","Cached metadata and thumbnails remain available.");
    const referenceId = new URLSearchParams(window.location.search).get("reference");
    if (referenceId) renderDetail(references.find(function(ref) { return ref.id === referenceId; }));
  } catch (error) {
    setDriveStatus("error","The local library could not open: " + error.message);
    showMessage("Could not open the local library",error.message + "\n\nTry reloading this page in a browser that supports IndexedDB.");
  }
}

init();
