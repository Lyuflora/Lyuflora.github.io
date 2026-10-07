import {SpawnSimulator, createOutcomeSeeds} from "./frequency-simulator.js";
import {deriveEmitterSettings, inferSimpleTuning} from "./frequency-tuning.js";

const PRESETS = {
  "steady-embers": {rateMin:4.5,rateMax:6.5,delayMin:0,delayMax:0.07,duration:8},
  "sparse-embers": {rateMin:0.8,rateMax:1.8,delayMin:0.12,delayMax:0.55,duration:10},
  "falling-leaves": {rateMin:0.5,rateMax:1.7,delayMin:0.18,delayMax:0.82,duration:12},
  "water-drops": {rateMin:1.5,rateMax:3.2,delayMin:0.03,delayMax:0.32,duration:8},
  "blowing-sand": {rateMin:9,rateMax:22,delayMin:0,delayMax:0.09,duration:6},
  "irregular-dust": {rateMin:1.1,rateMax:7.5,delayMin:0.05,delayMax:0.7,duration:10}
};
const PREVIEW_TRAIL_SECONDS = 1.4;
const state = {
  config:{spawnRateMin:4.5,spawnRateMax:6.5,particleDelayMin:0,particleDelayMax:0.07,duration:8,seed:42817,maxParticles:0},
  simulation:null,
  outcomes:[],
  tuning:{density:48,regularity:16},
  editMode:"simple",
  playhead:0,
  playing:false,
  frame:0,
  lastFrame:0,
  mode:"point"
};

const refs = {
  rateMin:$("#rateMin"),rateMax:$("#rateMax"),delayMin:$("#delayMin"),delayMax:$("#delayMax"),
  rateMinNumber:$("#rateMinNumber"),rateMaxNumber:$("#rateMaxNumber"),delayMinNumber:$("#delayMinNumber"),delayMaxNumber:$("#delayMaxNumber"),
  duration:$("#durationInput"),seed:$("#seedInput"),maxParticles:$("#maxParticlesInput"),canvas:$("#particleCanvas"),
  densityTuning:$("#densityTuning"),regularityTuning:$("#regularityTuning")
};
const context = refs.canvas.getContext("2d");

