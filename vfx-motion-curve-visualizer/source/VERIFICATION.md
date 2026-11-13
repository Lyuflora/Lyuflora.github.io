# Verification — November 9, 2026

## Z-up and direct point dragging — November 12 follow-up

- New editor camera uses Z-up; ground grid is XY. Top (XY), Front (XZ), Side (YZ) and perspective views are available. Smoke examples now rise along Z; existing saved coordinates are not silently remapped.
- Larger numbered control points can be dragged directly in the screen plane or constrained XY/XZ/YZ planes. Axis gizmos remain available. Browser checks verify XZ dragging changes X/Z and preserves Y; XY dragging preserves Z; Undo restores the complete point; Escape cancels a live drag.
- Point picking uses a 16-pixel screen tolerance. Point marker size stays readable across zoom levels. Direct dragging suspends camera orbit, captures the pointer, and cancels on pointer cancellation, lost capture, window blur, resize, or view/plane changes.
- Desktop layout, numeric edits, pace, curves, JSON, recovery, and previous-editor checks pass after the change. Production build and 22 numerical tests pass.

## Trajectory/profile blend implementation — November 12, 2026

- 22 numerical tests pass (17 original + 5 new), including derivative consistency with pace, signed scales, normalized-age integration, opposite-velocity cancellation, seeded identity and document validation.
- Chrome browser checks in `check-blend.cjs` pass: real 3D handle drag changes the selected point; one Undo restores it; Escape cancels an active drag. Numeric point edits, redo, pace, velocity key edits, insertion, v2 JSON roundtrip, draft recovery and Previous editor access pass.
- Desktop overflow checks pass at 1920×1080, 1440×900 and 1280×800. Overview screenshot visually inspected.
- Production build passes with the existing Three.js chunk-size advisory.
- Pre-change snapshot is outside the project at `../motion-editor-rollback-2026-11-12`. `restore-previous.ps1` restores source/configuration without removing new files. The restoration script has not been executed against the active project, to preserve the implemented version for review.
- This release has automatic smooth/linear profiles, relative pace, stable blend ghosts and numeric velocity editing. Manual tangent modes, absolute-speed/arc-length timing, evolving noise, emitter cohorts, probabilistic envelopes and engine baking are not implemented. Spatial/velocity representation conversions are sampled and approximate.

## UI iteration — November 11, 2026

- Production build passes; existing motion tests remain 17/17 passing.
- Automated Chrome checks via `check-ui.cjs` pass with no page runtime errors.
- No page overflow at 1280×800, 1440×900, 1920×1080 or 2560×1440. Stacked 800 px layout has no horizontal overflow.
- Both graph focus layouts work; selected key and timeline survive the layout change. Overview, Velocity focus, Position focus at 1280 px and obstacle editing screenshots were visually inspected.
- Obstacle controls render in the Scene inspector. Numeric X position and X dimension edits commit and remain visible; existing 3D gizmos render. In-scene dragging was previously tested below; it was not re-exercised in this iteration.
- Velocity numerical editing, inspector hide/show, preset modal open/Escape, JSON download and keyboard inspector-tab navigation pass.
- A compact preview inspection caught crowded viewport overlays. Container-based styling now removes secondary labels in narrow 3D panels.
- These checks cover the local velocity-authoring app, not the newer JS/Canvas implementation shown in the supplied screenshots. No new claim of cross-browser or exhaustive accessibility testing.

## In-scene obstacle editor

Verified in an isolated browser tab after adding the editor:

- Clicking the box selects it; Done and Escape exit selection. W/R selects move/resize when the viewport is focused.
- Dragging the Y move arrow changed Y from 0.8 m to approximately 1.91991 m. The timeline stayed at 2.00 s and all trajectory measurements stayed unchanged.
- Dragging the Y resize handle changed height from 2.3 m to approximately 3.77305 m, preserving the center position.
- With snapping enabled, a subsequent move landed at 2.4 m. Switching display units showed 240 cm.
- A negative dimension was rejected and restored to the previous valid value.
- JSON export retained the edited position and size in meters, including full precision.
- No browser console warnings or errors were observed in these checks. Existing motion tests remain 17/17 passing and the production build passes.

The active-drag Escape cancellation and simultaneous multi-axis/uniform drag gestures are implemented through Three.js TransformControls but were not separately exercised in these manual checks.

## Automated

- `npm test`: **17 / 17 passed**, one test file. Includes all 11 requested test categories.
- `npm run build`: TypeScript and Vite production build passed.
- Arc-length checks compare against both an analytic non-collinear example (8 decimal places) and a 100,000-step independent midpoint reference (6 decimal places).
- Vite emits an advisory that the Three.js vendor chunk exceeds 500 kB before gzip. It is approximately 138 kB gzipped; the application chunk is approximately 83 kB gzipped. No build errors.

## Interactive browser checks

Verified through the local in-app browser:

- Straight Move at 5 s gives X = 10 m, speed = 2 m/s, displacement = distance = 10 m.
- Changing its first velocity from 2 to 4 m/s gives X = 15 m at 5 s, matching its trapezoidal velocity area.
- Changing that duration to 10 s gives X = 30 m.
- Emitter mode with spawn at 5 s gives X = 12.5 m at emitter time 10 s for the edited 4→2 m/s curve.
- Hiding X leaves position and distance unchanged. Centimeter display changes 12.5 m to 1250 cm.
- Duplicate key time is rejected with a visible validation error. Adding and deleting keys updates the channel key count.
- Numerical inspector, table switching, and graph key dragging work. Dragging a key updates both its time and velocity; scale is held stable during a drag.
- Graph background dragging scrubs the shared timeline. Playback advances the cursor, pauses, reaches the duration, and restarts from the end.
- Arc Motion ends at (10, 0, 0) m, with traveled distance 14.79 m versus displacement 10 m.
- Sine-like Float ends at approximately (7.5, 0, 0) m, with traveled distance 10.65 m.
- Fish Swim / Detour produces its path through the same motion engine and passes over the default obstacle guide.
- 3D orbit, pan, zoom, fit, and reset controls work. The scene renders with WebGL. The obstacle dimension inspector updates its saved value.
- JSON download created `vfx-motion.json`; Open reloaded the downloaded file. The re-exported document equals the saved JSON, including key values.
- Unsupported schema version produces a visible error inside the JSON dialog; importing valid JSON succeeds.
- No browser console warnings or errors were observed during the checks.
- Desktop layout checked at 1920×1080 and the default narrower preview. The page scrolls vertically when its content exceeds the viewport. Mobile-specific behavior has not been manually verified.

## Scope and limits

The production build has been checked. The interactive checks used Vite's development server. No cross-browser certification, stress test at the 512-key-per-channel limit, or exhaustive keyboard/screen-reader audit was performed. WebGL fallback messaging is implemented but has not been tested with hardware acceleration disabled.

The app has no physics, automatic obstacle avoidance, cubic interpolation, autosave, undo/redo, or normalized-time entry. Three-dimensional display sampling is approximate; position readouts use analytic integration. See README for timing, unit, and precision conventions.
