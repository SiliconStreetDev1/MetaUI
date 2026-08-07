/**
 * @file WizardLayout.ts
 * @description MetaUI custom step-by-step wizard navigator.
 *
 * Architecture Decision:
 * SAP's sap.m.Wizard in renderMode "Page" requires a NavContainer ancestor in the DOM,
 * which MetaUI's GeneratorHost VBox does not provide. Using sap.m.Wizard in the default
 * "Scroll" mode renders ALL steps simultaneously, which is not desired behavior.
 *
 * Solution: Implement a fully custom step navigator using plain VBox/HBox/Button controls.
 * This gives MetaUI complete control over step visibility, per-step field validation,
 * and the beforeLayoutSectionChange async event API — with no dependency on the broken
 * Wizard container API.
 */

import SimpleForm from "sap/ui/layout/form/SimpleForm";
import Label from "sap/m/Label";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Button from "sap/m/Button";
import ProgressIndicator from "sap/m/ProgressIndicator";
import MTitle from "sap/m/Title";           // sap.m.Title IS a Control → safe inside HBox.items
import CoreTitle from "sap/ui/core/Title";  // sap.ui.core.Title is an Element → SimpleForm section headers ONLY
import Text from "sap/m/Text";
import { IPropertyMetadata, ISchema, ILayoutElement } from "../interfaces/ISchema";
import { IPlugin } from "../interfaces/IPlugin";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { Engine } from "../core/Engine";
import { SchemaNormalizer } from "../core/SchemaNormalizer";
import { Logger } from "../utils/Logger";
import Control from "sap/ui/core/Control";

/**
 * Minimal structural contract for accessing the hosting GeneratorHost without importing
 * it directly (which would create a circular dependency between WizardLayout ↔ GeneratorHost).
 */
interface IWizardCapableHost {
    /** Returns the active StateManager. Used to extract a payload snapshot at step-change time. */
    getStateManager(): { extractPayload(): Record<string, unknown> } | null;
    /** Fires a UI5 event upward on the host control. */
    fireEvent(eventName: string, params: Record<string, unknown>): void;
}

/**
 * Layout Manager that generates a custom paginated step navigator.
 * Renders exactly one step at a time, validates current-step fields before advancing,
 * and fires `beforeLayoutSectionChange` with a full async API before each step transition.
 *
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @public
 */
