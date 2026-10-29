/**
 * @file HostControlMetadata.ts
 * @description Shared UI5 control metadata and renderer definitions for GeneratorHost and DynamicHost.
 * Guarantees 100% property, aggregation, and event contract parity between the facade and inner host.
 */

import Control from "sap/ui/core/Control";
import RenderManager from "sap/ui/core/RenderManager";
import { Logger } from "../../utils/Logger";
import { isRecord } from "../../utils/TypeGuards";

const UI5_BINDING_DESCRIPTOR_KEYS = [
    "path",
    "model",
    "type",
    "formatOptions",
    "constraints",
    "formatter",
    "parts",
    "mode",
    "parameters",
    "events"
];

/**
 * Checks whether a string setting passed to `DynamicHost` or `GeneratorHost` is a literal JSON document
 * (`{...}` or `[...]`) rather than a UI5 binding expression (`{/path}` or `{path: '...'}`), preventing
 * `ManagedObject.applySettings` from misinterpreting raw JSON payloads/schemas as binding syntax.
 *
 * @param val Candidate property value.
 * @returns {boolean} True when `val` is a valid JSON literal string.
 */
export function isJsonLiteralString(val: unknown): val is string {
    if (typeof val !== "string") {
        return false;
    }
    const trimmed = val.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return false;
    }
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (isRecord(parsed) && typeof parsed.path === "string") {
            const keys = Object.keys(parsed);
            if (keys.length > 0 && keys.every((k) => UI5_BINDING_DESCRIPTOR_KEYS.includes(k))) {
                Logger.warn(
                    `Constructor string '${trimmed}' matches UI5 binding-descriptor shape and was treated as a binding. ` +
                    `For a literal JSON payload with only 'path', use setProperty('dataJson', ...) or 'data'.`,
                    undefined,
                    "HostControlMetadata"
                );
                Logger.debug(`Classified constructor string '${trimmed}' as a UI5 binding descriptor.`, undefined, "HostControlMetadata");
                return false;
            }
        }
        return true;
    } catch (_e) {
        // CATCH_EXEMPT: a JSON.parse failure is the answer this predicate exists to give --
        // the constructor string is not a JSON literal, so it is a UI5 binding string. The
        // caller acts on the returned false; there is nothing degraded to report.
        return false;
    }
}

/**
 * Result of extracting literal JSON strings from constructor settings before `ManagedObject.applySettings`.
 */
export interface IExtractedHostSettings<T extends object> {
    idOrSettings?: string | T;
    settings?: T;
    literalDataJson?: string;
    literalSchemaDefinition?: string;
}

/**
 * Extracts literal JSON strings for `dataJson` and `schemaDefinition` from constructor settings so
 * UI5's `BindingParser` does not consume `{...}` JSON literals during `super(idOrSettings, settings)`.
 *
 * @param idOrSettings Optional control ID or settings object.
 * @param settings Optional settings object when an explicit ID is passed first.
 * @returns {IExtractedHostSettings<T>} Sanitized constructor arguments and any extracted JSON literals.
 */
export function extractConstructorJsonLiterals<T extends object>(
    idOrSettings?: string | T,
    settings?: T
): IExtractedHostSettings<T> {
    const target =
        typeof idOrSettings === "object" && idOrSettings !== null
            ? (idOrSettings as Record<string, unknown>)
            : typeof settings === "object" && settings !== null
              ? (settings as Record<string, unknown>)
              : null;
    if (!target) {
        return { idOrSettings, settings };
    }
    const literalDataJson = isJsonLiteralString(target.dataJson) ? target.dataJson : undefined;
    const literalSchemaDefinition = isJsonLiteralString(target.schemaDefinition)
        ? target.schemaDefinition
        : undefined;
    if (literalDataJson === undefined && literalSchemaDefinition === undefined) {
        return { idOrSettings, settings };
    }
    const cloned: Record<string, unknown> = { ...target };
    if (literalDataJson !== undefined) {
        delete cloned.dataJson;
    }
    if (literalSchemaDefinition !== undefined) {
        delete cloned.schemaDefinition;
    }
    if (typeof idOrSettings === "object" && idOrSettings !== null) {
        return {
            idOrSettings: cloned as T,
            settings,
            literalDataJson,
            literalSchemaDefinition
        };
    }
    return {
        idOrSettings,
        settings: cloned as T,
        literalDataJson,
        literalSchemaDefinition
    };
}

/**
 * Shared UI5 metadata specification for `GeneratorHost` and `DynamicHost`.
 */
