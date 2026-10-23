/**
 * @file server.js
 * @description Static fixture server for the cross-engine matrix.
 *
 * Mirrors the routing of the Puppeteer harness in `scripts/run-tests.js` (built library under
 * /resources/..., sandbox app and mockData under test/webapp/, /Categories and /odata/v4/main/*
 * mocks) so that an engine difference cannot be an artefact of a different server. It binds to
 * 127.0.0.1 on an ephemeral port; `scripts/run-tests.js` auto-runs `main()` on require, so the
 * routing is reimplemented here rather than imported.
 */

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { STANDALONE_CONSUMER_HTML } = require("./fixtures");

const ROOT_DIR = path.join(__dirname, "..", "..");
const WEBAPP_DIR = path.join(ROOT_DIR, "test", "webapp");
const DIST_RESOURCES_DIR = path.join(ROOT_DIR, "dist", "resources");

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".properties": "text/plain; charset=utf-8",
    ".library": "application/xml; charset=utf-8"
};

const ODATA_V4_METADATA_XML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="metaui.mock" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Employee">
        <Key><PropertyRef Name="ID"/></Key>
        <Property Name="ID" Type="Edm.String" Nullable="false"/>
        <Property Name="FirstName" Type="Edm.String"/>
        <Property Name="LastName" Type="Edm.String"/>
      </EntityType>
      <EntityContainer Name="Container">
        <EntitySet Name="Employees" EntityType="metaui.mock.Employee"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

const CACHE_DIR = path.join(__dirname, ".dist-cache");
const LIB_SUBPATH = path.join("nz", "co", "siliconst", "ui5", "metaui");

const isComplete = (dir) =>
    fs.existsSync(path.join(dir, LIB_SUBPATH, "library.js")) &&
    fs.existsSync(path.join(dir, LIB_SUBPATH, "controls", "DynamicHost.js")) &&
    fs.existsSync(path.join(dir, LIB_SUBPATH, "layouts", "WizardLayout.js"));

/**
 * Serves a frozen copy of the built library rather than dist/ itself.
 *
 * `ui5 build --clean-dest` deletes and rewrites dist/ in place, so a rebuild landing mid-run
 * makes a module 404 or arrive truncated and the engine that happened to be running takes the
 * blame. That is exactly how a "Firefox cannot load WizardLayout.js" false positive is produced,
 * and it was produced here on the first Firefox run. Snapshotting also guarantees every engine
 * in one run is measured against byte-identical library code, which is the whole premise of
 * attributing a difference to the engine.
 *
 * A good snapshot is also kept in `.dist-cache` so the matrix still runs while someone else's
 * build has dist/ torn down; it says so loudly when it falls back.
 */
function snapshotDist() {
    let source = DIST_RESOURCES_DIR;
    let fromCache = false;
    if (isComplete(DIST_RESOURCES_DIR)) {
        fs.rmSync(CACHE_DIR, { recursive: true, force: true });
        fs.cpSync(DIST_RESOURCES_DIR, CACHE_DIR, { recursive: true });
    } else if (isComplete(CACHE_DIR)) {
        source = CACHE_DIR;
        fromCache = true;
        console.warn(
            `  [WARN] dist/resources is missing or mid-rebuild. Serving the cached snapshot in ${CACHE_DIR}. ` +
                `Re-run after 'npm run build' finishes for a result tied to the current source.`
        );
    } else {
        throw new Error(
            `dist/resources/${LIB_SUBPATH} is missing and no usable snapshot exists in ${CACHE_DIR}. Run 'npm run build' at the repo root first.`
        );
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metaui-browser-matrix-"));
    fs.cpSync(source, path.join(dir, "resources"), { recursive: true });
    return { dir: path.join(dir, "resources"), fromCache };
}

function startServer() {
    const snapshot = snapshotDist();
    const servedResourcesDir = snapshot.dir;
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

            if (pathname === "/favicon.ico") {
                res.writeHead(204);
                res.end();
                return;
            }
            if (pathname === "/standalone-consumer.html") {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(STANDALONE_CONSUMER_HTML);
                return;
            }
            if (pathname === "/Categories") {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify([{ Id: "C1", Name: "Hardware" }, { Id: "C2", Name: "Software" }]));
                return;
            }
            if (pathname.startsWith("/odata/v4/main/")) {
                if (pathname.endsWith("$metadata")) {
                    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "OData-Version": "4.0" });
                    res.end(ODATA_V4_METADATA_XML);
                    return;
                }
                res.writeHead(200, { "Content-Type": "application/json; odata.metadata=minimal", "OData-Version": "4.0" });
                res.end(JSON.stringify({ "@odata.context": "$metadata#Employees", value: [{ ID: "E100", FirstName: "Ada" }] }));
                return;
            }

            let filePath;
            if (pathname.startsWith("/resources/nz/co/siliconst/ui5/metaui")) {
                filePath = path.join(servedResourcesDir, pathname.replace(/^\/resources\//, ""));
            } else {
                filePath = path.join(WEBAPP_DIR, pathname === "/" ? "/index.html" : pathname);
            }

            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                if (filePath.endsWith(".properties")) {
                    const basePropsPath = filePath.replace(/_[a-zA-Z0-9_]+\.properties$/, ".properties");
                    if (basePropsPath !== filePath && fs.existsSync(basePropsPath)) {
                        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
                        res.end(fs.readFileSync(basePropsPath));
                        return;
                    }
                }
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("Not Found: " + pathname);
                return;
            }

            res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
            res.end(fs.readFileSync(filePath));
        });

        server.listen(0, "127.0.0.1", () =>
            resolve({
                server,
                baseUrl: `http://127.0.0.1:${server.address().port}`,
                servedResourcesDir,
                servedFromCache: snapshot.fromCache,
                close() {
                    server.close();
                    fs.rmSync(path.dirname(servedResourcesDir), { recursive: true, force: true });
                }
            })
        );
        server.on("error", reject);
    });
}

module.exports = { startServer };
