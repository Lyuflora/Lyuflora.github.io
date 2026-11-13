import { describe, it, expect } from "vitest";
import {
  position,
  velocity,
  distance,
  distanceEvaluator,
  sampleMotion,
  resizeLifetime,
  serialize,
  deserialize,
  validateMotion,
  type Motion,
} from "./motion";
import { preset } from "./presets";
function constant(v: [number, number, number], duration = 5): Motion {
  const m = preset("Straight Move");
  m.lifetime = duration;
  (["x", "y", "z"] as const).forEach(
    (a, i) =>
      (m.curves[a] = [
        { time: 0, value: v[i] },
        { time: duration, value: v[i] },
      ]),
  );
  return m;
}
describe("motion accuracy", () => {
  it("constant velocity: (2,0,0) over 5 s gives (10,0,0)", () => {
    const m = constant([2, 0, 0]);
    expect(position(m, 5)).toEqual([10, 0, 0]);
    expect(distance(m, 5)).toBeCloseTo(10, 8);
  });
  it("zero velocity stays at the origin", () => {
    const m = constant([0, 0, 0]);
    expect(position(m, 5)).toEqual([0, 0, 0]);
    expect(distance(m, 5)).toBe(0);
  });
  it("linear acceleration integrates exactly, including partial segments", () => {
    const m = constant([0, 0, 0], 2);
    m.curves.x = [
      { time: 0, value: 0 },
      { time: 2, value: 4 },
    ];
    expect(position(m, 2)[0]).toBe(4);
    expect(position(m, 1)[0]).toBe(1);
  });
  it("direction reversal moves backwards after the turning point", () => {
    const m = constant([0, 0, 0], 4);
    m.curves.x = [
      { time: 0, value: 2 },
      { time: 4, value: -2 },
    ];
    expect(position(m, 2)[0]).toBe(2);
    expect(position(m, 3)[0]).toBe(1.5);
  });
  it("return to origin has positive traveled distance", () => {
    const m = constant([0, 0, 0], 4);
    m.curves.x = [
      { time: 0, value: 2 },
      { time: 4, value: -2 },
    ];
    expect(position(m, 4)[0]).toBe(0);
    expect(distance(m, 4)).toBeCloseTo(4, 7);
  });
  it("axes integrate independently", () => {
    const m = constant([2, -3, 4]);
    expect(position(m, 5)).toEqual([10, -15, 20]);
    expect(distance(m, 5)).toBeCloseTo(5 * Math.sqrt(29), 7);
  });
  it("lifetime scales times while preserving velocity", () => {
    const m = resizeLifetime(constant([2, 0, 0]), 10);
    expect(position(m, 10)[0]).toBe(20);
    expect(m.curves.x[1].value).toBe(2);
  });
  it("random scrubbing is deterministic and order independent", () => {
    const m = preset("Fish Swim / Detour"),
      times = [0, 0.3, 1, 2.7, 4, 5];
    const sequential = times.map((t) => position(m, t));
    [5, 2, 0, 4, 1, 3].forEach((i) =>
      expect(position(m, times[i])).toEqual(sequential[i]),
    );
  });
  it("JSON round trip preserves every key and setting", () => {
    const m = preset("Fish Swim / Detour");
    expect(deserialize(serialize(m))).toEqual(m);
  });
  it("invalid input gives controlled validation errors", () => {
    const m = constant([2, 0, 0]);
    m.curves.x[1].time = 0;
    expect(() => validateMotion(m)).toThrow(/unique/);
    m.curves.x[1].time = 5;
    m.curves.x[1].value = Infinity;
    expect(() => validateMotion(m)).toThrow(/finite/);
    expect(() => deserialize("{")).toThrow(/Malformed/);
    expect(() => deserialize('{"schemaVersion":2}')).toThrow(/version/);
    expect(() => resizeLifetime(m, 0)).toThrow(/Duration/);
  });
  it("emitter spawn times sample different sections of the velocity curve", () => {
    const m = constant([0, 0, 0], 4);
    m.timeSource = "emitter";
    m.curves.x = [
      { time: 0, value: 0 },
      { time: 4, value: 4 },
    ];
    m.spawnTime = 1;
    expect(position(m, 3)[0]).toBe(4);
    expect(position(m, 0.5)).toEqual([0, 0, 0]);
    m.spawnTime = 2;
    expect(position(m, 3)[0]).toBe(2.5);
    expect(velocity(m, 3)[0]).toBe(3);
  });
  it("path length agrees with a dense midpoint reference for a 3D detour", () => {
    const m = preset("Fish Swim / Detour"),
      count = 100000,
      dt = m.lifetime / count;
    let sum = 0;
    for (let i = 0; i < count; i++)
      sum += Math.hypot(...velocity(m, (i + 0.5) * dt)) * dt;
    expect(distance(m, 5)).toBeCloseTo(sum, 6);
  });
  it("non-collinear linear speed has accurate arc length", () => {
    const m = constant([1, 0, 0], 1);
    m.curves.y = [
      { time: 0, value: 0 },
      { time: 1, value: 1 },
    ];
    expect(distance(m, 1)).toBeCloseTo((Math.sqrt(2) + Math.asinh(1)) / 2, 8);
  });
  it("single keys extend constantly and endpoints remain continuous", () => {
    const m = constant([0, 0, 0]);
    m.curves.x = [{ time: 2, value: 3 }];
    expect(position(m, 5)[0]).toBe(15);
    expect(position(m, 2 - 1e-8)[0]).toBeCloseTo(position(m, 2 + 1e-8)[0], 6);
  });
  it("invalid spawn, obstacle and missing channels are rejected", () => {
    const m = constant([1, 0, 0]);
    m.spawnTime = 5;
    expect(() => validateMotion(m)).toThrow(/Spawn/);
    m.spawnTime = 0;
    m.obstacle.size[0] = 0;
    expect(() => validateMotion(m)).toThrow(/obstacle/);
    m.obstacle.size[0] = 1;
    m.curves.y = [];
    expect(() => validateMotion(m)).toThrow(/keys/);
  });
  it("cached arc length agrees with direct integration during random scrubbing", () => {
    const m = preset("Fish Swim / Detour");
    m.timeSource = "emitter";
    m.spawnTime = 1.3;
    const at = distanceEvaluator(m);
    [5, 0, 2.85, 1.3, 4.2, 0.7].forEach((t) =>
      expect(at(t)).toBeCloseTo(distance(m, t), 7),
    );
  });
  it("emitter input graph retains authored velocity before the particle spawns", () => {
    const m = constant([2, 0, 0]);
    m.timeSource = "emitter";
    m.spawnTime = 2;
    expect(sampleMotion(m)[0].velocity).toEqual([2, 0, 0]);
    expect(velocity(m, 0)).toEqual([0, 0, 0]);
  });
});
