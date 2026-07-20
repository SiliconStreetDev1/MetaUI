/**
 * @file ArrayPlugin.ts
 * @description Renders a button that drills down into a nested table (array) via a recursive Dialog using v2 schema.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import JSONModel from "sap/ui/model/json/JSONModel";

export class ArrayPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Button` to open a nested array form dialog.
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
            type: "array",
            title: field.ui?.label || propKey,
            items: field.items || {
                type: "object",
                properties: {} // inference will handle it if empty
            }
        };

        if (field.uiLayout) {
            subSchema.uiLayout = field.uiLayout;
        }

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: !this.isEditable ? "View Records" : "Edit Records",
            icon: !this.isEditable ? "sap-icon://display" : "sap-icon://list",
            press: (oEvent: sap.ui.base.Event) => {
                const btn = oEvent.getSource() as Button;
                const parentModel = btn.getModel(modelName) as JSONModel;
                if (!parentModel) return;
                
                const bindingContext = btn.getBindingContext(modelName);
                let updatePath = bindingPath;
                if (bindingContext && !bindingPath.startsWith("/")) {
                    const ctxPath = bindingContext.getPath();
                    updatePath = ctxPath.endsWith("/") ? ctxPath + bindingPath : (ctxPath === "/" ? "/" + bindingPath : ctxPath + "/" + bindingPath);
                }
                
                const nestedData = parentModel.getProperty(updatePath) || [];

                sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/host/GeneratorHost"], (GeneratorHost: typeof import("../../controls/host/GeneratorHost").default) => {
                    const host = new GeneratorHost({
                        schemaDefinition: subSchema,
                        data: nestedData,
                        editable: this.isEditable // Pass the display mode down to the child Engine!
                    });

                    // Only attach submit event if we are not in display mode
                    if (!!this.isEditable) {
                        host.attachSubmit((e: sap.ui.base.Event) => {
                            const payload = e.getParameter("payload");
                            parentModel.setProperty(updatePath, payload);
                        });
                    }

                    const buttonText = field.ui?.dialogButtonText || (!this.isEditable ? "Close" : "OK");
                    host.openInDialog(`Nested Records: ${field.ui?.label || propKey}`, buttonText);
                });
            }
        });
        
        return this.control as Control;
    }

    /**
     * Read-only component for the engine, returns null.
     */
    protected getValue(): unknown {
        return null;
    }

    /**
     * Read-only component, no dynamic state handling needed for the button itself.
     */
    protected applyState(): void {
        // dynamic state changes
    }
}
