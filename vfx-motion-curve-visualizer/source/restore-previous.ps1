$ErrorActionPreference = 'Stop'
$projectPath = 'C:\Users\alyu\Documents\New project\vfx-motion-curve-visualizer'
$snapshotPath = 'C:\Users\alyu\Documents\New project\motion-editor-rollback-2026-11-12'
if ((Resolve-Path -LiteralPath $projectPath).Path -ne $projectPath) { throw 'Unexpected project path.' }
if (-not (Test-Path -LiteralPath (Join-Path $snapshotPath 'src\main.tsx'))) { throw 'Rollback snapshot is missing.' }
Copy-Item -LiteralPath (Join-Path $snapshotPath 'src') -Destination $projectPath -Recurse -Force
Get-ChildItem -LiteralPath $snapshotPath -File | Copy-Item -Destination $projectPath -Force
Write-Output 'Previous source and configuration restored. Restart the preview if needed; run npm run build to refresh dist.'
