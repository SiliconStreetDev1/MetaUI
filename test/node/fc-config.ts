/**
 * @file fc-config.ts
 * @description Global fast-check configuration and access to the UI5 log sink.
 *
 * The seed is fixed. Mutation testing requires a deterministic suite: with a random seed a
 * mutant that one run kills the next run reports as survived, and the score becomes noise.
 * `FC_SEED` and `FC_NUM_RUNS` override it — the Stryker job lowers the run count so a few
 * thousand mutants finish in minutes, while `npm run test:prop` keeps the full budget.
 */

import fc from "fast-check";

/** Number of generated cases per property. */
export const NUM_RUNS: number = Number(process.env.FC_NUM_RUNS || 1000);

/** Fixed PRNG seed, so the same cases run for every mutant. */
export const SEED: number = Number(process.env.FC_SEED || 20261023);

fc.configureGlobal({
    numRuns: NUM_RUNS,
    seed: SEED,
    // Report the shrunk counterexample, not just the failure.
    verbose: 1,
    // Generated schemas nest; fast-check's default 1s interrupt is too tight for the deep cases.
    interruptAfterTimeLimit: 120_000,
    markInterruptAsFailure: true
});

/** A single captured MetaUI log entry. */
export interface ILogEntry {
    readonly level: "debug" | "info" | "warning" | "error";
    readonly message: string;
    readonly details?: string;
    readonly component?: string;
}

/** Capture handle for the stubbed `sap/base/Log`. */
export interface ILogSink {
    entries: ILogEntry[];
    start(): ILogSink;
    stop(): ILogSink;
    has(level: string, needle: string): boolean;
    reported(needle: string): boolean;
    text(): string;
}

const stub = require("./ui5-stub.js") as { logSink: ILogSink };

/** The live log sink installed by `bootstrap.js`. */
export const logSink: ILogSink = stub.logSink;

/**
 * Message and details joined. 87 of the 127 `Logger.warn`/`Logger.error` call sites in `src/`
 * pass the component tag as `message` and the real diagnostic as `details`, so a property that
 * asserts "the engine said so" has to look in both slots.
 *
 * @param entry The captured log entry.
 * @returns {string} The full text of the entry.
 */
export function logText(entry: ILogEntry): string {
    return entry.details === undefined ? entry.message : `${entry.message} ${entry.details}`;
}

/**
 * True when any captured warning or error mentions `needle`.
 *
 * @param entries The captured entries.
 * @param needle The substring to look for.
 * @returns {boolean} True when the engine reported it.
 */
export function reported(entries: readonly ILogEntry[], needle: string): boolean {
    return entries.some(
        (entry) => (entry.level === "warning" || entry.level === "error") && logText(entry).includes(needle)
    );
}

/**
 * Runs `body` with log capture enabled and returns both its result and the captured entries.
 *
 * @param body The function to run.
 * @returns {{ value: T; entries: ILogEntry[] }} The result and the log entries it produced.
 */
export function withLogCapture<T>(body: () => T): { value: T; entries: ILogEntry[] } {
    logSink.start();
    try {
        const value = body();
        return { value, entries: logSink.entries.slice() };
    } finally {
        logSink.stop();
    }
}

export { fc };
