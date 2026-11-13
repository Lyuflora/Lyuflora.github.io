# Rollback and recovery

The complete pre-change source/configuration snapshot is at:

`C:\Users\alyu\Documents\New project\motion-editor-rollback-2026-11-12`

**Immediate comparison:** click **Previous editor** in the new header. This opens the original editor. Click **Open trajectory & blend editor** at the bottom to return. New-editor drafts are kept in a separate browser-storage key; original JSON remains available in the previous editor.

**Restore the previous default application:** from PowerShell, run:

```powershell
& 'C:\Users\alyu\Documents\New project\vfx-motion-curve-visualizer\restore-previous.ps1'
```

This copies the snapshot's source and configuration back into the project. It leaves new files in place for later review. No recursive deletion, dependency removal or draft clearing is performed. Restart the dev server if configuration changes are not picked up. Run `npm run build` to regenerate the production output after restoring. The snapshot does not contain node_modules; the existing dependency installation is reused.

**Individual edits:** Undo/Redo and Ctrl+Z / Ctrl+Shift+Z operate within the new editor. A 3D drag commits one history entry. Escape while the 3D canvas is focused cancels an active drag. Download JSON for a portable copy; browser drafts recover after reload but are not a substitute for a file backup. Loading an example or document is undoable. History is session-local; only the current draft is persisted.
