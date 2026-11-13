# Artist-first trajectory authoring plan

Status: design proposal, November 11, 2026. No application behavior changed by this plan.

## Product direction

Author the visible motion in this order: **Shape → Pace → Variation → Inspect → Export**. The primary canvas is 3D. Position and velocity graphs describe the same evaluated motion; they are not separate data sets that can disagree.

The current local implementation is schema v1, with linear XYZ velocity keys integrated into position. Direct spatial authoring needs a new motion mode and evaluator, not just draggable markers on the existing line. Keep existing documents working in their original mode.

Clarification: the requested range is **randomized blending between two velocity-over-life profiles**, each with XYZ curves and its own signed XYZ scale multipliers. The focused specification below takes precedence over the earlier general variation options. Graph display bounds and independent XYZ noise are not the requested range model.

## Refined specification: two velocity-over-life profiles

### Exact meaning

Let a = particle age / lifetime, from 0 to 1. Define two normalized-age vector curves C1(a), C2(a), with component-wise scale multipliers:

| Profile | X | Y | Z |
| --- | ---: | ---: | ---: |
| Curve 1 | 23 | -10 | 6 |
| Curve 2 | 33 | -5 | -6 |

Scaled profiles are V1(a) = C1(a) ⊙ (23, -10, 6) and V2(a) = C2(a) ⊙ (33, -5, -6). These scales are not random bounds. Negative scales invert the relevant component; a zero scale removes that component's contribution.

Recommended default, pending any target-engine compatibility requirement: choose one seeded uniform blend weight b in [0,1] at particle birth; retain it throughout life and share it across XYZ. Evaluate:

`V(a,b) = (1-b) V1(a) + b V2(a)`

A fixed b keeps each particle coherent. Separate XYZ weights produce a different family of motion and must be a separately named advanced mode. A changing weight over life is modulation/turbulence and likewise must not be implied by this feature. Do not claim these recommended defaults reproduce an unspecified engine's random sampling semantics.

For example, at an age where C1x = 0.2 and C2x = 0.8, scaled X velocities are 4.6 and 26.4; the midpoint blend is 15.5. The scales 23 and 33 are not that age's endpoints.

### Graph presentation

Default to three vertically aligned X/Y/Z plots with a shared age axis and cursor. Offer an overlay view when desired; six curves plus fills should not be the mandatory default.

- Channel color identifies X/Y/Z consistently with 3D. Line style identifies profile: Curve 1 solid, Curve 2 dashed. Text labels accompany both identities.
- Plot the scaled profiles by default, in explicit velocity units. Keep signed scale multipliers in the selected profile inspector, separate from curve keys.
- Fill the area between the two scaled curves lightly. Compute the fill's lower/upper boundary per age, including crossings. Never swap Curve 1 and Curve 2 identities merely because one becomes numerically larger.
- Emphasize zero, negative values and selected-profile keys. Inactive profile stays visible as a comparison, without displaying all its handles.
- An optional small set of fixed 25%, 50%, 75% blend lines illustrates interpolation; these are illustrative weights, not a particle random sample or probability quantiles.
- A selected particle's actual blend is highlighted and labeled with its weight/seed. The same particle is selected in 3D and in every channel. Use a distinct selection treatment from either editable endpoint profile.
- At the shared cursor, show Curve 1, Curve 2 and selected-particle scaled values. A 50% blend is labeled “50% blend,” not a “most likely” particle.
- Horizontal axis: Particle age, 0–100% lifetime. Show seconds alongside percentage at the cursor for the selected lifetime. Velocity is per second, not per normalized-age unit.
- Fit all / Fit selection and axis isolation are view controls; do not normalize plotted physical amplitudes silently. Raw normalized curve editing is a separate labeled view.

Shared XYZ weighting is visible in a concise control: “Blend per particle — linked XYZ.” The channel ribbons are marginal ranges, not independent menus of possible component values. In velocity space, one shared blend traces the segment between the two profile vectors at each age, not an XYZ box.

### 3D presentation and integration

For common lifetime T and common spawn origin P0:

`P(a,b) = P0 + T ∫[0,a] V(u,b) du`

The factor T is required because the graph's horizontal domain is normalized age while velocity is expressed per second.

With b constant, compute the integrated endpoint trajectories P1(a), P2(a). Then:

`P(a,b) = (1-b) P1(a) + b P2(a)`

This exact relationship suggests the primary preview:

