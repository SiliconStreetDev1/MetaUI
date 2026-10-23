/**
 * @file bootstrap.js
 * @description Mocha `--require` hook. Installs the UI5 module stubs before the first
 * `src/` import, then registers ts-node in transpile-only mode.
 *
 * Transpile-only is required: Stryker rewrites the sources it mutates, and a mutant may
 * well be type-incorrect (`maxLength: undefined` where a `number` is declared). Type
 * checking is the job of `npm run typecheck`, not of the mutation run.
 */

const path = require("path");

process.env.TS_NODE_PROJECT = path.join(__dirname, "tsconfig.json");
process.env.TS_NODE_TRANSPILE_ONLY = "true";

require("./ui5-stub.js");
require("ts-node/register");
