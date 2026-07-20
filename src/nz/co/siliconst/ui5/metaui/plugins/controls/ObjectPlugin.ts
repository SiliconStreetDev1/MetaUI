/**
 * @file ObjectPlugin.ts
 * @description Renders a button that opens a dialog to edit a nested object structure.
 */

import { BasePlugin } from "./BasePlugin";
import { IPluginValidationResult } from "../../interfaces/IPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import JSONModel from "sap/ui/model/json/JSONModel";

export class ObjectPlugin extends BasePlugin {
    public render(field: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = field;
        const propKey = bindingPath.startsWith("/") ? bindingPath.substring(1) : bindingPath;
        
        const subSchema: any = {
            type: "object",
            title: field.ui?.label || propKey,
            properties: field.properties || {}
        };
        
        if (field.uiLayout) {
            subSchema.uiLayout = field.uiLayout;
        }

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: this.isDisplayMode ? "View Details" : "Edit Details",
            icon: this.isDisplayMode ? "sap-icon://display" : "sap-icon://form",
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
                
                const nestedData = parentModel.getProperty(updatePath) || {};

                sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/host/GeneratorHost"], (GeneratorHost: any) => {
                    const host = new GeneratorHost({
                        schemaDefinition: subSchema,
                        inputData: nestedData,
                        displayMode: this.isDisplayMode
                    });

                    if (!this.isDisplayMode) {
                        host.attachSubmit((e: any) => {
                            const payload = e.getParameter("payload");
                            parentModel.setProperty(updatePath, payload);
                        });
                    }

                    const buttonText = field.ui?.dialogButtonText || (this.isDisplayMode ? "Close" : "OK");
                    host.openInDialog(`Nested Details: ${field.ui?.label || propKey}`, buttonText);
                });
            }
        });

        return this.control as Control;
    }

    public validate(): IPluginValidationResult {
        return { isValid: true };
    }

    protected getValue(): any {
        return null;
    }

    protected applyState(): void {
        // No dynamic state handling needed for the button
    }
}