export class WizardLayout implements ILayoutManager {
    /**
     * Renders the wizard as a custom step-by-step navigator.
     *
     * @param schema The active JSON schema object containing `uiLayout` step groups.
     * @param modelName The bound UI5 model name for data bindings.
     * @param engine The central Engine orchestrator for field generation and validation.
     * @param onSubmit Hook executed when the user completes the final step successfully.
     * @returns {Control} A VBox root container comprising the step header, content, and navigation.
     */
    public render(schema: ISchema, modelName: string, engine: Engine, onSubmit?: () => void): Control {
        if (!schema.uiLayout || !Array.isArray(schema.uiLayout)) {
            Logger.warn("[MetaUI WizardLayout] Missing 'uiLayout' array in schema. Cannot build step navigator.", "", "WizardLayout");
            return new VBox();
        }

        // Filter valid step-level elements. Both "Group" and "WizardStep" act as step containers.
        const stepElements = schema.uiLayout.filter(
            (e: ILayoutElement) => e.type === "Group" || e.type === "WizardStep"
        );

        if (stepElements.length === 0) {
            Logger.warn("[MetaUI WizardLayout] No Group or WizardStep elements found in uiLayout.", "", "WizardLayout");
            return new VBox();
        }

        const totalSteps = stepElements.length;

        // --- Phase 1: Build all step forms and track field binding paths per step ---
        // Each step form is built eagerly so that plugins are registered in the Engine
        // and are available for validation via engine.getPluginByPath() on any step.
        const stepForms: SimpleForm[] = [];
        // stepFieldPaths[i] = all binding paths registered when building step i's fields.
        // Used by _validateStep to run targeted per-step validation.
        const stepFieldPaths: string[][] = [];

        stepElements.forEach((element: ILayoutElement) => {
            const fieldPaths: string[] = [];
            const form = this._buildStepForm(element, schema, modelName, engine, fieldPaths);
            stepForms.push(form);
            stepFieldPaths.push(fieldPaths);
        });

        // --- Phase 2: Build the navigator UI ---
        // Navigation state. Lives in closure; mutated by navigateTo() on each step transition.
        let currentStepIndex = 0;

        // Header: step title (sap.m.Title — a proper Control) + step counter label + progress bar
        const stepTitleControl = new MTitle({ level: "H3" });
        const stepCounterLabel = new Text();
        const progressBar = new ProgressIndicator({
            showValue: false,
            state: "None",
            height: "0.5rem"
        }).addStyleClass("metaUIWizardProgress");

        // Content: single-child VBox that swaps its contents to the current step form
        const contentArea = new VBox({ width: "100%" }).addStyleClass("metaUIWizardContent");

        // Navigation: Previous (left) / Next|Complete (right)
        const prevButton = new Button({
            text: "Previous",
            icon: "sap-icon://navigation-left-arrow",
            enabled: false,
            press: () => navigateTo(currentStepIndex - 1)
        });

        const nextButton = new Button({
            type: "Emphasized",
            text: totalSteps === 1 ? "Complete" : "Next Step",
            icon: "sap-icon://navigation-right-arrow",
            iconFirst: false,
            press: () => handleNextPress()
        });

        // --- Phase 3: Navigation logic ---

        /**
         * Physically transitions the navigator to the given step index.
         * Updates the header, content, and navigation button states.
         *
         * @param index The target step index (0-based).
         */
        const navigateTo = (index: number): void => {
            if (index < 0 || index >= totalSteps) {
                Logger.error("[MetaUI WizardLayout]", `Invalid navigation target: step ${index}`, "WizardLayout");
                return;
            }

            currentStepIndex = index;
            const element = stepElements[currentStepIndex];
            const isLastStep = currentStepIndex === totalSteps - 1;

            // Update step header
            stepTitleControl.setText(element.label || `Step ${currentStepIndex + 1}`);
            stepCounterLabel.setText(`Step ${currentStepIndex + 1} of ${totalSteps}`);
            progressBar.setPercentValue(((currentStepIndex + 1) / totalSteps) * 100);

            // Swap the content area to show only the current step's form
            contentArea.removeAllItems();
            contentArea.addItem(stepForms[currentStepIndex]);

            // Update navigation controls
            prevButton.setEnabled(currentStepIndex > 0);
            nextButton.setText(isLastStep ? "Complete" : "Next Step");
            nextButton.setIcon(isLastStep ? "sap-icon://accept" : "sap-icon://navigation-right-arrow");
        };

        /**
         * Called when the user presses the Next/Complete button.
         * Executes the following pipeline in sequence:
         * 1. Per-step field validation (synchronous, local).
         * 2. If last step → fires onSubmit.
         * 3. Otherwise → fires `beforeLayoutSectionChange` with full async API.
         * 4. If not prevented → calls navigateTo(next).
         */
        const handleNextPress = (): void => {
            // Step 1: Validate only the current step's fields.
            // This gives immediate visual feedback (red borders) on errors before any event fires.
            if (!this._validateStep(stepFieldPaths[currentStepIndex], engine)) {
                Logger.debug("[MetaUI WizardLayout]", `Step ${currentStepIndex} failed local validation. Blocking navigation.`, "WizardLayout");
                return;
            }

            // Step 2: If this is the final step, treat Next as Complete.
            if (currentStepIndex === totalSteps - 1) {
                if (onSubmit) onSubmit();
                return;
            }

            // Step 3: Fire beforeLayoutSectionChange to give the consumer a pre-navigation hook.
            const host = engine.host as IWizardCapableHost | null;

            if (!host) {
                // No upstream host to notify — advance directly.
                navigateTo(currentStepIndex + 1);
                return;
            }

            const sm = host.getStateManager();
            const payload: Record<string, unknown> = sm ? sm.extractPayload() : {};

            // Guard: prevents navigateTo() from being called more than once
            // if both preventDefault + resumeNavigation are called by a consumer.
            let isPrevented = false;
            let isNavigated = false;

            const advance = (): void => {
                if (!isNavigated) {
                    isNavigated = true;
                    navigateTo(currentStepIndex + 1);
                }
            };

            host.fireEvent("beforeLayoutSectionChange", {
                /**
                 * The 0-based index of the step the user is navigating AWAY FROM.
                 */
                stepIndex: currentStepIndex,

                /**
                 * A live snapshot of the full form payload at the moment of the transition.
                 */
                payload,

                /**
                 * Blocks navigation synchronously. Call this at the start of an async check to
                 * prevent the wizard from advancing while waiting for a backend response.
                 * Call resumeNavigation() after the check passes to allow the advance.
                 */
                preventDefault: () => {
                    isPrevented = true;
                },

                /**
                 * Blocks navigation AND paints a specific field with an error state.
                 * @param fieldPath The full binding path of the field to mark invalid.
                 * @param errorMessage The error message to display on the field.
                 */
                addError: (fieldPath: string, errorMessage: string) => {
                    isPrevented = true;
                    const plugin: IPlugin | undefined = engine.getPluginByPath(fieldPath);
                    if (plugin && typeof plugin.setVisualValidationState === "function") {
                        plugin.setVisualValidationState(false, errorMessage);
                    }
                },

                /**
                 * Explicitly allows navigation after a prior `preventDefault()` call.
                 * Intended for async consumer patterns (e.g., backend validation Promises).
                 * Calling this causes the wizard to advance to the next step immediately.
                 */
                resumeNavigation: () => {
                    advance();
                }
            });

            // Step 4: If the consumer did not call preventDefault(), advance immediately.
            if (!isPrevented) {
                advance();
            }
        };

        // Initialize: show Step 0 with all state set correctly.
        navigateTo(0);

        // --- Phase 4: Assemble the root container ---
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const navBar = new HBox({
            width: "100%",
            justifyContent: "SpaceBetween",
            alignItems: "Center",
            items: [prevButton, nextButton]
        } as any).addStyleClass("sapUiSmallMarginTop");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const header = new VBox({
            width: "100%",
            items: [
                new HBox({
                    justifyContent: "SpaceBetween",
                    alignItems: "Center",
                    width: "100%",
                    items: [stepTitleControl, stepCounterLabel]
                } as any),
                progressBar
            ]
        }).addStyleClass("sapUiSmallMarginBottom");

        return new VBox({
            width: "100%",
            items: [header, contentArea, navBar]
        });
    }

