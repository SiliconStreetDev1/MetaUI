/**
 * @file run-mutation.js
 * @description Cross-platform entry point for `npm run mutate`.
 *
 * Exists only to pin the generator budget before Stryker spawns its workers. Mutation testing
 * needs a deterministic suite — with a random seed the same mutant is killed on one run and
 * survives on the next — and it needs the suite to be quick, because it runs once per mutant.
 * The budget defaults to the same figure `npm run test:prop` uses, so the score describes the
 * suite as CI actually runs it rather than a thinned-out version of it. Lower it for a quicker,
 * less precise sweep: `FC_NUM_RUNS=100 npm run mutate`. Extra arguments are forwarded to the
 * Stryker CLI, e.g. `npm run mutate -- --mutate src/.../SchemaNormalizer.ts`.
 */

const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_MUTATION_RUNS = "1000";

const strykerBin = path.join(
    __dirname,
    "..",
    "..",
    "node_modules",
    "@stryker-mutator",
    "core",
    "bin",
    "stryker.js"
);

const result = spawnSync(process.execPath, [strykerBin, "run", ...process.argv.slice(2)], {
    stdio: "inherit",
    cwd: path.join(__dirname, "..", ".."),
    env: {
        ...process.env,
        FC_NUM_RUNS: process.env.FC_NUM_RUNS || DEFAULT_MUTATION_RUNS,
        FC_SEED: process.env.FC_SEED || "20261023"
    }
});

process.exit(result.status === null ? 1 : result.status);
