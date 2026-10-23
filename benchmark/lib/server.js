/**
 * @file server.js
 * @description Minimal static server for the benchmark pages. Serves the built library out of
 *              `dist/resources` under the same `/resources/...` root the real consumer uses,
 *              and the benchmark page assets under `/bench/`.
 *
 * Mirrors the resource routing in `scripts/run-tests.js` deliberately: the benchmark must load
 * exactly the artefact that ships, not a transpiled-on-the-fly variant.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".properties": "text/plain; charset=utf-8",
    ".library": "application/xml; charset=utf-8",
    ".map": "application/json; charset=utf-8"
};

/**
 * @param {object} opts
 * @param {string} opts.resourcesDir absolute path to the built `resources` directory
 * @param {string} opts.pageDir      absolute path to `benchmark/page`
 * @param {(entry:{url:string,bytes:number,ms:number})=>void} [opts.onServe] per-request hook
 */
function startServer(opts) {
    const distResources = opts.resourcesDir;
    const pageDir = opts.pageDir;

    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const started = Date.now();
            const parsed = new URL(req.url, "http://localhost");
            const pathname = decodeURIComponent(parsed.pathname);

            if (pathname === "/favicon.ico") {
                res.writeHead(204);
                res.end();
                return;
            }

            let filePath;
            if (pathname.startsWith("/resources/")) {
                filePath = path.join(distResources, pathname.replace(/^\/resources\//, ""));
            } else if (pathname.startsWith("/bench/")) {
                filePath = path.join(pageDir, pathname.replace(/^\/bench\//, ""));
            } else if (pathname === "/" || pathname === "/index.html") {
                filePath = path.join(pageDir, "index.html");
            } else {
                filePath = path.join(pageDir, pathname.replace(/^\//, ""));
            }

            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("Not Found: " + pathname);
                return;
            }

            const body = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
                // Explicit, so the driver can total transferred bytes from response headers
                // instead of guessing at a chunked body.
                "Content-Length": body.length
            });
            res.end(body);
            if (opts.onServe) {
                opts.onServe({ url: pathname, bytes: body.length, ms: Date.now() - started });
            }
        });

        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
        });
        server.on("error", reject);
    });
}

module.exports = { startServer };
