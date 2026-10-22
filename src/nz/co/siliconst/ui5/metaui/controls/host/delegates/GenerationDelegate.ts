/**
 * @file GenerationDelegate.ts
 * @description Host delegate that orchestrates the schema normalization, $ref definition extraction,
 * layout scoring/mutation, dependency preloading, and warning/error banner assembly for GeneratorHost.
 */

import Control from "sap/ui/core/Control";
import MessageBox from "sap/m/MessageBox";
import MessageStrip from "sap/m/MessageStrip";
import VBox from "sap/m/VBox";
import { FlexRendertype } from "sap/m/library";
import { MessageType } from "sap/ui/core/library";
import { ISchema } from "../../../interfaces/ISchema";
import { SchemaNormalizer } from "../../../core/SchemaNormalizer";
import { SchemaBuilderRegistry } from "../../../core/SchemaBuilderRegistry";
import { SchemaValidator } from "../../../core/SchemaValidator";
import { LayoutScorer } from "../../../core/LayoutScorer";
import { LayoutMutator } from "../../../core/LayoutMutator";
import { DefaultLayoutGenerator } from "../../../core/DefaultLayoutGenerator";
import { PluginRegistry } from "../../../core/PluginRegistry";
import { Logger } from "../../../utils/Logger";
import { isRecord, readRecord, deepClone } from "../../../utils/TypeGuards";
import type GeneratorHost from "../GeneratorHost";

/**
 * Output of the input-data and schema preparation phase in `GenerationDelegate`.
 */
export interface IPreparedGenerationInput {
    /** Normalized and layout-mutated schema ready for Engine rendering. */
    readonly normalizedSchema: ISchema;
    /** Pristine inferred schema baseline prior to layout mutation (or null if explicit schema). */
    readonly inferredBaseline: ISchema | null;
    /** Normalized `$ref` definitions dictionary. */
    readonly normalizedDefinitions?: Record<string, ISchema>;
    /** Deep-cloned initial data payload for `StateManager`. */
    readonly finalData: unknown;
    /** Non-empty error message if raw JSON input string parsing failed. */
    readonly dataParseError: string;
}

/**
 * Orchestrates the schema and layout preparation pipeline for `GeneratorHost`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls.host.delegates
 * @public
 */
export class GenerationDelegate {
    constructor(private readonly host: GeneratorHost) {}

    /**
     * Parses raw input data and schema properties on the host, normalizes the schema and `$ref` definitions,
     * and applies layout scoring and mutation.
     *
     * @param previousPayload Optional payload extracted from the prior `StateManager` before teardown.
     * @returns {IPreparedGenerationInput | null} The prepared inputs, or `null` if halted by a debug schema error dialog.
     */
    public prepareSchemaAndData(previousPayload: unknown): IPreparedGenerationInput | null {
        let rawSchema: unknown = this.host.getProperty("schemaDefinition");
        if (typeof rawSchema === "string" && rawSchema.trim().startsWith("{")) {
            try {
                rawSchema = JSON.parse(rawSchema);
            } catch (e) {
                Logger.debug(
                    "[MetaUI GenerationDelegate]",
                    `Deferring malformed JSON schema string to SchemaNormalizer: ${(e as Error).message}`
                );
            }
        }
        if (rawSchema && typeof rawSchema === "object") {
            rawSchema = deepClone(rawSchema);
        }
        let builtDefinitions: Record<string, ISchema> | undefined;
        if (isRecord(rawSchema)) {
            type CustomBuilderLookup = {
                getBuilderFor?: (
                    s: Record<string, unknown>
                ) => { build: (s: Record<string, unknown>, t?: string) => ISchema } | undefined;
            };
            const customRegistry = this.host.getProperty("schemaBuilderRegistry") as CustomBuilderLookup | null;
            const builder = customRegistry?.getBuilderFor
                ? customRegistry.getBuilderFor(rawSchema)
                : SchemaBuilderRegistry.getBuilderFor(rawSchema);
            if (builder) {
                const target = (this.host.getProperty("schemaTarget") as string | null) || undefined;
                const built = builder.build(rawSchema, target);
                if (built.definitions) {
                    builtDefinitions = built.definitions;
                }
                rawSchema = built;
            }
        }
        const isSchemaEmpty = !rawSchema || (isRecord(rawSchema) && Object.keys(rawSchema).length === 0);

        const { parsedData, dataParseError } = this.parseRawInputData();
        const rawFinalData = dataParseError ? parsedData : previousPayload || parsedData;
        const isDataEmpty =
            !rawFinalData ||
            (isRecord(rawFinalData) && Object.keys(rawFinalData).length === 0) ||
            (Array.isArray(rawFinalData) && rawFinalData.length === 0);

        if (isDataEmpty && isSchemaEmpty) {
            const msg = "No payload provided and no explicit schema defined. Cannot infer UI.";
            Logger.error("[MetaUI]", msg, "GeneratorHost");
            this.host.fireEvent("error", { message: msg });
            throw new Error(msg);
        }

        let finalData: unknown = rawFinalData !== undefined && rawFinalData !== null ? deepClone(rawFinalData) : {};
        const normalizedSchema = SchemaNormalizer.normalize(isSchemaEmpty ? null : rawSchema, finalData);
        if (
            normalizedSchema.type === "array" &&
            !Array.isArray(finalData) &&
            isRecord(finalData) &&
            Object.keys(finalData).length === 0
        ) {
            finalData = [];
        }
        const hasHybridInference = this.containsAdditionalProperties(rawSchema);
        const inferredBaseline =
            isSchemaEmpty || hasHybridInference ? SchemaNormalizer.inferSchemaFromData(finalData) : null;

        const schemaErrors = SchemaValidator.validateSchemaStructure(normalizedSchema);
        if (schemaErrors.length > 0) {
            const errorMsg = "Schema Structural Errors Found:\n- " + schemaErrors.join("\n- ");
            Logger.error("[MetaUI]", errorMsg, "GeneratorHost");
            if (this.host.getProperty("debugMode")) {
                MessageBox.error(errorMsg, { title: "MetaUI Schema Error" });
                return null;
            }
        }

        const normalizedDefinitions = this.extractAndNormalizeDefinitions(rawSchema, builtDefinitions);

        if (DefaultLayoutGenerator.ensureLayout(normalizedSchema)) {
            Logger.warn(
                "[MetaUI GeneratorHost] Missing 'uiLayout' array in schema. Synthesized a default layout mapping to prevent a blank render."
            );
        }

        return {
            normalizedSchema,
            inferredBaseline,
            normalizedDefinitions,
            finalData,
            dataParseError
        };
    }

