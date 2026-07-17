/**
 * @file FormLayout.ts
 * @description Generates a fully responsive SAP Fiori Form layout (SimpleForm).
 */

import SimpleForm from "sap/ui/layout/form/SimpleForm";
import Label from "sap/m/Label";
import { IFieldMetadata } from "../interfaces/ISchema";
import { PluginRegistry } from "../core/PluginRegistry";

/**
 * Utility class strictly for constructing Form layouts without custom CSS.
 */
export class FormLayout {
    /**
     * Builds a SimpleForm with ResponsiveGridLayout, injecting the requested plugins.
     * @param fields The array of root fields to render as FormElements.
     * @returns A fully populated sap.ui.layout.form.SimpleForm.
     */
    public static build(fields: IFieldMetadata[]): SimpleForm {
        const form = new SimpleForm({
            editable: true,
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

        fields.forEach((field) => {
            // Respect Fiori accessibility standards by enforcing the required flag on labels
            const label = new Label({
                text: field.label,
                required: field.isRequired
            });

            // Instantiate the correct plugin for the data type
            const plugin = registry.getPlugin(field.type);
            
            // In the isolated state manager architecture, the binding path maps exactly to the fieldName.
            const control = plugin.render(field, `/${field.fieldName}`);

            form.addContent(label);
            form.addContent(control);
        });

        return form;
    }
}
