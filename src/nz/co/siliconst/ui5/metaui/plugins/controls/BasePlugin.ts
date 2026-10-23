/**
 * @file BasePlugin.ts
 * @description Abstract base class for all UI5 control plugins.
 * Extends PluginStateBase with schema initialization, data-model binding helpers,
 * validation pipeline execution, and nested modal dialog launching.
 */

import { IPlugin, IPluginEngineContext } from "../../interfaces/IPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { PipelineManager } from "../../core/PipelineManager";
import { PluginStateBase } from "../../core/PluginStateBase";
import Control from "sap/ui/core/Control";
import Element from "sap/ui/core/Element";
import JSONModel from "sap/ui/model/json/JSONModel";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";
import { ControlDirectiveUtil, INestedEditorLaunchOptions, isEnabledSupport } from "../../utils/ControlDirectiveUtil";
import { AccessibilityUtil } from "../../utils/AccessibilityUtil";

/**
 * Abstract base class for all UI5 control plugins in the MetaUI framework.
 * Implements the Template Method pattern for consistent validation, formatting,
 * state management, and dynamic UI5 data binding across all widgets.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export abstract class BasePlugin extends PluginStateBase implements IPlugin {
    protected bindingPath?: string;
    protected modelName: string = "meta";
    protected onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void;
    protected engineContext?: IPluginEngineContext;
    protected readonly invalidParsePaths: Map<string, string> = new Map();
    private readonly activeNestedHosts: Set<Control> = new Set();

    /**
     * Marks the plugin's control as a navigation affordance rather than a value editor: a trigger whose only
     * job is to open or follow a target (`sap.m.Link`, the nested-dialog trigger `sap.m.Button`).
     * `ControlDirectiveUtil.applyCommonDirectives` disables every control without an `editable` property when the
     * host is read-only, which for these controls hides the payload behind a dead widget instead of protecting it.
     * Read-only state belongs on the dialog or the bound value, not on the ability to reach it.
     */
    protected readonly isNavigationAffordance: boolean = false;

    /**
     * Injects the owning Engine context into the plugin.
     *
     * @param context The engine context interface.
     */
    public setEngineContext(context: IPluginEngineContext): void {
        this.engineContext = context;
    }

    /**
     * Initializes common plugin fields at the start of `render`.
     *
     * @param metadata The schema property metadata.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel alias.
     * @param onChange Optional callback fired when the control value changes.
     */
    protected initialize(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): void {
        this.metadata = metadata;
        this.bindingPath = bindingPath;
        this.fieldKey = bindingPath.startsWith("/") ? bindingPath.substring(1) : bindingPath;
        this.modelName = modelName;
        this.onChange = onChange;
    }

    /**
     * Evaluates whether the current property is marked as required in the schema metadata.
     *
     * @returns {boolean} True if the property is required.
     */
    protected isRequired(): boolean {
        if (!this.metadata) {
            return false;
        }
        if (typeof this.metadata.required === "boolean") {
            return this.metadata.required;
        }
        return Boolean(
            Array.isArray(this.metadata.required) && this.fieldKey && this.metadata.required.includes(this.fieldKey)
        );
    }

    /**
     * Reads the current bound value from the underlying `JSONModel` for this control or a cloned row control.
     *
     * @param sourceControl Optional cloned row control instance.
     * @returns {unknown} The model value at the resolved absolute path, or `undefined` if unavailable.
     */
    protected getModelValue(sourceControl?: Control): unknown {
        const target = sourceControl ?? this.mainControl ?? this.control;
        const model = (target?.getModel(this.modelName) || this.engineContext?.getModel()) as JSONModel | undefined;
        return model && typeof model.getProperty === "function"
            ? model.getProperty(this.resolveAbsolutePath(target))
            : undefined;
    }

    /**
     * Writes a value the user just produced in the UI into the bound `JSONModel`.
     *
     * Every widget that commits imperatively (rather than relying on two-way binding alone) must go through
     * this method. Resolving the model as `sourceControl.getModel(modelName) ?? engineContext.getModel()` is
     * the whole point: a control only carries a model once it is inside a tree the host propagated the model
     * to. A widget rendered into dialog content, into a detached cell template, or before it is added to its
     * parent has no local model, and a plugin that looked only at `sourceControl.getModel()` dropped the
     * edit on the floor — the UI accepted it and the payload never saw it.
     *
     * @param sourceControl The control that produced the value (the event source, or a cloned row cell).
     * @param value The value to persist at the control's resolved absolute path.
     * @returns {boolean} True if a model was resolved and the value was written.
     */
    protected commitValue(sourceControl: Control, value: unknown): boolean {
        const model = (sourceControl.getModel(this.modelName) || this.engineContext?.getModel()) as
            | JSONModel
            | undefined;
        if (!model) {
            return false;
        }
        model.setProperty(this.resolveAbsolutePath(sourceControl), value);
        return true;
    }

    /**
     * Returns the list of active formatter names configured on `metadata.ui` (`formatter` or `formatters`).
     *
     * @returns {string[] | undefined} The active formatter names, or `undefined` if none are configured.
     */
    protected getActiveFormatters(): string[] | undefined {
        if (this.metadata?.ui?.formatters && this.metadata.ui.formatters.length > 0) {
            return this.metadata.ui.formatters;
        }
        return this.metadata?.ui?.formatter ? [this.metadata.ui.formatter] : undefined;
    }

    /**
     * Returns true when the active formatter chain is presentational (implements `IParser.parse`).
     *
     * @returns {boolean} True if at least one active formatter is presentational.
     */
    protected hasPresentationalFormatter(): boolean {
        const formatters = this.getActiveFormatters();
        return Boolean(formatters && PipelineManager.getInstance().hasPresentationalParser(formatters));
    }

    /**
     * Converts a live UI control value into the value to store in the underlying `JSONModel`.
     * Presentational formatters parse the display string back into raw data via `runParsers()`;
     * transforming formatters (those without `parse()`, such as `textCase`) write the formatted value.
     *
     * @param liveVal The value read from the UI control.
     * @returns {unknown} The value to persist into the model.
     */
    protected resolveModelWriteValue(liveVal: unknown): unknown {
        const formatters = this.getActiveFormatters();
        if (!formatters || formatters.length === 0 || liveVal === undefined) {
            return liveVal;
        }
        const pm = PipelineManager.getInstance();
        if (pm.hasPresentationalParser(formatters)) {
            return pm.runParsers(liveVal, formatters, this.metadata?.ui?.args);
        }
        return pm.runFormatters(liveVal, formatters, this.metadata?.ui?.args);
    }

    /**
     * Runs the validation pipeline on the changed control (supporting both direct controls and cloned table row cells)
     * and notifies the Engine's `onChange` listener.
     *
     * @param controlId Optional runtime ID of the control that triggered the change event.
     */
    protected notifyChange(controlId?: string): void {
        const sourceControl = controlId ? (Element.getElementById(controlId) as Control | undefined) : undefined;
        const formatters = this.getActiveFormatters();
        if (sourceControl && sourceControl !== this.control && sourceControl !== this.mainControl && this.metadata) {
            const targetPath = this.resolveAbsolutePath(sourceControl);
            const rowFieldKey = targetPath.replace(/^\//, "") || this.fieldKey || "";
            const liveVal = this.resolveModelWriteValue(this.getValue(sourceControl));
            const model = sourceControl.getModel(this.modelName) as JSONModel | undefined;
            if (model && liveVal !== undefined && !this.invalidParsePaths.has(rowFieldKey)) {
                if (model.getProperty(targetPath) !== liveVal) {
                    model.setProperty(targetPath, liveVal);
                }
                if (formatters) {
                    sourceControl.getBinding("value")?.refresh(true);
                }
            }
            const result = this.validate(sourceControl);
            ControlDirectiveUtil.applyVisualValidationState(sourceControl, result.isValid, result.errorMessage);
            if (this.onChange) {
                this.onChange(result.isValid, rowFieldKey, result.errorMessage, controlId);
            }
            return;
        }
        const cleanKey = (this.bindingPath || this.fieldKey || "").replace(/^\//, "");
        if (this.isEditable && formatters && !this.invalidParsePaths.has(cleanKey)) {
            const target = this.mainControl ?? this.control;
            const model = (target?.getModel(this.modelName) || this.engineContext?.getModel()) as JSONModel | undefined;
            const liveVal = this.resolveModelWriteValue(this.getValue());
            if (model && liveVal !== undefined) {
                const absPath = this.resolveAbsolutePath(target);
                if (model.getProperty(absPath) !== liveVal) {
                    model.setProperty(absPath, liveVal);
                }
                target?.getBinding("value")?.refresh(true);
            }
        }
        const result = this.validate();
        this.setVisualValidationState(result.isValid, result.errorMessage);
        if (this.onChange) {
            this.onChange(result.isValid, this.fieldKey, result.errorMessage, controlId ?? this.getControlId());
        }
    }

    /**
     * Clears any visual error state and resets parse error flags on the plugin.
     */
    public override clearError(): void {
        this.invalidParsePaths.clear();
        super.clearError();
    }

    /**
     * Creates a read-only `sap.m.Text` control for display mode (`isEditable = false`).
     *
     * @param engineScopeId Deterministic scope ID prefix.
     * @param bindingPath Property binding path.
     * @param bindingInfo Optional custom binding descriptor.
     * @returns {Control} The configured `sap.m.Text` control.
     */
    protected createDisplayText(
        engineScopeId: string | undefined,
        bindingPath: string,
        bindingInfo?: PropertyBindingInfo | string
    ): Control {
        this.control = ControlDirectiveUtil.createDisplayTextControl(
            this.generateStableId(engineScopeId, bindingPath),
            bindingInfo ?? this.generateBindingInfo(bindingPath, this.modelName),
            this.metadata,
            this.bindingPath || this.fieldKey || "",
            this.modelName
        );
        return this.control;
    }

    /**
     * Resolves the absolute model path for this plugin's control, taking table row binding contexts into account.
     *
     * @param control Optional control instance whose binding context should be inspected.
     * @returns {string} The absolute JSONModel path (starting with `/`).
     */
    protected resolveAbsolutePath(control?: Control): string {
        return ControlDirectiveUtil.resolveAbsolutePath(
            control ?? this.mainControl ?? this.control,
            this.bindingPath ?? this.fieldKey ?? "",
            this.modelName
        );
    }

    /**
     * Launches a modal `DynamicHost` dialog for editing or viewing a nested object, array, or `$ref` sub-schema.
     *
     * @param options Configuration for the nested modal editor.
     */
    protected openNestedEditorDialog(options: INestedEditorLaunchOptions): void {
        ControlDirectiveUtil.openNestedHostDialog({
            ...options,
            onHostCreated: (nestedHost) => {
                this.trackNestedHost(nestedHost);
                options.onHostCreated?.(nestedHost);
            }
        });
    }

    /**
     * Registers a nested modal `DynamicHost` for lifecycle ownership, first discarding every host that the
     * dialog layer already destroyed on close. `openNestedHostDialog` destroys its host in the `finally` of
     * `openInDialog`, but it exposes no close hook, so without this sweep the tracking set would grow by one
     * dead reference per dialog open for the whole life of the form.
     *
     * @param nestedHost The freshly created nested `DynamicHost` instance.
     */
    protected trackNestedHost(nestedHost: Control): void {
        for (const trackedHost of this.activeNestedHosts) {
            if (trackedHost.isDestroyed()) {
                this.activeNestedHosts.delete(trackedHost);
            }
        }
        this.activeNestedHosts.add(nestedHost);
    }

    /**
     * Destroys any active nested modal `DynamicHost` instances alongside the plugin's own control.
     */
    public override destroy(): void {
        for (const nestedHost of this.activeNestedHosts) {
            if (!nestedHost.isDestroyed()) {
                nestedHost.destroy();
            }
        }
        this.activeNestedHosts.clear();
        // The InvisibleText controls that carry accessible names and descriptions live in UI5's static
        // area, not in this plugin's control tree, so destroying the tree would leave them behind.
        AccessibilityUtil.destroyAccessibilityTexts(this.control);
        super.destroy();
    }

    /**
     * Renders the specific UI5 control based on the schema property metadata.
     *
     * @param metadata The property metadata.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel alias.
     * @param engineScopeId Deterministic scope ID prefix.
     * @param onChange Callback invoked on value change.
     * @param model Optional direct model reference.
     * @returns {Control} The rendered UI5 control.
     */
    public abstract render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName?: string,
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void,
        model?: unknown
    ): Control;

    /**
     * Retrieves the raw value from the concrete UI5 control for validation.
     *
     * @param sourceControl Optional runtime source control (e.g., a cloned table row cell).
     * @returns {unknown} The current field value.
     */
    protected abstract getValue(sourceControl?: Control): unknown;

    /**
     * Checks whether the target control (either a cloned table row cell or this plugin's primary control) is visible.
     *
     * @param sourceControl Optional runtime source control.
     * @returns {boolean} True if visible.
     */
    protected isTargetVisible(sourceControl?: Control): boolean {
        if (sourceControl && sourceControl !== this.control && sourceControl !== this.mainControl) {
            if (typeof sourceControl.data === "function" && sourceControl.data("metauiDynamicVisible") === false) {
                return false;
            }
            if (typeof sourceControl.getVisible === "function" && !sourceControl.getVisible()) {
                return false;
            }
            return true;
        }
        return this.isVisible();
    }

    /**
     * Reads any dynamic `$row` policy `required` override stored on a cloned table row cell control.
     *
     * @param sourceControl Optional runtime source control.
     * @returns {boolean | undefined} The dynamic required boolean if set, otherwise undefined.
     */
    protected getDynamicRequiredOverride(sourceControl?: Control): boolean | undefined {
        if (sourceControl && typeof sourceControl.data === "function") {
            const dynReq = sourceControl.data("metauiDynamicRequired");
            if (typeof dynReq === "boolean") {
                return dynReq;
            }
        }
        return undefined;
    }

    /**
     * Hook for subclasses (such as `NumberPlugin` and `PickerPlugin`) to return a widget-level parse error message
     * before running schema validators.
     *
     * @param sourceControl Optional runtime source control (e.g., a cloned table row cell).
     * @returns {string | undefined} The parse error message if the input is unparseable, otherwise `undefined`.
     */
    protected getParseError(sourceControl?: Control): string | undefined {
        void sourceControl;
        return undefined;
    }

    /**
     * Validates the current value of the control against the schema rules via the `PipelineManager`.
     *
     * A plugin that did not finish rendering fails **closed**, whether what is missing is its metadata or its
     * control. `Engine.generateField` registers the plugin before calling `render()`, so a render that throws
     * leaves a registered plugin behind: before `initialize()` ran it has neither metadata nor control, after
     * it has metadata but no control. Both states used to differ, and the metadata-less one returned
     * `{ isValid: true }` — so a required field the user could see had failed to render still let
     * `triggerSubmit()` through. A *hidden* control is a different case and still returns valid: the field is
     * rendered, the user simply cannot reach it.
     *
     * Widgets that hold no user data (`ActionButtonPlugin`, `MessageStripPlugin`) opt out by overriding this
     * method outright, so tightening the guard here cannot make a form unsubmittable.
     *
     * @param sourceControl Optional runtime source control (e.g., a cloned table row cell).
     * @returns {{ isValid: boolean; errorMessage?: string }} The validation result.
     */
    public validate(sourceControl?: Control): { isValid: boolean; errorMessage?: string } {
        const target = sourceControl ?? this.control;
        const label = this.bindingPath || this.fieldKey || "unknown";
        if (!this.metadata) {
            return {
                isValid: false,
                errorMessage: `Field '${label}' failed to initialize, so its value could not be validated.`
            };
        }
        if (!target) {
            return {
                isValid: false,
                errorMessage: `Field '${label}' failed to render, so its value could not be validated.`
            };
        }
        if (!this.isTargetVisible(sourceControl)) {
            return { isValid: true };
        }
        const cleanPath = (
            sourceControl ? this.resolveAbsolutePath(sourceControl) : this.bindingPath || this.fieldKey || ""
        ).replace(/^\//, "");
        const parseErr = this.invalidParsePaths.get(cleanPath) || this.getParseError(sourceControl);
        if (parseErr) {
            return { isValid: false, errorMessage: parseErr };
        }
        const rawControlVal = !this.isEditable ? this.getModelValue(sourceControl) : this.getValue(sourceControl);
        const valueToValidate =
            this.isEditable && this.hasPresentationalFormatter()
                ? this.resolveModelWriteValue(rawControlVal)
                : rawControlVal;
        return PipelineManager.getInstance().runValidators(
            valueToValidate,
            this.metadata,
            this.getDynamicRequiredOverride(sourceControl)
        );
    }

    /**
     * Updates the internal metadata when dynamic schema state changes occur (`IPlugin.onStateChange`).
     *
     * @param newMetadata The updated property metadata.
     */
    public onStateChange(newMetadata: IPropertyMetadata): void {
        this.updateMetadata(newMetadata);
    }

    /**
     * Updates the internal metadata and triggers the concrete control to apply the new state.
     *
     * @param newMeta The updated property metadata.
     */
    public updateMetadata(newMeta: IPropertyMetadata): void {
        this.metadata = newMeta;
        this.applyState();
        this.validate();
    }

    /**
     * Applies common UI directives (`readOnly`, `visible`, `visibleOn`, `enabled`, `enabledOn`, `controlProps`).
     *
     * @param control The outer UI5 control.
     * @param metadata The property metadata.
     * @param modelName The UI5 JSONModel alias.
     */
    protected applyCommonDirectives(control: Control, metadata: IPropertyMetadata, modelName: string = "meta"): void {
        const effectiveTarget = this.mainControl ?? control;
        ControlDirectiveUtil.applyCommonDirectives(
            control,
            effectiveTarget,
            metadata,
            this.bindingPath || this.fieldKey || "",
            this.isEditable,
            modelName,
            { required: this.isRequired(), nameTargets: this.resolveAccessibleNameTargets(control) }
        );
        if (this.isNavigationAffordance && !metadata.ui?.enabledOn && isEnabledSupport(effectiveTarget)) {
            effectiveTarget.setEnabled(this.isAffordanceEnabled());
        }
    }

    /**
     * Resolves which controls carry this field's accessible name and description. The default is the one
     * control the user interacts with, which is what a companion `sap.m.Label` also points at. A composite
     * widget whose outer control cannot hold an `ariaLabelledBy` overrides this to name the inner control
     * that actually takes focus.
     *
     * @param control The outer control produced by `render`.
     * @returns {Control[]} The controls that should receive the accessible name.
     */
    protected resolveAccessibleNameTargets(control: Control): Control[] {
        return [this.mainControl ?? control];
    }

    /**
     * Resolves whether a navigation affordance stays interactive. Only an explicit `ui.enabled: false`
     * switches it off; `readOnly` and host display mode do not, because they constrain editing, not navigation.
     *
     * @returns {boolean} True when the affordance should remain clickable.
     */
    protected isAffordanceEnabled(): boolean {
        return this.metadata?.ui?.enabled !== false;
    }

    /**
     * Generates a binding info object or binding path string for UI5 controls.
     *
     * @param bindingPath The JSON path to bind.
     * @param modelName The UI5 JSONModel alias.
     * @param type Optional UI5 data type name.
     * @param additionalOptions Optional extra binding options.
     * @returns {PropertyBindingInfo | string} The binding descriptor.
     */
    protected generateBindingInfo(
        bindingPath: string,
        modelName: string = "meta",
        type?: string,
        additionalOptions?: Record<string, unknown>
    ): PropertyBindingInfo | string {
        return ControlDirectiveUtil.generateBindingInfo(bindingPath, modelName, this.metadata, type, additionalOptions);
    }

    /**
     * Generates a deterministic, stable ID for UI5 controls based on the engine scope and binding path.
     *
     * @param engineScopeId Deterministic scope ID prefix.
     * @param bindingPath Property binding path.
     * @returns {string | undefined} The sanitized stable control ID.
     */
    protected generateStableId(engineScopeId: string | undefined, bindingPath: string): string | undefined {
        if (!engineScopeId) {
            return undefined;
        }
        const cleanPath = bindingPath.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+/, "");
        return `${engineScopeId}-${cleanPath}`;
    }
}
