# MetaUI starter app

The smallest UI5 Tooling application that renders a MetaUI form. Copy this folder and edit it,
rather than assembling an app from the documentation.

```bash
npm install
npm start          # http://localhost:8080
```

You should see a form with five fields, generated from this object in `webapp/Component.js` with
**no schema**: three `sap.m.Input`s, a `sap.m.DatePicker` for the date string, and a
`sap.m.CheckBox` for the boolean.

```js
{ FullName: "Ada Lovelace", Email: "ada@example.com", CheckIn: "2026-12-01", Guests: 2, VIP: true }
```

That is MetaUI's inference path. Supply a `schemaDefinition` when you want control over widgets,
validation and layout; see [Schemas & Data Inference](../../docs/wiki/SchemasAndInference.md).

## What each file is doing

| File | Why it is here |
|---|---|
| `package.json` | Depends on `@siliconst/metaui` from npm, and on `@ui5/cli` to serve and build. |
| `ui5.yaml` | The `framework:` block supplies UI5 itself. The `builder:` block bundles MetaUI into the build — that is **Route A**; see below. |
| `webapp/manifest.json` | Declares `nz.co.siliconst.ui5.metaui` under `sap.ui5.dependencies.libs`. **Required** — UI5 only fetches a library's `library-preload.js` when the library is named as a library. |
| `webapp/Component.js` | Puts a plain object in a `JSONModel`. Nothing MetaUI-specific. |
| `webapp/Main.view.xml` | Declares the `meta:` namespace and places one `DynamicHost`, bound to the model. |
| `webapp/Main.controller.js` | Handles `submit`. The event carries `payload` (object) and `payloadJson` (string). |

Nothing else is needed. `ui5 serve` resolves MetaUI straight out of `node_modules`, because the
published package ships its own `ui5.yaml` declaring itself a library.

## Deploying it

Two routes, covered in [Deployment](../../docs/wiki/Deployment.md). This app is set up for
**Route A** — `ui5 build` produces one deployable containing the app and MetaUI together.

For **Route B**, where MetaUI is deployed once as a shared BSP library and every app references it,
delete the `builder:` block from `ui5.yaml`. Leave the `manifest.json` declaration in place.

> Getting that backwards is the one mistake worth knowing about. An app with no `builder:` block
> whose library is *not* on the server builds successfully, with no warning, and then renders a
> **blank page** with `failed to load '…/library-preload.js'` in the browser console.
