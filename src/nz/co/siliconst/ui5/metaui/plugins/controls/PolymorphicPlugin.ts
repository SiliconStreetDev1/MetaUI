/**
 * @file PolymorphicPlugin.ts
 * @description Renders a polymorphic variant selector (sap.m.Select) paired with a dynamic
 * child field container for JSON Schema / OpenAPI oneOf, anyOf, and discriminator structures.
 */

import { BasePlugin } from "./BasePlugin";
import { IPlugin } from "../../interfaces/IPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { PluginRegistry } from "../../core/PluginRegistry";
import { IPolymorphicVariant, PolymorphicUtil } from "../../utils/PolymorphicUtil";
import { ControlDirectiveUtil } from "../../utils/ControlDirectiveUtil";
import { AccessibilityUtil } from "../../utils/AccessibilityUtil";
import Control from "sap/ui/core/Control";
import VBox from "sap/m/VBox";
import Label from "sap/m/Label";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import JSONModel from "sap/ui/model/json/JSONModel";
import PropertyBinding from "sap/ui/model/PropertyBinding";
import Event from "sap/ui/base/Event";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Plugin responsible for rendering polymorphic schemas (`ui.widget = "polymorphic"`, `oneOf`, `anyOf`, `discriminator`).
 * Displays a variant `sap.m.Select` switcher and dynamically renders the child controls of the active branch.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class PolymorphicPlugin extends BasePlugin {
    private variantSelect?: Select;
    private fieldsContainer?: VBox;
    private activeChildPlugins: IPlugin[] = [];
    private activeChildPaths: string[] = [];
    private variants: IPolymorphicVariant[] = [];
    private engineScopeId?: string;
    private parentBinding?: PropertyBinding;
    private parentBindingHandler?: () => void;

    /**
     * Renders the polymorphic `VBox` containing the variant `Select` and dynamic child fields container.
     *
     * @param metadata The property metadata containing `oneOf` / `anyOf` / `discriminator`.
     * @param bindingPath The JSON path bound to this polymorphic object.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @param directModel Optional direct `JSONModel` reference for immediate variant detection.
     * @returns {Control} The configured `sap.m.VBox` control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void,
        directModel?: JSONModel
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);
        this.engineScopeId = engineScopeId;
        this.variants = PolymorphicUtil.extractVariants(metadata, this.engineContext?.getSchemaDefinitions());

        const items = this.variants.map((v) => new Item({ key: v.key, text: v.title }));
        const initialModel = directModel || (this.engineContext?.getModel() as JSONModel | undefined);
        const initialKey = this.detectVariant(initialModel);

        this.variantSelect = new Select({
            id: this.generateStableId(engineScopeId, `${bindingPath}-variant`),
            forceSelection: false,
            selectedKey: initialKey,
            enabled: this.isControlEditable(),
            width: "100%",
            items,
            change: (oEvent: Event) => {
                const src = oEvent.getSource() as Select;
                this.onVariantChanged(src.getSelectedKey());
            }
        });

        this.fieldsContainer = new VBox({
            id: this.generateStableId(engineScopeId, `${bindingPath}-fields`),
            width: "100%"
        }).addStyleClass("sapUiTinyMarginTop");

        this.mainControl = this.variantSelect;
        this.control = new VBox({
            id: this.generateStableId(engineScopeId, bindingPath),
            width: "100%",
            items: [this.variantSelect, this.fieldsContainer]
        });

        this.ensureVariantDefaults(initialKey, initialModel);
        this.renderVariantFields(initialKey, initialModel);

        const syncVariantFromModel = (): void => {
            const activeModel = (this.control?.getModel(this.modelName) ||
                this.engineContext?.getModel()) as JSONModel | undefined;
            if (!activeModel || !this.variantSelect || !this.control) {
                return;
            }
            if (!this.parentBinding) {
                const absPath = this.resolveAbsolutePath(this.control);
                const binding = activeModel.bindProperty(absPath);
                this.parentBindingHandler = () => {
                    if (!this.variantSelect || this.variantSelect.isDestroyed()) {
                        return;
                    }
                    const nextKey = this.detectVariant(activeModel);
                    if (nextKey && this.variantSelect.getSelectedKey() !== nextKey) {
                        this.variantSelect.setSelectedKey(nextKey);
                        this.ensureVariantDefaults(nextKey, activeModel);
                        this.renderVariantFields(nextKey, activeModel);
                    }
                };
                binding.attachChange(this.parentBindingHandler);
                this.parentBinding = binding;
            }
            const detected = this.detectVariant(activeModel);
            if (detected && this.variantSelect.getSelectedKey() !== detected) {
                this.variantSelect.setSelectedKey(detected);
                this.ensureVariantDefaults(detected, activeModel);
                this.renderVariantFields(detected, activeModel);
            }
        };

        this.control.attachModelContextChange(syncVariantFromModel);
        this.control.addEventDelegate({ onBeforeRendering: syncVariantFromModel });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Ensures the bound model object has the active variant's discriminator, `const`, and `default` values initialized.
     */
    private ensureVariantDefaults(variantKey: string, model?: JSONModel): void {
        PolymorphicUtil.ensureVariantDefaults(
            model,
            this.resolveAbsolutePath(this.control),
            this.variants,
            variantKey,
            this.metadata?.discriminator?.propertyName
        );
    }

    /**
     * Detects the active variant key from the bound `JSONModel`.
     *
     * @param model Optional `JSONModel` instance.
     * @returns {string} The active variant key.
     */
    private detectVariant(model?: JSONModel): string {
        const currentObj = model?.getProperty(this.resolveAbsolutePath(this.control));
        return PolymorphicUtil.detectActiveVariantKey(
            this.variants,
            currentObj,
            this.metadata?.discriminator?.propertyName
        );
    }

    /**
     * Handles user selection of a new polymorphic variant, updating the bound model and re-rendering child controls.
     *
     * @param newKey The newly selected variant key.
     */
    private onVariantChanged(newKey: string): void {
        const model = (this.control?.getModel(this.modelName) ||
            this.engineContext?.getModel()) as JSONModel | undefined;
        PolymorphicUtil.applyVariantSwitch(
            model,
            this.resolveAbsolutePath(this.control),
            this.variants,
            newKey,
            this.metadata?.discriminator?.propertyName
        );
        this.renderVariantFields(newKey, model);
        this.notifyChange(this.variantSelect?.getId());
    }

    /**
     * Renders the child controls for the specified variant inside `this.fieldsContainer`.
     *
     * @param variantKey The active variant key.
     * @param directModel Optional `JSONModel` reference.
     */
    private renderVariantFields(variantKey: string, directModel?: JSONModel): void {
        if (!this.fieldsContainer) {
            return;
        }
        this.destroyChildPlugins();
        this.fieldsContainer.destroyItems();

        const variant = this.variants.find((v) => v.key === variantKey) || this.variants[0];
        if (!variant) {
            return;
        }

        const discProp = this.metadata?.discriminator?.propertyName;
        const registry = this.engineContext?.pluginRegistry || PluginRegistry.getInstance();
        const rawBase = this.bindingPath || "";
        const basePath = rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;
        this.clearVariantValidation(basePath);

        for (const [propKey, propMeta] of Object.entries(variant.properties)) {
            if (propKey === discProp) continue;
            const childPath = `${basePath}/${propKey}`;
            const childPlugin = registry.getPlugin(propMeta.type, propMeta.ui?.widget);
            if (typeof childPlugin.setEditable === "function") {
                childPlugin.setEditable(this.isControlEditable());
            }
            if (this.engineContext && typeof childPlugin.setEngineContext === "function") {
                childPlugin.setEngineContext(this.engineContext);
            }

            const labelText = propMeta.ui?.label || propMeta.title || propKey;
            const label = new Label({
                text: labelText,
                required: propMeta.required === true && this.isEditable
            }).addStyleClass("sapUiTinyMarginTop");
            if (propMeta.ui?.visible === false || propMeta.ui?.visibleOn) {
                ControlDirectiveUtil.applyCommonDirectives(
                    label,
                    label,
                    { type: "string", ui: { visible: propMeta.ui.visible, visibleOn: propMeta.ui.visibleOn } },
                    childPath,
                    true,
                    this.modelName
                );
            }

            const childOnChange = (
                isValid: boolean,
                fieldKey?: string,
                errorMessage?: string,
                controlId?: string
            ): void => {
                if (this.onChange) {
                    this.onChange(isValid, fieldKey, errorMessage, controlId);
                }
                const allChildrenValid = this.activeChildPlugins.every((cp) => cp.validate().isValid);
                if (allChildrenValid && this.bindingPath && this.engineContext?.reportSchemaError) {
                    this.engineContext.reportSchemaError(this.bindingPath, null);
                }
            };

            const childControl = childPlugin.render(
                propMeta,
                childPath,
                this.modelName,
                this.engineScopeId,
                childOnChange,
                directModel
            );
            if (typeof childPlugin.setAssociatedLabel === "function") {
                childPlugin.setAssociatedLabel(label);
            } else {
                label.setLabelFor(childControl);
            }
            // The variant's label is added to fieldsContainer below, so it reaches the DOM: `labelFor` is
            // the single naming mechanism for this child and the synthetic InvisibleText stands down.
            AccessibilityUtil.reconcileLabelAssociation(label, labelText, true);

            this.activeChildPlugins.push(childPlugin);
            this.activeChildPaths.push(childPath);
            this.fieldsContainer.addItem(label);
            this.fieldsContainer.addItem(childControl);
        }
    }

    /**
     * Resolves an active child plugin by its normalized or absolute binding path.
     *
     * @param path The target binding path.
     * @returns {IPlugin | undefined} The matching child plugin, if any.
     */
    public getChildPluginByPath(path: string): IPlugin | undefined {
        const cleanTarget = path.replace(/^\//, "");
        for (let i = 0; i < this.activeChildPaths.length; i++) {
            const cleanChild = this.activeChildPaths[i].replace(/^\//, "");
            if (cleanChild === cleanTarget) {
                return this.activeChildPlugins[i];
            }
            const nested = this.activeChildPlugins[i].getChildPluginByPath?.(cleanTarget);
            if (nested) {
                return nested;
            }
        }
        return undefined;
    }

    /**
     * Validates the polymorphic field and all active child plugins in the selected variant.
     *
     * @returns {{ isValid: boolean; errorMessage?: string }} Validation outcome.
     */
    public override validate(): { isValid: boolean; errorMessage?: string } {
        if (!this.isVisible()) {
            return { isValid: true };
        }
        let firstFailure: { isValid: boolean; errorMessage?: string } | null = null;
        for (let i = 0; i < this.activeChildPlugins.length; i++) {
            const child = this.activeChildPlugins[i];
            const childPath = this.activeChildPaths[i];
            const res = child.validate();
            if (typeof child.setVisualValidationState === "function") {
                child.setVisualValidationState(res.isValid, res.errorMessage);
            }
            if (childPath && this.engineContext?.reportSchemaError) {
                this.engineContext.reportSchemaError(
                    childPath,
                    res.isValid ? null : res.errorMessage || I18n.getText(TEXT_KEY.invalidValue)
                );
            }
            if (!res.isValid && !firstFailure) {
                firstFailure = res;
            }
        }
        if (firstFailure) {
            return firstFailure;
        }
        return super.validate();
    }

    /**
     * Updates the visual validation state of `variantSelect` without painting it red for child field errors.
     */
    public override setVisualValidationState(isValid: boolean, errorMessage?: string): void {
        if (isValid) {
            super.setVisualValidationState(true);
            return;
        }
        const hasChildFailure = this.activeChildPlugins.some((cp) => !cp.validate().isValid);
        if (!hasChildFailure) {
            super.setVisualValidationState(false, errorMessage);
        }
    }

    /**
     * Clears visual errors on both the variant selector and all active child plugins.
     */
    public override clearError(): void {
        super.clearError();
        for (const child of this.activeChildPlugins) {
            child.clearError?.();
        }
    }

    /**
     * Applies visibility changes and clears child validation errors when hidden.
     */
    public override applyVisibility(visible: boolean): void {
        super.applyVisibility(visible);
        if (!visible) {
            if (this.bindingPath) {
                const rawBase = this.bindingPath.endsWith("/") ? this.bindingPath.slice(0, -1) : this.bindingPath;
                this.clearVariantValidation(rawBase);
            }
            for (const child of this.activeChildPlugins) {
                child.clearError?.();
            }
        }
    }

    /**
     * Retrieves the current polymorphic object value from the bound model.
     *
     * @returns {unknown} The bound object or selected variant key.
     */
    protected getValue(): unknown {
        const modelVal = this.getModelValue(this.control);
        if (modelVal !== undefined) {
            return modelVal;
        }
        return this.variantSelect ? this.variantSelect.getSelectedKey() : null;
    }

    /**
     * Applies dynamic `readOnly` and `editable` state updates to the variant selector and child plugins.
     */
    protected applyState(): void {
        const canEdit = this.isControlEditable();
        if (this.variantSelect) {
            this.variantSelect.setEnabled(canEdit);
        }
        for (const child of this.activeChildPlugins) {
            if (typeof child.setState === "function") {
                child.setState("editable", canEdit);
            } else if (typeof child.setEditable === "function") {
                child.setEditable(canEdit);
            }
        }
    }

    /**
     * Discards every ledger entry beneath this polymorphic node, so the abandoned variant's field errors do not
     * outlive the fields themselves.
     *
     * `ValidationLedger.clearArrayEntries` builds its match as `cleanPrefix` or `cleanPrefix + "/"`, so the prefix
     * must be passed WITHOUT a trailing slash: `'/Payment/'` became `'Payment//'` and matched nothing, which made
     * all three call sites silent no-ops. An empty base path is skipped rather than passed through, because an
     * empty prefix matches every key in the ledger and would wipe unrelated fields.
     *
     * @param basePath The polymorphic node's binding path, already stripped of any trailing slash.
     */
    private clearVariantValidation(basePath: string): void {
        if (!basePath) {
            return;
        }
        this.engineContext?.clearValidationPrefix?.(basePath);
    }

    /**
     * Destroys all active child plugins.
     */
    private destroyChildPlugins(): void {
        if (this.bindingPath) {
            const rawBase = this.bindingPath.endsWith("/") ? this.bindingPath.slice(0, -1) : this.bindingPath;
            this.clearVariantValidation(rawBase);
        }
        for (const child of this.activeChildPlugins) {
            if (typeof child.destroy === "function") {
                child.destroy();
            }
        }
        this.activeChildPlugins = [];
        this.activeChildPaths = [];
    }

    /**
     * Destroys all active child plugins and the outer polymorphic `VBox`.
     */
    public override destroy(): void {
        if (this.parentBinding && this.parentBindingHandler) {
            this.parentBinding.detachChange(this.parentBindingHandler);
            this.parentBinding.destroy();
            this.parentBinding = undefined;
            this.parentBindingHandler = undefined;
        }
        this.destroyChildPlugins();
        super.destroy();
    }
}