function clamp(value,min,max) { return Math.min(max,Math.max(min,value)); }
function formatSeconds(value,digits) { return Number(value).toFixed(digits === undefined ? 2 : digits) + " s"; }
function formatRate(value) {
  const number = Number(value);
  const precise = number.toFixed(2);
  return precise.endsWith("0") ? number.toFixed(1) : precise;
}
function readControls() {
  state.config.spawnRateMin = Number(refs.rateMin.value);
  state.config.spawnRateMax = Number(refs.rateMax.value);
  state.config.particleDelayMin = Number(refs.delayMin.value);
  state.config.particleDelayMax = Number(refs.delayMax.value);
  state.config.duration = Number(refs.duration.value);
  state.config.seed = (Number(refs.seed.value) >>> 0) || 1;
  state.config.maxParticles = clamp(Number(refs.maxParticles.value) || 0,0,100000);
}
function updateSpread(band,min,max,rangeMax) {
  const start = (min / rangeMax) * 100;
  const end = (max / rangeMax) * 100;
  band.style.setProperty("--range-start",start + "%");
  band.style.setProperty("--range-width",Math.max(0,end-start) + "%");
}
function updateControlLabels() {
  const rateMin = Number(refs.rateMin.value);
  const rateMax = Number(refs.rateMax.value);
  const delayMin = Number(refs.delayMin.value);
  const delayMax = Number(refs.delayMax.value);
  refs.rateMinNumber.value = rateMin.toFixed(2);
  refs.rateMaxNumber.value = rateMax.toFixed(2);
  refs.delayMinNumber.value = delayMin.toFixed(2);
  refs.delayMaxNumber.value = delayMax.toFixed(2);
  $("#rateSummary").textContent = formatRate(rateMin) + "–" + formatRate(rateMax) + " /s";
  $("#delaySummary").textContent = formatSeconds(delayMin) + "–" + formatSeconds(delayMax);
  $("#durationValue").textContent = refs.duration.value + " sec";
  $("#durationReadout").textContent = Number(refs.duration.value).toFixed(2) + " sec";
  $("#densityEnd").textContent = refs.duration.value + " sec";
  updateSpread($("#rateBand"),rateMin,rateMax,32);
  updateSpread($("#delayBand"),delayMin,delayMax,1.5);
  updateTuningPresentation();
}
function densityLabel(value) {
  if (value < 18) return "Sparse";
  if (value < 38) return "Light";
  if (value < 62) return "Balanced";
  if (value < 82) return "Frequent";
  return "Very frequent";
}
function regularityLabel(value) {
  if (value < 20) return "Very regular";
  if (value < 45) return "Mostly regular";
  if (value < 72) return "Variable";
  return "Random";
}
function updateTuningPresentation() {
  const density = Number(refs.densityTuning.value);
  const regularity = Number(refs.regularityTuning.value);
  const derived = deriveEmitterSettings({density:density,regularity:regularity});
  const centerRate = (derived.spawnRateMin+derived.spawnRateMax)/2;
  const effectiveRate = 1/(1/centerRate+derived.particleDelayMax/2);
  const regularityText = regularityLabel(regularity);
  $("#densityTuningValue").textContent = densityLabel(density);
  $("#regularityTuningValue").textContent = regularityText;
  $("#tuningSummary").textContent = effectiveRate.toFixed(1)+" spawns / sec · "+regularityText.toLowerCase();
  $("#densityTag").textContent = densityLabel(density)+" density";
  $("#regularityTag").textContent = regularityText;

  let title = "A gently shifting rhythm";
  let description = "The stream has a clear pace, with enough timing movement to feel less mechanical.";
  if (density < 25 && regularity > 70) {
    title = "Slow, uneven bursts";
    description = "Events are far apart and the pauses vary widely, creating occasional loose clusters.";
  } else if (density < 28) {
    title = "Widely spaced events";
    description = "The low event rate leaves open space between spawns, giving each particle room to read.";
  } else if (density > 78 && regularity > 68) {
    title = "Dense, irregular flow";
    description = "Frequent events combine with wide timing variation, so clusters may form alongside short gaps.";
  } else if (density > 78) {
    title = "Fast, steady stream";
    description = "Events arrive frequently and keep a fairly even rhythm across the simulation.";
  } else if (regularity > 76) {
    title = "Loose, natural scatter";
    description = "The rate and added delay can shift from event to event, producing uneven spacing and small clusters.";
  } else if (regularity < 20) {
    title = "A steady stream";
    description = "Spawns follow a consistent cadence with very little timing drift.";
  }
  $("#interpretationTitle").textContent = title;
  $("#interpretationText").textContent = description;
  let tip = "Compare the signature with the alternate outcomes to see how the same ranges can produce different patterns.";
  if (density < 28) tip = "Raise density to bring events closer together, or keep the open spacing for isolated particles.";
  else if (density > 78) tip = "At high density, a small amount of randomness can keep neighboring spawn markers readable.";
  else if (regularity < 20) tip = "Add a little randomness to soften the mechanical rhythm without changing the overall pace much.";
  else if (regularity > 76) tip = "Lower randomness if the long pauses and clusters feel less controlled than you want.";
  $("#tuningTip").textContent = tip;
}
function syncSimpleTuningFromAdvanced() {
  state.tuning = inferSimpleTuning({
    spawnRateMin:refs.rateMin.value,
    spawnRateMax:refs.rateMax.value,
    particleDelayMin:refs.delayMin.value,
    particleDelayMax:refs.delayMax.value
  });
  refs.densityTuning.value = String(state.tuning.density);
  refs.regularityTuning.value = String(state.tuning.regularity);
}
function applySimpleTuning() {
  state.tuning = {density:Number(refs.densityTuning.value),regularity:Number(refs.regularityTuning.value)};
  const derived = deriveEmitterSettings(state.tuning);
  refs.rateMin.value = String(derived.spawnRateMin);
  refs.rateMax.value = String(derived.spawnRateMax);
  refs.delayMin.value = String(derived.particleDelayMin);
  refs.delayMax.value = String(derived.particleDelayMax);
  $$(".preset-chip").forEach(function(button) { button.classList.remove("active"); });
  rebuild();
}
function createSimulation(settings) {
  return SpawnSimulator.simulate({
    spawnRateMin:settings.spawnRateMin,
    spawnRateMax:settings.spawnRateMax,
    particleDelayMin:settings.particleDelayMin,
    particleDelayMax:settings.particleDelayMax,
    duration:settings.duration,
    seed:settings.seed
  });
}
function updatePlayState(label) {
  $("#playState").textContent = label;
  $("#transportOrb").classList.toggle("is-playing",state.playing);
  $("#playButton").setAttribute("aria-label",state.playing ? "Pause simulation" : "Play simulation");
  $("#playGlyph").textContent = state.playing ? "Ⅱ" : "▶";
  $("#playLabel").textContent = state.playing ? "Pause" : (state.playhead > 0 ? "Resume" : "Play");
}
function rebuild() {
  pause(false);
  readControls();
  updateControlLabels();
  state.simulation = createSimulation(state.config);
  state.outcomes = createOutcomeSeeds(state.config.seed).map(function(seed) {
    return createSimulation(Object.assign({},state.config,{seed:seed}));
  });
  state.playhead = 0;
  renderAll();
  drawPreview();
  updatePlayState("READY TO PLAY");
}
function eventIntervals(events) {
  return events.slice(1).map(function(event,index) {
    const previous = events[index];
    return {
      gap:event.time-previous.time,
      base:event.baseInterval,
      delay:event.sampledDelay,
      rate:event.sampledSpawnRate,
      from:index+1,
      to:index+2
    };
  });
}
function average(values) { return values.length ? values.reduce(function(sum,value) { return sum+value; },0)/values.length : 0; }
function summarize() {
  const events = state.simulation.events;
  const gaps = eventIntervals(events).map(function(interval) { return interval.gap; });
  const meanGap = average(gaps);
  const deviation = gaps.length ? Math.sqrt(average(gaps.map(function(gap) { return Math.pow(gap-meanGap,2); }))) : 0;
  const cv = meanGap ? deviation/meanGap : 0;
  let variation = "—", variationNote = "interval consistency";
  if (gaps.length) {
    variation = cv < 0.18 ? "Low" : cv < 0.42 ? "Medium" : "High";
    variationNote = Math.round(cv*100) + "% spread";
  }
  $("#metricFrequency").textContent = (events.length/state.config.duration).toFixed(2);
  $("#metricAverageGap").textContent = gaps.length ? formatSeconds(meanGap) : "—";
  $("#metricShortestGap").textContent = gaps.length ? formatSeconds(Math.min.apply(null,gaps)) : "—";
  $("#metricLongestGap").textContent = gaps.length ? formatSeconds(Math.max.apply(null,gaps)) : "—";
  $("#metricSpawnCount").textContent = String(events.length);
  $("#metricVariation").textContent = variation;
  $("#metricVariationNote").textContent = variationNote;
  $("#signatureCount").textContent = events.length + (events.length === 1 ? " EVENT" : " EVENTS");
}
function makeTimelineSvg(events,duration,withPlayhead,compact) {
  const left = 34, right = 980, baseY = compact ? 42 : 96, width = right-left;
  const tickCount = Math.min(10,Math.max(2,Math.ceil(duration)));
  const ticks = [];
  for (let i=0;i<=tickCount;i++) {
    const x = left + width*(i/tickCount);
    const label = (duration*i/tickCount).toFixed(duration <= 8 ? 1 : 0);
    ticks.push('<line class="time-grid" x1="'+x.toFixed(2)+'" y1="'+(compact ? 5 : 16)+'" x2="'+x.toFixed(2)+'" y2="'+baseY+'"/><text class="time-tick" x="'+x.toFixed(2)+'" y="'+(compact ? 56 : 122)+'" text-anchor="'+(i===0 ? "start" : i===tickCount ? "end" : "middle")+'">'+label+'</text>');
  }
  const marks = events.map(function(event,index) {
    const x = left + width*(event.time/duration);
    const height = compact ? 13 + ((index*17 + Math.round(event.sampledDelay*100)) % 21) : 20 + ((index*29 + Math.round(event.sampledDelay*100)) % 43);
    const opacity = (0.62 + 0.34*(event.sampledSpawnRate/32)).toFixed(2);
    return '<line class="spawn-mark" x1="'+x.toFixed(2)+'" y1="'+(baseY-height)+'" x2="'+x.toFixed(2)+'" y2="'+baseY+'" opacity="'+opacity+'"><title>Spawn at '+event.time.toFixed(3)+' s · '+event.sampledSpawnRate.toFixed(2)+' per second · '+event.sampledDelay.toFixed(2)+' s added delay</title></line>';
  }).join("");
  const playhead = withPlayhead ? '<line id="timelinePlayhead" class="timeline-playhead" x1="'+left+'" y1="9" x2="'+left+'" y2="105"/><circle id="timelinePlayheadCap" class="timeline-playhead-cap" cx="'+left+'" cy="9" r="3.5"/>' : "";
  return '<line class="timeline-baseline" x1="'+left+'" y1="'+baseY+'" x2="'+right+'" y2="'+baseY+'"/>'+ticks.join("")+marks+playhead;
}
function renderSignature() {
  const svg = $("#signatureSvg");
  svg.innerHTML = makeTimelineSvg(state.simulation.events,state.config.duration,true);
  svg.setAttribute("aria-label",state.simulation.events.length+" particle spawns across "+state.config.duration+" seconds");
  updateTimelinePlayhead();
}
function densityPath(events,duration) {
  const samples = 60, halfWindow = 0.4;
  const counts = [];
  let cursor = 0, left = 0;
  for (let i=0;i<samples;i++) {
    const time = duration*(i/(samples-1));
    const low = Math.max(0,time-halfWindow), high = Math.min(duration,time+halfWindow);
    while (cursor<events.length && events[cursor].time<=high) cursor++;
    while (left<cursor && events[left].time<low) left++;
    const effective = Math.max(0.1,high-low);
    counts.push((cursor-left)/effective);
  }
  const max = Math.max(0.01,Math.max.apply(null,counts));
  const points = counts.map(function(value,index) {
    return {x:38+924*(index/(samples-1)),y:133-(value/max)*94,value:value};
  });
  return {max:max,points:points};
}
function renderDensity() {
  const graph = densityPath(state.simulation.events,state.config.duration);
  const d = graph.points.map(function(point,index) { return (index ? "L" : "M")+point.x.toFixed(1)+" "+point.y.toFixed(1); }).join(" ");
  const area = d+" L 962 140 L 38 140 Z";
  const grid = [40,80,120].map(function(y) { return '<line class="density-grid" x1="38" y1="'+y+'" x2="962" y2="'+y+'"/>'; }).join("");
  const path = '<path class="density-area" d="'+area+'"/><path class="density-line" d="'+d+'"/>';
  $("#densitySvg").innerHTML = grid+path+'<line class="density-axis" x1="38" y1="140" x2="962" y2="140"/>';
  $("#densityPeak").textContent = graph.max < 0.05 ? "No spawns" : "Peak " + graph.max.toFixed(1) + " / sec";
}
function renderIntervals() {
  const intervals = eventIntervals(state.simulation.events).slice(0,12);
  const list = $("#intervalList");
  if (!intervals.length) {
    list.innerHTML = '<div class="quiet-empty">A second spawn is needed to compare intervals.</div>';
    return;
  }
  const longest = Math.max.apply(null,intervals.map(function(item) { return item.gap; }));
  list.innerHTML = intervals.map(function(item) {
    const width = clamp(item.gap/longest*100,8,100);
    const baseWidth = item.gap ? clamp(item.base/item.gap*100,0,100) : 100;
    const delayWidth = 100-baseWidth;
    return '<article class="interval-row"><div class="interval-caption"><span>Spawn '+String(item.from).padStart(2,"0")+' <i>→</i> '+String(item.to).padStart(2,"0")+'</span><strong>'+formatSeconds(item.gap)+'</strong></div><div class="interval-track"><div class="interval-total" style="width:'+width.toFixed(1)+'%"><span class="interval-base" style="width:'+baseWidth.toFixed(1)+'%"></span><span class="interval-delay" style="width:'+delayWidth.toFixed(1)+'%"></span></div></div><div class="interval-detail"><span>'+item.base.toFixed(2)+' s at '+item.rate.toFixed(1)+'/s</span><span>+ '+item.delay.toFixed(2)+' s delay</span></div></article>';
  }).join("");
}
function renderOutcomes() {
  const list = $("#outcomeList");
  const labels = ["A","B","C"];
  list.innerHTML = state.outcomes.map(function(result,index) {
    return '<article class="outcome-row"><span class="outcome-name">'+labels[index]+'</span><svg class="outcome-signature" viewBox="0 0 1000 58" role="img" aria-label="Random outcome '+labels[index]+', '+result.events.length+' spawns">'+makeTimelineSvg(result.events,result.duration,false,true)+'</svg><span class="outcome-count">'+result.events.length+'<small>spawns</small></span></article>';
  }).join("");
}
function renderMetrics() { summarize(); }
function renderAll() {
  renderMetrics();
  renderSignature();
  renderDensity();
  renderIntervals();
  renderOutcomes();
}
function updateTimelinePlayhead() {
  const line = $("#timelinePlayhead");
  const cap = $("#timelinePlayheadCap");
  if (!line || !cap) return;
  const left = 34, right = 980;
  const x = left+(right-left)*(state.playhead/state.config.duration);
  line.setAttribute("x1",x.toFixed(2));
  line.setAttribute("x2",x.toFixed(2));
  cap.setAttribute("cx",x.toFixed(2));
  $("#timeReadout").textContent = state.playhead.toFixed(2);
  $("#stageTimeMarker").textContent = "T + "+state.playhead.toFixed(2);
}
function resizeCanvas() {
  const rect = refs.canvas.getBoundingClientRect();
  const scale = Math.max(1,window.devicePixelRatio || 1);
  const width = Math.max(1,Math.round(rect.width*scale));
  const height = Math.max(1,Math.round(rect.height*scale));
  if (refs.canvas.width !== width || refs.canvas.height !== height) {
    refs.canvas.width = width;
    refs.canvas.height = height;
  }
  context.setTransform(scale,0,0,scale,0,0);
}
function drawPreview() {
  if (!context || !state.simulation) return;
  resizeCanvas();
  const rect = refs.canvas.getBoundingClientRect();
  const width = rect.width, height = rect.height;
  context.clearRect(0,0,width,height);
  const events = state.simulation.events;
  for (let i=0;i<events.length;i++) {
    const event = events[i];
    const age = state.playhead-event.time;
    if (age < 0 || age > PREVIEW_TRAIL_SECONDS) continue;
    const progress = age/PREVIEW_TRAIL_SECONDS;
    const x = 26+progress*(width-54);
    const lane = (i*47 + Math.floor(event.sampledSpawnRate*11)) % 100;
    const y = 22+(lane/100)*(height-48);
    const alpha = (1-progress)*0.86;
    context.globalAlpha = alpha;
    context.strokeStyle = "#8dc6b1";
    context.fillStyle = "#c6f0e3";
    if (state.mode === "streak") {
      context.lineWidth = 2;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(x-11,y+2);
      context.lineTo(x+3,y-1);
      context.stroke();
    } else {
      const radius = 2.2+event.sampledSpawnRate/32;
      context.beginPath();
      context.arc(x,y,radius,0,Math.PI*2);
      context.fill();
    }
  }
  context.globalAlpha = 1;
}
function animate(now) {
  if (!state.playing) return;
  const delta = Math.min(0.08,(now-state.lastFrame)/1000);
  state.lastFrame = now;
  state.playhead = Math.min(state.config.duration,state.playhead+delta);
  updateTimelinePlayhead();
  drawPreview();
  if (state.playhead >= state.config.duration) {
    state.playing = false;
    updatePlayState("SIMULATION COMPLETE");
    drawPreview();
    return;
  }
  state.frame = window.requestAnimationFrame(animate);
}
function play() {
  if (state.playing) {
    pause(true);
    return;
  }
  if (state.playhead >= state.config.duration) state.playhead = 0;
  state.playing = true;
  state.lastFrame = performance.now();
  updatePlayState("SIMULATION PLAYING");
  state.frame = window.requestAnimationFrame(animate);
}
function pause(updateLabel) {
  state.playing = false;
  if (state.frame) window.cancelAnimationFrame(state.frame);
  state.frame = 0;
  if (updateLabel !== false) updatePlayState(state.playhead > 0 ? "SIMULATION PAUSED" : "READY TO PLAY");
}
function restart() {
  pause(false);
  state.playhead = 0;
  updateTimelinePlayhead();
  drawPreview();
  updatePlayState("READY TO PLAY");
}
function randomSeed() {
  if (window.crypto && window.crypto.getRandomValues) {
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] || 1;
  }
  return (Date.now() ^ Math.floor(Math.random()*4294967295)) >>> 0 || 1;
}
function setPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  refs.rateMin.value = String(preset.rateMin);
  refs.rateMax.value = String(preset.rateMax);
  refs.delayMin.value = String(preset.delayMin);
  refs.delayMax.value = String(preset.delayMax);
  refs.duration.value = String(preset.duration);
  syncSimpleTuningFromAdvanced();
  $$(".preset-chip").forEach(function(button) { button.classList.toggle("active",button.dataset.preset===name); });
  rebuild();
}
function $(selector) { return document.querySelector(selector); }
function $$(selector) { return Array.from(document.querySelectorAll(selector)); }
function commitPairValue(minRange,maxRange,minNumber,maxNumber,index,rawValue) {
  const range = index === 0 ? minRange : maxRange;
  const field = index === 0 ? minNumber : maxNumber;
  const precision = Number(field.dataset.precision);
  const step = Math.pow(10,precision);
  const fallback = Number(range.value);
  const parsed = Number(rawValue);
  const bounded = clamp(Number.isFinite(parsed) ? parsed : fallback,Number(range.min),Number(range.max));
  const value = Math.round(bounded*step)/step;
  let min = Number(minRange.value);
  let max = Number(maxRange.value);
  if (index === 0) {
    min = value;
    if (min > max) max = min;
  } else {
    max = value;
    if (max < min) min = max;
  }
  minRange.value = min.toFixed(precision);
  maxRange.value = max.toFixed(precision);
  minNumber.value = min.toFixed(precision);
  maxNumber.value = max.toFixed(precision);
  syncSimpleTuningFromAdvanced();
  $$(".preset-chip").forEach(function(button) { button.classList.remove("active"); });
  rebuild();
}
function pairRange(minRange,maxRange,minNumber,maxNumber) {
  minRange.addEventListener("input",function() {
    commitPairValue(minRange,maxRange,minNumber,maxNumber,0,minRange.value);
  });
  maxRange.addEventListener("input",function() {
    commitPairValue(minRange,maxRange,minNumber,maxNumber,1,maxRange.value);
  });
  minNumber.addEventListener("change",function() {
    commitPairValue(minRange,maxRange,minNumber,maxNumber,0,minNumber.value);
  });
  maxNumber.addEventListener("change",function() {
    commitPairValue(minRange,maxRange,minNumber,maxNumber,1,maxNumber.value);
  });
}
function bindControls() {
  pairRange(refs.rateMin,refs.rateMax,refs.rateMinNumber,refs.rateMaxNumber);
  pairRange(refs.delayMin,refs.delayMax,refs.delayMinNumber,refs.delayMaxNumber);
  $$(".step-adjust").forEach(function(button) {
    button.addEventListener("click",function() {
      const field = $("#"+button.dataset.target);
      const precision = Number(field.dataset.precision);
      const scale = Math.pow(10,precision);
      const current = Number(field.value);
      const next = clamp((Number.isFinite(current) ? current : Number(field.min))+Number(button.dataset.delta),Number(field.min),Number(field.max));
      field.value = (Math.round(next*scale)/scale).toFixed(precision);
      field.dispatchEvent(new Event("change",{bubbles:true}));
    });
  });
  refs.duration.addEventListener("input",rebuild);
  refs.seed.addEventListener("change",function() {
    const value = clamp(Math.floor(Number(refs.seed.value)||1),1,4294967295);
    refs.seed.value = String(value);
    rebuild();
  });
  refs.maxParticles.addEventListener("input",function() {
    state.config.maxParticles = clamp(Number(refs.maxParticles.value)||0,0,100000);
  });
  refs.densityTuning.addEventListener("input",applySimpleTuning);
  refs.regularityTuning.addEventListener("input",applySimpleTuning);
  $("#simpleMode").addEventListener("click",function() { setEditMode("simple"); });
  $("#advancedMode").addEventListener("click",function() { setEditMode("advanced"); });
  $("#playButton").addEventListener("click",play);
  $("#restartButton").addEventListener("click",restart);
  $("#regenerateButton").addEventListener("click",function() {
    refs.seed.value = String(randomSeed());
    rebuild();
    updatePlayState("NEW SEED READY");
  });
  $("#rerollOutcomes").addEventListener("click",function() {
    state.outcomes = createOutcomeSeeds(randomSeed()).map(function(seed) { return createSimulation(Object.assign({},state.config,{seed:seed})); });
    renderOutcomes();
  });
  $$(".preset-chip").forEach(function(button) { button.addEventListener("click",function() { setPreset(button.dataset.preset); }); });
  $("#pointMode").addEventListener("click",function() { setMode("point"); });
  $("#streakMode").addEventListener("click",function() { setMode("streak"); });
  window.addEventListener("resize",drawPreview,{passive:true});
  document.addEventListener("visibilitychange",function() { if (document.hidden && state.playing) pause(true); });
}
function setEditMode(mode) {
  state.editMode = mode;
  const advanced = mode === "advanced";
  $("#advancedControls").open = advanced;
  $("#simpleMode").classList.toggle("active",!advanced);
  $("#advancedMode").classList.toggle("active",advanced);
  $("#simpleMode").setAttribute("aria-pressed",String(!advanced));
  $("#advancedMode").setAttribute("aria-pressed",String(advanced));
}
function setMode(mode) {
  state.mode = mode;
  $("#pointMode").classList.toggle("active",mode === "point");
  $("#streakMode").classList.toggle("active",mode === "streak");
  $("#pointMode").setAttribute("aria-pressed",String(mode === "point"));
  $("#streakMode").setAttribute("aria-pressed",String(mode === "streak"));
  $("#previewModeNote").textContent = mode.toUpperCase()+" MODE · 1.4 SEC VISUAL TRAIL";
  drawPreview();
}

bindControls();
syncSimpleTuningFromAdvanced();
rebuild();
