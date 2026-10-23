/**
 * Standalone demo: a sap.m.Table bound to a real OData V4 service, three scalar columns,
 * and a fourth column holding a MetaUI DynamicHost that edits a JSON document carried in
 * an Edm.String field. Serves both the page and the OData V4 service so it runs offline.
 *
 *   node server.js        ->  http://localhost:8124
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8124;
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CANDIDATES = [path.join(REPO_ROOT, 'dist', 'resources'), path.join(REPO_ROOT, 'dist', 'src')];
function metauiRoot() {
    return CANDIDATES.filter(function (d) {
        return require('fs').existsSync(d + '/nz/co/siliconst/ui5/metaui/library-preload.js');
    })[0] || null;
}

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
        <Property Name="DetailsJson" Type="Edm.String"/>
      </EntityType>
      <EntityContainer Name="Container">
        <EntitySet Name="WorkOrders" EntityType="metaui.mock.WorkOrder"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

function freshRows() {
    return [
        { ID: "WO-1", Code: "PO-10021", Status: "Open", Owner: "Ada Lovelace", DetailsJson: JSON.stringify({ Priority: "High", Quantity: 4, Notes: "Expedite this one" }) },
        { ID: "WO-2", Code: "PO-10022", Status: "Closed", Owner: "Grace Hopper", DetailsJson: JSON.stringify({ Priority: "Low", Quantity: 1, Notes: "Delivered" }) },
        { ID: "WO-3", Code: "PO-10023", Status: "Open", Owner: "Alan Turing", DetailsJson: JSON.stringify({ Priority: "Medium", Quantity: 9, Notes: "Awaiting parts" }) },
        { ID: "WO-4", Code: "PO-10024", Status: "On Hold", Owner: "Katherine Johnson", DetailsJson: JSON.stringify({ Priority: "High", Quantity: 12, Notes: "Supplier delay" }) }
    ];
}
let rows = freshRows();
const patchLog = [];

const PAGE = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>MetaUI x OData V4</title>
<script
  id="sap-ui-bootstrap"
  src="/ui5/resources/sap-ui-core.js"
  data-sap-ui-theme="sap_horizon"
  data-sap-ui-libs="sap.m, sap.ui.core, sap.ui.layout"
  data-sap-ui-compatVersion="edge"
  data-sap-ui-async="true"
  data-sap-ui-resourceroots='{"nz.co.siliconst.ui5.metaui":"/resources/nz/co/siliconst/ui5/metaui"}'>
<\/script>
<style>
  body { margin:0; font-family: "72", Arial, sans-serif; }
  .banner { padding:12px 16px; background:#354a5f; color:#fff; font-size:14px; }
  .banner b { font-weight:600; }
  #log { font-family: Consolas, monospace; font-size:12px; white-space:pre-wrap;
         padding:10px 16px; background:#f5f6f7; border-top:1px solid #d9d9d9; max-height:220px; overflow:auto; }
</style>
</head>
<body class="sapUiBody">
<div class="banner">
  <b>Table bound to a real OData V4 service.</b>
  Three columns come straight from the service. The fourth is a MetaUI DynamicHost whose
  <code>dataJson</code> is bound to the <code>DetailsJson</code> field and driven by a JSON Schema.
  Edit any field in that column &mdash; the PATCH the model sends appears in the log below.
</div>
<div id="content"></div>
<div id="log">PATCH log (live from the service):\n</div>

<script>
sap.ui.getCore().attachInit(function () {
  sap.ui.require([
    "sap/ui/model/odata/v4/ODataModel",
    "sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem", "sap/m/Text",
    "sap/m/Title", "sap/m/Toolbar", "sap/m/ToolbarSpacer", "sap/m/Button",
    "nz/co/siliconst/ui5/metaui/controls/DynamicHost"
  ], function (ODataModel, Table, Column, ColumnListItem, Text, Title, Toolbar, ToolbarSpacer, Button, DynamicHost) {

    var schema = {
      type: "object",
      properties: {
        Priority: { type: "string", enum: ["Low","Medium","High"], ui: { label: "Priority" } },
        Quantity: { type: "integer", ui: { label: "Qty" } },
        Notes:    { type: "string", ui: { label: "Notes" } }
      }
    };

    var oModel = new ODataModel({ serviceUrl: "/odata/v4/wo/", groupId: "$direct" });

    var host = new DynamicHost({ schemaDefinition: schema, editable: true, liveUpdate: true });
    host.bindProperty("dataJson", { path: "DetailsJson" });

    var table = new Table({
      headerToolbar: new Toolbar({ content: [
        new Title({ text: "Work Orders (OData V4)" }),
        new ToolbarSpacer(),
        new Button({ text: "Refresh log", press: pollLog }),
        new Button({ text: "Reset data", press: function () {
          fetch("/odata/v4/wo/__reset").then(function(){ oModel.refresh(); pollLog(); });
        }})
      ]}),
      columns: [
        new Column({ width: "9rem",  header: new Text({ text: "Code" }) }),
        new Column({ width: "7rem",  header: new Text({ text: "Status" }) }),
        new Column({ width: "12rem", header: new Text({ text: "Owner" }) }),
        new Column({ header: new Text({ text: "Details — MetaUI from DetailsJson" }) })
      ]
    });
    table.setModel(oModel);
    table.bindItems({
      path: "/WorkOrders",
      template: new ColumnListItem({ cells: [
        new Text({ text: "{Code}" }),
        new Text({ text: "{Status}" }),
        new Text({ text: "{Owner}" }),
        host
      ]})
    });
    table.placeAt("content");

    function pollLog() {
      fetch("/odata/v4/wo/__probe").then(function (r) { return r.json(); }).then(function (s) {
        var el = document.getElementById("log");
        if (!s.patches.length) { el.textContent = "PATCH log (live from the service):\\n  (none yet — edit a field in the Details column)"; return; }
        el.textContent = "PATCH log (live from the service):\\n" + s.patches.map(function (p, i) {
          return "  " + (i+1) + ". PATCH WorkOrders('" + p.id + "')  " + JSON.stringify(p.body);
        }).join("\\n");
      });
    }
    setInterval(pollLog, 1500);
    pollLog();
  });
});
<\/script>
</body></html>`;

const MIME = { ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".properties": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
    ".library": "application/xml; charset=utf-8", ".css": "text/css", ".html": "text/html; charset=utf-8" };

http.createServer(function (req, res) {
    const url = new URL(req.url, "http://localhost");
    const p = decodeURIComponent(url.pathname);

    if (p === "/" || p === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(PAGE);
    }

    if (p.startsWith("/odata/v4/wo/")) {
        const tail = p.slice("/odata/v4/wo/".length);
        if (tail === "$metadata") {
            res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "OData-Version": "4.0" });
            return res.end(METADATA);
        }
        if (tail === "__probe") {
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ patches: patchLog, rows: rows }));
        }
        if (tail === "__reset") {
            rows = freshRows(); patchLog.length = 0;
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end('{"reset":true}');
        }
        const key = /^WorkOrders\('([^']+)'\)$/.exec(tail);
        if (req.method === "PATCH" && key) {
            let body = "";
            req.on("data", function (c) { body += c; });
            req.on("end", function () {
                let parsed = {};
                try { parsed = JSON.parse(body || "{}"); } catch (e) { parsed = { parseError: String(e.message) }; }
                patchLog.push({ id: key[1], body: parsed });
                const row = rows.find(function (r) { return r.ID === key[1]; });
                if (row) { Object.assign(row, parsed); }
                console.log("PATCH WorkOrders('" + key[1] + "')", JSON.stringify(parsed));
                res.writeHead(200, { "Content-Type": "application/json; odata.metadata=minimal", "OData-Version": "4.0" });
                res.end(JSON.stringify(Object.assign({ "@odata.context": "$metadata#WorkOrders/$entity" }, row || {})));
            });
            return;
        }
        if (key) {
            const row = rows.find(function (r) { return r.ID === key[1]; });
            res.writeHead(row ? 200 : 404, { "Content-Type": "application/json; odata.metadata=minimal", "OData-Version": "4.0" });
            return res.end(row ? JSON.stringify(Object.assign({ "@odata.context": "$metadata#WorkOrders/$entity" }, row)) : JSON.stringify({ error: { code: "NOT_FOUND", message: "WorkOrder '" + key[1] + "' does not exist.", details: [{ message: "Check the key or refresh the list." }] } }));
        }
        if (tail.startsWith("WorkOrders")) {
            res.writeHead(200, { "Content-Type": "application/json; odata.metadata=minimal", "OData-Version": "4.0" });
            return res.end(JSON.stringify({ "@odata.context": "$metadata#WorkOrders", "@odata.count": rows.length, value: rows }));
        }
    }

    // UI5 itself, proxied server-side. Fetching the CDN from the page trips Chromium's
    // opaque-response blocking in some setups; proxying sidesteps it and keeps one origin.
    if (p.startsWith("/ui5/")) {
        const upstream = "https://ui5.sap.com/1.120.50/" + p.slice("/ui5/".length) + (url.search || "");
        fetch(upstream).then(function (r) {
            if (!r.ok) { res.writeHead(r.status); return res.end("upstream " + r.status); }
            const ct = r.headers.get("content-type") || "application/octet-stream";
            return r.arrayBuffer().then(function (buf) {
                res.writeHead(200, { "Content-Type": ct, "Cache-Control": "public, max-age=86400" });
                res.end(Buffer.from(buf));
            });
        }).catch(function (e) { res.writeHead(502); res.end("proxy error: " + e.message); });
        return;
    }

    if (p.startsWith("/resources/nz/co/siliconst/ui5/metaui")) {
        const rel = p.replace("/resources/nz/co/siliconst/ui5/metaui", "");
        const root = metauiRoot();
        if (!root) { res.writeHead(503); return res.end('Built library not found. Run: npm run build'); }
        const file = path.join(root, 'nz/co/siliconst/ui5/metaui', rel);
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
            return res.end(fs.readFileSync(file));
        }
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found: " + p);
}).listen(PORT, function () {
    console.log("MetaUI x OData V4 demo running at  http://localhost:" + PORT);
    console.log('Serving MetaUI from ' + (metauiRoot() || 'NOT FOUND'));
});
