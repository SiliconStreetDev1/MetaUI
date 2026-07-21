/**
 * @file ObjectPlugin.ts
 * @description Renders a button that opens a dialog to edit a nested object structure.
 */

import { BasePlugin } from "./BasePlugin";
import { IPluginValidationResult } from "../../interfaces/IPlugin";
import { ISchema, IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import Button from "sap/m/Button";
import JSONModel from "sap/ui/model/json/JSONModel";

export class ObjectPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Button` to open a nested Object form dialog.
     * 
     * @param field The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Button control.
     */
    public render(field: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = field;
        const propKey = bindingPath.startsWith("/") ? bindingPath.substring(1) : bindingPath;
        
        const subSchema: ISchema = {
            type: "object",
            title: field.ui?.label || propKey,
            properties: field.properties || {}
        };
        
        if (field.uiLayout) {
            subSchema.uiLayout = field.uiLayout;
        }

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: !this.isEditable ? "View Details" : "Edit Details",
            icon: !this.isEditable ? "sap-icon://display" : "sap-icon://form",
            press: (oEvent: Event) => {
                const btn = oEvent.getSource() as Button;
                const parentModel = btn.getModel(modelName) as JSONModel;
                if (!parentModel) return;
                
                const bindingContext = btn.getBindingContext(modelName);
                let updatePath = bindingPath;
                if (bindingContext && !bindingPath.startsWith("/")) {
                    const ctxPath = bindingContext.getPath();
                    updatePath = ctxPath.endsWith("/") ? ctxPath + bindingPath : (ctxPath === "/" ? "/" + bindingPath : ctxPath + "/" + bindingPath);
                }
                
                // Deep clone to prevent live-mutations on the parent model before 'Submit' is clicked
                const nestedData = JSON.parse(JSON.stringify(parentModel.getProperty(updatePath) || {}));

                sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/DynamicHost"], (DynamicHost: typeof import("../../controls/DynamicHost").default) => {
                    const host = new DynamicHost({
                        schemaDefinition: subSchema,
                        data: nestedData,
                        editable: this.isEditable
                    });

                    if (!!this.isEditable) {
                        host.attachSubmit((e: Event) => {
                            const payload = (e.getParameter("payload") as unknown);
                            parentModel.setProperty(updatePath, payload);
                            
                            // CRITICAL: Notify the parent Engine that this field mutated
                            // so it can trigger LiveUpdate syncs and validate!
                            if (this.onChange) {
                                this.onChange(true, propKey);
                            }
                        });
                    }

                    const buttonText = field.ui?.dialogButtonText || (!this.isEditable ? "Close" : "OK");
                    host.openInDialog(`Nested Details: ${field.ui?.label || propKey}`, buttonText);
                });
            }
        });

        return this.control as Control;
    }

    /**
     * Validates the object plugin (always true as validation is deferred to the dialog host).
     * @returns {IPluginValidationResult} The validation result.
     */
    public validate(): IPluginValidationResult {
        return { isValid: true };
    }

    /**
     * Read-only component for the engine, returns null.
     */
    protected getValue(): null {
        return null;
    }

    /**
     * Read-only component, no dynamic state handling needed for the button itself.
     */
    protected applyState(): void {
        // No dynamic state handling needed for the button
    }
}
