/**
 * @file ArrayPlugin.ts
 * @description Renders a button that drills down into a nested table (array) via a recursive Dialog using v2 schema.
 */

import { IPlugin } from "../../interfaces/IPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import JSONModel from "sap/ui/model/json/JSONModel";

export class ArrayPlugin implements IPlugin {
    public render(field: IPropertyMetadata,  bindingPath: string,  modelName: string, engineScopeId?: string): Control {
        const propKey = bindingPath.startsWith("/") ? bindingPath.substring(1) : bindingPath;
        
        const subSchema: any = {
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

        // Fallback to dialog if engine is not available (e.g. legacy tests)
        return new Button({
            text: "View Records",
            icon: "sap-icon://list",
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
                
                const nestedData = parentModel.getProperty(updatePath) || [];

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
                    host.openInDialog(`Nested Records: ${field.ui?.label || propKey}`, buttonText);
                });
            }
        });
    }

    public validate(): any { return { isValid: true }; }
    public onStateChange(newMetadata: IPropertyMetadata): void {}
}
