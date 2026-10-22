/**
 * @file BaseHardwareControl.ts
 * @description Base UI5 Control for all hardware and rich media widgets (Camera, Signature, Geolocation, Voice, RichText).
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
import Control, { $ControlSettings } from "sap/ui/core/Control";
import { ValueState } from "sap/ui/core/library";
import Event from "sap/ui/base/Event";
import BaseHardwareControlRenderer from "./BaseHardwareControlRenderer";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";

/**
 * Constructor settings supported by `BaseHardwareControl` and all derived hardware controls.
 */
export interface $BaseHardwareControlSettings extends $ControlSettings {
    value?: unknown | PropertyBindingInfo | string;
    schemaMetadata?: unknown;
    readOnly?: boolean;
    valueState?: ValueState | string;
    valueStateText?: string;
}

/**
 * Abstract base control providing shared properties (`value`, `schemaMetadata`, `readOnly`, `valueState`, `valueStateText`),
 * a hidden `_content` aggregation, and a `capture` event for hardware/media controls.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 * @public
 */
export default class BaseHardwareControl extends Control {
    constructor(idOrSettings?: string | $BaseHardwareControlSettings, settings?: $BaseHardwareControlSettings) {
        super(idOrSettings as string, settings);
    }

    static readonly metadata = {
        library: "nz.co.siliconst.ui5.metaui",
        properties: {
            /**
             * The current captured value (e.g., Base64 data URL, coordinate object, HTML string, or transcription).
             */
            value: { type: "any", defaultValue: null },
            /**
             * The raw JSON Schema property metadata associated with this control.
             */
            schemaMetadata: { type: "object", defaultValue: {} },
            /**
             * Whether the hardware control is in read-only mode.
             */
            readOnly: { type: "boolean", defaultValue: false },
            /**
             * Visual validation state of the hardware control.
             */
            valueState: { type: "sap.ui.core.ValueState", defaultValue: ValueState.None },
            /**
             * Validation error or warning text associated with the current `valueState`.
             */
            valueStateText: { type: "string", defaultValue: "" }
        },
        aggregations: {
            /**
             * Internal composite layout aggregation rendered by `BaseHardwareControlRenderer`.
             */
            _content: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" }
        },
        events: {
            /**
             * Fired whenever a new hardware value is captured or cleared by the user.
             */
            capture: {
                parameters: {
                    value: { type: "any" }
                }
            }
        }
    };

    static renderer = BaseHardwareControlRenderer;

    /**
     * Sets the visual `ValueState` on the hardware control without triggering a destructive full re-render.
     *
     * @param state The new `ValueState`.
     * @returns {this} This control instance for chaining.
     */
    public setValueState(state: ValueState): this {
        this.setProperty("valueState", state, true);
        this.updateDomVisualState();
        this.syncHardwareState();
        return this;
    }

    /**
     * Gets the current visual `ValueState` of the hardware control.
     *
     * @returns {ValueState} The current `ValueState`.
     */
    public getValueState(): ValueState {
        return (this.getProperty("valueState") as ValueState) || ValueState.None;
    }

    /**
     * Sets the validation message text for the hardware control without triggering a destructive full re-render.
     *
     * @param text The validation message string.
     * @returns {this} This control instance for chaining.
     */
    public setValueStateText(text: string): this {
        this.setProperty("valueStateText", text, true);
        this.updateDomVisualState();
        this.syncHardwareState();
        return this;
    }

    /**
     * Gets the current validation message text of the hardware control.
     *
     * @returns {string} The current validation message string.
     */
    public getValueStateText(): string {
        return (this.getProperty("valueStateText") as string) || "";
    }

    /**
     * Sets the `readOnly` state of the hardware control and synchronously updates inner sub-controls.
     *
     * @param readOnly Whether the control should be read-only.
     * @returns {this} This control instance for chaining.
     */
    public setReadOnly(readOnly: boolean): this {
        this.setProperty("readOnly", Boolean(readOnly), true);
        this.syncHardwareState();
        return this;
    }

    /**
     * Gets whether the hardware control is currently in read-only mode.
     *
     * @returns {boolean} True if read-only.
     */
    public getReadOnly(): boolean {
        return Boolean(this.getProperty("readOnly"));
    }

    /**
     * Synchronizes inner sub-controls with the current `readOnly`, `valueState`, and `valueStateText` properties.
     * Overridden by derived hardware controls.
     */
    protected syncHardwareState(): void {
        // Default no-op; overridden by subclasses
    }

    /**
     * Updates the mounted wrapper DOM element and error message node in place to avoid detaching active canvas/video elements.
     */
    private updateDomVisualState(): void {
        const domRef = this.getDomRef() as HTMLElement | null;
        if (!domRef) {
            return;
        }
        const valueState = this.getValueState();
        const valueStateText = this.getValueStateText();
        const isError = valueState === ValueState.Error;

        if (isError) {
            domRef.setAttribute("aria-invalid", "true");
            domRef.style.border = "1px solid #b00";
            domRef.style.borderRadius = "4px";
            domRef.style.padding = "0.25rem";
            domRef.style.boxSizing = "border-box";
        } else {
            domRef.removeAttribute("aria-invalid");
            domRef.style.border = "";
            domRef.style.borderRadius = "";
            domRef.style.padding = "";
            domRef.style.boxSizing = "";
        }

        if (valueStateText) {
            domRef.setAttribute("title", valueStateText);
        } else {
            domRef.removeAttribute("title");
        }

        const errEl = document.getElementById(`${this.getId()}-err`);
        if (errEl) {
            errEl.textContent = valueStateText || "";
            errEl.style.display = isError && Boolean(valueStateText) ? "block" : "none";
        }
    }
}

// <generated-accessors>
// Generated by scripts/generate-control-accessors.js from this control's UI5 metadata.
// Do not edit by hand: run `npm run gen:accessors`. `npm run lint` fails if it is stale.

/**
 * Parameters delivered with the `capture` event of `BaseHardwareControl`.
 */
export interface BaseHardwareControl$CaptureEventParameters {
    value?: unknown;
}

/**
 * Accessors UI5 generates at runtime from `BaseHardwareControl`'s metadata, declared here so
 * TypeScript consumers can call them. Merged into the class by declaration merging.
 */
export default interface BaseHardwareControl {
    getValue(): unknown;
    setValue(value: unknown): this;
    getSchemaMetadata(): object;
    setSchemaMetadata(schemaMetadata: object): this;
    attachCapture(fn: (event: Event<BaseHardwareControl$CaptureEventParameters, BaseHardwareControl>) => void, listener?: object): this;
    attachCapture<T>(
        data: T,
        fn: (event: Event<BaseHardwareControl$CaptureEventParameters, BaseHardwareControl>, data: T) => void,
        listener?: object
    ): this;
    detachCapture(fn: (event: Event<BaseHardwareControl$CaptureEventParameters, BaseHardwareControl>) => void, listener?: object): this;
    fireCapture(parameters?: BaseHardwareControl$CaptureEventParameters): this;
}
// </generated-accessors>