    /**
     * Applies layout complexity scoring and structural layout mutation after plugin dependencies have been preloaded.
     *
     * @param normalizedSchema The normalized schema to score and mutate.
     * @param normalizedDefinitions Optional normalized `$ref` definitions dictionary.
     * @param registry Optional injected `PluginRegistry` instance.
     */
    public applyLayoutScoring(
        normalizedSchema: ISchema,
        normalizedDefinitions?: Record<string, ISchema>,
        registry?: PluginRegistry
    ): void {
        const budget = (this.host.getProperty("layoutBudget") as number) || 0;
        LayoutScorer.apply(normalizedSchema, budget, normalizedDefinitions, registry);
        LayoutMutator.apply(normalizedSchema);
    }

    /**
     * Preloads any required UI5 plugin or layout modules that are not yet in the `sap.ui.require` cache.
     *
     * @param schema The normalized schema.
     * @param registry The active `PluginRegistry` instance.
     */
    public async preloadIfNeeded(
        schema: ISchema,
        registry: PluginRegistry,
        normalizedDefinitions?: Record<string, ISchema>
    ): Promise<void> {
        const pathsToLoad = registry.getPathsToLoad(schema, normalizedDefinitions);
        const needsNetworkLoad = Array.from(pathsToLoad).some((path: string) => !sap.ui.require(path));
        if (needsNetworkLoad) {
            this.host.setBusy(true);
            try {
                await registry.preloadDependencies(schema, normalizedDefinitions);
            } finally {
                this.host.setBusy(false);
            }
        }
    }

