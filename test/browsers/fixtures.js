/**
 * @file fixtures.js
 * @description Reads the standalone-consumer HTML page and the 52-widget consumer fixture
 * OUT OF `scripts/run-tests.js` rather than restating them.
 *
 * The cross-engine matrix must render exactly the tree the Chromium gate renders, otherwise a
 * "Firefox difference" could just be a difference between two hand-maintained fixtures. The
 * Chromium harness owns those constants, this harness is read-only on that file, and a widget
 * added there is picked up here on the next run with no edit.
 *
 * `scripts/run-tests.js` calls `main()` at module scope, so it cannot be `require`d. The three
 * constants are extracted by locating the declaration and brace/backtick matching, then evaluated
 * in an empty VM context (they are pure literals - no identifiers, no calls).
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RUN_TESTS_JS = path.join(__dirname, "..", "..", "scripts", "run-tests.js");

/**
 * Returns the source text of an object/array literal initialiser by brace matching, skipping
 * over string and template literals so that a brace inside a string cannot end the match.
 */
function extractBalanced(source, declaration, open, close) {
    const declIndex = source.indexOf(declaration);
    if (declIndex === -1) {
        throw new Error(`fixtures.js: '${declaration}' not found in ${RUN_TESTS_JS}. The Chromium harness was renamed or restructured; update the extractor rather than copying the fixture.`);
    }
    const start = source.indexOf(open, declIndex);
    if (start === -1) {
        throw new Error(`fixtures.js: no '${open}' after '${declaration}'.`);
    }
    let depth = 0;
    let quote = null;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        const prev = source[i - 1];
        if (quote) {
            if (ch === quote && prev !== "\\") quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
            quote = ch;
            continue;
        }
        if (ch === "/" && source[i + 1] === "/") {
            i = source.indexOf("\n", i);
            if (i === -1) break;
            continue;
        }
        if (ch === open) depth++;
        else if (ch === close) {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`fixtures.js: unbalanced '${open}' for '${declaration}'.`);
}

/** Returns the contents of a backtick template literal initialiser. */
function extractTemplate(source, declaration) {
    const declIndex = source.indexOf(declaration);
    if (declIndex === -1) {
        throw new Error(`fixtures.js: '${declaration}' not found in ${RUN_TESTS_JS}.`);
    }
    const start = source.indexOf("`", declIndex);
    const end = source.indexOf("`", start + 1);
    if (start === -1 || end === -1) {
        throw new Error(`fixtures.js: no template literal for '${declaration}'.`);
    }
    return source.slice(start + 1, end);
}

const source = fs.readFileSync(RUN_TESTS_JS, "utf8");

const CONSUMER_ALL_WIDGETS_SCHEMA = vm.runInNewContext(
    `(${extractBalanced(source, "const CONSUMER_ALL_WIDGETS_SCHEMA =", "{", "}")})`
);
const CONSUMER_ALL_WIDGETS_DATA = vm.runInNewContext(
    `(${extractBalanced(source, "const CONSUMER_ALL_WIDGETS_DATA =", "{", "}")})`
);
const STANDALONE_CONSUMER_HTML = extractTemplate(source, "const STANDALONE_CONSUMER_HTML =");

if (!CONSUMER_ALL_WIDGETS_SCHEMA.properties || Object.keys(CONSUMER_ALL_WIDGETS_SCHEMA.properties).length < 10) {
    throw new Error("fixtures.js: extracted consumer schema looks wrong (fewer than 10 properties).");
}
if (!/sap-ui-bootstrap/.test(STANDALONE_CONSUMER_HTML)) {
    throw new Error("fixtures.js: extracted consumer HTML has no UI5 bootstrap tag.");
}

module.exports = {
    RUN_TESTS_JS,
    CONSUMER_ALL_WIDGETS_SCHEMA,
    CONSUMER_ALL_WIDGETS_DATA,
    STANDALONE_CONSUMER_HTML
};
