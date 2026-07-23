/**
 * @file SwaggerUIMapper.ts
 * @description Utility class for mapping OpenAPI properties and formats into MetaUI IUIDirectives.
 */
import { IUIDirective } from "../interfaces/ISchema";

export class SwaggerUIMapper {
    /**
     * Evaluates an OpenAPI property definition and constructs a MetaUI IUIDirective block.
     * Extracts labels from title/description, maps readOnly state, and assigns 
     * specific Fiori widgets based on the OpenAPI 'format' property.
     * 
     * @param {any} swaggerProp The raw OpenAPI property schema.
     * @param {string} keyName The technical JSON key of the property.
     * @returns {IUIDirective} The constructed MetaUI UI orchestration directive.
     */
    public static build(swaggerProp: any, keyName: string): IUIDirective {
        const ui: IUIDirective = {};

        // Labeling
        if (swaggerProp.title) {
            ui.label = swaggerProp.title;
        } else if (swaggerProp.description) {
            ui.label = swaggerProp.description;
        } else {
            ui.label = this.generateLabel(keyName);
        }

        // State
        if (swaggerProp.readOnly === true) {
            ui.readOnly = true;
        }

        // Formats to Widgets
        if (swaggerProp.format) {
            switch (swaggerProp.format) {
                case "date-time":
                    ui.widget = "datetime";
                    break;
                case "date":
                    ui.widget = "date";
                    break;
                case "password":
                    ui.format = "password";
                    break;
                case "email":
                    ui.format = "email";
                    break;
                case "uri":
                    ui.format = "url";
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
     * Generates a human-readable Title Case label from camelCase or snake_case technical keys.
     * 
     * @param {string} name The technical property key.
     * @returns {string} The formatted human-readable label.
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
