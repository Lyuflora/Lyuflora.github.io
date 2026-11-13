import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChartSpline,
  Table2,
  LockKeyhole,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  axes,
  clamp,
  position,
  evaluate,
  type Axis,
  type Motion,
  type Vec3,
} from "./motion";
export const colors: Record<Axis, string> = {
  x: "#28e1ed",
  y: "#ffc654",
  z: "#c47bff",
};
export type Sample = { time: number; position: Vec3; velocity: Vec3 };
export type Selection = { axis: Axis; index: number };
export function NumberField({
  value,
  onCommit,
  label,
  step = 0.1,
  disabled = false,
}: {
  value: number;
  onCommit: (n: number) => void;
  label: string;
  step?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      aria-label={label}
      title={label}
      step={step}
      disabled={disabled}
      value={draft ?? Number(value.toFixed(5))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        if (draft !== null) {
          onCommit(e.target.value.trim() === "" ? NaN : Number(e.target.value));
          setDraft(null);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
type Props = {
  motion: Motion;
  samples: Sample[];
  time: number;
  kind: "velocity" | "position";
  visible: Record<Axis, boolean>;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onKey: (a: Axis, i: number, t: number, v: number) => void;
  onScrub: (t: number) => void;
  onToggle: (a: Axis) => void;
  focused: boolean;
  onFocusView: () => void;
};
export function Graph(p: Props) {
  const [table, setTable] = useState(false),
    svg = useRef<SVGSVGElement>(null),
    drag = useRef<Selection | null>(null);
  const [size, setSize] = useState({ width: 600, height: 233 });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({
        width: Math.max(280, rect.width),
        height: Math.max(160, rect.height),
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [table]);
  const W = size.width,
    H = size.height,
    L = 50,
    R = 20,
    T = 25,
    B = 34,
    factor = p.motion.units === "cm" ? 100 : 1;
  const [frozenRange, setFrozenRange] = useState<{
    low: number;
    high: number;
    ticks: number[];
  } | null>(null);
  const range = useMemo(() => {
    const vals = p.samples.flatMap((s) =>
      axes.flatMap((a, i) => (p.visible[a] ? [s[p.kind][i] * factor] : [])),
    );
    let low = Math.min(0, ...vals),
      high = Math.max(0, ...vals);
    const span = Math.max(high - low, 2 * factor),
      step = 10 ** Math.floor(Math.log10(span / 5));
    const inc = [1, 2, 5, 10].map((n) => n * step).find((n) => n >= span / 5)!;
    low = Math.floor((low - span * 0.12) / inc) * inc;
    high = Math.ceil((high + span * 0.12) / inc) * inc;
    return {
      low,
      high,
      ticks: Array.from(
        { length: Math.round((high - low) / inc) + 1 },
        (_, i) => low + i * inc,
      ),
    };
  }, [p.samples, p.kind, p.visible, factor]);
  const { low, high, ticks } = frozenRange ?? range;
  const px = (t: number) => L + (t / p.motion.lifetime) * (W - L - R),
    py = (v: number) => T + ((high - v * factor) / (high - low)) * (H - T - B);
  function point(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * W) / rect.width,
      y = ((e.clientY - rect.top) * H) / rect.height;
    return {
      time: clamp(
        ((x - L) / (W - L - R)) * p.motion.lifetime,
        0,
        p.motion.lifetime,
      ),
      value: (high - ((y - T) / (H - T - B)) * (high - low)) / factor,
    };
  }
  const current =
    p.kind === "velocity"
      ? axes.map((a) => evaluate(p.motion.curves[a], p.time))
      : position(p.motion, p.time);
  return (
    <section className={`panel graph-panel graph-${p.kind}`}>
      <div className="panel-heading">
        <h2>
          {p.kind === "velocity" ? "Velocity" : "Position"}{" "}
          <span>{p.kind === "velocity" ? "Editable" : "Derived"}</span>
        </h2>
        <div className="graph-heading-actions">
          <div className="segmented view-switch">
            <button
              title="Curve view"
              aria-label={`${p.kind} curve view`}
              className={!table ? "active" : ""}
              onClick={() => setTable(false)}
            >
              <ChartSpline size={17} />
            </button>
            <button
              title="Keyframe table"
              aria-label={`${p.kind} table view`}
              className={table ? "active" : ""}
              onClick={() => setTable(true)}
            >
              <Table2 size={16} />
            </button>
          </div>
          <button
            className="focus-graph"
            aria-label={`${p.focused ? "Restore overview from" : "Focus"} ${p.kind} graph`}
            onClick={p.onFocusView}
          >
            {p.focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
      {table ? (
        <div className="graph-table">
          <table>
            <thead>
              <tr>
                <th>Time (s)</th>
                {axes.map((a) => (
                  <th style={{ color: colors[a] }} key={a}>
                    {a.toUpperCase()} ({p.motion.units}
                    {p.kind === "velocity" ? "/s" : ""})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.kind === "velocity"
                ? Array.from(
                    {
                      length: Math.max(
                        ...axes.map((a) => p.motion.curves[a].length),
                      ),
                    },
                    (_, i) => (
                      <tr key={i}>
                        <td>Key {String(i + 1).padStart(2, "0")}</td>
                        {axes.map((a) => (
                          <td key={a}>
                            {p.motion.curves[a][i] ? (
                              <div className="table-pair">
                                <NumberField
                                  label={`${a} key ${i + 1} time`}
                                  value={p.motion.curves[a][i].time}
                                  onCommit={(t) =>
                                    p.onKey(
                                      a,
                                      i,
                                      t,
                                      p.motion.curves[a][i].value,
                                    )
                                  }
                                />
                                <NumberField
                                  label={`${a} key ${i + 1} velocity`}
                                  value={p.motion.curves[a][i].value * factor}
                                  onCommit={(v) =>
                                    p.onKey(
                                      a,
                                      i,
                                      p.motion.curves[a][i].time,
                                      v / factor,
                                    )
                                  }
                                />
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                        ))}
                      </tr>
                    ),
                  )
                : p.samples
                    .filter((_, i) => i % 15 === 0)
                    .map((s) => (
                      <tr key={s.time}>
                        <td>{s.time.toFixed(2)}</td>
                        {s.position.map((v, i) => (
                          <td key={i}>{(v * factor).toFixed(3)}</td>
                        ))}
                      </tr>
                    ))}
            </tbody>
          </table>
          {p.kind === "velocity" && (
            <div className="table-note">
              Each cell: time (s) / velocity ({p.motion.units}/s)
            </div>
          )}
        </div>
      ) : (
        <div className="graph-body">
          <div className="graph-unit">
            {p.kind === "velocity" ? "Velocity" : "Position"} ({p.motion.units}
            {p.kind === "velocity" ? "/s" : ""})
          </div>
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${p.kind} XYZ graph. ${p.kind === "velocity" ? "Drag a keyframe to edit." : "Click or drag to scrub."}`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              svg.current?.setPointerCapture(e.pointerId);
              if (!drag.current) p.onScrub(point(e).time);
            }}
            onPointerMove={(e) => {
              if (!svg.current?.hasPointerCapture(e.pointerId)) return;
              const n = point(e);
              if (drag.current) {
                const { axis, index } = drag.current;
                const keys = p.motion.curves[axis];
                const lo = index === 0 ? 0 : keys[index - 1].time + 0.0001,
                  hi =
                    index === keys.length - 1
                      ? p.motion.lifetime
                      : keys[index + 1].time - 0.0001;
                p.onKey(axis, index, clamp(n.time, lo, hi), n.value);
              } else p.onScrub(n.time);
            }}
            onPointerUp={() => {
              drag.current = null;
              setFrozenRange(null);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setFrozenRange(null);
            }}
          >
            <defs>
              <clipPath id={`${p.kind}-clip`}>
                <rect
                  x={L - 5}
                  y={T - 8}
                  width={W - L - R + 10}
                  height={H - T - B + 16}
                />
              </clipPath>
            </defs>
            {ticks.map((v) => (
              <g key={v}>
                <line
                  x1={L}
                  x2={W - R}
                  y1={py(v / factor)}
                  y2={py(v / factor)}
                  stroke={v === 0 ? "#4b5766" : "#29333f"}
                  strokeWidth={v === 0 ? 1.2 : 0.7}
                />
                <text x={L - 11} y={py(v / factor) + 4} textAnchor="end">
                  {Number(v.toFixed(2))}
                </text>
              </g>
            ))}
            {Array.from(
              { length: 6 },
              (_, i) => (p.motion.lifetime * i) / 5,
            ).map((t) => (
              <g key={t}>
                <line
                  x1={px(t)}
                  x2={px(t)}
                  y1={T}
                  y2={H - B}
                  stroke="#29333f"
                  strokeWidth=".7"
                />
                <text x={px(t)} y={H - B + 19} textAnchor="middle">
                  {Number(t.toFixed(2))}
                </text>
              </g>
            ))}
            <g clipPath={`url(#${p.kind}-clip)`}>
              {axes.map(
                (a, i) =>
                  p.visible[a] && (
                    <g key={a}>
                      <path
                        d={p.samples
                          .map(
                            (s, j) =>
                              `${j ? "L" : "M"}${px(s.time)},${py(s[p.kind][i])}`,
                          )
                          .join(" ")}
                        fill="none"
                        stroke={colors[a]}
                        strokeWidth="2.6"
                        strokeLinejoin="round"
                      />
                      {p.kind === "velocity" &&
                        p.motion.curves[a].map((k, j) => (
                          <circle
                            key={j}
                            cx={px(k.time)}
                            cy={py(k.value)}
                            r={
                              p.selection.axis === a && p.selection.index === j
                                ? 7
                                : 4.5
                            }
                            fill={
                              p.selection.axis === a && p.selection.index === j
                                ? "#111820"
                                : colors[a]
                            }
                            stroke={colors[a]}
                            strokeWidth="2"
                            className="graph-key"
                            role="button"
                            tabIndex={0}
                            aria-label={`${a.toUpperCase()} key ${j + 1}, ${k.time.toFixed(2)} seconds, velocity ${(k.value * factor).toFixed(2)}`}
                            onFocus={() => p.onSelect({ axis: a, index: j })}
                            onKeyDown={(e) => {
                              if (e.key.startsWith("Arrow")) {
                                e.preventDefault();
                                p.onKey(
                                  a,
                                  j,
                                  k.time,
                                  k.value +
                                    (e.key === "ArrowUp"
                                      ? 0.1
                                      : e.key === "ArrowDown"
                                        ? -0.1
                                        : 0),
                                );
                              }
                            }}
                            onPointerDown={(e) => {
                              setFrozenRange(range);
                              p.onSelect({ axis: a, index: j });
                              drag.current = { axis: a, index: j };
                              e.currentTarget.ownerSVGElement?.setPointerCapture(
                                e.pointerId,
                              );
                            }}
                          />
                        ))}
                    </g>
                  ),
              )}
              <line
                x1={px(p.time)}
                x2={px(p.time)}
                y1={T}
                y2={H - B}
                stroke="#eef4ff"
                strokeOpacity=".7"
                strokeWidth="1"
              />
              {axes.map(
                (a, i) =>
                  p.visible[a] && (
                    <circle
                      key={a}
                      cx={px(p.time)}
                      cy={py(current[i])}
                      r="3.8"
                      fill={colors[a]}
                      stroke="#eefaff"
                      strokeWidth="1.3"
                    />
                  ),
              )}
            </g>
            <rect
              x={clamp(px(p.time) - 33, L, W - R - 66)}
              y="4"
              width="66"
              height="17"
              rx="4"
              fill="#e9f1fc"
            />
            <text
              className="cursor-label"
              x={clamp(px(p.time), L + 33, W - R - 33)}
              y="16"
              textAnchor="middle"
            >
              t = {p.time.toFixed(2)} s
            </text>
            <text
              x={(L + W - R) / 2}
              y={H - 1}
              textAnchor="middle"
              className="axis-label"
            >
              Time (s)
            </text>
          </svg>
        </div>
      )}
      <div className="graph-footer">
        <span>
          {p.kind === "position" ? (
            <>
              <LockKeyhole size={11} /> Integrated position
            </>
          ) : (
            <>LINEAR INTERPOLATION</>
          )}
        </span>
        <div className="channel-legend">
          {axes.map((a) => (
            <button
              key={a}
              aria-pressed={p.visible[a]}
              onClick={() => p.onToggle(a)}
              className={!p.visible[a] ? "muted" : ""}
              style={{ color: colors[a] }}
            >
              <i />
              {a.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