- Solid Curve 1 trajectory and dashed Curve 2 trajectory, with profile labels.
- A few intermediate trajectories, selected particle emphasized.
- At the current age, endpoint markers connected by a thin line; all shared-weight particles of the same age lie on that segment. This is a position locus, not a velocity arrow.
- Optional translucent ribbon joining corresponding-age points along the two trajectories. This ruled surface can fold or self-intersect; it is not a filled probability volume. Keep it off by default if it obscures editing.
- Velocity arrows at selected-age markers, plus a separate equal-time-dot or speed overlay.
- Switch between “Same age” comparison and “Emitter preview” with staggered births. Both use the same particle-age evaluator; the latter shows alive particles at differing ages.

The straight cross-section result assumes shared origin/lifetime and fixed shared-axis weight. Random origins, different lifetimes or independent XYZ weights require separate evaluation and a different visualization. Do not reuse this ribbon as a universal envelope.

Final speed is the magnitude of the blended velocity vector. It is generally not the blend of the two speed magnitudes. Opposing profile velocities can cancel, producing a slower or stopped intermediate particle. Show the actual speed and motion so this is discoverable without implying an error.

### Direct 3D authoring of the profiles

Keep spatial authoring central: select Curve 1 or Curve 2 and choose Shape or Pace. Edit that endpoint trajectory, then derive its velocity profile with explicit time mapping. All blends update from the two resulting endpoint profiles. Intermediate sample paths are previews, not independent editable curves; optionally “Promote to profile” makes an explicit copy.

For velocity-origin documents, direct point manipulation is an explicit conversion to trajectory authoring with a reconstruction/error preview and undo. Preserve the existing signed scale decomposition when possible; a zero scale cannot be inverted to obtain raw curve keys. Require an explicit scale change or bake-to-scale-1 conversion for that component instead of dividing by zero or silently altering semantics.

Profile scales remain physical multipliers in velocity mode. Applying a global finish-in-lifetime renormalization after blending would change their meaning and is not allowed silently. If profiles are authored from paths using normalized pace, perform that timing calculation separately for each endpoint profile before deriving its velocity; the blend itself remains the formula above.

Smoke example: author two related rise/lean profiles with different slowdown and drift. Fish example: author two route/timing variations with different turn pace. Fixed blending creates diversity between particles; ongoing wandering is an additional, explicitly enabled smooth variation layer, not a side effect of random blend selection.

### Scope and validation additions

Implement paired scaled profiles and deterministic blend evaluation before general noise or arbitrary spread envelopes. Save both raw profiles, six scales, age domain, lifetime, random seed, distribution and correlation policy.

Test b=0/1 against endpoints; b=0.5 against vector averages; signed scales and profile crossings; normalized-age integration with non-unit lifetime; exact position-blend equivalence; opposite-vector speed cancellation; same seed across scrub/playback; and linked graph/3D particle selection. Export both profiles plus blending semantics only when a target supports them; otherwise label exports as selected deterministic samples.

## 1. Shape in 3D

- Select a path point to show an XYZ move gizmo and exact coordinates in the inspector. Distinguish editable shape points from equal-time markers through shape and fill, not color alone.
- Drag an axis or plane handle. Offer Top/Front/Side views and explicit construction planes; an empty perspective click cannot determine depth by itself.
- Add on the path, insert between points, delete interior points, select multiple points and undo/redo. Inserting a point should preserve the existing shape within tolerance.
- Smooth/Linear applies to selected segments. Tangent handles appear for the selection; Auto/Aligned/Broken controls are contextual. Aligned spatial tangents do not promise equal incoming/outgoing velocity.
- Start position can be pinned to the emitter. End position is a spatial target, not automatically a timing constraint in every playback mode.
- Dragging previews live. Pointer release commits one undo entry; Escape or lost capture cancels the gesture. Layout changes cancel an active gesture before rearranging views.
- Obstacle and path selection are distinct. Only one transform target is active. The obstacle remains a guide; no implied avoidance or collision response.

## 2. Pace along the shape

Add a scalar **Speed** graph before asking artists to manage XYZ velocity components. A direction change can alter component curves while total speed stays constant; display both when inspecting.

3D overlays:

- Equal-time dots: large spacing means fast motion; dense spacing means slow motion. Use a visible time interval and an adaptive display count.
- Optional path coloring by speed with a numeric legend, separate from XYZ axis colors.
- Scrubbed particle, trail and a velocity arrow at the current position. Arrow scale is labeled; clipping a displayed arrow never changes its numeric velocity.
- Selecting a time marker highlights the corresponding age in Speed, Position and Velocity.

Use two explicit timing policies:

| Policy | Artist controls | Consequence |
| --- | --- | --- |
| Finish in lifetime (default) | Path, duration, relative pace profile | Normalize pace so the particle traverses the path in the specified time. Show the resulting physical speed. A longer edited path changes the physical speed needed to finish. |
| Use physical speed | Path and speed in units/second | Integrate speed to determine progress. The particle may not reach the end during its lifetime. If it arrives early, hold at the endpoint and show that stop. |

