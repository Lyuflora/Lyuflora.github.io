# Motion Editor UI/UX iteration

Reviewed November 11, 2026, using four screenshots and the supplied feature summary. The newer JS/Canvas editor is on another PC; its source and runtime were unavailable. Screenshot findings are observations, not a functional audit of that implementation. The implemented iteration is in this local React velocity-authoring app.

## Findings and proposed changes

| Priority | Screenshot evidence | User impact | Design response |
| --- | --- | --- | --- |
| P0 | Wide outer margins while a narrow sidebar scrolls through long paragraphs | Available space does not help editing; precise fields are hard to find | Fill the application window. Keep a readable inspector on the right and let its content scroll independently. |
| P0 | Point tools, document conversion, selection explanations, construction and export all appear in one sidebar | Users must repeatedly find the controls relevant to their action | Separate selection properties, scene guides, motion settings, creation and export. Show advanced controls in context. |
| P0 | Multi-row viewport toolbar and repeated Add/Delete controls | Controls consume canvas space and duplicate decisions | One compact tool strip; selected-point/segment settings in the inspector. Place whole-document operations in a separate menu. |
| P1 | Expanded graph rearranges the inspector, document actions and transport | Spatial memory is lost when switching tasks | Keep header, inspector and timeline in fixed locations. Expand the chosen graph within the same workspace. |
| P1 | Repeated local-document notices, implementation versions and mathematical caveats | Important feedback is buried in routine information | Short status in the header; contextual help for model semantics; expandable diagnostics for detailed results. |
| P1 | Very large late velocity peak, small early values, overlapping labels | Early motion becomes difficult to inspect even in the expanded graph | Fit all / Fit selection; time-range zoom; solo axis; stable scales during dragging; numeric incoming/outgoing velocity for the selected knot. Keep units explicit. |
| P1 | Obstacle toolbar overlaps existing point controls; numeric fields are near the bottom of the sidebar | Scene editing feels bolted on and precise adjustment is difficult | Selecting the obstacle opens Scene properties with Move/Resize, snapping and numeric fields. Keep only the manipulation handles in the viewport. |
| P2 | Tiny text and similar visual weight across controls, labels, notices and action buttons | Reading and scanning take unnecessary effort | Larger controls and key values; subdued secondary text; consistent selected states; fewer persistent labels. |
| P2 | Axis colors differ between viewport and graphs | Moving between spatial and curve views requires remapping axes | Use one labeled axis palette throughout, including handles and numeric fields. Preserve textual X/Y/Z identifiers. |

The screenshots do not establish whether the late spike is intentional, a tangent overshoot, or a timing issue. Do not smooth it away or silently normalize physical velocity. Give the user inspection tools first.

## Implemented locally

- Full-width workspace without the decorative feature footer.
- Persistent right inspector with Selection, Scene and Motion tabs, including keyboard tab navigation.
- Overview, Velocity and Position focus layouts with the same mounted views, selection and timeline.
- Graph dimensions measured from their actual display area so axis text stays readable as panels resize.
- Larger selection fields, clear Editable/Derived badges and compact workspace controls.
- Obstacle editor moved from a canvas overlay into Scene properties; existing 3D Move/Resize, snapping and exact numeric edits retained.
- Presets moved into an on-demand chooser.
- Download explicitly labeled as a download; no implication that an existing file was overwritten.
- Responsive stacked views below 900 px.

## Applying the design to the newer editor

Keep its shared physical motion model. This local app's velocity-key model is not a replacement for it.

**Selection panel:** A selected point exposes age, XYZ position and relevant tangent controls. A selected segment exposes Smooth/Linear and interval properties. Multi-selection exposes shared operations and proportional radius/falloff. Incoming/outgoing velocity remains explicit at discontinuities. Whole-document conversion should stay separate from selection operations.

**Scene panel:** Camera view, guides, obstacle transforms and illustrative particle-cohort settings. Obstacle changes remain guide changes, not trajectory edits or collision simulation.

**Motion panel:** Duration, spawn offset, timing and document-level interpolation operations. Retime remains explicit. Avoid displaying schema versions and conversion implementation details as primary labels.

**Create flow:** Simple Motion, Blank Trajectory and Smoke Column open focused parameter panels. Construction has an obvious Finish/Cancel state and retains the previous document until committed.

**Export workspace:** Independent Position/Velocity proposal status, tolerances, key budgets, reconstruction overlays and numeric exports. Preserve ready/blocked diagnostics and unresolved handoff requirements. Keep these out of the everyday point inspector.

**Persistent shell:** One document header, one timeline, one inspector location. A focused graph rearranges view sizes without duplicating document controls or resetting camera, selection or time. Cancel any active gesture before changing layout in the newer implementation.

The newer version's mixed smooth/linear spans, editable position, tangent modes, proportional editing, undo, file identity, construction and bake/export pipeline have not been ported. They require its source to preserve and test their behavior.

## Validation

Production build and all 17 existing motion tests pass. Browser checks cover four desktop sizes (1280×800, 1440×900, 1920×1080, 2560×1440), graph focus, selection/time retention, numerical key editing, numerical obstacle move/resize, inspector visibility, JSON download, preset modal and keyboard inspector navigation. See VERIFICATION.md for scope and limitations.
