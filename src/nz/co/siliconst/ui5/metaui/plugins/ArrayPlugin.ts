/**
 * @file ArrayPlugin.ts
 * @description Renders a button that drills down into a nested table (array) via a recursive Dialog using v2 schema.
 */

import { IPlugin } from "../interfaces/IPlugin";
import { IPropertyMetadata } from "../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import JSONModel from "sap/ui/model/json/JSONModel";

export class ArrayPlugin implements IPlugin {
    public render(field: IPropertyMetadata, bindingPath: string, modelName: string): Control {
        // In tables, bindingPath is usually passed simply as the key (e.g. 'lineItems' or '/lineItems')
        const propKey = bindingPath.startsWith("/") ? bindingPath.substring(1) : bindingPath;
        
        return new Button({
            text: "View Records",
            icon: "sap-icon://list",
            press: (oEvent: any) => {
                const btn = oEvent.getSource() as Button;
                const context = btn.getBindingContext(modelName);
                if (!context) return;
                
                const rowData = context.getObject();
                const nestedData = rowData[propKey] || [];
                
                // Synthesize a v2 schema for the nested array dialog as an object wrapper
                const subSchema = {
                    type: "object",
                    properties: {
                        [propKey]: {
                            type: "array",
                            ui: { label: field.ui?.label || propKey },
                            items: field.items || {
                                type: "object",
                                properties: {} // inference will handle it if empty
                            }
                        }
                    }
                };

                sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/GeneratorHost"], (GeneratorHost: any) => {
                    const host = new GeneratorHost({
                        schemaDefinition: subSchema,
                        initialData: {
                            [propKey]: nestedData
                        }
                    });

                    // V2 Fix: Capture the nested dialog's save event and update the parent model!
                    host.attachSubmit((e: any) => {
                        const payload = e.getParameter("payload");
                        const updatedArray = payload[propKey];
                        
                        const parentModel = btn.getModel(modelName) as JSONModel;
                        const contextPath = btn.getBindingContext(modelName).getPath();
                        
                        // Push changes back to parent model to force UI5 bindings to refresh
                        parentModel.setProperty(`${contextPath}/${propKey}`, updatedArray);
                    });

                    host.openInDialog(`Nested Records: ${field.ui?.label || propKey}`, "Close");
                });
            }
        });
    }

    public validate(): boolean { return true; }
    public onStateChange(newMetadata: IPropertyMetadata): void {}
}
