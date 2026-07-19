/**
 * @file ObjectPlugin.ts
 * @description Renders a button that opens a dialog to edit a nested object structure.
 */

import { IPlugin, IPluginValidationResult } from "../../interfaces/IPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import JSONModel from "sap/ui/model/json/JSONModel";

export class ObjectPlugin implements IPlugin {
    public render(field: IPropertyMetadata,  bindingPath: string,  modelName: string, engineScopeId?: string): Control {
        const propKey = bindingPath.startsWith("/") ? bindingPath.substring(1) : bindingPath;
        
        const subSchema: any = {
            type: "object",
            title: field.ui?.label || propKey,
            properties: field.properties || {}
        };
        
        if (field.uiLayout) {
            subSchema.uiLayout = field.uiLayout;
        }

        return new Button({
            text: "View Details",
            icon: "sap-icon://form",
            press: (oEvent: any) => {
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

                sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/GeneratorHost"], (GeneratorHost: any) => {
                    const host = new GeneratorHost({
                        schemaDefinition: subSchema,
                        initialData: nestedData
                    });

                    host.attachSubmit((e: any) => {
                        const payload = e.getParameter("payload");
                        parentModel.setProperty(updatePath, payload);
                    });

                    const buttonText = field.ui?.dialogButtonText || "OK";
                    host.openInDialog(`Nested Details: ${field.ui?.label || propKey}`, buttonText);
                });
            }
        });
    }

    public validate(): IPluginValidationResult {
        return { isValid: true };
    }

    public onStateChange(newMetadata: IPropertyMetadata): void {
        // No dynamic state handling needed for the button
    }
}
