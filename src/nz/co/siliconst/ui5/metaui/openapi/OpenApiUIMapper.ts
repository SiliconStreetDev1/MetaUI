/**
 * @file OpenApiUIMapper.ts
 * @description Utility class for mapping OpenAPI properties and formats into MetaUI IUIDirectives.
 */
import { IUIDirective } from "../interfaces/ISchema";

/**
 * Utility class responsible for evaluating OpenAPI metadata and generating the corresponding 
 * MetaUI UI rendering directives. This isolates all visual layout assumptions from the parsing engine.
 * 
 * @public
 */
export class OpenApiUIMapper {
    /**
     * Evaluates an OpenAPI property definition and constructs a MetaUI IUIDirective block.
     * Extracts labels from title/description, maps readOnly state, and assigns 
     * specific UI5 Fiori widgets based on the OpenAPI 'format' property.
     * 
     * @param {any} swaggerProp The raw OpenAPI property schema chunk.
     * @param {string} keyName The technical JSON key of the property.
     * @returns {IUIDirective} The constructed MetaUI UI orchestration directive.
     */
    public static build(swaggerProp: unknown, keyName: string): IUIDirective {
        const ui: IUIDirective = {};

        // Label Synthesis
        if (swaggerProp.title) {
            ui.label = swaggerProp.title;
        } else {
            ui.label = this.generateLabel(keyName);
        }

        // State Mapping
        if (swaggerProp.readOnly === true) {
            ui.readOnly = true;
        }

        // Format to Widget Translation
        if (swaggerProp.format) {
            switch (swaggerProp.format) {
                case "date-time":
                    ui.widget = "datetime";
                    break;
                case "date":
                    ui.widget = "date";
                    break;
                case "password":
                    ui.widget = "password";
                    ui.format = "password"; // Kept for schema validation
                    break;
                case "email":
                    ui.widget = "email";
                    ui.format = "email"; // Kept for schema validation
                    break;
                case "uri":
                    ui.widget = "link";
                    ui.format = "url"; // Kept for schema validation
                    break;
                case "binary":
                case "byte":
                    ui.widget = "fileUploader";
                    break;
                case "uuid":
                case "ipv4":
                case "ipv6":
                case "hostname":
                    if (!ui.validators) ui.validators = [];
                    ui.validators.push(swaggerProp.format);
                    break;
            }
        }

        return ui;
    }

    /**
     * Synthesizes a human-readable Title Case label from camelCase or snake_case technical keys.
     * 
     * @param {string} name The raw technical property key (e.g., 'creationTimestamp').
     * @returns {string} The formatted human-readable label (e.g., 'Creation Timestamp').
     * @private
     */
    private static generateLabel(name: string): string {
        if (!name) return "";
        let spaced = name.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
        return spaced.split(' ')
            .filter(w => w.length > 0)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .trim();
    }
}
