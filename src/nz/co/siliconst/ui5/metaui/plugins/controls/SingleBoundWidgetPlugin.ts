/**
 * @file SingleBoundWidgetPlugin.ts
 * @description Shared abstract base class for the single-bound UI5 widgets — one control, one bound value
 * property, one change event — backing `BooleanPlugin`, `SwitchPlugin`, `SliderPlugin`, `StepInputPlugin`
 * and `RatingIndicatorPlugin`.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import CheckBox, { $CheckBoxSettings } from "sap/m/CheckBox";
import Switch, { $SwitchSettings } from "sap/m/Switch";
import Slider, { $SliderSettings } from "sap/m/Slider";
import StepInput, { $StepInputSettings } from "sap/m/StepInput";
import RatingIndicator, { $RatingIndicatorSettings } from "sap/m/RatingIndicator";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { isEditableSupport, isEnabledSupport } from "../../utils/ControlDirectiveUtil";

/**
 * Union of the SAPUI5 control instances rendered by a `SingleBoundWidgetPlugin` subclass.
 */
export type SingleBoundWidgetInstance = CheckBox | Switch | Slider | StepInput | RatingIndicator;

/**
 * Constructor settings accepted by every single-bound widget control.
 */
export type SingleBoundWidgetSettings = $CheckBoxSettings &
    $SwitchSettings &
    $SliderSettings &
    $StepInputSettings &
    $RatingIndicatorSettings;

/**
 * Static configuration descriptor for a concrete `SingleBoundWidgetPlugin` subclass.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export interface ISingleBoundWidgetConfig {
    /** The SAPUI5 control constructor used in edit mode. */
    ControlClass: new (mSettings?: SingleBoundWidgetSettings) => SingleBoundWidgetInstance;
    /** Name of the control property that carries the bound value (`selected`, `state`, `value`). */
    valueProperty: string;
    /** Name of the control event fired once the user has committed a new value (`select`, `change`). */
    changeEvent: string;
    /**
     * Which interactivity property the control exposes. `sap.m.Switch` and `sap.m.Slider` have only
     * `enabled`; the rest have `editable`. Declaring it here is what keeps the five widgets from
     * drifting into inconsistent read-only behaviour.
     */
    editableProperty: "editable" | "enabled";
    /**
     * Reads the live value out of the rendered control, or returns `undefined` when the control
     * cannot answer (destroyed, or a stand-in that does not implement the getter).
     */
    readValue: (control: Control) => unknown;
    /**
     * Converts a model value into the widget's own value domain, used only when `readValue` cannot
     * answer. Defaults to the model value unchanged.
     */
    coerceModelValue?: (modelValue: unknown) => unknown;
}

/**
 * Shared abstract base class for the five structurally identical single-bound widgets.
 * Consolidates display-mode rendering, control construction, value binding, the change-and-commit
 * handler, `getValue`, and the editable half of `applyState`. Subclasses declare a
 * {@link ISingleBoundWidgetConfig} and, where the widget has bounds or a scale, override
 * {@link SingleBoundWidgetPlugin.buildExtraSettings} and
 * {@link SingleBoundWidgetPlugin.applyExtraState}.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export abstract class SingleBoundWidgetPlugin extends BasePlugin {
    protected abstract readonly widgetConfig: ISingleBoundWidgetConfig;

    /**
     * Renders the configured UI5 widget in edit mode, or a formatted `sap.m.Text` in display mode.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured widget or display text control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        if (!this.isEditable) {
            return this.createDisplayText(engineScopeId, bindingPath);
        }

        const cfg = this.widgetConfig;
        const settings: SingleBoundWidgetSettings = {
            id: this.generateStableId(engineScopeId, bindingPath),
            ...this.buildExtraSettings(metadata)
        };
        // The bound property and the change event are named by the config, so they are merged in
        // rather than written as literal keys. They still go through the constructor, because UI5
        // only parses the `{model>/path}` binding shorthand while applying settings.
        Object.assign(settings, {
            [cfg.valueProperty]: this.generateBindingInfo(bindingPath, modelName),
            [cfg.changeEvent]: (oEvent: Event) => {
                const src = oEvent.getSource() as Control;
                const liveValue = cfg.readValue(src);
                if (liveValue !== undefined) {
                    this.commitValue(src, liveValue);
                }
                this.notifyChange(src.getId());
            }
        });

        const WidgetCtor = cfg.ControlClass;
        const widget = new WidgetCtor(settings);
        this.applyEditableProperty(widget);

        this.control = widget;
        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Returns the widget-specific constructor settings (bounds, step, scale, required indicator).
     * The default widget has none.
     *
     * @param metadata The property metadata.
     * @returns {SingleBoundWidgetSettings} Extra settings merged into the control constructor.
     */
    protected buildExtraSettings(metadata: IPropertyMetadata): SingleBoundWidgetSettings {
        void metadata;
        return {};
    }

    /**
     * Applies the widget-specific half of `applyState` — everything beyond editability.
     * The default widget has none.
     *
     * @param control The rendered widget control.
     * @param metadata The current property metadata.
     */
    protected applyExtraState(control: Control, metadata: IPropertyMetadata): void {
        void control;
        void metadata;
    }

    /**
     * Resolves the numeric increment for a stepped widget from `multipleOf`, then `ui.options.step`.
     *
     * @param metadata The property metadata.
     * @returns {number} The resolved step, defaulting to 1.
     */
    protected resolveStep(metadata: IPropertyMetadata): number {
        if (typeof metadata.multipleOf === "number") {
            return metadata.multipleOf;
        }
        if (metadata.ui?.options && typeof metadata.ui.options.step === "number") {
            return metadata.ui.options.step;
        }
        return 1;
    }

    /**
     * Retrieves the current value from the rendered widget, falling back to the bound model value
     * whenever the control cannot answer or the plugin is in display mode.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The current field value.
     */
    protected getValue(sourceControl?: Control): unknown {
        const target = sourceControl ?? this.control;
        const modelVal = this.getModelValue(target);
        if (!this.isEditable || modelVal === null || modelVal === undefined) {
            return modelVal;
        }
        const liveValue = target ? this.widgetConfig.readValue(target) : undefined;
        if (liveValue !== undefined) {
            return liveValue;
        }
        return this.widgetConfig.coerceModelValue ? this.widgetConfig.coerceModelValue(modelVal) : modelVal;
    }

    /**
     * Applies dynamic `readOnly` state plus any widget-specific state to the rendered control.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        this.applyEditableProperty(this.control);
        this.applyExtraState(this.control, this.metadata);
    }

    /**
     * Writes the current effective editability onto whichever interactivity property the widget declares.
     *
     * @param widget The rendered widget control.
     */
    private applyEditableProperty(widget: Control): void {
        const editable = this.isControlEditable();
        if (this.widgetConfig.editableProperty === "enabled") {
            if (isEnabledSupport(widget)) {
                widget.setEnabled(editable);
            }
            return;
        }
        if (isEditableSupport(widget)) {
            widget.setEditable(editable);
        }
    }
}
