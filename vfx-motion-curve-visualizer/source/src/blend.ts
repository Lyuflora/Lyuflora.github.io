import {
  axes,
  clamp,
  evaluate,
  integral,
  type Curves,
  type Vec3,
} from "./motion";
export type Point = { age: number; value: Vec3 };
export type Profile = {
  name: string;
  scale: Vec3;
  points: Point[];
  smooth: boolean;
  curves?: Curves;
  pace: [number, number, number];
};
export type BlendDocument = {
  schemaVersion: 2;
  kind: "velocity-profile-blend";
  lifetime: number;
  seed: number;
  profiles: [Profile, Profile];
};
export const mix = (a: Vec3, b: Vec3, w: number): Vec3 =>
  w === 0
    ? [...a]
    : w === 1
      ? [...b]
      : (a.map((v, i) => v * (1 - w) + b[i] * w) as Vec3);
export function seededWeight(seed: number, index: number) {
  let n = (seed + Math.imul(index + 1, 0x9e3779b9)) | 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
export function base(
  p: Profile,
  a: number,
): { position: Vec3; derivative: Vec3 } {
  a = clamp(a, 0, 1);
  if (p.curves)
    return {
      position: axes.map((x) => integral(p.curves![x], 0, a)) as Vec3,
      derivative: axes.map((x) => evaluate(p.curves![x], a)) as Vec3,
    };
  const ps = p.points;
  let i = ps.findIndex((k, j) => j < ps.length - 1 && a <= ps[j + 1].age);
  if (i < 0) i = ps.length - 2;
  const l = ps[i],
    r = ps[i + 1],
    h = r.age - l.age,
    u = (a - l.age) / h;
  const tangent = (j: number, c: number) => {
    const lo = ps[Math.max(0, j - 1)],
      hi = ps[Math.min(ps.length - 1, j + 1)];
    return (hi.value[c] - lo.value[c]) / (hi.age - lo.age);
  };
  return {
    position: l.value.map((v, c) =>
      p.smooth
        ? (2 * u ** 3 - 3 * u * u + 1) * v +
          (u ** 3 - 2 * u * u + u) * h * tangent(i, c) +
          (-2 * u ** 3 + 3 * u * u) * r.value[c] +
          (u ** 3 - u * u) * h * tangent(i + 1, c)
        : v + (r.value[c] - v) * u,
    ) as Vec3,
    derivative: l.value.map((v, c) =>
      p.smooth
        ? ((6 * u * u - 6 * u) * v +
            (3 * u * u - 4 * u + 1) * h * tangent(i, c) +
            (-6 * u * u + 6 * u) * r.value[c] +
            (3 * u * u - 2 * u) * h * tangent(i + 1, c)) /
          h
        : (r.value[c] - v) / h,
    ) as Vec3,
  };
}
export function warp(p: Profile, a: number) {
  const keys = p.pace.map((value, i) => ({ time: i / 2, value }));
  const area = integral(keys, 0, 1);
  return { age: integral(keys, 0, a) / area, rate: evaluate(keys, a) / area };
}
export function profileAt(p: Profile, a: number, T: number) {
  const w = warp(p, clamp(a, 0, 1)),
    v = base(p, w.age);
  return {
    position: v.position.map((x, i) => x * p.scale[i]) as Vec3,
    velocity: v.derivative.map(
      (x, i) => (x * p.scale[i] * w.rate) / (p.curves ? 1 : T),
    ) as Vec3,
  };
}
// Velocity-authored curves are in units/second; their normalized-age integral needs lifetime.
export function endpoint(p: Profile, a: number, T: number) {
  const v = profileAt(p, a, T);
  return {
    ...v,
    position: v.position.map((x) => x * (p.curves ? T : 1)) as Vec3,
  };
}
export function at(d: BlendDocument, a: number, b: number) {
  const x = endpoint(d.profiles[0], a, d.lifetime),
    y = endpoint(d.profiles[1], a, d.lifetime);
  return {
    position: mix(x.position, y.position, b),
    velocity: mix(x.velocity, y.velocity, b),
  };
}
export function pathCopy(p: Profile, T: number): Profile {
  if (!p.curves) return structuredClone(p);
  const points = Array.from({ length: 17 }, (_, i) => ({
    age: i / 16,
    value: base(p, i / 16).position.map((x) => x * T) as Vec3,
  }));
  return { ...p, curves: undefined, points, smooth: true };
}
export function presetBlend(kind: "smoke" | "fish"): BlendDocument {
  const smoke = kind === "smoke";
  const points = (second: boolean): Point[] =>
    (smoke
      ? [
          [0, 0, 0],
          [0.015, 0.18, 0],
          [0.05, 0.31, 0.02],
          [0.1, 0.39, 0.04],
          [second ? 0.21 : 0.15, 0.44, second ? -0.04 : 0.05],
        ]
      : [
          [0, 0, 0],
          [0.07, 0.06, -0.03],
          [0.14, 0.12, 0.04],
          [0.22, 0.05, 0.06],
          [0.31, 0.07, 0],
        ]
    ).map((value, i) => ({
      age: i / 4,
      value: (smoke ? [value[0], value[2], value[1]] : value) as Vec3,
    }));
  return {
    schemaVersion: 2,
    kind: "velocity-profile-blend",
    lifetime: 5,
    seed: 42,
    profiles: [
      {
        name: "Curve 1",
        scale: smoke ? [23, 6, 10] : [23, -10, 6],
        points: points(false),
        smooth: true,
        pace: smoke ? [1.6, 1, 0.3] : [1, 0.6, 1.4],
      },
      {
        name: "Curve 2",
        scale: smoke ? [33, -6, 8] : [33, -5, -6],
        points: points(true),
        smooth: true,
        pace: smoke ? [1.3, 0.9, 0.4] : [1.1, 1.5, 0.8],
      },
    ],
  };
}
export function validateBlend(value: unknown): BlendDocument {
  const d = value as BlendDocument;
  if (
    !d ||
    d.schemaVersion !== 2 ||
    d.kind !== "velocity-profile-blend" ||
    !Number.isFinite(d.lifetime) ||
    d.lifetime < 0.1 ||
    d.lifetime > 3600 ||
    !Number.isInteger(d.seed) ||
    !Array.isArray(d.profiles) ||
    d.profiles.length !== 2
  )
    throw Error("Invalid blend document.");
  for (const p of d.profiles) {
    if (
      !Array.isArray(p.scale) ||
      p.scale.length !== 3 ||
      !p.scale.every((x) => Number.isFinite(x) && Math.abs(x) <= 10000) ||
      !Array.isArray(p.pace) ||
      p.pace.length !== 3 ||
      !p.pace.every((x) => Number.isFinite(x) && x >= 0 && x <= 100) ||
      p.pace.reduce((a, b) => a + b, 0) <= 0 ||
      !Array.isArray(p.points) ||
      p.points.length < 2 ||
      p.points.length > 128 ||
      typeof p.smooth !== "boolean"
    )
      throw Error("Invalid profile settings.");
    p.points.forEach((k, i) => {
      if (
        !Number.isFinite(k.age) ||
        k.age < 0 ||
        k.age > 1 ||
        (i && k.age <= p.points[i - 1].age) ||
        k.value.length !== 3 ||
        !k.value.every((x) => Number.isFinite(x) && Math.abs(x) < 100000)
      )
        throw Error("Invalid path points.");
    });
    if (p.points[0].age !== 0 || p.points.at(-1)!.age !== 1)
      throw Error("Path must span the full lifetime.");
    if (p.curves)
      for (const axis of axes) {
        const ks = p.curves[axis];
        if (!Array.isArray(ks) || ks.length < 2 || ks.length > 256)
          throw Error("Invalid velocity keys.");
        ks.forEach((k, i) => {
          if (
            !Number.isFinite(k.time) ||
            k.time < 0 ||
            k.time > 1 ||
            !Number.isFinite(k.value) ||
            Math.abs(k.value) > 100000 ||
            (i && k.time <= ks[i - 1].time)
          )
            throw Error("Invalid velocity keys.");
        });
        if (ks[0].time !== 0 || ks.at(-1)!.time !== 1)
          throw Error("Velocity profiles must span 0–100%.");
      }
  }
  return structuredClone(d);
}