    /**
     * Validates all fields registered during a specific step's form build.
     *
     * Routes error painting through `engine.reportSchemaError()` → `resolveVisualState()`
     * → `plugin.setVisualValidationState()`. This is the single authoritative path for
     * painting red borders in MetaUI, and correctly handles both default and
     * `useMessageManager` modes.
     *
     * @param fieldPaths The list of binding paths collected during the step's form build.
     * @param engine The Engine instance that holds the plugin registry and validation ledger.
     * @returns {boolean} True if all fields are valid, false if any failed.
     */
    private _validateStep(fieldPaths: string[], engine: Engine): boolean {
        let allValid = true;

        for (const path of fieldPaths) {
            const plugin = engine.getPluginByPath(path);
            if (!plugin) continue;

            const result = plugin.validate();

            if (!result.isValid) {
                // Route through the Engine's validation ledger.
                // reportSchemaError → resolveVisualState → plugin.setVisualValidationState
                // This is the same path used by triggerSubmit and the PBRE.
                engine.reportSchemaError(path, result.errorMessage || "This field is required.");
                allValid = false;
            } else {
                // Clearing null removes the error from the ledger and resets the visual state.
                engine.reportSchemaError(path, null);
            }
        }

        return allValid;
    }

    /**
     * Constructs a SimpleForm for a single wizard step, recursively rendering all
     * child layout elements and collecting their binding paths into `fieldPaths`.
     *
     * @param stepElement The top-level Group/WizardStep layout element for this step.
     * @param schema The active JSON schema.
     * @param modelName The UI5 JSONModel alias for data binding.
     * @param engine The Engine instance for field generation.
     * @param fieldPaths Collector array — all binding paths generated for this step are pushed here.
     * @returns {SimpleForm} The assembled SimpleForm for this wizard step.
     */
    private _buildStepForm(
        stepElement: ILayoutElement,
        schema: ISchema,
        modelName: string,
        engine: Engine,
        fieldPaths: string[]
    ): SimpleForm {
        const form = new SimpleForm({
            editable: true,
            layout: "ResponsiveGridLayout",
            labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
            adjustLabelSpan: false,
            emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0, emptySpanS: 0,
            columnsXL: 1, columnsL: 1, columnsM: 1,
            singleContainerFullSize: false
        });

        if (stepElement.elements && Array.isArray(stepElement.elements)) {
            stepElement.elements.forEach((childElement: ILayoutElement) => {
                this._renderElementInForm(form, childElement, schema, modelName, engine, fieldPaths);
            });
        }

        return form;
    }

