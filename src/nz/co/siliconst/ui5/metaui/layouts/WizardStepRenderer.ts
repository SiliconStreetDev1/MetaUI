/**
 * @file WizardStepRenderer.ts
 * @description Renders individual wizard step SimpleForm containers and validates per-step field paths.
 */

import SimpleForm from "sap/ui/layout/form/SimpleForm";
import { ISchema, ILayoutElement } from "../interfaces/ISchema";
import { Engine } from "../core/Engine";
import { PayloadValidator } from "../core/PayloadValidator";
import { SchemaNormalizer } from "../core/SchemaNormalizer";
import { LayoutElementWalker, LayoutFieldFactory } from "./LayoutElementWalker";

/**
 * Stateless helper for building and validating individual wizard steps in `WizardLayout`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @internal
 */
export class WizardStepRenderer {
    /**
     * Validates all fields registered during a specific step's form build.
     * Routes error painting through `engine.reportSchemaError()` so both default and
     * `useMessageManager` modes are updated consistently.
     *
     * @param fieldPaths The list of binding paths collected during the step's form build.
     * @param engine The Engine instance that holds the plugin registry and validation ledger.
     * @param schema Optional root schema for resolving array/table sub-layouts.
     * @returns {boolean} True if all fields are valid, false if any failed.
     */
    public static validateStep(fieldPaths: string[], engine: Engine, schema?: ISchema): boolean {
        engine.host?.evaluatePoliciesNow?.();
        let allValid = true;
        const activeModel = engine.getModel() as { getProperty?: (p: string) => unknown } | undefined;

        for (const path of fieldPaths) {
            const plugin = engine.getPluginByPath(path);
            if (plugin) {
                if (engine.isInsideAbsentOptionalObject(path)) {
                    engine.reportSchemaError(path, null);
                    continue;
                }
                const result = plugin.validate();
                if (!result.isValid) {
                    engine.reportSchemaError(path, result.errorMessage || "This field is required.");
                    allValid = false;
                } else {
                    engine.reportSchemaError(path, null);
                }
            } else if (schema) {
                const scopeStr = `#/properties/${path.replace(/^\//, "").replace(/\//g, "/properties/")}`;
                const { meta } = SchemaNormalizer.resolveScope(schema, scopeStr);
                if (meta && meta.ui?.visible !== false) {
                    if (meta.type === "array") {
                        if (!engine.validateArrayPath(path, meta)) {
                            allValid = false;
                        }
                    } else {
                        const val = activeModel?.getProperty ? activeModel.getProperty(path) : undefined;
                        const res = PayloadValidator.validateTree(
                            meta,
                            val,
                            (ref) => engine.host?.getSchemaDefinition?.(ref) ?? null
                        );
                        if (!res.isValid) {
                            engine.reportSchemaError(path, res.errorMessage || "Invalid field.");
                            allValid = false;
                        } else {
                            engine.reportSchemaError(path, null);
                        }
                    }
                }
            }
        }
        if (engine.hasActiveErrorsForPaths(fieldPaths)) {
            allValid = false;
        }
        return allValid;
    }

    /**
     * Constructs a `SimpleForm` for a single wizard step, recursively rendering all
     * child layout elements and collecting their binding paths into `fieldPaths`.
     *
     * @param stepElement The top-level Group/WizardStep layout element for this step.
     * @param schema The active JSON schema.
     * @param modelName The UI5 JSONModel alias for data binding.
     * @param engine The Engine instance for field generation.
     * @param fieldPaths Collector array — all binding paths generated for this step are pushed here.
     * @returns {SimpleForm} The assembled `SimpleForm` for this wizard step.
     */
    public static buildStepForm(
        stepElement: ILayoutElement,
        schema: ISchema,
        modelName: string,
        engine: Engine,
        fieldPaths: string[]
    ): SimpleForm {
        const form = LayoutFieldFactory.createSimpleForm(undefined, schema.ui);

        if (stepElement.elements && Array.isArray(stepElement.elements)) {
            LayoutElementWalker.walk(
                stepElement.elements,
                schema,
                engine,
                LayoutElementWalker.createSimpleFormSink(form, schema, modelName, engine, "WizardLayout", fieldPaths),
                "WizardLayout"
            );
        }

        return form;
    }
}