export const HOST_CONTROL_METADATA = {
    properties: {
        schemaDefinition: { type: "any", defaultValue: null },
        schemaDefinitions: { type: "object", defaultValue: {} },
        schemaTarget: { type: "string", defaultValue: null },
        pluginRegistry: { type: "object", defaultValue: null },
        schemaBuilderRegistry: { type: "object", defaultValue: null },
        data: { type: "any", defaultValue: null, bindable: "bindable" },
        dataJson: { type: "string", defaultValue: null, bindable: "bindable" },
        liveUpdate: { type: "boolean", defaultValue: false },
        isValid: { type: "boolean", defaultValue: true },
        useMessageManager: { type: "boolean", defaultValue: false },
        modelName: { type: "string", defaultValue: "meta" },
        debugMode: { type: "boolean", defaultValue: false },
        editable: { type: "boolean", defaultValue: true },
        enabled: { type: "boolean", defaultValue: true },
        showPayload: { type: "boolean", defaultValue: false },
        layoutBudget: { type: "int", defaultValue: 0 },
        engineScopeId: { type: "string", defaultValue: null },
        width: { type: "sap.ui.core.CSSSize", defaultValue: "100%" },
        height: { type: "sap.ui.core.CSSSize", defaultValue: "auto" }
    },
    aggregations: {
        _content: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" },
        /** What `SpaceDelegate` shows when the host is too narrow for a form: a button or a banner. */
        _space: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" },
        /** The `showPayload` icon, positioned over the host's top-right corner by `PayloadDelegate`. */
        _payload: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" }
    },
    events: {
        beforeSubmit: {
            parameters: {
                payload: { type: "object" },
                addError: { type: "function" },
                preventDefault: { type: "function" }
            }
        },
        submit: {
            parameters: {
                payload: { type: "object" },
                payloadJson: { type: "string" }
            }
        },
        cancel: {},
        fieldChange: {
            parameters: {
                fieldPath: { type: "string" },
                value: { type: "any" },
                payload: { type: "object" },
                isValid: { type: "boolean" }
            }
        },
        validationStateChanged: { parameters: { isValid: { type: "boolean" } } },
        validationError: { parameters: { fieldPath: { type: "string" }, message: { type: "string" } } },
        validationSuccess: { parameters: { fieldPath: { type: "string" } } },
        error: { parameters: { message: { type: "string" }, exception: { type: "object" } } },
        beforeLayoutSectionChange: {
            parameters: {
                stepIndex: { type: "int" },
                currentSectionIndex: { type: "int" },
                newSectionIndex: { type: "int" },
                payload: { type: "object" },
                preventDefault: { type: "function" },
                addError: { type: "function" },
                resumeNavigation: { type: "function" }
            }
        }
    }
};

/**
 * Shared UI5 API v2 renderer for `GeneratorHost` and `DynamicHost`.
 */
export const HOST_CONTROL_RENDERER = {
    apiVersion: 2,
    render(rm: RenderManager, control: Control): void {
        rm.openStart("div", control);
        const width = control.getProperty("width") as string;
        const height = control.getProperty("height") as string;
        if (width) {
            rm.style("width", width);
        }
        if (height) {
            rm.style("height", height);
        }
        rm.style("min-width", "0");
        rm.style("max-width", "100%");
        rm.style("box-sizing", "border-box");
        rm.openEnd();
        // The payload icon hangs from a zero-height anchor, absolutely positioned in the top-right corner, so it
        // takes no width or height from the content below it. The anchor is rendered whether or not there is an
        // icon: UI5 patches a re-render in place by position, so an anchor appearing ahead of the content when the
        // icon is first switched on would make the patcher rebuild the form and lose an edit in progress.
        // The payload button hangs from an anchor in the top-right corner. The anchor is rendered whether
        // or not there is a button: UI5 patches a re-render in place by position, so an anchor appearing
        // ahead of the content when the button is first switched on would make the patcher rebuild the
        // form and lose an edit in progress.
        //
        // The anchor takes no width — that matters in a table column, where width is the scarce axis and
        // a button stealing a few rem would undo the narrow-container work. It does take height, but only
        // when a button is actually there. A zero-height anchor was tried first and the button then
        // overlapped the first field's right edge by 20px, landing exactly on a dropdown's arrow or a
        // date picker's icon. Height is the cheap axis in a form; width is not.
        const payloadIcon = control.getAggregation("_payload") as Control | null;
        rm.openStart("div")
            .style("position", "relative")
            .style("height", payloadIcon ? "1.75rem" : "0")
            .openEnd();
        if (payloadIcon) {
            rm.openStart("div")
                .style("position", "absolute")
                .style("top", "0")
                .style("right", "0")
                .style("z-index", "1")
                .style("line-height", "0")
                .openEnd();
            rm.renderControl(payloadIcon);
            rm.close("div");
        }
        rm.close("div");
        // Always rendered, for the same reason as the payload anchor above: the banner shown when a host is
        // too narrow appears ahead of the form, and an element arriving ahead of the content mid-session makes
        // UI5's patcher rebuild everything after it, losing an edit in progress. An empty wrapper costs nothing.
        const spaceNotice = control.getAggregation("_space") as Control | null;
        rm.openStart("div").openEnd();
        if (spaceNotice) {
            rm.renderControl(spaceNotice);
        }
        rm.close("div");
        const content = control.getAggregation("_content") as Control;
        if (content) {
            rm.renderControl(content);
        }
        rm.close("div");
    }
};
