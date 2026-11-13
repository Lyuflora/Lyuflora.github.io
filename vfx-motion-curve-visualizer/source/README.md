# VFX Motion Curve Visualizer

## Trajectory and profile blending — November 12 iteration

The new viewport uses **Z-up**, with an XY ground grid. Drag a numbered control point directly; **Screen** uses the camera-facing plane. Choose **XY/XZ/YZ** for a constrained edit, or use its axis gizmo. **Top/Front/Side** views provide predictable placement. Escape cancels the drag, and Undo restores a completed edit. Smoke examples rise along Z; existing documents retain their original coordinates.

The default editor now supports two editable 3D profiles, signed XYZ scale multipliers, per-profile pace controls, and deterministic blending with a fixed weight shared across XYZ. Select Curve 1/2, then drag a point's axis handle or edit its coordinates. Shape uses automatic smooth interpolation or linear spans. Pace redistributes time while retaining the profile endpoint. It is a relative timing profile, not an absolute-speed or arc-length editor.

Velocity/Position/Speed plots use particle age (0–100%). Solid cyan is Curve 1; dashed gold is Curve 2; white is the selected blend. Component fills show the range between the scaled profiles. Ghost trajectories use stable seeded weights. Equal-time dots reveal speed along the selected path. Smoke and Fish examples provide different routes and pace patterns; evolving noise, particle-cohort emission, manual tangent handles and engine-specific baking remain future work.

Velocity keys are editable numerically in Velocity curves. Converting a spatial profile to velocity keys samples it at nine ages; converting back samples 17 spatial points and uses smooth interpolation. These conversions are approximations and undoable. Original signed scales remain in the document; a zero scale locks the corresponding spatial axis. Path styling currently applies to the entire selected profile.

Download/Open save and load schema-v2 authoring documents. The new editor recovers its current browser draft after reload; undo history is session-local. Old schema-v1 files open in **Previous editor**, which retains the original velocity-authoring and obstacle workflow. The two editors keep independent state; switching away from the old editor remounts it when you return, so download old-editor edits before switching.

See **[ROLLBACK.md](ROLLBACK.md)** for the pre-change source snapshot and one-command restoration. Browser verification: `node check-blend.cjs <path-to-playwright>`.

A local React + TypeScript + Vite application for editing XYZ velocity and inspecting its integrated 3D trajectory. The dark desktop layout follows the supplied mockup. No account, server-side backend, or cloud storage is used. Fonts and JavaScript are bundled locally.

## Run

Requires Node.js 20.19+ or 22.12+ and npm. From this folder:

```powershell
npm install
npm run dev
```