    /**
     * Wraps the generated UI5 control in diagnostic `MessageStrip` banners if the schema had no properties,
     * if input JSON parsing failed, or if the Engine reported partial rendering errors.
     *
     * @param generatedContent The root control returned by `Engine.build`.
     * @param normalizedSchema The normalized schema.
     * @param dataParseError Optional data parse error message.
     * @param hasPartialErrors True if the Engine encountered partial field/layout errors.
     * @returns {Control} The final container control to mount in `_content`.
     */
    public wrapWithStatusBanners(
        generatedContent: Control,
        normalizedSchema: ISchema,
        dataParseError: string,
        hasPartialErrors: boolean
    ): Control {
        const hasProperties =
            normalizedSchema.type === "array"
                ? !!normalizedSchema.items
                : !!normalizedSchema.properties && Object.keys(normalizedSchema.properties).length > 0;

        if (!hasProperties) {
            const strip = new MessageStrip({
                text: "Warning: The generated UI is blank. Reason: The schema (or inferred schema) contains no valid properties to render.",
                type: MessageType.Warning,
                showIcon: true,
                showCloseButton: true
            }).addStyleClass("sapUiSmallMargin");
            return new VBox({ renderType: FlexRendertype.Bare, items: [strip] });
        }

        if (dataParseError) {
            const strip = new MessageStrip({
                text: "Data Error: " + dataParseError + ". The form has been rendered with a blank dataset.",
                type: MessageType.Error,
                showIcon: true,
                showCloseButton: true
            }).addStyleClass("sapUiSmallMargin");

            type InsertableContainer = Control & {
                insertItem?: (item: Control, index: number) => void;
                insertContent?: (item: Control, index: number) => void;
            };
            const insertable = generatedContent as InsertableContainer;
            if (typeof insertable.insertItem === "function") {
                insertable.insertItem(strip, 0);
                return generatedContent;
            }
            if (typeof insertable.insertContent === "function") {
                insertable.insertContent(strip, 0);
                return generatedContent;
            }
            return new VBox({ renderType: FlexRendertype.Bare, items: [strip, generatedContent] });
        }

        const targetFallbackWarning =
            normalizedSchema.ui?.options && typeof normalizedSchema.ui.options.targetFallbackWarning === "string"
                ? normalizedSchema.ui.options.targetFallbackWarning
                : "";

        if (hasPartialErrors || targetFallbackWarning) {
            const strip = new MessageStrip({
                text:
                    targetFallbackWarning ||
                    "Layout partially rendered. Some fields failed to generate due to configuration errors.",
                type: MessageType.Warning,
                showIcon: true,
                showCloseButton: true
            }).addStyleClass("sapUiSmallMarginBottom");
            return new VBox({ renderType: FlexRendertype.Bare, items: [strip, generatedContent] });
        }

        return generatedContent;
    }

    private parseRawInputData(): { parsedData: unknown; dataParseError: string } {
        let inputData: unknown = this.host.getBaseProperty("data");
        const inputDataJson = this.host.getBaseProperty("dataJson");
        let dataParseError = "";

        if (typeof inputDataJson === "string" && inputDataJson.length > 0) {
            try {
                inputData = JSON.parse(inputDataJson);
            } catch (e) {
                dataParseError = "Failed to parse inputDataJson string: " + (e as Error).message;
                Logger.error("[MetaUI]", dataParseError, "GeneratorHost");
                this.host.fireEvent("error", { message: dataParseError, exception: e });
                inputData = {};
            }
        } else if (typeof inputData === "string") {
            try {
                inputData = JSON.parse(inputData);
            } catch (e) {
                dataParseError = "Failed to parse inputData string: " + (e as Error).message;
                Logger.error("[MetaUI]", dataParseError, "GeneratorHost");
                this.host.fireEvent("error", { message: dataParseError, exception: e });
                inputData = {};
            }
        }

        return { parsedData: inputData, dataParseError };
    }

    private containsAdditionalProperties(node: unknown, depth: number = 0): boolean {
        if (depth > 8 || !isRecord(node)) return false;
        if (node.additionalProperties === true) return true;
        if (isRecord(node.properties)) {
            for (const key of Object.keys(node.properties)) {
                if (this.containsAdditionalProperties(node.properties[key], depth + 1)) {
                    return true;
                }
            }
        }
        if (isRecord(node.items) && this.containsAdditionalProperties(node.items, depth + 1)) {
            return true;
        }
        return false;
    }

    private extractAndNormalizeDefinitions(
        rawSchema: unknown,
        builtDefinitions?: Record<string, ISchema>
    ): Record<string, ISchema> | undefined {
        const rawDefinitionsProp = this.host.getProperty("schemaDefinitions");
        const rawDefinitions: Record<string, unknown> = isRecord(rawDefinitionsProp) ? { ...rawDefinitionsProp } : {};
        if (builtDefinitions) {
            Object.assign(rawDefinitions, builtDefinitions);
        }

        if (isRecord(rawSchema)) {
            const embeddedDefs = readRecord(rawSchema, "definitions") || readRecord(rawSchema, "$defs");
            if (embeddedDefs) {
                Object.assign(rawDefinitions, embeddedDefs);
            }
        }

        if (Object.keys(rawDefinitions).length === 0) {
            return undefined;
        }

        const normalized: Record<string, ISchema> = {};
        const rootRecord = isRecord(rawSchema) ? rawSchema : undefined;
        for (const key of Object.keys(rawDefinitions)) {
            try {
                normalized[key] = SchemaNormalizer.normalizeDefinition(rawDefinitions[key], key, rootRecord);
            } catch (_e) {
                Logger.warn(`[MetaUI] Failed to normalize schema definition '${key}'`, "", "GeneratorHost");
            }
        }
        return normalized;
    }
}
