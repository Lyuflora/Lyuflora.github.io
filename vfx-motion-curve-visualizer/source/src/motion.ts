export const axes = ["x", "y", "z"] as const;
export type Axis = (typeof axes)[number];
export type Vec3 = [number, number, number];
export type Key = { time: number; value: number };
export type Curves = Record<Axis, Key[]>;
export type Motion = {
  schemaVersion: 1;
  lifetime: number;
  timeSource: "particle" | "emitter";
  spawnTime: number;
  coordinateSpace: "local" | "world";
  units: "m" | "cm";
  curves: Curves;
  obstacle: { visible: boolean; position: Vec3; size: Vec3 };
};
export const clamp = (n: number, a: number, b: number) =>
  Math.min(b, Math.max(a, n));
export const length = (v: Vec3) => Math.hypot(...v);
export function evaluate(keys: Key[], t: number): number {
  if (t <= keys[0].time) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].time) {
      const a = keys[i - 1],
        b = keys[i];
      return a.value + ((b.value - a.value) * (t - a.time)) / (b.time - a.time);
    }
  }
  return keys[keys.length - 1].value;
}
// Constant extension before the first and after the last key. Each linear
// segment has an exact trapezoidal integral, including partial segments.
export function integral(keys: Key[], start: number, end: number): number {
  if (end <= start) return 0;
  const stops = [
    start,
    ...keys.map((k) => k.time).filter((t) => t > start && t < end),
    end,
  ];
  let total = 0;
  for (let i = 1; i < stops.length; i++)
    total +=
      ((evaluate(keys, stops[i - 1]) + evaluate(keys, stops[i])) *
        (stops[i] - stops[i - 1])) /
      2;
  return total;
}
export function startTime(m: Motion) {
  return m.timeSource === "emitter" ? m.spawnTime : 0;
}
export function velocity(m: Motion, time: number): Vec3 {
  if (time < startTime(m)) return [0, 0, 0];
  return axes.map((a) =>
    evaluate(m.curves[a], clamp(time, 0, m.lifetime)),
  ) as Vec3;
}
export function position(m: Motion, time: number): Vec3 {
  return axes.map((a) =>
    integral(m.curves[a], startTime(m), clamp(time, 0, m.lifetime)),
  ) as Vec3;
}
function simpson(
  f: (x: number) => number,
  a: number,
  b: number,
  eps: number,
  depth = 18,
): number {
  const mid = (a + b) / 2,
    fa = f(a),
    fb = f(b),
    fm = f(mid),
    whole = ((b - a) * (fa + 4 * fm + fb)) / 6;
  function recurse(
    a: number,
    b: number,
    fa: number,
    fm: number,
    fb: number,
    whole: number,
    eps: number,
    depth: number,
  ): number {
    const mid = (a + b) / 2,
      fl = f((a + mid) / 2),
      fr = f((mid + b) / 2);
    const left = ((mid - a) * (fa + 4 * fl + fm)) / 6,
      right = ((b - mid) * (fm + 4 * fr + fb)) / 6;
    const delta = left + right - whole;
    if (depth <= 0 || Math.abs(delta) <= 15 * eps)
      return left + right + delta / 15;
    return (
      recurse(a, mid, fa, fl, fm, left, eps / 2, depth - 1) +
      recurse(mid, b, fm, fr, fb, right, eps / 2, depth - 1)
    );
  }
  return recurse(a, b, fa, fm, fb, whole, eps, depth);
}
export function distance(m: Motion, time: number): number {
  const start = startTime(m),
    end = clamp(time, 0, m.lifetime);
  if (end <= start) return 0;
  const stops = [
    ...new Set([
      start,
      end,
      ...axes
        .flatMap((a) => m.curves[a].map((k) => k.time))
        .filter((t) => t > start && t < end),
    ]),
  ].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 1; i < stops.length; i++)
    sum += simpson(
      (t) => length(velocity(m, t)),
      stops[i - 1],
      stops[i],
      1e-8 / stops.length,
    );
  return sum;
}
// Cache complete velocity intervals once. Scrubbing only integrates the one
// partial interval containing the cursor; it never accumulates frame deltas.
export function distanceEvaluator(m: Motion): (time: number) => number {
  const start = startTime(m);
  const stops = [
    ...new Set([
      start,
      m.lifetime,
      ...axes
        .flatMap((a) => m.curves[a].map((k) => k.time))
        .filter((t) => t > start),
    ]),
  ].sort((a, b) => a - b);
  const totals = [0];
  for (let i = 1; i < stops.length; i++)
    totals.push(
      totals[i - 1] +
        simpson((t) => length(velocity(m, t)), stops[i - 1], stops[i], 1e-9),
    );
  return (time) => {
    const t = clamp(time, start, m.lifetime);
    let lo = 0,
      hi = stops.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (stops[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return (
      totals[lo] +
      (t > stops[lo]
        ? simpson((x) => length(velocity(m, x)), stops[lo], t, 1e-9)
        : 0)
    );
  };
}
export function resizeLifetime(m: Motion, lifetime: number): Motion {
  if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 3600)
    throw new Error(
      "Duration must be greater than 0 and at most 3600 seconds.",
    );
  const ratio = lifetime / m.lifetime;
  return {
    ...m,
    lifetime,
    spawnTime: m.spawnTime * ratio,
    curves: Object.fromEntries(
      axes.map((a) => [
        a,
        m.curves[a].map((k) => ({ ...k, time: k.time * ratio })),
      ]),
    ) as Curves,
  };
}
export function validateMotion(data: unknown): Motion {
  if (!data || typeof data !== "object")
    throw new Error("Expected a motion JSON object.");
  const m = data as Motion;
  if (m.schemaVersion !== 1)
    throw new Error("Unsupported schema version. Expected version 1.");
  if (!Number.isFinite(m.lifetime) || m.lifetime <= 0 || m.lifetime > 3600)
    throw new Error(
      "Duration must be greater than 0 and at most 3600 seconds.",
    );
  if (!["particle", "emitter"].includes(m.timeSource))
    throw new Error("Invalid time source.");
  if (
    !Number.isFinite(m.spawnTime) ||
    m.spawnTime < 0 ||
    m.spawnTime >= m.lifetime
  )
    throw new Error("Spawn time must be within the duration, before its end.");
  if (
    !["local", "world"].includes(m.coordinateSpace) ||
    !["m", "cm"].includes(m.units)
  )
    throw new Error("Invalid coordinate space or display units.");
  for (const a of axes) {
    const keys = m.curves?.[a];
    if (!Array.isArray(keys) || !keys.length || keys.length > 512)
      throw new Error(`${a.toUpperCase()}: provide 1–512 keys.`);
    keys.forEach((k, i) => {
      if (!k || !Number.isFinite(k.time) || !Number.isFinite(k.value))
        throw new Error(
          `${a.toUpperCase()}: key times and values must be finite numbers.`,
        );
      if (
        k.time < 0 ||
        k.time > m.lifetime ||
        (i > 0 && k.time <= keys[i - 1].time)
      )
        throw new Error(
          `${a.toUpperCase()}: key times must be unique, ascending, and within the duration.`,
        );
    });
  }
  const o = m.obstacle;
  if (
    !o ||
    typeof o.visible !== "boolean" ||
    !Array.isArray(o.position) ||
    !Array.isArray(o.size) ||
    o.position.length !== 3 ||
    o.size.length !== 3 ||
    !o.position.every(Number.isFinite) ||
    !o.size.every((n) => Number.isFinite(n) && n > 0)
  )
    throw new Error("Invalid obstacle guide. Dimensions must be positive.");
  return structuredClone(m);
}
export function serialize(m: Motion) {
  return JSON.stringify(validateMotion(m), null, 2);
}
export function deserialize(s: string) {
  try {
    return validateMotion(JSON.parse(s));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("Malformed JSON. Choose a valid motion file.");
    throw error;
  }
}
export function sampleMotion(m: Motion, count = 300) {
  const times = [
    ...new Set([
      ...Array.from({ length: count + 1 }, (_, i) => (m.lifetime * i) / count),
      startTime(m),
      ...axes.flatMap((a) => m.curves[a].map((k) => k.time)),
    ]),
  ].sort((a, b) => a - b);
  // The input graph shows the whole authored emitter curve, including times
  // before the representative particle spawns. Particle motion is still zero.
  return times.map((time) => ({
    time,
    position: position(m, time),
    velocity: axes.map((a) => evaluate(m.curves[a], time)) as Vec3,
  }));
}
