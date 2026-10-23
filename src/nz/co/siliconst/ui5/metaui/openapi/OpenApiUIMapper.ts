/**
 * @file OpenApiUIMapper.ts
 * @description Pure utility class for mapping OpenAPI properties and formats into MetaUI IUIDirectives.
 */

import { IUIDirective } from "../interfaces/ISchema";
import { WIDGET_TYPE } from "../constants/MetaUIConstants";
import { DataInferenceBuilder } from "../core/DataInferenceBuilder";
import { SchemaDirectiveNormalizer } from "../core/SchemaDirectiveNormalizer";
import { isRecord, readString, readBoolean } from "../utils/TypeGuards";

/**
 * Evaluates OpenAPI property metadata and constructs the corresponding MetaUI `IUIDirective` block.
 * Isolates all visual widget and format mappings from the OpenAPI structural parsers.
 *
 * @namespace nz.co.siliconst.ui5.metaui.openapi
 * @internal
 */
export class OpenApiUIMapper {
    /**
     * Constructs a MetaUI `IUIDirective` from a raw OpenAPI property definition.
     * Extracts labels from `title` or synthesizes a human-readable label from `keyName`,
     * maps `readOnly` state, and assigns Fiori widgets and validation formats from OpenAPI `format`.
     *
     * @param rawProp The raw OpenAPI property schema record.
     * @param keyName The technical JSON key of the property.
     * @returns {IUIDirective} The constructed MetaUI UI orchestration directive.
     */
    public static build(rawProp: unknown, keyName: string): IUIDirective {
        const swaggerProp = isRecord(rawProp) ? rawProp : {};
        const ui: IUIDirective = {
            label: readString(swaggerProp, "title") || DataInferenceBuilder.generateLabel(keyName)
        };

        if (readBoolean(swaggerProp, "readOnly") === true) {
            ui.readOnly = true;
        }

        if (readString(swaggerProp, "type") === "file") {
            ui.widget = WIDGET_TYPE.FILE_UPLOADER;
        }

        // Mirrors SchemaDirectiveNormalizer.normalizeUI so a document compiled through OpenApiBuilder
        // alone carries the same placeholder as the same document run through SchemaNormalizer.
        const placeholder = SchemaDirectiveNormalizer.exampleAsPlaceholder(swaggerProp.example);
        if (placeholder !== undefined) {
            ui.placeholder = placeholder;
        }

        const format = readString(swaggerProp, "format");
        const formatMapping = SchemaDirectiveNormalizer.formatToWidget(format);
        if (formatMapping.widget) {
            ui.widget = formatMapping.widget;
        }
        if (formatMapping.uiFormat) {
            ui.format = formatMapping.uiFormat;
        }

        if (isRecord(swaggerProp.ui)) {
            Object.assign(ui, swaggerProp.ui);
            if (!ui.label) {
                ui.label = readString(swaggerProp, "title") || DataInferenceBuilder.generateLabel(keyName);
            }
        }

        return ui;
    }
}
