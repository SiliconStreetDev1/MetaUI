/**
 * The stress routine runs under Node, outside any UI5 runtime, but it imports
 * src/ modules and `utils/Logger` imports `sap/base/Log`. The OpenAPI code path
 * itself pulls in no other UI5 module, so one stub is enough to run it.
 *
 * Registered with `node -r` ahead of ts-node so the interception is in place
 * before the first require of a src/ module.
 */
const Module = require('module');

const LOG_STUB = {
    // Quiet by default: the routine crawls thousands of definitions and the
    // library logs per-definition. Set STRESS_VERBOSE=1 to see them.
    debug() {},
    info() {},
    warning(message, details, component) {
        if (process.env.STRESS_VERBOSE) console.warn(`[${component}] ${message}`, details || '');
    },
    error(message, details, component) {
        console.error(`[${component}] ${message}`, details || '');
    }
};

const STUBS = {
    'sap/base/Log': { __esModule: true, default: LOG_STUB, ...LOG_STUB }
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(STUBS, request)) {
        return STUBS[request];
    }
    if (request.startsWith('sap/')) {
        throw new Error(
            `The stress routine reached UI5 module '${request}', which has no Node stub. ` +
            `Either add one in test/swagger_schemas/node-ui5-stub.js or move this coverage ` +
            `into the browser suite.`
        );
    }
    return originalLoad.apply(this, arguments);
};
