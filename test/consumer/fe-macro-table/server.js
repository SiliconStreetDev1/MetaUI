/**
 * @file server.js
 * @description A Fiori Elements List Report whose custom column hosts a `DynamicHost`, served
 * together with the OData V4 service it needs. Everything else under `test/consumer/` drives a
 * plain `sap.m.Table`; this is the one place MetaUI is exercised inside a real Fiori Elements
 * table, which is where consumers actually embed it.
 *
 * It exists because `sap.fe.macros.Table` (`sap.ui.mdc.Table` underneath) sizes its columns in
 * JavaScript from annotations and type metadata rather than letting the browser measure content.
 * A custom column has no type metadata, so it is handed an equal share of the table width —
 * measured at 292px on a 1600px viewport with five columns, and 148px at 850px. How the form
 * looks therefore depends on the reader's screen and how many columns are shown, which is why
 * the same app looks fine on one machine and broken on another.
 *
 * Two hypotheses were tested here and disproved, recorded so they are not chased again:
 * the column widths are **not** timing-dependent (delaying the schema by 2.5s after the table
 * laid out produced byte-identical widths), and popin does **not** lose an uncommitted edit in a
 * MetaUI field, though it does in a plain `sap.m.Input` in the same table.
 *
 *   node server.js   ->  http://localhost:8150
 *
 * Switches, all optional:
 *   ?delay=<ms>        how late the schema reaches the hosts; 0 is the "warm cache" case
 *   ?labelSpan=<n>     sets root `ui.labelSpan` on the schema
 *   COLW=<css width>   sets `width` on the custom column in the manifest, the Fiori Elements
 *                      lever for stopping the column shrinking with the viewport
 *   METAUI_ROOT=<dir>  serve MetaUI from somewhere other than the consumer app's node_modules
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require("https");

const PORT = Number(process.env.PORT) || 8150;
const UI5 = "https://ui5.sap.com/1.120.50/";

// MetaUI comes from the packed tarball the consumer app installed, not from `dist/`, so a build
// running in the repository while this server is up cannot change what it serves mid-session.
const METAUI_ROOT = process.env.METAUI_ROOT || path.resolve(
    __dirname, "..", "app", "node_modules", "@siliconst", "metaui", "src"
);

const METADATA = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="metaui.mock" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="WorkOrder">
        <Key><PropertyRef Name="ID"/></Key>
        <Property Name="ID" Type="Edm.String" Nullable="false"/>
        <Property Name="Code" Type="Edm.String"/>
        <Property Name="Status" Type="Edm.String"/>
        <Property Name="Owner" Type="Edm.String"/>
        <Property Name="Site" Type="Edm.String"/>
        <Property Name="DetailsJson" Type="Edm.String"/>
      </EntityType>
      <EntityContainer Name="Container">
        <EntitySet Name="WorkOrders" EntityType="metaui.mock.WorkOrder"/>
      </EntityContainer>

      <Annotations Target="metaui.mock.WorkOrder">
        <Annotation Term="UI.HeaderInfo">
          <Record Type="UI.HeaderInfoType">
            <PropertyValue Property="TypeName" String="Work Order"/>
            <PropertyValue Property="TypeNamePlural" String="Work Orders"/>
          </Record>
        </Annotation>
        <Annotation Term="UI.LineItem">
          <Collection>
            <Record Type="UI.DataField"><PropertyValue Property="Value" Path="Code"/></Record>
            <Record Type="UI.DataField"><PropertyValue Property="Value" Path="Owner"/></Record>
            <Record Type="UI.DataField"><PropertyValue Property="Value" Path="Status"/></Record>
            <Record Type="UI.DataField"><PropertyValue Property="Value" Path="Site"/></Record>
          </Collection>
        </Annotation>
        <Annotation Term="UI.SelectionFields">
          <Collection><PropertyPath>Status</PropertyPath></Collection>
        </Annotation>
      </Annotations>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

function freshRows() {
    const d = (p, q, n) => JSON.stringify({ Contact: p, Quantity: q, Notes: n, DueOn: "2026-11-30", Approved: q > 5 });
    return [
        { ID: "WO-1", Code: "PO-10021", Status: "Open",    Owner: "Ada Lovelace",      Site: "Auckland",    DetailsJson: d("Ada Lovelace", 4, "Expedite this one") },
        { ID: "WO-2", Code: "PO-10022", Status: "Closed",  Owner: "Grace Hopper",      Site: "Wellington",  DetailsJson: d("Grace Hopper", 1, "Delivered") },
        { ID: "WO-3", Code: "PO-10023", Status: "Open",    Owner: "Alan Turing",       Site: "Christchurch", DetailsJson: d("Alan Turing", 9, "Awaiting parts") },
        { ID: "WO-4", Code: "PO-10024", Status: "On Hold", Owner: "Katherine Johnson", Site: "Hamilton",    DetailsJson: d("Katherine Johnson", 12, "Supplier delay") }
    ];
}
let rows = freshRows();

const FILES = {
"/index.html": `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>FE macro table + MetaUI</title>
<script id="sap-ui-bootstrap"
  src="/ui5/resources/sap-ui-core.js"
  data-sap-ui-theme="sap_horizon"
  data-sap-ui-compatVersion="edge"
  data-sap-ui-async="true"
  data-sap-ui-oninit="module:sap/ui/core/ComponentSupport"
  data-sap-ui-resourceroots='{"feapp": "./", "nz.co.siliconst.ui5.metaui": "./metaui/nz/co/siliconst/ui5/metaui"}'>
<\/script>
</head>
<body class="sapUiBody">
<div data-sap-ui-component data-name="feapp" data-id="container" data-settings='{"id":"feapp"}' style="height:100%"><\/div>
</body></html>`,

"/Component.js": `sap.ui.define(["sap/fe/core/AppComponent", "sap/ui/model/json/JSONModel"], function (AppComponent, JSONModel) {
    "use strict";
    // The schema reaches the hosts through a named model that is populated LATE, which is what
    // makes the race deterministic: the mdc table lays its columns out before any host has content.
    var LS = /[?&]labelSpan=([0-9]+)/.exec(location.search);
    var SCHEMA = {
        type: "object",
        ui: LS ? { labelSpan: parseInt(LS[1], 10) } : undefined,
        properties: {
            Contact:  { type: "string", maxLength: 60 },
            Quantity: { type: "integer" },
            Notes:    { type: "string" },
            DueOn:    { type: "string", format: "date" },
            Approved: { type: "boolean", ui: { widget: "switch" } }
        }
    };
    return AppComponent.extend("feapp.Component", {
        metadata: { manifest: "json" },
        init: function () {
            AppComponent.prototype.init.apply(this, arguments);
            var lazy = new JSONModel({ schema: null });
            this.setModel(lazy, "lazy");
            var m = /[?&]delay=([0-9]+)/.exec(location.search);
            var delay = m ? parseInt(m[1], 10) : 1500;
            window.__metauiSchemaLoaded = false;
            setTimeout(function () {
                lazy.setProperty("/schema", SCHEMA);
                window.__metauiSchemaLoaded = true;
            }, delay);
        }
    });
});`,

"/manifest.json": JSON.stringify({
    "_version": "1.59.0",
    "sap.app": {
        id: "feapp",
        type: "application",
        title: "Work Orders",
        dataSources: {
            mainService: { uri: "/odata/v4/wo/", type: "OData", settings: { odataVersion: "4.0" } }
        }
    },
    "sap.ui": { technology: "UI5", deviceTypes: { desktop: true, tablet: true, phone: true } },
    "sap.ui5": {
        dependencies: {
            minUI5Version: "1.120.0",
            libs: {
                "sap.m": {}, "sap.ui.core": {}, "sap.ui.layout": {},
                "sap.fe.templates": {},
                "nz.co.siliconst.ui5.metaui": {}
            }
        },
        models: {
            "": {
                dataSource: "mainService",
                settings: { synchronizationMode: "None", operationMode: "Server", autoExpandSelect: true, earlyRequests: true,  }
            }
        },
        routing: {
            routes: [{ pattern: ":?query:", name: "WorkOrdersList", target: "WorkOrdersList" }],
            targets: {
                WorkOrdersList: {
                    type: "Component",
                    id: "WorkOrdersList",
                    name: "sap.fe.templates.ListReport",
                    options: {
                        settings: {
                            entitySet: "WorkOrders",
                            variantManagement: "None",
                            initialLoad: "Enabled",
                            views: {
                                paths: [{ key: "all", entitySet: "WorkOrders", annotationPath: "com.sap.vocabularies.UI.v1.LineItem" }]
                            },
                            controlConfiguration: {
                                "@com.sap.vocabularies.UI.v1.LineItem": {
                                    tableSettings: { type: "ResponsiveTable", personalization: false },
                                    columns: {
                                        // The custom column: a manifest column extension pointing at a
                                        // fragment. This is the shape being investigated.
                                        MetaUIDetail: {
                                            header: "Detail (MetaUI)",
                                            template: "feapp.ext.DetailColumn",
                                            position: { placement: "After", anchor: "DataField::Owner" },
                                            availability: "Default"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}, null, 2),

"/ext/DetailColumn.fragment.xml": `<core:FragmentDefinition
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    <meta:DynamicHost
        schemaDefinition="{lazy>/schema}"
        dataJson="{DetailsJson}"
        editable="true" />
</core:FragmentDefinition>`
};

function send(res, code, type, body) {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
}

const MIME = { ".js": "application/javascript", ".json": "application/json", ".xml": "application/xml",
               ".html": "text/html", ".css": "text/css", ".properties": "text/plain", ".png": "image/png",
               ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf" };

http.createServer(function (req, res) {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;

    if (p === "/manifest.json") {
        const colw = process.env.COLW || url.searchParams.get("colw");
        const manifest = JSON.parse(FILES["/manifest.json"]);
        if (colw) {
            manifest["sap.ui5"].routing.targets.WorkOrdersList.options.settings
                .controlConfiguration["@com.sap.vocabularies.UI.v1.LineItem"]
                .columns.MetaUIDetail.width = colw;
        }
        return send(res, 200, "application/json", JSON.stringify(manifest));
    }

    if (FILES[p] !== undefined) {
        const ext = path.extname(p) || ".html";
        return send(res, 200, MIME[ext] || "text/plain", FILES[p]);
    }

    // MetaUI, from the installed package
    if (p.startsWith("/metaui/")) {
        const f = path.join(METAUI_ROOT, p.slice("/metaui/".length));
        if (fs.existsSync(f) && fs.statSync(f).isFile()) {
            return send(res, 200, MIME[path.extname(f)] || "text/plain", fs.readFileSync(f));
        }
        return send(res, 404, "text/plain", "not found: " + p);
    }

    // OData V4
    if (p === "/odata/v4/wo/$metadata") return send(res, 200, "application/xml", METADATA);
    if (p === "/odata/v4/wo/" || p === "/odata/v4/wo") {
        return send(res, 200, "application/json", JSON.stringify({
            "@odata.context": "$metadata", value: [{ name: "WorkOrders", kind: "EntitySet", url: "WorkOrders" }]
        }));
    }
    if (p.startsWith("/odata/v4/wo/WorkOrders")) {
        return send(res, 200, "application/json", JSON.stringify({
            "@odata.context": "$metadata#WorkOrders", "@odata.count": rows.length, value: rows
        }));
    }

    // Minimal OData V4 $batch. UI5's V4 model batches by default and Fiori Elements overrides
    // any attempt to force $direct, so the service has to speak multipart/mixed.
    if (p === "/odata/v4/wo/$batch" && req.method === "POST") {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            const ct = req.headers["content-type"] || "";
            const m = /boundary=(?:"([^"]+)"|([^;\s]+))/.exec(ct);
            const boundary = m ? (m[1] || m[2]) : null;
            if (!boundary) return send(res, 400, "text/plain", "no boundary");

            // One response part per GET in the request, in order.
            const parts = body.split("--" + boundary).filter((s) => /\bGET\b/.test(s));
            const outBoundary = "batch_resp_" + Date.now();
            const pieces = parts.map((part) => {
                const line = (/(?:^|\n)\s*GET\s+(\S+)/.exec(part) || [])[1] || "";
                let payload;
                if (line.startsWith("$metadata")) {
                    payload = METADATA;
                    return `--${outBoundary}\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\n`
                        + `HTTP/1.1 200 OK\r\nContent-Type: application/xml\r\n\r\n${payload}\r\n`;
                }
                payload = JSON.stringify({
                    "@odata.context": "$metadata#WorkOrders",
                    "@odata.count": rows.length,
                    value: rows
                });
                return `--${outBoundary}\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\n`
                    + `HTTP/1.1 200 OK\r\nContent-Type: application/json;odata.metadata=minimal\r\n\r\n${payload}\r\n`;
            });
            const out = pieces.join("") + `--${outBoundary}--\r\n`;
            res.writeHead(200, {
                "Content-Type": `multipart/mixed; boundary=${outBoundary}`,
                "OData-Version": "4.0",
                "Cache-Control": "no-store"
            });
            res.end(out);
        });
        return;
    }

    // UI5, proxied so everything is one origin
    if (p.startsWith("/ui5/")) {
        const upstream = UI5 + p.slice("/ui5/".length) + (url.search || "");
        return https.get(upstream, function (up) {
            res.writeHead(up.statusCode, { "Content-Type": up.headers["content-type"] || "application/octet-stream" });
            up.pipe(res);
        }).on("error", function (e) { send(res, 502, "text/plain", "proxy error: " + e.message); });
    }

    send(res, 404, "text/plain", "not found: " + p);
}).listen(PORT, function () {
    console.log("FE macro table repro on  http://localhost:" + PORT);
    console.log("MetaUI from " + METAUI_ROOT);
});