Do not suggest that fixed path length, duration and arbitrary absolute speed are independent. Display the active policy beside Speed. Zero pace over an interval creates a hold; an entirely zero profile is invalid for completing a nonzero path. Reverse travel is deferred to an explicit future mode rather than allowing negative scalar speed accidentally.

Shape edits preserve the pace profile and duration in the default policy. Speed edits preserve the geometric path. Arrival-time pins and retiming are later explicit operations, not side effects of moving a point.

## 3. Motion examples and controls

### Smoke

Shape the main rise and lean in 3D. Start with a fast-rise/slow-tail pace preset, then tune its falloff. Add low-amplitude lateral drift and smooth evolving variation, optionally increasing with age. Show a cohort emitted at successive times so the artist sees a plume, not only one moving dot.

Controls should describe the visual intent: Rise pace, Slowdown, Drift direction, Drift amount, Spread and Swirl rate/scale. The smoke preset is authored motion, not a buoyancy or fluid simulation. Dissipation is a separate appearance preview; opacity fading must not secretly alter speed. A fixed camera-facing opacity preview is sufficient initially.

### Fish

Shape the intended route first. Add smooth wander and a separate speed modulation profile. Let the artist select a turn region and choose Maintain speed, Slow into turn / Recover, or Burst out of turn. Amount and blend extent are editable. These are art-direction presets, not claims about universal fish behavior.

Turn regions attach to path segments/progress so they remain at the bend when overall duration changes. Age-based speed effects attach to normalized age. Display the binding for each modifier. Curvature can help suggest regions later; manual selection is the first implementation. Heading follows velocity with a stable up direction; banking/body animation is a later preview feature.

## 4. What a range means in 3D

| Range type | 3D representation | Important behavior |
| --- | --- | --- |
| Speed min/max | Seeded particles at different progress along the same path; time markers and trails | Speed-only variation does not widen the geometric route. Fixed-endpoint timing can make faster particles wait at the end. |
| Position/spatial variation | Ghost trajectories around the reference path, selected-age cloud and editable spread cross-sections | Prefer path-relative lateral/vertical spread for artists. Independent world-axis XYZ bounds are an advanced option. |
| XYZ velocity min/max | Integrate each seeded velocity history; display its trajectory and current velocity arrow | A velocity range is a set of vectors, not a spatial tube radius. Small persistent changes can accumulate into large position differences. |
| Lifetime range | Different particle ages/alive states and endpoints in cohort preview | Show particle age versus emitter time explicitly. |
| Graph display bounds | Highlight the corresponding time slice in 3D; optional isolate interval | Zooming or cropping the graph must never change motion, world scale, or trajectory geometry. |

Default preview: one bright reference trajectory, 16 subdued seeded trajectories, and the selected sample highlighted. A sample-count control trades clarity/performance for coverage. Pin the seed and sample identity across edits, scrubbing and layout changes. Selecting a ghost selects the same sample in every graph.

At a given age, show the particle cloud/cross-section. Optionally show a sampled spread envelope, labeled as sampled coverage. Do not call it a guaranteed bound or assign a probability percentage without the relevant distribution and estimator. A sample envelope and component-wise min/max curves need not correspond to any single realizable trajectory.

Spatial spread can be asymmetric and vary along the route. Use a stable transported path frame for lateral/vertical handles, including inflections, near-vertical sections and stationary regions. Do not assume the Frenet normal is stable everywhere.

### Randomness is part of the document

Offer two distinct behaviors:

1. **Per particle:** choose deterministic random parameters once from the seed. A particle retains its identity through its lifetime. For a scalar min/max curve, a first implementation uses one fixed blend parameter over time.
2. **Evolving:** smooth, time-correlated noise with amplitude and change rate. Do not draw fresh random values per render frame.

Default scalar distribution is uniform and documented. XYZ correlation must be explicit: linked axes use a shared parameter; independent axes use separate parameters. Neither is equivalent to uniform sampling in a sphere. Shape variation, speed variation and correlated turbulence have separate seeds/streams so adjusting one does not reshuffle all others.

In Finish-in-lifetime mode, pace randomization changes the distribution of speed along the route but not the shared arrival time. A uniform speed multiplier would normalize away, so disable that control in this policy or switch explicitly to physical-speed timing. Lifetime variation is a separate option.

Graph ribbons show reference/sample variation with clear provenance: authored input bounds versus evaluated sample coverage. Derive sampled velocity from each sampled position history, or sampled position from each sampled velocity history. Do not independently sample both.

## 5. Evaluation and graph consistency

Represent the reference path as C(s), where s measures arc length. Let q(t) be traveled distance from the timing model. Then:

