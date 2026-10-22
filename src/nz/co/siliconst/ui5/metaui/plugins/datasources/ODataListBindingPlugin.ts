/**
 * @file ODataListBindingPlugin.ts
 * @description Renders a sap.m.ComboBox bound directly to an OData entity set path.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import ComboBox from "sap/m/ComboBox";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import { Logger } from "../../utils/Logger";

/**
 * Plugin responsible for rendering a `sap.m.ComboBox` bound to a live OData entity set (`ui.widget = "odataSelect"`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.datasources
 * @public
 */
export class ODataListBindingPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.ComboBox` whose `items` aggregation is bound to the configured OData entity set.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured ComboBox or Text control.
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

        const ds = metadata.ui?.dataSource;
        const bindingInfo = this.generateBindingInfo(bindingPath, modelName) as unknown as string;
        const combo = new ComboBox({
            id: this.generateStableId(engineScopeId, bindingPath),
            selectedKey: bindingInfo,
            value: !ds?.url ? bindingInfo : undefined,
            placeholder: metadata.ui?.placeholder || "Select...",
            width: "100%",
            required: this.isRequired(),
            change: (oEvent: Event) => {
                const src = oEvent.getSource() as ComboBox;
                const nextVal = src.getSelectedKey() || src.getValue();
                const model = (src.getModel(modelName) || this.engineContext?.getModel()) as JSONModel | undefined;
                if (model) {
                    model.setProperty(this.resolveAbsolutePath(src), nextVal);
                }
                this.notifyChange(src.getId());
            }
        });

        if (ds && ds.url && ds.keyField && ds.textField) {
            const odataModelPrefix = ds.modelName ? `${ds.modelName}>` : "";
            combo.bindAggregation("items", {
                path: `${odataModelPrefix}${ds.url}`,
                template: new Item({
                    key: `{${odataModelPrefix}${ds.keyField}}`,
                    text: `{${odataModelPrefix}${ds.textField}}`
                }),
                templateShareable: true
            });
        } else {
            Logger.warn(
                "[MetaUI ODataListBindingPlugin]",
                "Incomplete dataSource configuration for odataSelect widget.",
                "ODataListBindingPlugin"
            );
        }

        combo.attachModelContextChange((oEvent: Event) => {
            const src = (oEvent.getSource() as ComboBox) || combo;
            if (src.isDestroyed()) return;
            const boundVal = this.getModelValue(src);
            if (boundVal !== undefined && boundVal !== null && boundVal !== "") {
                const strVal = String(boundVal);
                if (!src.getItems().some((it) => it.getKey() === strVal)) {
                    src.addItem(new Item({ key: strVal, text: strVal }));
                }
            }
        });

        this.control = combo;
        this.applyCommonDirectives(this.control, metadata, modelName);

        return this.control;
    }

    /**
     * Retrieves the currently selected key or typed value from the `ComboBox`.
     *
     * @param sourceControl Optional cloned row control to read from when bound inside a `TableLayout`.
     * @returns {unknown} The selected key string.
     */
    protected getValue(sourceControl?: Control): unknown {
        if (!this.isEditable) {
            return this.getModelValue(sourceControl) ?? "";
        }
        const target = (sourceControl || this.control) as ComboBox | undefined;
        if (!target || typeof target.getSelectedKey !== "function") {
            return this.getModelValue(target) ?? "";
        }
        const liveVal = target.getSelectedKey() || target.getValue();
        if (liveVal === "" && (!target.getDomRef() || target.getItems().length === 0)) {
            return this.getModelValue(target) ?? "";
        }
        return liveVal;
    }

    /**
     * Applies dynamic `readOnly` and `required` state updates to the `ComboBox`.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        const combo = this.control as ComboBox;
        combo.setEditable(this.isControlEditable());
        combo.setRequired(this.isRequired());
    }
}