    /**
     * Recursively renders a single layout element into a SimpleForm.
     * For `Group` elements, adds a Title and recurses into children.
     * For `Control` elements, resolves the schema scope, generates the plugin control,
     * and pushes the binding path to `fieldPaths` for per-step validation tracking.
     *
     * @param form The target SimpleForm to append content to.
     * @param element The layout element to render.
     * @param schema The active JSON schema.
     * @param modelName The UI5 JSONModel alias for data binding.
     * @param engine The Engine instance for field generation.
     * @param fieldPaths Collector array for binding path tracking.
     */
    private _renderElementInForm(
        form: SimpleForm,
        element: ILayoutElement,
        schema: ISchema,
        modelName: string,
        engine: Engine,
        fieldPaths: string[]
    ): void {
        if (element.type === "Group") {
            if (element.label) {
                // sap.ui.core.Title (CoreTitle) is an Element, not a Control.
                // It is ONLY valid inside a SimpleForm's content aggregation as a section header.
                form.addContent(new CoreTitle({ text: element.label }));
            }
            if (element.elements && Array.isArray(element.elements)) {
                element.elements.forEach((childElement: ILayoutElement) => {
                    this._renderElementInForm(form, childElement, schema, modelName, engine, fieldPaths);
                });
            }
            return;
        }

        if (element.type === "Control") {
            if (!element.scope || !element.scope.startsWith("#/properties/")) {
                Logger.error(`[MetaUI WizardLayout] Invalid scope '${element.scope}' — must start with '#/properties/'.`, "", "WizardLayout");
                return;
            }

            const { meta, bindingPath, propKey } = SchemaNormalizer.resolveScope(schema, element.scope);

            if (!meta) {
                Logger.error(`[MetaUI WizardLayout] Property '${propKey}' not found in schema.`, "", "WizardLayout");
                return;
            }

            try {
                const labelText = element.label || meta.ui?.label || propKey;
                const label = new Label({
                    text: labelText,
                    // meta.required may be boolean or string[] at schema object level;
                    // Label.required only accepts boolean — normalize it.
                    required: meta.required === true
                });

                const effectiveMeta: IPropertyMetadata = { ...meta };
                if (element.widget) {
                    effectiveMeta.ui = { ...(meta.ui || {}), widget: element.widget };
                }

                const absolutePath = `/${bindingPath}`;
                const control = engine.generateField(effectiveMeta, absolutePath, modelName);

                // Track this path so _validateStep can target exactly the fields built for this step.
                fieldPaths.push(absolutePath);

                if (effectiveMeta.ui?.fullWidth) {
                    sap.ui.require(["sap/ui/layout/GridData"], (GridData: typeof import("sap/ui/layout/GridData").default) => {
                        control.setLayoutData(new GridData({ span: "XL12 L12 M12 S12" }));
                    });
                }

                form.addContent(label);
                form.addContent(control);
            } catch (error) {
                Logger.error(`[MetaUI WizardLayout] Failed to render field '${propKey}'`, (error as Error).message, "WizardLayout");
                form.addContent(new Label({ text: propKey }));
            }
            return;
        }

        Logger.warn(`[MetaUI WizardLayout] Unsupported element type '${element.type}' inside a wizard step.`, "", "WizardLayout");
    }
}
