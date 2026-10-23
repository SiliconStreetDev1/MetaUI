/**
 * @file PickerPlugin.ts
 * @description Shared abstract base class for UI5 DatePicker, TimePicker, and DateTimePicker control plugins.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import DatePicker, { $DatePickerSettings } from "sap/m/DatePicker";
import TimePicker, { $TimePickerSettings } from "sap/m/TimePicker";
import DateTimePicker, { $DateTimePickerSettings } from "sap/m/DateTimePicker";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";
import { I18n, MetaUITextKey } from "../../utils/I18n";

/**
 * Union of SAPUI5 date/time picker control instances.
 */
export type PickerControlInstance = (DatePicker | TimePicker | DateTimePicker) & {
    isValidValue?(): boolean;
};

/**
 * Shared constructor settings accepted by all three picker controls.
 */
export type PickerSettings = $DatePickerSettings & $TimePickerSettings & $DateTimePickerSettings;

/**
 * Static configuration descriptor for a concrete `PickerPlugin` subclass.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export interface IPickerPluginConfig {
    ControlClass: new (mSettings?: PickerSettings) => PickerControlInstance;
    bindingType: string;
    sourcePattern: string;
    displayFormat?: string;
    /** Bundle key of the sentence shown when the control cannot parse what the user typed. */
    parseErrorMessageKey: MetaUITextKey;
}

/**
 * Shared abstract base class for `DatePlugin`, `TimePlugin`, and `DateTimePlugin`.
 * Consolidates binding generation, display-mode rendering, `change` event parse validation,
 * `getParseError`, `getValue`, and `applyState`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export abstract class PickerPlugin extends BasePlugin {
    protected abstract readonly pickerConfig: IPickerPluginConfig;

    /**
     * Renders the configured UI5 picker control in edit mode or a formatted `sap.m.Text` in display mode.
     *
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured picker or display text control.
     */
    public render(
        fieldMetadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(fieldMetadata, bindingPath, modelName, onChange);

        const cfg = this.pickerConfig;
        const pickerBinding = this.generateBindingInfo(bindingPath, modelName, cfg.bindingType, {
            formatOptions: {
                source: { pattern: cfg.sourcePattern },
                pattern: cfg.sourcePattern
            }
        }) as PropertyBindingInfo;

        if (!this.isEditable) {
            return this.createDisplayText(engineScopeId, bindingPath, pickerBinding);
        }

        const PickerCtor = cfg.ControlClass;
        this.control = new PickerCtor({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: pickerBinding as unknown as string,
            ...(cfg.displayFormat ? { displayFormat: cfg.displayFormat } : {}),
            ...(fieldMetadata.ui?.placeholder ? { placeholder: fieldMetadata.ui.placeholder } : {}),
            editable: this.isControlEditable(),
            required: this.isRequired(),
            change: (oEvent: Event) => {
                const src = oEvent.getSource() as PickerControlInstance;
                const params = oEvent.getParameters() as { valid?: boolean };
                const cleanPath = this.resolveAbsolutePath(src).replace(/^\//, "") || this.fieldKey || "";
                if (params.valid === false) {
                    this.invalidParsePaths.set(cleanPath, I18n.getText(cfg.parseErrorMessageKey));
                    src.data("metauiParseInvalid", true);
                } else {
                    this.invalidParsePaths.delete(cleanPath);
                    src.data("metauiParseInvalid", null);
                }
                this.notifyChange(src.getId());
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control;
    }

    /**
     * Checks whether the picker currently holds an unparseable value via `isValidValue()`.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {string | undefined} The parse error message if invalid, otherwise `undefined`.
     */
    protected override getParseError(sourceControl?: Control): string | undefined {
        const target = (sourceControl ?? this.control) as PickerControlInstance | undefined;
        if (this.isEditable && target && typeof target.isValidValue === "function" && !target.isValidValue()) {
            return I18n.getText(this.pickerConfig.parseErrorMessageKey);
        }
        return undefined;
    }

    /**
     * Retrieves the current string value from the picker control.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The picker value.
     */
    protected getValue(sourceControl?: Control): unknown {
        if (!this.isEditable) {
            return this.getModelValue(sourceControl) ?? null;
        }
        const target = (sourceControl ?? this.control) as PickerControlInstance | undefined;
        if (!target) {
            return null;
        }
        const val = target.getProperty("value");
        if (!val && !target.getDomRef()) {
            return this.getModelValue(target) ?? null;
        }
        return val;
    }

    /**
     * Applies dynamic `readOnly`, `required`, and `placeholder` state updates to the picker control.
     */
    protected applyState(): void {
        if (this.control && this.metadata && this.isEditable) {
            const picker = this.control as PickerControlInstance;
            picker.setEditable(this.isControlEditable());
            picker.setRequired(this.isRequired());
            picker.setPlaceholder(this.metadata.ui?.placeholder || "");
        }
    }
}
