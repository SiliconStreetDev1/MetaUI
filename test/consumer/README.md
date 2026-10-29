# Consumer verification

Everything else in `test/` exercises MetaUI from inside this repository. This directory does the
one thing those cannot: it **installs the packed npm tarball into a real UI5 Tooling application
and drives it in a browser**, so what gets verified is the artefact a consumer actually receives —
after `ui5 build`, after `publish-prep` renamed and pruned it, after npm packed it.

Four suites, 63 checks. The three browser suites assert nothing they have not observed in a live
page; the fourth reads the installed package and runs the app's own `ui5 build`.

## Running it

```bash
# 1. Build and pack the library (from the repository root)
npm run build && npm run publish-prep
cd dist && npm pack && cd ..

# 2. Install that tarball into the consumer app
cd test/consumer/app
npm install
npm run install-lib        # forces a clean reinstall; see the trap below
```

> **The trap.** npm resolves a `file:` dependency from the lockfile's integrity hash, so a second
> `npm install` will happily reinstall the **previous** tarball and every check will pass against
> stale code. `install-lib` deletes `node_modules/@siliconst` and `package-lock.json` first.
> **Always assert the new build is actually installed before believing a result** — look for a
> module you know only exists in the build under test.

```bash
# 3. Serve the app, then run the checks from the repository root
cd test/consumer/app && npm start          # http://localhost:8123

node test/consumer/checks/releasecheck.js  # 18 checks
node test/consumer/checks/panels.js        # 14 checks
node test/consumer/checks/behaviour.js     # 15 checks
```

The deployment checks need no server:

```bash
node test/consumer/checks/deploycheck.js   # 16 checks
```

Set `BASE_URL` to point at a different host or port.

## What each suite covers

| Suite | Covers |
|---|---|
| `releasecheck.js` | The library loads and reports its version; the declarative host renders with real geometry; no page-level horizontal overflow; a host inside a table cell does not overflow it; an edit reaches `outputData`; `openInDialog` opens; the payload viewer's `sap.ui.codeeditor` is not requested until a viewer is opened, not even when the icon is switched on everywhere; no console errors, page errors or failed requests. |
| `panels.js` | **Inference with no schema** — the primary production path: a date string must produce a `DatePicker` and a boolean a `CheckBox`. Plus a **250-row table**: every row reachable in the binding, one page painted, the growing counter reporting the full collection. |
| `deploycheck.js` | **Both deployment routes.** The installed package is the current `dist/` build; the library folder carries `.library`, `manifest.json` (at its root), `library.js`, `library-preload.js` and the message bundle; the shipped `ui5.yaml` carries the build exclusions; and `ui5 build --include-dependency nz.co.siliconst.ui5.metaui` produces MetaUI's preload with no `*-dbg-dbg.js`, no `*.d.ts`, and at most 300 files (171 measured). |
| `behaviour.js` | **Host embedding** — several hosts in one table, each a distinct instance, an edit in one landing only in that row's payload. **Dialog transaction** — an edit stays out of `data` until confirmed, Cancel discards it, Confirm commits it, and it reopens cleanly. |

## `odata-v4-demo/`

A standalone page serving both a real OData V4 service and a UI5 app against it:

```bash
node test/consumer/odata-v4-demo/server.js   # http://localhost:8124
```

A `sap.m.Table` bound through a genuine `sap.ui.model.odata.v4.ODataModel`. Three columns come
straight from the service; the fourth is a `DynamicHost` whose `dataJson` is bound to a
`DetailsJson` field — a JSON document carried in an `Edm.String` — and driven by a JSON Schema.
Editing it issues a real PATCH, which the service records and the page displays live.

It proxies UI5 itself so the page runs from one origin, and resolves the built library from
`dist/` on each request (`publish-prep` renames `dist/resources` to `dist/src`, so a path captured
at startup goes stale the moment the project is rebuilt).

The same round trip is asserted automatically in
`test/webapp/test/unit/core/CoreArchitecture.qunit.js`, module *"OData V4 + table + embedded
host"*. This demo exists to be looked at.

## Why these are not in `npm test`

They need a packed tarball and a running server, which the CI gate does not produce. They are the
**release** check — run them before publishing, not on every commit.
