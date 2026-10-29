# Deployment

Two ways to get MetaUI onto a server. Pick one — they configure the consuming app differently.

> **Deploying one app that uses MetaUI?** → **Route A**, bundle it.
> **Deploying several apps that share MetaUI?** → **Route B**, deploy the library once.

---

## Route A — bundle MetaUI into your app

One deployable holding your app and MetaUI together.

1. `npm install @siliconst/metaui`
2. Declare the library in your app's `manifest.json` — see [Getting Started](GettingStarted.md).
3. Opt MetaUI into your app's build, in **the app's** `ui5.yaml`:

   ```yaml
   builder:
     settings:
       includeDependency:
         - nz.co.siliconst.ui5.metaui
   ```

4. `ui5 build`

Your app's `dist/` now carries MetaUI under `resources/nz/co/siliconst/ui5/metaui/`. Deploy it the
way you deploy any Fiori app.

> **The one mistake to avoid.** Skip step 3 and the build still succeeds, with **no warning at
> all**. The deployed app then renders a **blank white page**, with `failed to load
> '…/library.js'` and a handful of 404s in the browser console. If you see that: step 3 is
> missing — or you meant Route B and the library is not on the server yet.

Avoid `ui5 build --all`, which copies the whole UI5 framework into the output.

---

## Route B — deploy MetaUI once, as a shared BSP library

MetaUI lives on the ABAP system as its own BSP application, and every Fiori app references it. Done
once, and again on each MetaUI upgrade.

**1. Build the BSP payload**, from a clone of this repository:

```bash
npm run pack:bsp
```

That runs `ui5 build` and then flattens the result: `dist/resources/nz/…` becomes `dist/nz/…`.

**Why flatten?** A BSP needs the namespace at the root of the BSP application.
`/UI5/APP_INDEX_CALCULATE` looks for `.library` and `manifest.json` there, and a namespace nested
under `resources/` is not found. The symptom is 404s on the Launchpad rather than an upload error,
which is why it is worth getting right before uploading.

**2. Upload the contents of `dist/`** to the BSP application, so that `nz/` sits at the BSP root.

**3. In each consuming app:** Route A steps 1 and 2, and deliberately **not** step 3. The library is
already on the server; bundling it again ships a second copy.

> **What is verified and what is not.** The payload is verified: after `pack:bsp`, `dist/nz/co/
> siliconst/ui5/metaui/` carries `.library`, `manifest.json`, `library.js`, `library-preload.js`
> and the message bundles, and the library renders correctly when served from a BSP-style path.
> **The upload itself is not verified** — neither that the BSP lands the folder where the App Index
> expects it, nor that a Fiori Launchpad resolves the library afterwards. Nobody has run those
> against a real system and documented the result.

---

## Local development

Nothing to configure, either way. `ui5 serve` resolves MetaUI straight out of `node_modules`,
because the published package ships its own `ui5.yaml` declaring itself a library — that is what
maps `src/nz/co/siliconst/ui5/metaui/` onto the virtual `/resources/nz/co/siliconst/ui5/metaui/`.

---

## Background

**Declare the library; do not merely point a resource root at it.** UI5 fetches a library's
`library-preload.js` only when the library is *named as a library*, in `manifest.json` under
`sap.ui5.dependencies.libs` or in `data-sap-ui-libs`. Measured on OpenUI5 1.120.50 rendering one
eight-field form: **2 HTTP requests when declared, 87 when only `data-sap-ui-resourceroots` is
set.** On localhost that is easy to miss; across a real network those 87 resolve in serialised
waves and dominate first render.

**The two packaging commands are mutually exclusive.**

```
ui5 build  →  dist/resources/nz/…
                 ├─ npm run pack:npm   build + publish-prep  →  dist/src/nz/…   →  npm publish
                 └─ npm run pack:bsp   build + flatten       →  dist/nz/…       →  BSP upload
```

Both post-build steps consume `dist/resources`, so one build serves one route. To switch, run the
other command — it rebuilds from scratch.

**The BSP payload keeps the `-dbg.js` files** so `sap-ui-debug=true` works against the deployed
library. The npm package keeps them too, and drops source maps.
