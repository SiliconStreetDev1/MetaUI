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
import { Logger } from "../utils/Logger";
import { I18n, MetaUITextKey, TEXT_KEY } from "../utils/I18n";

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
 * Why a hardware control could not obtain a value from the device it depends on.
 *
 * Every member describes the same class of event — *the browser will not hand this control the
 * device* — which is why {@link BaseHardwareControl.reportCapabilityFailure} reports all of them
 * at one severity and through one visible state. Before this existed, an absent camera logged at
 * `warn` while a denied camera logged at `error`, so the same user-visible outcome (the button
 * did nothing) was classified two different ways depending on which engine the page ran on.
 */
export type HardwareFailureReason = "unsupported" | "denied" | "timeout" | "failed";

/**
 * Resource bundle key for each failure reason. `{0}` is replaced with the device name.
 *
 * These are deliberately plain and actionable: the person pressed a button and nothing happened,
 * and the message has to tell them whether to change a browser setting or give up on this engine.
 */
const FAILURE_TEXT_KEY: Readonly<Record<HardwareFailureReason, MetaUITextKey>> = {
    unsupported: TEXT_KEY.hardwareUnsupported,
    denied: TEXT_KEY.hardwareDenied,
    timeout: TEXT_KEY.hardwareTimeout,
    failed: TEXT_KEY.hardwareFailed
};

/**
 * Abstract base control providing shared properties (`value`, `schemaMetadata`, `readOnly`, `valueState`, `valueStateText`),
 * a hidden `_content` aggregation, and a `capture` event for hardware/media controls.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 * @internal
 */
export default class BaseHardwareControl extends Control {
    /**
     * Text of the capability message this control is currently painting, or `""` when none.
     * Remembered so {@link BaseHardwareControl.clearCapabilityFailure} can retract its own message
     * without erasing a validation error that the ValidationLedger painted in the meantime.
     */
    private capabilityFailureText: string = "";

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
     * Reports that the device capability this control depends on could not be used.
     *
     * A missing or refused device API is the one failure a hardware control cannot work around, so it
     * is **painted**, not merely logged: `valueState` becomes `Error` and `valueStateText` carries the
     * sentence, which `BaseHardwareControlRenderer` renders as a red outline, an inline message line
     * and `aria-invalid="true"` on the wrapper. A `Logger.warn` alone was invisible, because UI5's stock
     * log level on a production page is `ERROR` and discarded it before anything — including the test
     * harness — could observe it.
     *
     * The log entry is kept, at `error` for every reason. The severity is uniform on purpose: to the
     * person pressing the button, an absent API and a denied permission are the same event, and `error`
     * is the only level that survives the stock log level.
     *
     * @param capability Human-readable name of the device capability, e.g. `"Camera"`.
     * @param reason Why the capability could not be used.
     * @param detail Optional technical detail (an exception message, an error code) added to the log entry only.
     */
    protected reportCapabilityFailure(capability: string, reason: HardwareFailureReason, detail?: string): void {
        const text = I18n.getText(FAILURE_TEXT_KEY[reason], [capability]);
        this.capabilityFailureText = text;
        this.setValueState(ValueState.Error);
        this.setValueStateText(text);
        const shortName = this.getShortControlName();
        Logger.error(`[MetaUI ${shortName}]`, detail ? `${text} (${reason}: ${detail})` : `${text} (${reason})`, shortName);
    }

    /**
     * Retracts a message previously painted by {@link BaseHardwareControl.reportCapabilityFailure}.
     *
     * Called by a derived control once the device does deliver a value, so a retried capture clears the
     * earlier failure. It only clears the state when the control is still showing *that* message: a
     * validation error painted since then belongs to the ValidationLedger and must survive.
     */
    protected clearCapabilityFailure(): void {
        const painted = this.capabilityFailureText;
        if (!painted) {
            return;
        }
        this.capabilityFailureText = "";
        if (this.getValueStateText() !== painted) {
            return;
        }
        this.setValueState(ValueState.None);
        this.setValueStateText("");
    }

    /**
     * Returns the unqualified class name used as the log prefix and component, e.g. `"CameraControl"`.
     *
     * @returns {string} The last segment of the UI5 metadata class name.
     */
    private getShortControlName(): string {
        const segments = this.getMetadata().getName().split(".");
        return segments[segments.length - 1] || "BaseHardwareControl";
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
