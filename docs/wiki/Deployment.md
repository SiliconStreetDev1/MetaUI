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

4. `ui5 build --clean-dest`

   `--clean-dest` empties `dist/` first. Without it, files from an earlier build stay behind, so a
   `dist/` that looks right can still be hiding a missing step 3.

Your app's `dist/` now carries MetaUI under `resources/nz/co/siliconst/ui5/metaui/`. Deploy it the
way you deploy any Fiori app.

> **The one mistake to avoid.** Skip step 3 and the build still succeeds, with **no warning at
> all**. The deployed app then renders a **blank white page**, with `failed to load
> '…/library.js'` and a handful of 404s in the browser console. If you see that: step 3 is
> missing — or you meant Route B and the library is not on the server yet.
>
> **The same errors under `ui5 serve`** mean something else: the server was started before
> `npm install`, and it reads `node_modules` only when it starts. Restart it.

Avoid `ui5 build --all`, which copies the whole UI5 framework into the output.

---

## Route B — deploy MetaUI once, as a shared BSP library

MetaUI lives on the ABAP system as its own BSP application, and every Fiori app references it. Done
once, and again on each MetaUI upgrade.

> **Route B is not finished.** Step 1, building the payload, is tested: the result is a working
> library when served. Steps 2 and 3, uploading it and having apps find it, have **never been run
> against a real SAP system**. They say below what is known and what is not. If you need something
> that works today, use Route A.

**1. Build the payload.** This is the one step done in this repository rather than in your app:

```bash
git clone https://github.com/SiliconStreetDev1/MetaUI.git
cd MetaUI
npm install
npm run pack:bsp
```

Build the same version your apps install: `version` in this repository's `package.json` should
match the `@siliconst/metaui` version in your app's `package.json`.

`pack:bsp` runs `ui5 build` and then moves `dist/resources/nz/…` to `dist/nz/…`. The library's own
files — `.library`, `manifest.json`, `library.js`, `library-preload.js` and the message bundles —
are then in `dist/nz/co/siliconst/ui5/metaui/`. That folder also carries the `-dbg.js` files, the
TypeScript sources and the source maps.

The npm package holds the same library files in `src/nz/co/siliconst/ui5/metaui/`, without the
TypeScript sources or source maps. Whether that folder can be uploaded instead of building one is
untested too.

**2. Upload it. Not yet documented.** Nothing here has been tried, so the choices are yours: the
upload tool (`/UI5/UI5_REPOSITORY_LOAD`, `npx fiori deploy`, or a UI5 Tooling deploy task), the BSP
application name, the package and the transport.

**Which folder becomes the BSP root is unresolved.** The project's working understanding, also
untested, is that the SAP UI5 App Index registers a library from the `manifest.json` at the
**root** of its BSP application, and that you run `/UI5/APP_INDEX_CALCULATE` after uploading. On
that reading you would upload the *contents* of `dist/nz/co/siliconst/ui5/metaui/`. `pack:bsp` was
written for uploading `dist/` itself, which puts `nz/` at the root and `manifest.json` four folders
below it. Both cannot be right, and only a real system will say which. Get it wrong and the upload
still succeeds; the failure shows up later, as 404s for `…/nz/co/siliconst/ui5/metaui/…` when an
app loads.

**3. In each consuming app:** Route A steps 1 and 2, and deliberately **not** step 3. The library is
already on the server; bundling it again ships a second copy.

How the app then finds the library on the server is untested as well. On a Fiori Launchpad that is
the App Index's job, and the `manifest.json` declaration from Route A step 2 is all the app
supplies. For an app started outside the Launchpad, from its own `index.html`, this page does not
say how it finds the library.

---

## Local development

Nothing to configure, either way. `ui5 serve` resolves MetaUI straight out of `node_modules`,
because the published package ships its own `ui5.yaml` declaring itself a library — that is what
maps `src/nz/co/siliconst/ui5/metaui/` onto the virtual `/resources/nz/co/siliconst/ui5/metaui/`.

It does that once, when it starts. **Restart `ui5 serve` after installing or upgrading MetaUI.**

---

## Background

**Declare the library; do not merely point a resource root at it.** UI5 fetches a library's
`library-preload.js` only when the library is *named as a library*, in `manifest.json` under
`sap.ui5.dependencies.libs` or in `data-sap-ui-libs`. Measured on OpenUI5 1.120.50 rendering one
eight-field form from a **built** app: **2 HTTP requests when declared, 87 when only
`data-sap-ui-resourceroots` is set.** On localhost that is easy to miss; across a real network
those 87 resolve in serialised waves and dominate first render.

Those figures are for `ui5 build` output. `ui5 serve` builds no preload bundles, so under it every
module is its own request — around a hundred for MetaUI, declared or not. A long Network tab under
`ui5 serve` does not mean the declaration failed.

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
