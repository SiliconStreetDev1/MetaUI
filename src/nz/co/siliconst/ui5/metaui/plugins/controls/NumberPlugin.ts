/**
 * @file NumberPlugin.ts
 * @description Renders a numeric sap.m.Input control with numeric coercion and validation.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Input from "sap/m/Input";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { InputType } from "sap/m/library";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Handles rendering logic for numeric (`number` and `integer`) properties.
 * Coerces valid numbers into the underlying `JSONModel` and flags unparseable input as invalid.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class NumberPlugin extends BasePlugin {
    private hasUnparseableInput: boolean = false;

    /**
     * Renders a `sap.m.Input` control with `type: InputType.Number`.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured numeric Input control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);
        this.hasUnparseableInput = false;

        if (!this.isEditable) {
            return this.createDisplayText(engineScopeId, bindingPath);
        }

        const hasFormatter = Boolean(
            metadata.ui?.formatter || (metadata.ui?.formatters && metadata.ui.formatters.length > 0)
        );

        this.control = new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            type: hasFormatter ? InputType.Text : InputType.Number,
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            placeholder: metadata.ui?.placeholder || "",
            required: this.isRequired(),
            change: (oEvent: Event) => {
                const input = oEvent.getSource() as Input;
                const rawVal = input.getValue().trim();
                const targetPath = this.resolveAbsolutePath(input);
                const cleanPath = targetPath.replace(/^\//, "") || this.fieldKey || "";

                // Explicitly coerce string input into a native JavaScript number in the JSONModel
                if (rawVal === "") {
                    this.hasUnparseableInput = false;
                    this.invalidParsePaths.delete(cleanPath);
                    input.data("metauiParseInvalid", null);
                    const dynReq = this.getDynamicRequiredOverride(input);
                    const effectiveReq = dynReq !== undefined ? dynReq : this.isRequired();
                    const emptyVal = metadata.nullable === false && !effectiveReq ? undefined : null;
                    this.commitValue(input, emptyVal);
                } else {
                    const parsedInput = this.hasPresentationalFormatter()
                        ? this.resolveModelWriteValue(rawVal)
                        : rawVal;
                    const numVal = typeof parsedInput === "number" ? parsedInput : Number(parsedInput);
                    if (Number.isNaN(numVal)) {
                        this.hasUnparseableInput = true;
                        this.invalidParsePaths.set(cleanPath, I18n.getText(TEXT_KEY.numberParseError));
                        input.data("metauiParseInvalid", true);
                    } else if (metadata.type === "integer" && !Number.isInteger(numVal)) {
                        this.hasUnparseableInput = true;
                        this.invalidParsePaths.set(cleanPath, I18n.getText(TEXT_KEY.integerParseError));
                        input.data("metauiParseInvalid", true);
                    } else {
                        this.hasUnparseableInput = false;
                        this.invalidParsePaths.delete(cleanPath);
                        input.data("metauiParseInvalid", null);
                        this.commitValue(input, numVal);
                    }
                }

                this.notifyChange(input.getId());
            }
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Returns a parse error message when the user input is an unparseable number (or non-integer for `integer`).
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {string | undefined} The parse error message if invalid, otherwise `undefined`.
     */
    protected override getParseError(sourceControl?: Control): string | undefined {
        if (!sourceControl && this.hasUnparseableInput && this.metadata) {
            return this.metadata.type === "integer"
                ? I18n.getText(TEXT_KEY.integerParseError)
                : I18n.getText(TEXT_KEY.numberParseError);
        }
        return undefined;
    }

    /**
     * Clears any visual error state and resets parse error flags on the numeric plugin.
     */
    public override clearError(): void {
        this.hasUnparseableInput = false;
        super.clearError();
    }

    /**
     * Retrieves the current numeric value from the `sap.m.Input` control.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The parsed number, `null`/`undefined` if empty, or raw string if unparseable.
     */
    protected getValue(sourceControl?: Control): unknown {
        if (!this.isEditable) {
            return this.getModelValue(sourceControl);
        }
        const target = (sourceControl ?? this.control) as Input | undefined;
        if (!target || typeof target.getValue !== "function") {
            return this.getModelValue(target);
        }
        const raw = target.getValue().trim();
        if (raw === "") {
            const modelVal = this.getModelValue(target);
            if (!target.getDomRef()) {
                return modelVal;
            }
            return modelVal === undefined ? undefined : null;
        }
        const candidate = this.hasPresentationalFormatter() ? this.resolveModelWriteValue(raw) : raw;
        const parsed = typeof candidate === "number" ? candidate : Number(candidate);
        if (Number.isNaN(parsed)) {
            return raw;
        }
        return parsed;
    }

    /**
     * Applies dynamic `readOnly`, `required`, and `placeholder` state updates to the Input.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        const input = this.control as Input;
        input.setEditable(this.isControlEditable());
        input.setRequired(this.isRequired());
        input.setPlaceholder(this.metadata.ui?.placeholder || "");
    }
}
