import { useEffect, useMemo, useRef, useState } from "react";
import {
  FishSymbol,
  FolderOpen,
  Download,
  Undo2,
  Redo2,
  Play,
  Pause,
  SkipBack,
  Expand,
  Plus,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { axes, type Vec3 } from "./motion";
import { NumberField, colors } from "./Graph";
import {
  at,
  endpoint,
  pathCopy,
  presetBlend,
  seededWeight,
  validateBlend,
  type BlendDocument,
  type Profile,
} from "./blend";
import { BlendViewport } from "./BlendViewport";
import "./blend.css";
type History = {
  past: BlendDocument[];
  present: BlendDocument;
  future: BlendDocument[];
};
function initial() {
  try {
    const raw = localStorage.getItem("motion-blend-draft");
    if (raw) return validateBlend(JSON.parse(raw));
  } catch {}
  return presetBlend("smoke");
}
export default function BlendStudio({ legacy }: { legacy: () => void }) {
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: initial(),
    future: [],
  }));
  const doc = history.present;
  const [active, setActive] = useState(0),
    [point, setPoint] = useState(1),
    [tab, setTab] = useState<"shape" | "pace" | "curves">("shape"),
    [age, setAge] = useState(0.4),
    [playing, setPlaying] = useState(false),
    [weight, setWeight] = useState(0.5),
    [count, setCount] = useState(12),
    [dots, setDots] = useState(true),
    [fit, setFit] = useState(0),
    [graph, setGraph] = useState<"velocity" | "position" | "speed">("velocity"),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    gesture = useRef<BlendDocument | null>(null),
    hRef = useRef(history);
  hRef.current = history;
  function commit(next: BlendDocument) {
    try {
      next = validateBlend(next);
      setHistory((h) => ({
        past: [...h.past, h.present].slice(-80),
        present: next,
        future: [],
      }));
      setDirty(true);
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function undo() {
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            present: h.past.at(-1)!,
            future: [h.present, ...h.future],
          }
        : h,
    );
    setDirty(true);
  }
  function redo() {
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.present],
            present: h.future[0],
            future: h.future.slice(1),
          }
        : h,
    );
    setDirty(true);
  }
  function begin() {
    gesture.current = structuredClone(hRef.current.present);
  }
  function end(cancel: boolean) {
    const before = gesture.current;
    if (!before) return;
    gesture.current = null;
    setHistory((h) =>
      cancel
        ? { ...h, present: before }
        : {
            past: [...h.past, before].slice(-80),
            present: h.present,
            future: [],
          },
    );
    if (!cancel) setDirty(true);
  }
  function changeProfile(fn: (p: Profile) => void) {
    const next = structuredClone(doc);
    fn(next.profiles[active]);
    commit(next);
  }
  function preparePath() {
    const next = structuredClone(doc);
    next.profiles[active] = pathCopy(next.profiles[active], next.lifetime);
    return next;
  }
  function move(value: Vec3, live = false, index = point) {
    const next = preparePath(),
      p = next.profiles[active],
      i = Math.min(index, p.points.length - 1);
    p.points[i].value = value.map((x, c) =>
      p.scale[c] === 0 ? p.points[i].value[c] : x / p.scale[c],
    ) as Vec3;
    if (live) {
      try {
        validateBlend(next);
        setHistory((h) => ({ ...h, present: next }));
      } catch {}
    } else commit(next);
  }
  useEffect(() => {
    try {
      localStorage.setItem("motion-blend-draft", JSON.stringify(doc));
    } catch {
      setMessage(
        "Browser draft storage is unavailable. Download a document to retain your edits.",
      );
    }
  }, [doc]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!playing) return;
    let id = 0,
      last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setAge((a) => (a + dt / doc.lifetime) % 1);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, doc.lifetime]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const profile = doc.profiles[active],
    path = pathCopy(profile, doc.lifetime),
    selected = Math.min(point, path.points.length - 1),
    pos = path.points[selected].value.map(
      (x, i) => x * profile.scale[i],
    ) as Vec3,
    current = at(doc, age, weight),
    speed = Math.hypot(...current.velocity);
  const samples = useMemo(
    () =>
      Array.from({ length: 161 }, (_, i) => ({
        age: i / 160,
        a: endpoint(doc.profiles[0], i / 160, doc.lifetime),
        b: endpoint(doc.profiles[1], i / 160, doc.lifetime),
        v: at(doc, i / 160, weight),
      })),
    [doc, weight],
  );
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "motion-blend.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDirty(false);
    setMessage("Download started. Browser draft retained.");
  };
  return (
    <div className="blend-app">
      <header className="blend-header">
        <FishSymbol color="#38c1ed" />
        <strong>Motion Editor</strong>
        <span className="blend-doc">
          Two velocity profiles{" "}
          <small>{dirty ? "Modified · browser draft" : "Browser draft"}</small>
        </span>
        <div className="blend-header-actions">
          <button onClick={legacy}>
            <ArrowLeft size={15} />
            Previous editor
          </button>
          <button onClick={() => file.current?.click()}>
            <FolderOpen size={15} />
            Open
          </button>
          <button onClick={download}>
            <Download size={15} />
            Download
          </button>
        </div>
        <input
          hidden
          type="file"
          accept=".json"
          ref={file}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f)
              try {
                if (f.size > 1000000) throw Error("File exceeds 1 MB.");
                commit(validateBlend(JSON.parse(await f.text())));
                setPoint(0);
                setAge(0);
                setPlaying(false);
                setFit((n) => n + 1);
              } catch (err) {
                setMessage((err as Error).message);
              }
            e.target.value = "";
          }}
        />
      </header>
      <div className="blend-workspace">
        <main className="blend-main">
          <nav className="blend-toolbar">
            <div>
              {(["shape", "pace", "curves"] as const).map((t) => (
                <button
                  aria-pressed={tab === t}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t === "shape"
                    ? "Shape"
                    : t === "pace"
                      ? "Pace"
                      : "Velocity curves"}
                </button>
              ))}
            </div>
            <div>
              <button
                aria-label="Undo"
                disabled={!history.past.length}
                onClick={undo}
              >
                <Undo2 size={17} />
              </button>
              <button
                aria-label="Redo"
                disabled={!history.future.length}
                onClick={redo}
              >
                <Redo2 size={17} />
              </button>
              <select
                aria-label="Load example"
                value=""
                onChange={(e) => {
                  commit(presetBlend(e.target.value as "smoke" | "fish"));
                  setPoint(1);
                  setAge(0.4);
                  setPlaying(false);
                  setFit((n) => n + 1);
                }}
              >
                <option value="" disabled>
                  Examples
                </option>
                <option value="smoke">Smoke · rise and slow</option>
                <option value="fish">Fish · varied turns</option>
              </select>
            </div>
          </nav>
          <div
            className={`blend-views ${tab === "curves" ? "curves-focus" : ""}`}
          >
            <section className="blend-spatial">
              <div className="blend-view-heading">
                <strong>3D trajectory</strong>
                <button
                  onClick={() => setFit((n) => n + 1)}
                  aria-label="Fit paths"
                >
                  <Expand size={16} />
                </button>
              </div>
              <BlendViewport
                doc={doc}
                active={active}
                point={selected}
                age={age}
                weight={weight}
                count={count}
                dots={dots}
                fit={fit}
                onSelect={(i) => {
                  if (profile.curves) {
                    const n = preparePath();
                    commit(n);
                    setMessage(
                      "Converted to a smooth editable path using 17 sampled points. Undo restores velocity keys.",
                    );
                  }
                  setPoint(i);
                  setTab("shape");
                }}
                onMove={(v, i) => move(v, true, i)}
                onBegin={begin}
                onEnd={end}
              />
              <div className="blend-spatial-footer">
                <span>
                  <i />
                  Curve 1 <i className="second" />
                  Curve 2 <i className="sample" />
                  Selected blend
                </span>
                <label>
                  <input
                    type="checkbox"
                    checked={dots}
                    onChange={(e) => setDots(e.target.checked)}
                  />
                  Time dots
                </label>
              </div>
            </section>
            <section className="blend-plots">
              <div className="blend-view-heading">
                <strong>
                  {graph === "velocity"
                    ? "Scaled velocity"
                    : graph === "position"
                      ? "Position"
                      : "Actual speed"}
                </strong>
                <select
                  aria-label="Graph quantity"
                  value={graph}
                  onChange={(e) => setGraph(e.target.value as typeof graph)}
                >
                  <option value="velocity">Velocity</option>
                  <option value="position">Position</option>
                  <option value="speed">Speed</option>
                </select>
              </div>
              {(graph === "speed" ? [0] : [0, 1, 2]).map((c) => {
                const val = (
                  s: (typeof samples)[number],
                  k: "a" | "b" | "v",
                ) =>
                  graph === "speed"
                    ? Math.hypot(...s[k].velocity)
                    : s[k][graph][c];
                const vals = samples.flatMap((s) => [
                  val(s, "a"),
                  val(s, "b"),
                  val(s, "v"),
                ]);
                const lo = Math.min(0, ...vals),
                  hi = Math.max(0.01, ...vals),
                  pad = (hi - lo) * 0.12,
                  Y = (v: number) =>
                    154 - ((v - lo + pad) / (hi - lo + 2 * pad)) * 130,
                  X = (a: number) => 48 + a * 500;
                const line = (k: "a" | "b" | "v") =>
                  samples
                    .map(
                      (s, i) => `${i ? "L" : "M"}${X(s.age)},${Y(val(s, k))}`,
                    )
                    .join(" ");
                const fill = `${line("a")} ${samples
                  .slice()
                  .reverse()
                  .map((s) => `L${X(s.age)},${Y(val(s, "b"))}`)
                  .join(" ")} Z`;
                return (
                  <svg
                    key={c}
                    viewBox="0 0 570 186"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`${graph === "speed" ? "Speed" : axes[c].toUpperCase()} ${graph} profiles`}
                    onPointerDown={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setAge(
                        Math.max(
                          0,
                          Math.min(
                            1,
                            (((e.clientX - r.left) / r.width) * 570 - 48) / 500,
                          ),
                        ),
                      );
                    }}
                  >
                    <text
                      x="10"
                      y="20"
                      fill={graph === "speed" ? "#dceaf5" : colors[axes[c]]}
                    >
                      {graph === "speed" ? "|V|" : axes[c].toUpperCase()}
                    </text>
                    {[0, 0.5, 1].map((a) => (
                      <g key={a}>
                        <line
                          x1={X(a)}
                          x2={X(a)}
                          y1="22"
                          y2="154"
                          stroke="#2c3b47"
                        />
                        <text x={X(a)} y="177" textAnchor="middle">
                          {a * 100}%
                        </text>
                      </g>
                    ))}
                    <line
                      x1="48"
                      x2="548"
                      y1={Y(0)}
                      y2={Y(0)}
                      stroke="#597080"
                    />
                    <text x="43" y="30" textAnchor="end">
                      {hi.toFixed(1)}
                    </text>
                    <text x="43" y="150" textAnchor="end">
                      {lo.toFixed(1)}
                    </text>
                    {graph !== "speed" && (
                      <path d={fill} fill={colors[axes[c]]} opacity=".09" />
                    )}
                    <path
                      d={line("a")}
                      fill="none"
                      stroke="#28e1ed"
                      strokeWidth="2"
                    />
                    <path
                      d={line("b")}
                      fill="none"
                      stroke="#ffc654"
                      strokeWidth="2"
                      strokeDasharray="7 5"
                    />
                    <path
                      d={line("v")}
                      fill="none"
                      stroke="#eaf2ff"
                      strokeWidth="1.5"
                      opacity=".8"
                    />
                    <line
                      x1={X(age)}
                      x2={X(age)}
                      y1="22"
                      y2="154"
                      stroke="#b8cede"
                    />
                    <text x="554" y="20" textAnchor="end">
                      {graph === "position" ? "m" : "m/s"}
                    </text>
                  </svg>
                );
              })}
              <div className="blend-graph-note">
                Particle age · solid Curve 1 / dashed Curve 2
              </div>
            </section>
          </div>
          <section className="blend-transport">
            <button
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => setPlaying((v) => !v)}
            >
              {playing ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <button aria-label="Restart" onClick={() => setAge(0)}>
              <SkipBack size={17} />
            </button>
            <strong>
              {(age * doc.lifetime).toFixed(2)} / {doc.lifetime.toFixed(2)} s
            </strong>
            <input
              aria-label="Particle age"
              type="range"
              min="0"
              max="1"
              step=".001"
              value={age}
              onChange={(e) => setAge(+e.target.value)}
            />
            <span>{(age * 100).toFixed(0)}%</span>
          </section>
          <div className="blend-metrics">
            <span>
              Position{" "}
              <strong>
                {current.position.map((x) => x.toFixed(2)).join(", ")}{" "}
                <small>m</small>
              </strong>
            </span>
            <span>
              Speed{" "}
              <strong>
                {speed.toFixed(2)} <small>m/s</small>
              </strong>
            </span>
            <span>
              Velocity{" "}
              <strong>
                {current.velocity.map((x) => x.toFixed(2)).join(", ")}{" "}
                <small>m/s</small>
              </strong>
            </span>
          </div>
        </main>
        <aside className="blend-inspector">
          <h2>Inspector</h2>
          <div className="blend-profile-switch">
            {doc.profiles.map((p, i) => (
              <button
                key={i}
                aria-pressed={active === i}
                onClick={() => {
                  setActive(i);
                  setPoint(0);
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <h3>Velocity scales</h3>
          <div className="blend-xyz">
            {axes.map((a, c) => (
              <label key={a} style={{ color: colors[a] }}>
                {a.toUpperCase()}
                <NumberField
                  label={`Curve ${active + 1} ${a} scale`}
                  value={profile.scale[c]}
                  onCommit={(n) =>
                    changeProfile((p) => {
                      p.scale[c] = n;
                    })
                  }
                />
              </label>
            ))}
          </div>
          {tab === "shape" && (
            <>
              <h3>Path point</h3>
              <select
                aria-label="Selected path point"
                value={selected}
                onChange={(e) => setPoint(+e.target.value)}
              >
                {path.points.map((_, i) => (
                  <option value={i} key={i}>
                    Point {i + 1}
                  </option>
                ))}
              </select>
              <div className="blend-xyz">
                {axes.map((a, c) => (
                  <label key={a} style={{ color: colors[a] }}>
                    {a.toUpperCase()} (m)
                    <NumberField
                      disabled={profile.scale[c] === 0}
                      label={`Point ${a}`}
                      value={pos[c]}
                      onCommit={(n) => {
                        const v = [...pos] as Vec3;
                        v[c] = n;
                        move(v);
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="blend-row">
                Segment style
                <select
                  aria-label="Segment style"
                  value={profile.smooth ? "smooth" : "linear"}
                  onChange={(e) =>
                    changeProfile((p) => {
                      Object.assign(p, pathCopy(p, doc.lifetime));
                      p.smooth = e.target.value === "smooth";
                    })
                  }
                >
                  <option value="smooth">Smooth</option>
                  <option value="linear">Linear</option>
                </select>
              </label>
              <div className="blend-row">
                <button
                  onClick={() => {
                    const n = preparePath(),
                      p = n.profiles[active],
                      i = Math.min(selected, p.points.length - 2),
                      l = p.points[i],
                      r = p.points[i + 1];
                    p.points.splice(i + 1, 0, {
                      age: (l.age + r.age) / 2,
                      value: l.value.map(
                        (v, c) => (v + r.value[c]) / 2,
                      ) as Vec3,
                    });
                    commit(n);
                    setPoint(i + 1);
                  }}
                >
                  <Plus size={14} />
                  Insert point
                </button>
                <button
                  aria-label="Delete path point"
                  disabled={
                    selected === 0 || selected === path.points.length - 1
                  }
                  onClick={() => {
                    const n = preparePath();
                    n.profiles[active].points.splice(selected, 1);
                    commit(n);
                    setPoint(selected - 1);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <p>
                Drag a numbered point directly. Use the drag plane or axis
                handles for precise placement.
              </p>
              {profile.scale.some((x) => x === 0) && (
                <p>
                  A zero scale locks that axis. Change its scale to enable
                  editing.
                </p>
              )}
            </>
          )}
          {tab === "pace" && (
            <>
              <h3>Pace over life</h3>
              <p>
                Redistribute travel time along this profile. Its endpoint stays
                fixed.
              </p>
              {profile.pace.map((v, i) => (
                <label className="blend-row" key={i}>
                  {["Start", "Middle", "End"][i]}
                  <NumberField
                    label={`${["Start", "Middle", "End"][i]} pace`}
                    value={v}
                    onCommit={(n) =>
                      changeProfile((p) => {
                        p.pace[i] = n;
                      })
                    }
                  />
                </label>
              ))}
              <div className="blend-row">
                <button
                  onClick={() =>
                    changeProfile((p) => {
                      p.pace = [1.6, 1, 0.3];
                    })
                  }
                >
                  Rise → slow
                </button>
                <button
                  onClick={() =>
                    changeProfile((p) => {
                      p.pace = [1, 0.4, 1.4];
                    })
                  }
                >
                  Slow → burst
                </button>
              </div>
              <button
                onClick={() =>
                  changeProfile((p) => {
                    p.pace = [1, 1, 1];
                  })
                }
              >
                Even timing
              </button>
            </>
          )}
          {tab === "curves" && (
            <>
              <h3>Velocity profile</h3>
              <p>
                Values below are before signed scale multipliers. Editing
                converts this profile to velocity keys; Undo restores the path.
              </p>
              <VelocityKeys
                profile={profile}
                doc={doc}
                onChange={(p) => {
                  const next = structuredClone(doc);
                  next.profiles[active] = p;
                  commit(next);
                }}
              />
            </>
          )}
          <hr />
          <h3>Selected blend</h3>
          <label className="blend-row">
            Blend weight <strong>{(weight * 100).toFixed(0)}%</strong>
          </label>
          <input
            aria-label="Blend weight"
            type="range"
            min="0"
            max="1"
            step=".01"
            value={weight}
            onChange={(e) => setWeight(+e.target.value)}
          />
          <label className="blend-row">
            Seed
            <NumberField
              label="Random seed"
              value={doc.seed}
              step={1}
              onCommit={(seed) => commit({ ...doc, seed })}
            />
          </label>
          <button onClick={() => setWeight(seededWeight(doc.seed, 0))}>
            Select seeded particle
          </button>
          <label className="blend-row">
            Ghost paths
            <select
              aria-label="Ghost paths"
              value={count}
              onChange={(e) => setCount(+e.target.value)}
            >
              {[0, 8, 12, 24].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="blend-row">
            Lifetime (s)
            <NumberField
              label="Lifetime"
              value={doc.lifetime}
              onCommit={(lifetime) => commit({ ...doc, lifetime })}
            />
          </label>
          <p>One fixed blend per particle · linked XYZ</p>
        </aside>
      </div>
      {message && (
        <div role="status" className="blend-message">
          {message}
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function VelocityKeys({
  profile,
  doc,
  onChange,
}: {
  profile: Profile;
  doc: BlendDocument;
  onChange: (p: Profile) => void;
}) {
  const [axis, setAxis] = useState(0);
  const key = axes[axis];
  const keys =
    profile.curves?.[key] ??
    Array.from({ length: 9 }, (_, i) => ({
      time: i / 8,
      value:
        endpoint(profile, i / 8, doc.lifetime).velocity[axis] /
        (profile.scale[axis] || 1),
    }));
  return (
    <>
      <select
        aria-label="Velocity channel"
        value={axis}
        onChange={(e) => setAxis(+e.target.value)}
      >
        {axes.map((a, i) => (
          <option key={a} value={i}>
            {a.toUpperCase()}
          </option>
        ))}
      </select>
      <div className="blend-key-list">
        {keys.map((k, i) => (
          <label className="blend-row" key={`${key}-${i}`}>
            <span>{(k.time * 100).toFixed(0)}%</span>
            <NumberField
              label={`${key} velocity at ${(k.time * 100).toFixed(0)} percent`}
              value={k.value}
              onCommit={(value) => {
                let p = structuredClone(profile);
                if (!p.curves) {
                  const curves = {} as NonNullable<Profile["curves"]>;
                  axes.forEach((a, c) => {
                    curves[a] = Array.from({ length: 9 }, (_, j) => ({
                      time: j / 8,
                      value:
                        endpoint(profile, j / 8, doc.lifetime).velocity[c] /
                        (profile.scale[c] || 1),
                    }));
                  });
                  p = { ...p, curves, pace: [1, 1, 1] };
                }
                p.curves![key][i].value = value;
                onChange(p);
              }}
            />
          </label>
        ))}
      </div>
    </>
  );
}
