import { describe, it, expect } from "vitest";
import {
  at,
  endpoint,
  presetBlend,
  seededWeight,
  validateBlend,
  type BlendDocument,
} from "./blend";
describe("profile blending", () => {
  it("preserves endpoints and vector interpolation", () => {
    const d = presetBlend("fish");
    for (const a of [0, 0.1, 0.5, 1]) {
      expect(at(d, a, 0)).toEqual(endpoint(d.profiles[0], a, d.lifetime));
      expect(at(d, a, 1)).toEqual(endpoint(d.profiles[1], a, d.lifetime));
      const l = at(d, a, 0),
        r = at(d, a, 1),
        v = at(d, a, 0.5);
      v.position.forEach((x, c) =>
        expect(x).toBeCloseTo((l.position[c] + r.position[c]) / 2, 10),
      );
    }
  });
  it("velocity matches position derivative including pace, scales and lifetime", () => {
    const d = presetBlend("smoke"),
      h = 1e-6;
    for (const a of [0.1, 0.33, 0.7, 0.9]) {
      const l = at(d, a - h, 0.37),
        r = at(d, a + h, 0.37);
      at(d, a, 0.37).velocity.forEach((v, c) =>
        expect(v).toBeCloseTo(
          (r.position[c] - l.position[c]) / (2 * h * d.lifetime),
          5,
        ),
      );
    }
  });
  it("integrates normalized-age velocity using lifetime and signed multipliers", () => {
    const d = presetBlend("fish");
    d.lifetime = 3;
    d.profiles.forEach((p) => {
      p.pace = [1, 1, 1];
      p.curves = {
        x: [
          { time: 0, value: 2 },
          { time: 1, value: 2 },
        ],
        y: [
          { time: 0, value: 1 },
          { time: 1, value: 1 },
        ],
        z: [
          { time: 0, value: -1 },
          { time: 1, value: -1 },
        ],
      };
    });
    expect(at(d, 1, 0).position).toEqual([138, -30, -18]);
    expect(at(d, 0.5, 0).velocity).toEqual([46, -10, -6]);
  });
  it("opposite vectors cancel rather than blending speed magnitudes", () => {
    const d = presetBlend("fish");
    d.profiles[1] = structuredClone(d.profiles[0]);
    d.profiles[1].scale = d.profiles[0].scale.map((x) => -x) as [
      number,
      number,
      number,
    ];
    expect(Math.hypot(...at(d, 0.4, 0.5).velocity)).toBe(0);
  });
  it("retains seed identities and validates data", () => {
    expect(seededWeight(42, 2)).toBe(seededWeight(42, 2));
    expect(seededWeight(42, 2)).not.toBe(seededWeight(43, 2));
    expect(validateBlend(presetBlend("smoke"))).toEqual(presetBlend("smoke"));
    const bad = presetBlend("smoke");
    bad.profiles[0].pace = [0, 0, 0];
    expect(() => validateBlend(bad)).toThrow();
    expect(() => validateBlend({} as BlendDocument)).toThrow();
  });
});
