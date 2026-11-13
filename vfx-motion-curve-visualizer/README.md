# VFX Motion Curve Visualizer

Open **https://arislyu.com/vfx-motion-curve-visualizer/**.

The root `index.html` and `assets/` are the production build served by GitHub Pages. Editable React/TypeScript source, tests, design notes and rollback instructions are in `source/`. Initial source snapshot: `6df2a91` from the local motion-editor repository.

## Develop and rebuild

```powershell
cd source
npm ci
npm test
npm run dev
```

After editing, build and update the served files from this tool folder:

```powershell
npm --prefix source run build
Copy-Item -LiteralPath source/dist/index.html -Destination . -Force
Copy-Item -LiteralPath source/dist/assets -Destination . -Recurse -Force
```

The Vite build uses relative asset URLs so it works under this subdirectory. Dependencies, build caches and generated `source/dist/` are ignored. The committed root assets are the published output.

## Rollback

Click **Previous editor** in the application to use the original velocity editor. Repository history tracks the published build and source together; revert the tool's commit to roll back the addition. `source/ROLLBACK.md` describes the original local source snapshot, which is specific to the development computer and is not included in this website repository.