Open the Local URL printed by Vite (normally http://127.0.0.1:5173/). The development server must remain running. After the initial dependency install, the app needs no internet connection. Unsaved editing state lasts for the current page session; use Download to export JSON before closing or reloading.

```powershell
npm test
npm run build
npm run preview
```

The production application is generated in `dist/`. Serve it over HTTP; do not open `index.html` directly through `file://`.

## Use

- Select a channel in Inspector → Selection. Drag velocity keys or edit exact numbers in the key inspector. The velocity graph's table button shows all channels' key times and values. Inputs commit on blur or Enter.
- Overview, Velocity and Position switch the workspace layout without resetting selection, timeline or camera. The inspector stays on the right and can be hidden. Scene contains obstacle settings; Motion contains timing and unit settings.
- Add a key at the timeline cursor. If that time is occupied, a key is inserted into the largest available interval. Delete removes the selected key; each channel retains at least one key. Reset channel replaces that channel with a single zero-velocity key.
- Channel visibility affects graphs only. Every XYZ component continues to contribute to motion.
- Click or drag either graph, use the timeline slider, or use playback controls. Position, speed, displacement, traveled distance, and the 3D marker share one clock. Playback stops at the end; playing from the end restarts.
- Drag the 3D view to orbit, right-drag to pan, and scroll to zoom. The pan tool also enables left-drag panning. Fit and Reset frame the current path and visible obstacle. Camera framing stays stable while editing; use Fit after substantial trajectory changes.
- The four presets contain real velocity data. Fish Swim / Detour moves up and around the default guide, then returns toward its original direction. The guide has no physical collision behavior.
- Open Inspector → Scene to edit the obstacle's position and dimensions. Download/Open exports and reloads a complete JSON document; the JSON dialog also supports pasting and importing.

### Edit obstacles in the scene

Click the box, or choose **Edit obstacle** in the viewport. **Move** shows axis arrows and plane handles; **Resize** shows square axis handles and a center handle for uniform scaling. X is cyan, Y is yellow, and Z is purple. Resizing is centered on the box and keeps it axis aligned.

The Scene inspector shows exact XYZ values for the selected tool and follows the current display units. The magnet toggles 0.1 m snapping (10 cm in centimeter display). Dragged dimensions stop at 0.01 m to prevent a zero or inverted box. Exact numerical dimensions must remain positive. Changes are included in JSON exports.

Camera orbit pauses while a transform handle is dragged. Dragging empty space still orbits the camera. While the viewport is focused, **W** selects Move, **R** selects Resize, and **Escape** cancels an active drag or exits selection. **Done** finishes editing. Changing the guide never changes velocity, the trajectory, or the selected timeline time.

## Math and conventions

- Internal units are meters and seconds. Centimeter display converts graphs, readouts, keys, and obstacle values, while JSON remains in meters. Coordinate-space metadata is saved; local and world coordinates coincide because the emitter is fixed at the origin with identity orientation.
- Velocity is piecewise linear, holding its first/last value outside its authored key range within the configured duration. Position integrates each linear segment analytically, including partial segments. Position queries are deterministic and do not depend on playback history or frame rate.
- Particle mode uses age since spawn, from 0 through particle lifetime.
- Emitter mode uses emitter clock time. The representative particle stays at the origin until its spawn time, then integrates the emitter velocity from spawn through the cursor. Duration means emitter duration; playback stops there. Queries after duration clamp to its endpoint. The velocity editor still shows the entire authored emitter curve before spawn; the particle's speed readout is zero before spawn.
- Changing duration scales key times and spawn time proportionally, preserving velocity magnitudes. Times are seconds; `t / T` is a read-only normalized display.
- Displacement is the straight-line magnitude of position from the origin. Traveled distance integrates speed with adaptive Simpson quadrature, split at every velocity knot. Complete intervals are cached; scrubbing evaluates only the remaining partial interval.

## Verification

`src/motion.test.ts` has 17 automated accuracy and validation tests covering all 11 requested cases, plus dense-reference arc length, non-collinear analytic arc length, single-key extension, additional invalid settings, cached distance, and emitter graph behavior. Final results are recorded in `VERIFICATION.md`.

## Implementation

- `src/motion.ts`: types, validation, interpolation, exact position integration, arc length, serialization, cached sampling.
- `src/presets.ts`: reusable authored demonstration curves.
- `src/Graph.tsx`: SVG curves, graph dragging and scrubbing, keyframe tables, numeric inputs.
- `src/Viewport.tsx`: Three.js scene, orbit/pan/zoom controls, trajectory, direction marker, axes, grid, and obstacle.
- `src/App.tsx`: one authoritative motion state, synchronized playback, settings, file IO, and measurements.
- `src/styles.css`: shared controls and base styling.
- `src/studio.css`: persistent inspector, graph focus layouts and responsive workspace.
- `UI_UX_REVIEW.md`: screenshot findings and a migration plan for the newer editor on the other PC. Its richer authoring features are not present in this implementation.

## Limits and next iteration

The mathematical position is exact for the linear model; the drawn trajectory is an approximation using 300 uniform samples plus every authored knot and spawn time. The tube renderer uses 600 segments. Arc length has a numerical tolerance, with an 18-level recursion limit. Extremely large magnitudes or closely spaced keys may exceed useful floating-point/display precision. A channel supports at most 512 keys; duration is limited to 3600 seconds. WebGL and hardware acceleration are needed for 3D. High-frequency detail beyond the display sampling can look simplified even though position readouts remain analytically evaluated.

No collisions, forces, noise, spline editing, engine integration, persistent autosave, or undo/redo are implemented. Normalized-time input is not provided. The current marker is an arrow and retains its last direction at zero speed. A useful next iteration is undo/redo and multi-key selection, followed by adaptive screen-space trajectory sampling.
