/**
 * @file FormLayout.ts
 * @description Generates a fully responsive SAP Fiori Form layout (SimpleForm).
 */

import SimpleForm from "sap/ui/layout/form/SimpleForm";
import Label from "sap/m/Label";
import Title from "sap/ui/core/Title";
import { IPropertyMetadata } from "../interfaces/ISchema";
import { PluginRegistry } from "../core/PluginRegistry";
import { IPlugin } from "../interfaces/IPlugin";

export class FormLayout {
    /**
     * Builds a SimpleForm with ResponsiveGridLayout, injecting the requested plugins.
     * @param properties The dictionary of fields to render.
     * @param modelName The dynamic model name.
     * @param formTitle Optional title for the form block.
     * @param trackPlugin Optional callback to track instantiated plugins.
     */
    public static build(properties: Record<string, IPropertyMetadata>, modelName: string = "meta", formTitle?: string, trackPlugin?: (plugin: IPlugin) => void): SimpleForm {
        const form = new SimpleForm({
            editable: true,
            title: formTitle,
            layout: "ResponsiveGridLayout",
            labelSpanXL: 4,
            labelSpanL: 4,
            labelSpanM: 4,
            labelSpanS: 12,
            adjustLabelSpan: false,
            emptySpanXL: 0,
            emptySpanL: 0,
            emptySpanM: 0,
            emptySpanS: 0,
            columnsXL: 1,
            columnsL: 1,
            columnsM: 1,
            singleContainerFullSize: false
        });

        const registry = PluginRegistry.getInstance();
        
        // Group fields by their ui.group directive
        const groups: Record<string, { key: string; meta: IPropertyMetadata }[]> = {};
        const DEFAULT_GROUP = "__DEFAULT__";
        
        for (const key of Object.keys(properties)) {
            const meta = properties[key];
            const groupName = meta.ui?.group || DEFAULT_GROUP;
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push({ key, meta });
        }

        // Render groups
        for (const groupName of Object.keys(groups)) {
            if (groupName !== DEFAULT_GROUP) {
                form.addContent(new Title({ text: groupName }));
            }
            
            groups[groupName].forEach((field) => {
                try {
                    const label = new Label({
                        text: field.meta.ui?.label || field.key,
                        required: field.meta.required
                    });

                    // Attach visibility condition to label and control container logic
                    if (field.meta.ui?.visibleOn) {
                        const expr = `{= ${field.meta.ui.visibleOn.replace(/\$root\./g, `${modelName}>/`).replace(/\./g, '/')} }`;
                        label.bindProperty("visible", { parts: [{ path: "meta>/" }], formatter: () => false}); // temporary, condition engine does this usually
                    }

                    const plugin = registry.getPlugin(field.meta.type, field.meta.ui?.widget);
                    if (trackPlugin) trackPlugin(plugin);
                    const control = plugin.render(field.meta, `/${field.key}`, modelName);

                    if (field.meta.ui?.fullWidth) {
                        sap.ui.require(["sap/ui/layout/GridData"], (GridData: any) => {
                            control.setLayoutData(new GridData({
                                span: "XL12 L12 M12 S12"
                            }));
                        });
                    }

                    form.addContent(label);
                    form.addContent(control);
                } catch (error) {
                    sap.ui.require(["sap/base/Log"], (Log: any) => {
                        if (Log) Log.error(`[MetaUI] Failed to render field ${field.key}`, (error as Error).message, "FormLayout");
                    });
                }
            });
        }

        return form;
    }
}
