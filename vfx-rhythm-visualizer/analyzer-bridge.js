(function() {
  const params = new URLSearchParams(window.location.search);
  const referenceId = params.get("reference");
  if (!referenceId) return;

  const button = document.getElementById("saveReferenceRhythm");
  const backLink = document.getElementById("libraryBackLink");
  if (backLink) backLink.href = "./?reference=" + encodeURIComponent(referenceId);
  if (button) button.hidden = false;

  const open = indexedDB.open("vfx-pattern-library", 2);
  open.onerror = function() {
    if (button) button.textContent = "Library unavailable";
  };
  open.onsuccess = function() {
    const db = open.result;
    if (!db.objectStoreNames.contains("references")) {
      if (button) button.textContent = "Reference not found";
      return;
    }
    const request = db.transaction("references", "readonly").objectStore("references").get(referenceId);
    request.onsuccess = function() {
      const reference = request.result;
      if (!reference) {
        if (button) button.textContent = "Reference not found";
        return;
      }
      if (window.VFXAnalyzer && typeof window.VFXAnalyzer.loadReference === "function") window.VFXAnalyzer.loadReference(reference);
      document.title = (reference.title || "Reference") + " · Rhythm Analyzer";
      if (button) button.addEventListener("click", function() { saveCurve(db, referenceId, button); });
    };
  };

  function derive(points) {
    const peak = points.reduce(function(best, point) { return point.v > best.v ? point : best; }, points[0] || {t:0,v:0.1});
    const max = Math.max(0.01, peak.v);
    const peaks = [];
    for (let i=1; i<points.length-1; i++) {
      const a=points[i-1], p=points[i], b=points[i+1];
      if (p.v>a.v && p.v>=b.v && p.v>0.22) peaks.push(p);
    }
    const fall = points.find(function(point) { return point.t>peak.t && point.v<max*0.22; });
    let spacing = "";
    if (peaks.length === 2) spacing = "Asymmetric";
    else if (peaks.length > 2) {
      const gaps = peaks.slice(1).map(function(point,index) { return point.t-peaks[index].t; });
      const avg = gaps.reduce(function(a,b) { return a+b; },0)/gaps.length;
      const variance = gaps.reduce(function(a,b) { return a+(b-avg)*(b-avg); },0)/gaps.length;
      spacing = Math.sqrt(variance)<0.035 ? "Even" : "Uneven";
    }
    return {
      climaxPosition:Math.round(peak.t*100),
      peakCount:Math.max(1,peaks.length),
      attackType:peak.t<0.56 ? "Fast" : peak.t<0.82 ? "Measured" : "Slow",
      decayType:!fall || fall.t-peak.t>0.38 ? "Long" : fall.t-peak.t>0.18 ? "Medium" : "Short",
      spacingType:spacing
    };
  }
  function saveCurve(db, id, saveButton) {
    if (!window.VFXAnalyzer || typeof window.VFXAnalyzer.getPoints !== "function") return;
    const points = window.VFXAnalyzer.getPoints().filter(function(point) { return Number.isFinite(point.t) && Number.isFinite(point.v); }).sort(function(a,b) { return a.t-b.t; });
    if (points.length < 2) return;
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    const tx = db.transaction("references","readwrite");
    const store = tx.objectStore("references");
    const get = store.get(id);
    get.onsuccess = function() {
      const reference = get.result;
      if (!reference) { saveButton.textContent = "Reference not found"; return; }
      reference.rhythmCurve = points;
      Object.assign(reference,derive(points));
      reference.updatedAt = new Date().toISOString();
      store.put(reference);
    };
    tx.oncomplete = function() {
      saveButton.textContent = "Rhythm saved";
      saveButton.disabled = false;
      window.setTimeout(function() { saveButton.textContent = "Save rhythm"; },1700);
    };
    tx.onerror = function() {
      saveButton.textContent = "Save failed";
      saveButton.disabled = false;
    };
  }
})();