`P(t) = C(q(t))`

`V(t) = dC/ds · dq/dt`

In smooth, forward, unmodified motion, the norm of V equals the authored physical speed. Build an adaptive arc-length lookup for spatial splines; using the raw spline parameter as distance would create accidental speed changes.

For a normalized-age relative pace r(a), the finish policy uses the normalized accumulated pace to map to total path length. For absolute speed, integrate speed over seconds. Hold behavior at endpoints is explicit. At linear corners or broken tangents, expose incoming/outgoing values rather than drawing a false continuous velocity.

For positional offsets D(t, seed), evaluate final motion as `P = C(q) + D`; final velocity includes the derivative of D. A changing offset frame also contributes. For velocity-based drift, integrate the drift rather than adding it as a position offset. Show actual final speed as well as reference-path pace when variation changes them.

The deterministic evaluator must produce identical results regardless of playback frame rate, scrub order, preview sample count or pause/resume. Numerical integration, derivative and adaptive sampling tolerances belong to the evaluator/export contract.

### Graph editing policy

First release: Shape and Speed are editable; Position/Velocity are synchronized inspection views for trajectory-mode documents. Keep the old velocity-authoring mode editable for existing v1 documents.

Later, Position graph edits can operate on explicit time anchors with a defined spatial-fit/retime operation. Arbitrary XYZ velocity edits may change both route and timing; expose an explicit conversion to editable timed motion, with a preview and undo. Do not create two competing authorities or pretend that unconstrained component edits preserve shape. Artist intent takes priority over forcing full bidirectional editing into the first release.

## 6. Interface

Preserve the current stable header, right inspector and shared timeline. Replace the main layout labels with task modes **Shape / Speed / Variation**, with Position/Velocity graph focus available as view controls.

- Shape: large 3D canvas, compact tool strip, selection-specific point/tangent properties.
- Speed: 3D preview plus a large scalar speed graph, time dots visible by default.
- Variation: reference and ghost trajectories, min/max or spread controls, seed and cohort controls.
- Inspect: expand Position/Velocity without moving the inspector or timeline. Fit all, Fit selection and axis isolation are needed for large spikes.
- Export: separate authoring JSON, one selected deterministic sample, and engine-target proposals. Do not bury bake tolerances or diagnostics among everyday editing controls.

Technical explanations belong in help. Timing policy, units, selected sample and reference-versus-final motion are required visible context.

## 7. Delivery sequence and acceptance checks

| Milestone | Deliverable | Acceptance |
| --- | --- | --- |
| 1. Spatial authoring | New document mode, direct 3D point edits, smooth/linear spans, tangent selection, undo/cancel | Moving a point updates route and derived graphs; inserting preserves shape; one drag is one undo; old files reproduce unchanged. |
| 2. Pace | Arc-length timing, speed graph, two timing policies, time dots, smoke/fish pace presets | Constant speed stays constant on an unevenly parameterized spline; finish policy meets lifetime; physical-speed mode respects distance and endpoint behavior. |
| 3. Variation | Deterministic ranges, ghost paths, sample selection, spread handles, smooth noise and cohort preview | Same seed reproduces across scrub/playback and exports; speed-only variation stays on route; sample-count changes retain existing sample identities. |
| 4. Advanced output | Selected-sample baking, bound/coverage diagnostics, explicit graph-edit conversions | Reconstruct exported curves and compare position/velocity errors; variation semantics unsupported by the target remain explicit instead of being silently discarded. |

Add meaningful numerical tests: velocity equals an independent finite-difference position estimate away from discontinuities; integration recovers displacement; zero-length spans and full holds stay finite; sided corner values remain correct; frame construction is stable. Test real 3D drag, cancel, undo, selection and graph/time correspondence in the browser.

Architecture: versioned document union with legacy velocity and new trajectory modes; shared `evaluate(time, seed)` result for position/velocity; path geometry, timing and variation evaluated in a documented order; rendering and export consume that same result. Save seeds, correlation, timing policy and authored controls, not just preview points. Conversion from legacy velocity motion is explicit and reports approximation error.

## Reference context

The proposed workflow is our product design. Existing tools provide useful precedents, not a promise of engine equivalence:

- [Unity: varying particle properties over time](https://docs.unity.com/en-us/engine/6000.0/manual/visual-effects/particle-systems/varying-particle-system-properties-over-time) documents constants, curves and two-curve ranges. This plan specifies its own deterministic sampling/correlation semantics explicitly.
- [Houdini Point Velocity](https://www.sidefx.com/docs/houdini/nodes/sop/pointvelocity.html) documents computing velocity from motion and adding spatial/time-varying noise with separate scale and time controls.
