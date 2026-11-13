import type { Motion, Curves, Key } from "./motion";
const keys = (values: number[]): Key[] =>
  values.map((value, i) => ({ time: (i * 5) / (values.length - 1), value }));
export const presetNames = [
  "Fish Swim / Detour",
  "Straight Move",
  "Sine-like Float",
  "Arc Motion",
] as const;
export function preset(name: string): Motion {
  let curves: Curves;
  if (name === "Straight Move")
    curves = { x: keys([2, 2]), y: keys([0, 0]), z: keys([0, 0]) };
  else if (name === "Sine-like Float")
    curves = {
      x: keys([1.5, 1.5]),
      y: keys(
        Array.from({ length: 21 }, (_, i) => 2 * Math.sin((i * Math.PI) / 5)),
      ),
      z: keys(
        Array.from({ length: 21 }, (_, i) => Math.cos((i * Math.PI) / 5)),
      ),
    };
  else if (name === "Arc Motion")
    curves = { x: keys([2, 2]), y: keys([4, -4]), z: keys([0, 0]) };
  else
    curves = {
      x: keys([1.2, 2.6, 3.2, 3.0, 2.2, 1.0, 1.4, 2.0, 2.4, 2.4, 2.0]),
      y: keys([0, 1, 2.4, 1.8, 0.8, -1.6, -2.2, -1.4, -0.6, 0, 0.4]),
      z: keys([0, -0.3, -0.8, -0.5, -0.2, 0.4, 0.8, 0.6, 0.2, 0, 0]),
    };
  return {
    schemaVersion: 1,
    lifetime: 5,
    timeSource: "particle",
    spawnTime: 0,
    coordinateSpace: "local",
    units: "m",
    curves,
    obstacle: {
      visible: true,
      position: [5, 0.8, -0.6],
      size: [1.7, 2.3, 1.7],
    },
  };
}
