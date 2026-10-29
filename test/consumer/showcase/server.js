/**
 * @file server.js
 * @description Serves `index.html`, a single page showing every rendering behaviour that is easy
 * to get wrong and hard to assert: how a form lays out at each container width, what a disabled
 * host looks like beside a read-only one, what a read-only drill-down button says, and the
 * payload viewer.
 *
 * It exists because the rest of the suite measures and nothing looks. 3,200 assertions can all
 * pass while a form renders in a way nobody would ship — the label breakpoint moved from 600px to
 * 400px with every test green, and the only way to know whether 400 was the right number was to
 * put a form at 545px on a screen and look at it.
 *
 * Open it after any change that touches layout, and keep a screenshot as the baseline for the
 * next one. MetaUI is served from `dist/`, so run `npm run build` first.
 *
 *   node server.js   ->  http://localhost:8180
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8180;
const ROOT = path.resolve(__dirname, "..", "..", "..");
const DIST = path.join(ROOT, "dist", "resources");

const MIME = {
    ".html": "text/html", ".js": "application/javascript", ".json": "application/json",
    ".css": "text/css", ".properties": "text/plain", ".xml": "application/xml",
    ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf"
};

http.createServer(function (req, res) {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname === "/" ? "/index.html" : url.pathname;

    const file = p.startsWith("/resources/")
        ? path.join(DIST, p.slice("/resources/".length))
        : path.join(__dirname, p);

    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found: " + p);
        return;
    }
    res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store"
    });
    res.end(fs.readFileSync(file));
}).listen(PORT, function () {
    if (!fs.existsSync(path.join(DIST, "nz/co/siliconst/ui5/metaui/library-preload.js"))) {
        console.log("WARNING: dist/ holds no built library. Run 'npm run build' first.");
    }
    console.log("MetaUI showcase on  http://localhost:" + PORT);
});
