import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FishSymbol,
  FolderOpen,
  Save,
  Download,
  ChevronDown,
  Plus,
  Trash2,
  RotateCcw,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Box,
  ChartSpline,
  Activity,
  HelpCircle,
  X,
  Check,
  FileJson,
  Settings2,
  ArrowUpRight,
  Move3D,
  PanelRightClose,
  PanelRightOpen,
  LayoutDashboard,
} from "lucide-react";
import {
  axes,
  position,
  velocity,
  evaluate,
  distanceEvaluator,
  length,
  resizeLifetime,
  validateMotion,
  serialize,
  deserialize,
  clamp,
  sampleMotion,
  type Motion,
  type Axis,
} from "./motion";
import { preset, presetNames } from "./presets";
import { Graph, NumberField, colors, type Selection } from "./Graph";
import { Viewport } from "./Viewport";
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [motion, setMotion] = useState<Motion>(() =>
      preset("Fish Swim / Detour"),
    ),
    [time, setTime] = useState(2),
    [playing, setPlaying] = useState(false),
    [rate, setRate] = useState(1),
    [name, setName] = useState("Fish Swim / Detour"),
    [modified, setModified] = useState(false);
  const [visible, setVisible] = useState({ x: true, y: true, z: true }),
    [selection, setSelection] = useState<Selection>({ axis: "x", index: 4 }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState<"json" | "help" | "presets" | null>(null),
    [json, setJson] = useState("");
  const [layout, setLayout] = useState<"overview" | "velocity" | "position">(
    "overview",
  );
  const [inspectorTab, setInspectorTab] = useState<"key" | "scene" | "motion">(
    "key",
  );
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [editingObstacle, setEditingObstacle] = useState(false);
  const [obstacleHost, setObstacleHost] = useState<HTMLDivElement | null>(null);
  const handleObstacleEditing = useCallback((active: boolean) => {
    setEditingObstacle(active);
    if (active) {
      setInspectorTab("scene");
      setInspectorOpen(true);
    }
  }, []);
  function selectKey(value: Selection) {
    setSelection(value);
    setInspectorTab("key");
    setInspectorOpen(true);
    setEditingObstacle(false);
  }
  const file = useRef<HTMLInputElement>(null),
    samples = useMemo(
      () => sampleMotion(motion),
      [motion.curves, motion.lifetime, motion.timeSource, motion.spawnTime],
    ),
    factor = motion.units === "cm" ? 100 : 1;
  const distanceAt = useMemo(
    () => distanceEvaluator(motion),
    [motion.curves, motion.lifetime, motion.timeSource, motion.spawnTime],
  );
  const pos = position(motion, time),
    vel = velocity(motion, time),
    traveled = distanceAt(time);
  const selectedIndex = Math.min(
      selection.index,
      motion.curves[selection.axis].length - 1,
    ),
    key = motion.curves[selection.axis][selectedIndex];
  const change = useCallback((next: Motion) => {
    try {
      setMotion(validateMotion(next));
      setModified(true);
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, []);
  function changeObstacle(obstacle: Motion["obstacle"]) {
    try {
      const next = validateMotion({ ...motion, obstacle });
      // Preserve motion inputs while a spatial guide is being manipulated.
      setMotion((current) => ({ ...current, obstacle: next.obstacle }));
      setModified(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!playing) return;
    let raf = 0,
      last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const next = t + dt * rate;
        if (next >= motion.lifetime) {
          setPlaying(false);
          return motion.lifetime;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, motion.lifetime]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  function editKey(axis: Axis, index: number, t: number, value: number) {
    const curves = {
      ...motion.curves,
      [axis]: motion.curves[axis].map((k, i) =>
        i === index ? { time: t, value } : k,
      ),
    };
    change({ ...motion, curves });
  }
  function loadPreset(n: string) {
    setMotion(preset(n));
    setName(n);
    setModified(false);
    setSelection({ axis: "x", index: 0 });
    setTime(0);
    setPlaying(false);
    setError("");
  }
  function addKey() {
    const a = selection.axis,
      keys = motion.curves[a];
    let t = time;
    if (keys.some((k) => Math.abs(k.time - t) < 1e-6)) {
      let gap = 0;
      for (let i = 1; i < keys.length; i++)
        if (keys[i].time - keys[i - 1].time > gap) {
          gap = keys[i].time - keys[i - 1].time;
          t = (keys[i].time + keys[i - 1].time) / 2;
        }
      if (gap === 0) {
        t = keys[0].time === 0 ? motion.lifetime : 0;
      }
    }
    const next = [...keys, { time: t, value: evaluate(keys, t) }].sort(
      (a, b) => a.time - b.time,
    );
    if (change({ ...motion, curves: { ...motion.curves, [a]: next } }))
      setSelection({ axis: a, index: next.findIndex((k) => k.time === t) });
  }
  function deleteKey() {
    const a = selection.axis;
    if (motion.curves[a].length === 1) {
      setError("Keep at least one key. Use Reset channel to set it to zero.");
      return;
    }
    if (
      change({
        ...motion,
        curves: {
          ...motion.curves,
          [a]: motion.curves[a].filter((_, i) => i !== selectedIndex),
        },
      })
    )
      setSelection({ axis: a, index: Math.max(0, selectedIndex - 1) });
  }
  function download() {
    const blob = new Blob([serialize(motion)], { type: "application/json" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "vfx-motion.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Download started: vfx-motion.json");
  }
  function importJson(value: string) {
    try {
      const next = deserialize(value);
      setMotion(next);
      setName("Imported motion");
      setModified(false);
      setTime(0);
      setPlaying(false);
      setSelection({ axis: "x", index: 0 });
      setError("");
      setModal(null);
      setNotice("Motion imported");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function duration(n: number) {
    try {
      const next = resizeLifetime(motion, n);
      change(next);
      setTime((t) => clamp(t, 0, n));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const toggle = (a: Axis) => setVisible((v) => ({ ...v, [a]: !v[a] }));
  return (
    <div
      className={`app-shell studio-shell layout-${layout} ${inspectorOpen ? "" : "inspector-collapsed"}`}
    >
      <header className="app-header">
        <div className="brand-mark">
          <FishSymbol size={31} />
        </div>
        <div className="brand">
          <h1>Motion Editor</h1>
          <span>Velocity authoring</span>
        </div>
        <div className="document-identity">
          <strong>{name}</strong>
          <span className={modified ? "is-modified" : ""}>
            {modified
              ? "Modified · not saved"
              : name === "Imported motion"
                ? "Imported document"
                : "Preset document"}
          </span>
        </div>
        <div className="header-actions">
          <button onClick={() => file.current?.click()}>
            <FolderOpen size={17} />
            Open
          </button>
          <button onClick={download}>
            <Download size={17} />
            Download
          </button>
          <span className="header-divider" />
          <button
            className="export-button"
            onClick={() => {
              setJson(serialize(motion));
              setModal("json");
            }}
          >
            <Download size={16} />
            JSON
          </button>
          <button
            className="help-button"
            title="Help and conventions"
            aria-label="Help and conventions"
            onClick={() => setModal("help")}
          >
            <HelpCircle size={20} />
          </button>
        </div>
        <input
          ref={file}
          type="file"
          hidden
          accept=".json,application/json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              if (f.size > 1000000)
                setError("Motion file must be smaller than 1 MB.");
              else importJson(await f.text());
            }
            e.target.value = "";
          }}
        />
      </header>
      <main className="workspace">
        <aside className="sidebar studio-inspector" aria-label="Inspector">
          <div className="inspector-heading">
            <h2>Inspector</h2>
            <button
              aria-label="Hide inspector"
              onClick={() => setInspectorOpen(false)}
            >
              <PanelRightClose size={17} />
            </button>
          </div>
          <div
            className="inspector-tabs"
            role="tablist"
            aria-label="Inspector sections"
          >
            {(["key", "scene", "motion"] as const).map((tab) => (
              <button
                key={tab}
                id={`inspector-tab-${tab}`}
                role="tab"
                tabIndex={inspectorTab === tab ? 0 : -1}
                aria-selected={inspectorTab === tab}
                aria-controls={`inspector-pane-${tab}`}
                onClick={() => setInspectorTab(tab)}
                onKeyDown={(event) => {
                  const tabs = ["key", "scene", "motion"] as const;
                  const index = tabs.indexOf(tab);
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % 3
                      : event.key === "ArrowLeft"
                        ? (index + 2) % 3
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? 2
                            : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  setInspectorTab(tabs[next]);
                  document
                    .getElementById(`inspector-tab-${tabs[next]}`)
                    ?.focus();
                }}
              >
                {tab === "key"
                  ? "Selection"
                  : tab === "scene"
                    ? "Scene"
                    : "Motion"}
              </button>
            ))}
          </div>
          <div
            className="inspector-pane"
            role="tabpanel"
            id="inspector-pane-key"
            aria-labelledby="inspector-tab-key"
            hidden={inspectorTab !== "key"}
          >
            <section className="panel curve-section">
              <div className="section-title">
                <h2>
                  <ChartSpline size={16} />
                  Velocity keys
                </h2>
                <span className="tiny-label">VELOCITY</span>
              </div>
              <div className="section-content">
                <div className="channel-list">
                  {axes.map((a) => (
                    <div
                      className={`channel-row ${selection.axis === a ? "selected" : ""}`}
                      key={a}
                    >
                      <label style={{ color: colors[a] }}>
                        <input
                          type="checkbox"
                          checked={visible[a]}
                          onChange={() => toggle(a)}
                          style={{ accentColor: colors[a] }}
                        />
                        {a.toUpperCase()}
                        <i style={{ background: colors[a] }} />
                      </label>
                      <button
                        onClick={() => selectKey({ axis: a, index: 0 })}
                        className="channel-edit"
                        aria-label={`Edit ${a.toUpperCase()} channel`}
                      >
                        {motion.curves[a].length} keys
                        <Settings2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="key-inspector">
                  <div className="inspector-label">
                    <span style={{ color: colors[selection.axis] }}>
                      {selection.axis.toUpperCase()} CHANNEL
                    </span>
                    <select
                      aria-label="Selected keyframe"
                      value={selectedIndex}
                      onChange={(e) =>
                        setSelection({
                          ...selection,
                          index: Number(e.target.value),
                        })
                      }
                    >
                      {motion.curves[selection.axis].map((_, i) => (
                        <option key={i} value={i}>
                          Key {String(i + 1).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="key-inputs">
                    <label>
                      Time (s)
                      <NumberField
                        value={key.time}
                        label="Selected key time"
                        onCommit={(t) =>
                          editKey(selection.axis, selectedIndex, t, key.value)
                        }
                      />
                    </label>
                    <label>
                      Velocity ({motion.units}/s)
                      <NumberField
                        value={key.value * factor}
                        label="Selected key velocity"
                        onCommit={(v) =>
                          editKey(
                            selection.axis,
                            selectedIndex,
                            key.time,
                            v / factor,
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
                <div className="key-actions">
                  <button onClick={addKey}>
                    <Plus size={16} />
                    Add key
                  </button>
                  <button
                    aria-label="Reset selected channel to zero"
                    title="Reset channel to zero"
                    onClick={() => {
                      change({
                        ...motion,
                        curves: {
                          ...motion.curves,
                          [selection.axis]: [{ time: 0, value: 0 }],
                        },
                      });
                      setSelection({ ...selection, index: 0 });
                    }}
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    aria-label="Delete selected key"
                    title="Delete selected key"
                    onClick={deleteKey}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </section>

            <div className="selection-summary">
              <span>Selected key</span>
              <strong style={{ color: colors[selection.axis] }}>
                {selection.axis.toUpperCase()} /{" "}
                {String(selectedIndex + 1).padStart(2, "0")}
              </strong>
              <p>
                Drag a key in Velocity, or enter its exact time and value above.
              </p>
            </div>
          </div>
          <div
            className="inspector-pane"
            role="tabpanel"
            id="inspector-pane-scene"
            aria-labelledby="inspector-tab-scene"
            hidden={inspectorTab !== "scene"}
          >
            {" "}
            <section className="panel obstacle-settings">
              <div className="section-title">
                <h2>
                  <Box size={15} />
                  Obstacle guide
                </h2>
              </div>
              <div className="section-content">
                <label className="guide-check">
                  <input
                    type="checkbox"
                    checked={motion.obstacle.visible}
                    onChange={(e) =>
                      changeObstacle({
                        ...motion.obstacle,
                        visible: e.target.checked,
                      })
                    }
                  />
                  Show guide
                </label>
                {!editingObstacle && (
                  <button
                    className="edit-scene-action"
                    onClick={() => {
                      changeObstacle({ ...motion.obstacle, visible: true });
                      handleObstacleEditing(true);
                    }}
                  >
                    <Move3D size={16} />
                    Edit in viewport
                  </button>
                )}
                <div ref={setObstacleHost} />
                {!editingObstacle &&
                  (["position", "size"] as const).map((prop) => (
                    <div className="obstacle-fields" key={prop}>
                      <span>
                        {prop === "size" ? "Dimensions" : "Position"} (
                        {motion.units})
                      </span>
                      <div>
                        {axes.map((a, i) => (
                          <label key={a} style={{ color: colors[a] }}>
                            {a.toUpperCase()}
                            <NumberField
                              value={motion.obstacle[prop][i] * factor}
                              label={`Obstacle ${prop} ${a}`}
                              onCommit={(n) => {
                                const next = structuredClone(motion.obstacle);
                                next[prop][i] = n / factor;
                                changeObstacle(next);
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </div>
          <div
            className="inspector-pane"
            role="tabpanel"
            id="inspector-pane-motion"
            aria-labelledby="inspector-tab-motion"
            hidden={inspectorTab !== "motion"}
          >
            {" "}
            <section className="panel">
              <div className="section-title">
                <h2>
                  <Settings2 size={15} />
                  Motion Setup
                </h2>
              </div>
              <div className="section-content">
                <label className="field-label">
                  Time source{" "}
                  <span title="Particle: age since spawn. Emitter: global emitter clock, integrated from the representative spawn time.">
                    ⓘ
                  </span>
                </label>
                <div className="segmented time-source">
                  <button
                    className={motion.timeSource === "particle" ? "active" : ""}
                    onClick={() =>
                      change({ ...motion, timeSource: "particle" })
                    }
                  >
                    Particle lifetime
                  </button>
                  <button
                    className={motion.timeSource === "emitter" ? "active" : ""}
                    onClick={() => change({ ...motion, timeSource: "emitter" })}
                  >
                    Emitter lifetime
                  </button>
                </div>
                <label className="setting-row">
                  <span>
                    {motion.timeSource === "particle"
                      ? "Lifetime"
                      : "Emitter duration"}
                  </span>
                  <div className="input-unit">
                    <NumberField
                      value={motion.lifetime}
                      label="Lifetime seconds"
                      onCommit={duration}
                    />
                    <span>s</span>
                  </div>
                </label>
                <label
                  className={`setting-row ${motion.timeSource === "particle" ? "disabled" : ""}`}
                >
                  <span>Spawn time</span>
                  <div className="input-unit">
                    <NumberField
                      value={motion.spawnTime}
                      label="Particle spawn time"
                      disabled={motion.timeSource === "particle"}
                      onCommit={(spawnTime) => change({ ...motion, spawnTime })}
                    />
                    <span>s</span>
                  </div>
                </label>
                <div className="setting-divider" />
                <label className="setting-row">
                  <span>Coordinate space</span>
                  <select
                    aria-label="Coordinate space"
                    value={motion.coordinateSpace}
                    onChange={(e) =>
                      change({
                        ...motion,
                        coordinateSpace: e.target
                          .value as Motion["coordinateSpace"],
                      })
                    }
                  >
                    <option value="local">Local (emitter)</option>
                    <option value="world">World</option>
                  </select>
                </label>
                <label className="setting-row">
                  <span>Display units</span>
                  <select
                    aria-label="Display units"
                    value={motion.units}
                    onChange={(e) =>
                      change({
                        ...motion,
                        units: e.target.value as Motion["units"],
                      })
                    }
                  >
                    <option value="m">Meters (m)</option>
                    <option value="cm">Centimeters (cm)</option>
                  </select>
                </label>
              </div>
            </section>
            <p className="inspector-note">
              Duration changes scale key times while preserving velocity values.
            </p>
          </div>
        </aside>
        <div className="main-area">
          <div className="workspace-toolbar">
            <div
              className="workspace-layouts"
              role="group"
              aria-label="Workspace layout"
            >
              {(["overview", "velocity", "position"] as const).map((mode) => (
                <button
                  key={mode}
                  aria-pressed={layout === mode}
                  onClick={() => setLayout(mode)}
                >
                  {mode === "overview" ? (
                    <LayoutDashboard size={16} />
                  ) : (
                    <ChartSpline size={16} />
                  )}{" "}
                  {mode === "overview"
                    ? "Overview"
                    : mode === "velocity"
                      ? "Velocity"
                      : "Position"}
                </button>
              ))}
            </div>
            <div className="workspace-actions">
              <button onClick={() => setModal("presets")}>
                <Activity size={15} />
                Presets
              </button>
              <button
                aria-label={inspectorOpen ? "Hide inspector" : "Show inspector"}
                onClick={() => setInspectorOpen((v) => !v)}
              >
                {inspectorOpen ? (
                  <PanelRightClose size={17} />
                ) : (
                  <PanelRightOpen size={17} />
                )}
              </button>
            </div>
          </div>
          <div className="visualization-grid">
            <Viewport
              motion={motion}
              samples={samples}
              time={time}
              onObstacle={() =>
                changeObstacle({
                  ...motion.obstacle,
                  visible: !motion.obstacle.visible,
                })
              }
              onObstacleChange={changeObstacle}
              editing={editingObstacle}
              onEditingChange={handleObstacleEditing}
              editorContainer={obstacleHost}
            />
            <div className="graphs">
              {(["velocity", "position"] as const).map((kind) => (
                <Graph
                  key={kind}
                  kind={kind}
                  motion={motion}
                  samples={samples}
                  time={time}
                  visible={visible}
                  selection={{ axis: selection.axis, index: selectedIndex }}
                  onSelect={selectKey}
                  focused={layout === kind}
                  onFocusView={() =>
                    setLayout(layout === kind ? "overview" : kind)
                  }
                  onKey={editKey}
                  onScrub={(t) => {
                    setPlaying(false);
                    setTime(t);
                  }}
                  onToggle={toggle}
                />
              ))}
            </div>
          </div>
          <section className="panel timeline">
            <div className="transport">
              <div className="transport-buttons">
                <button
                  className={`play-button ${playing ? "playing" : ""}`}
                  aria-label={playing ? "Pause" : "Play"}
                  onClick={() => {
                    if (time >= motion.lifetime) setTime(0);
                    setPlaying((v) => !v);
                  }}
                >
                  {playing ? (
                    <Pause size={20} fill="currentColor" />
                  ) : (
                    <Play size={20} fill="currentColor" />
                  )}
                </button>
                <button
                  aria-label="Stop and reset"
                  onClick={() => {
                    setPlaying(false);
                    setTime(0);
                  }}
                >
                  <Square size={15} fill="currentColor" />
                </button>
                <button
                  aria-label="Go to start"
                  onClick={() => {
                    setTime(0);
                    setPlaying(false);
                  }}
                >
                  <SkipBack size={17} />
                </button>
                <button
                  aria-label="Go to end"
                  onClick={() => {
                    setTime(motion.lifetime);
                    setPlaying(false);
                  }}
                >
                  <SkipForward size={17} />
                </button>
              </div>
              <div className="time-readout">
                <strong>{time.toFixed(2)}</strong>
                <span>/ {motion.lifetime.toFixed(2)} s</span>
              </div>
              <input
                className="timeline-slider"
                aria-label="Timeline seconds"
                type="range"
                min="0"
                max={motion.lifetime}
                step="0.001"
                value={time}
                onChange={(e) => {
                  setPlaying(false);
                  setTime(Number(e.target.value));
                }}
                style={
                  {
                    "--progress": `${(time / motion.lifetime) * 100}%`,
                  } as React.CSSProperties
                }
              />
              <select
                className="rate-select"
                aria-label="Playback speed"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              >
                {[0.25, 0.5, 1, 1.5, 2].map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </div>
            <div className="measurements">
              <div className="measurement current-position">
                <span>
                  Position <small>X, Y, Z</small>
                </span>
                <strong>
                  {pos.map((n, i) => (
                    <span style={{ color: colors[axes[i]] }} key={i}>
                      {(n * factor).toFixed(2)}
                      {i < 2 && <em>, </em>}
                    </span>
                  ))}
                  <small>{motion.units}</small>
                </strong>
              </div>
              <div className="measurement">
                <span>
                  Displacement <small>|P − P₀|</small>
                </span>
                <strong>
                  {(length(pos) * factor).toFixed(2)}
                  <small>{motion.units}</small>
                </strong>
              </div>
              <div className="measurement">
                <span>
                  Distance traveled <small>∫ |V| dt</small>
                </span>
                <strong>
                  {(traveled * factor).toFixed(2)}
                  <small>{motion.units}</small>
                </strong>
              </div>
              <div className="measurement">
                <span>
                  Speed <small>|V|</small>
                </span>
                <strong>
                  {(length(vel) * factor).toFixed(2)}
                  <small>{motion.units}/s</small>
                </strong>
              </div>
            </div>
          </section>
          <div className="workspace-footnote">
            <span>
              <span className="live-dot" />
              All views synchronized
            </span>
            <span>
              Origin (0, 0, 0)
              <i />
              Linear velocity · Integrated position
            </span>
            <span>t / T = {(time / motion.lifetime).toFixed(3)}</span>
          </div>
        </div>
      </main>
      {error && !modal && (
        <div className="toast error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast success" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {modal === "presets" && (
        <Modal title="Start from a preset" onClose={() => setModal(null)}>
          <p className="modal-description">
            Choose a velocity study to explore.
          </p>{" "}
          <section className="panel presets-section">
            <div className="section-title">
              <h2>
                <Activity size={15} />
                Presets
              </h2>
              <ChevronDown size={14} />
            </div>
            <div className="preset-list">
              {presetNames.map((n, i) => (
                <button
                  key={n}
                  className={n === name ? "chosen" : ""}
                  onClick={() => {
                    loadPreset(n);
                    setModal(null);
                  }}
                >
                  <span className="preset-symbol">
                    {i === 0 ? (
                      <FishSymbol size={16} />
                    ) : i === 1 ? (
                      <ArrowUpRight size={16} />
                    ) : i === 2 ? (
                      <Activity size={16} />
                    ) : (
                      <ChartSpline size={16} />
                    )}
                  </span>
                  {n}
                  {n === name && <Check size={14} />}
                </button>
              ))}
            </div>
            <div className="preset-bottom">
              <button
                onClick={() => {
                  setJson(serialize(motion));
                  setModal("json");
                }}
              >
                <FileJson size={15} />
                Import / Export JSON
              </button>
            </div>
          </section>
          {modified && (
            <p className="inspector-note">
              Choosing a preset replaces the current motion. Download your
              changes first if you want to keep them.
            </p>
          )}
        </Modal>
      )}
      {modal === "json" && (
        <Modal title="Motion JSON" onClose={() => setModal(null)}>
          <p className="modal-description">
            Schema v1 · Velocity keys and scene settings
          </p>
          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}
          <textarea
            aria-label="Motion JSON"
            spellCheck={false}
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
          <div className="modal-actions">
            <button onClick={() => file.current?.click()}>
              <FolderOpen size={15} />
              Open file
            </button>
            <button onClick={() => importJson(json)}>Import JSON</button>
            <button className="primary" onClick={download}>
              <Download size={15} />
              Download JSON
            </button>
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="Working with motion" onClose={() => setModal(null)}>
          <div className="help-content">
            <p>
              Drag a velocity key to edit its time and value. Select a channel
              to add keys or enter exact values in the inspector. Arrow up/down
              adjusts a focused key by 0.1 m/s.
            </p>
            <p>
              Position is the analytic integral of linear velocity. Distance
              integrates the magnitude of velocity; displacement measures the
              straight line from the emitter origin.
            </p>
            <p>
              <b>Particle lifetime:</b> the clock starts at spawn.{" "}
              <b>Emitter lifetime:</b> the clock is emitter time, and the
              representative particle begins moving at its spawn time. Before
              spawn it stays at the origin. Playback ends at the emitter
              duration.
            </p>
            <p>
              Changing duration scales every key time and the spawn time
              proportionally, preserving velocity values. Values before the
              first key and after the last key hold constant within the
              duration.
            </p>
            <p>
              All calculations use meters and seconds. Display units convert
              values only. Local and world spaces coincide because the emitter
              has a fixed origin and orientation. The obstacle is a visual
              guide.
            </p>
            <p>
              Orbit by dragging, pan with right-drag, and zoom with the wheel.
              Use Fit to frame the trajectory. Nothing is stored remotely;
              download JSON to keep your work.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default App;
