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
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Button from "sap/m/Button";
import ProgressIndicator from "sap/m/ProgressIndicator";
import MTitle from "sap/m/Title";
import Text from "sap/m/Text";
import Control from "sap/ui/core/Control";
import { TitleLevel, ValueState } from "sap/ui/core/library";
import { ButtonType, FlexAlignItems, FlexJustifyContent } from "sap/m/library";
import { ISchema, ILayoutElement } from "../interfaces/ISchema";
import { IPlugin } from "../interfaces/IPlugin";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { Engine } from "../core/Engine";
import { WizardStepRenderer } from "./WizardStepRenderer";
import { AccessibilityUtil } from "../utils/AccessibilityUtil";
import { Logger } from "../utils/Logger";

/**
 * Minimal structural contract for accessing the hosting GeneratorHost without importing
 * it directly (which would create a circular dependency between WizardLayout ↔ GeneratorHost).
 */
interface IWizardCapableHost {
    /** Returns the active StateManager. Used to extract a payload snapshot at step-change time. */
    getStateManager(): { extractPayload(): unknown } | null;
    /** Fires a UI5 event upward on the host control. */
    fireEvent?(eventName: string, params?: Record<string, unknown>, allowPreventDefault?: boolean): unknown;
    /** Programmatically injects a custom validation error onto a field path. */
    addCustomError?(fieldPath: string, message: string): void;
    /** Programmatically clears a custom validation error from a field path. */
    clearCustomError?(fieldPath: string): void;
}

/**
 * Layout Manager that generates a custom paginated step navigator.
 * Renders exactly one step at a time, validates current-step fields before advancing,
 * and fires `beforeLayoutSectionChange` with a full async API before each step transition.
 *
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @internal
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
            Logger.warn(
                "[MetaUI WizardLayout] Missing 'uiLayout' array in schema. Cannot build step navigator.",
                "",
                "WizardLayout"
            );
            return new VBox();
        }

        const stepElements: ILayoutElement[] = [];
        let pendingLooseElements: ILayoutElement[] = [];
        for (const el of schema.uiLayout) {
            if (el.type === "Group" || el.type === "WizardStep") {
                if (pendingLooseElements.length > 0) {
                    stepElements.push({
                        type: "WizardStep",
                        label: schema.title || `Step ${stepElements.length + 1}`,
                        elements: pendingLooseElements
                    });
                    pendingLooseElements = [];
                }
                stepElements.push(el);
            } else {
                pendingLooseElements.push(el);
            }
        }
        if (pendingLooseElements.length > 0) {
            stepElements.push({
                type: "WizardStep",
                label: schema.title || `Step ${stepElements.length + 1}`,
                elements: pendingLooseElements
            });
        }
        if (stepElements.length === 0) {
            Logger.warn("[MetaUI WizardLayout] No Group or WizardStep elements found in uiLayout.", "", "WizardLayout");
            return new VBox();
        }

        const totalSteps = stepElements.length;
        const stepForms: SimpleForm[] = [];
        const stepFieldPaths: string[][] = [];

        stepElements.forEach((element: ILayoutElement) => {
            const fieldPaths: string[] = [];
            stepForms.push(WizardStepRenderer.buildStepForm(element, schema, modelName, engine, fieldPaths));
            stepFieldPaths.push(fieldPaths);
        });

        let currentStepIndex = 0;
        let navigationEpoch = 0;

        const stepTitleControl = new MTitle({ level: TitleLevel.H3 });
        const stepCounterLabel = new Text();
        const progressBar = new ProgressIndicator({
            showValue: false,
            state: ValueState.None,
            height: "0.5rem"
        }).addStyleClass("sapUiTinyMarginTop");
        // A bare role="progressbar" announces "50%" and nothing else. The counter beside it already says
        // "Step 2 of 4" on screen, so it names the bar rather than a second copy of the same sentence.
        AccessibilityUtil.associateAriaLabel(progressBar, stepCounterLabel);

        const contentArea = new VBox({ width: "100%" });
        // Each step's form is a region in its own right. Naming it with the live step title is what makes a
        // screen reader announce "Delivery details, form" on entry instead of dropping the user into a run
        // of unrelated fields with no indication of which step they belong to.
        stepForms.forEach((stepForm) => {
            AccessibilityUtil.associateAriaLabel(stepForm, stepTitleControl);
            contentArea.addDependent(stepForm);
        });

        const sectionChangeErrorPaths: Set<string> = new Set();
        const clearSectionChangeErrors = (): void => {
            if (sectionChangeErrorPaths.size === 0) {
                return;
            }
            const hostRef: IWizardCapableHost | undefined = engine.host;
            for (const errPath of Array.from(sectionChangeErrorPaths)) {
                if (hostRef && typeof hostRef.clearCustomError === "function") {
                    hostRef.clearCustomError(errPath);
                } else {
                    engine.reportCustomError(errPath, null);
                    const plugin: IPlugin | undefined = engine.getPluginByPath(errPath);
                    if (plugin) {
                        plugin.setVisualValidationState(true);
                    }
                }
            }
            sectionChangeErrorPaths.clear();
        };

        const prevButton = new Button({
            text: "Previous",
            icon: "sap-icon://navigation-left-arrow",
            enabled: false,
            press: () => {
                navigationEpoch++;
                clearSectionChangeErrors();
                navigateTo(currentStepIndex - 1);
            }
        });

        const nextButton = new Button({
            type: ButtonType.Emphasized,
            text: totalSteps === 1 ? "Complete" : "Next Step",
            icon: "sap-icon://navigation-right-arrow",
            iconFirst: false,
            press: () => handleNextPress()
        });

        const navigateTo = (index: number): void => {
            if (index < 0 || index >= totalSteps) {
                Logger.error("[MetaUI WizardLayout]", `Invalid navigation target: step ${index}`, "WizardLayout");
                return;
            }
            currentStepIndex = index;
            const element = stepElements[currentStepIndex];
            const isLastStep = currentStepIndex === totalSteps - 1;

            stepTitleControl.setText(element.label || `Step ${currentStepIndex + 1}`);
            stepCounterLabel.setText(`Step ${currentStepIndex + 1} of ${totalSteps}`);
            progressBar.setPercentValue(((currentStepIndex + 1) / totalSteps) * 100);

            const removedItems = contentArea.removeAllItems();
            for (const removed of removedItems) {
                contentArea.addDependent(removed);
            }
            contentArea.addItem(stepForms[currentStepIndex]);

            prevButton.setEnabled(currentStepIndex > 0);
            nextButton.setText(isLastStep ? "Complete" : "Next Step");
            nextButton.setIcon(isLastStep ? "sap-icon://accept" : "sap-icon://navigation-right-arrow");
        };

        const handleNextPress = (): void => {
            const pressEpoch = ++navigationEpoch;
            const originStepIndex = currentStepIndex;
            const targetStepIndex = originStepIndex + 1;
            clearSectionChangeErrors();
            if (!WizardStepRenderer.validateStep(stepFieldPaths[originStepIndex], engine, schema)) {
                Logger.debug(
                    "[MetaUI WizardLayout]",
                    `Step ${originStepIndex} failed local validation. Blocking navigation.`,
                    "WizardLayout"
                );
                return;
            }

            if (originStepIndex === totalSteps - 1) {
                if (onSubmit) {
                    onSubmit();
                }
                return;
            }

            const host: IWizardCapableHost | undefined = engine.host;
            if (!host || typeof host.fireEvent !== "function") {
                navigateTo(targetStepIndex);
                return;
            }

            const sm = host.getStateManager();
            const payload: unknown = sm ? sm.extractPayload() : {};
            let isPrevented = false;
            let hasHardError = false;
            let isNavigated = false;
            let inEventDispatch = true;
            let resumeRequestedSync = false;

            const advance = (): void => {
                if (
                    !isNavigated &&
                    !hasHardError &&
                    navigationEpoch === pressEpoch &&
                    currentStepIndex === originStepIndex
                ) {
                    isNavigated = true;
                    navigateTo(targetStepIndex);
                }
            };

            const allowed = host.fireEvent(
                "beforeLayoutSectionChange",
                {
                    stepIndex: originStepIndex,
                    currentSectionIndex: originStepIndex,
                    newSectionIndex: targetStepIndex,
                    payload,
                    preventDefault: () => {
                        isPrevented = true;
                        resumeRequestedSync = false;
                    },
                    addError: (fieldPath: string, errorMessage: string) => {
                        isPrevented = true;
                        hasHardError = true;
                        resumeRequestedSync = false;
                        const normalizedPath = fieldPath.startsWith("/") ? fieldPath : `/${fieldPath}`;
                        sectionChangeErrorPaths.add(normalizedPath);
                        if (typeof host.addCustomError === "function") {
                            host.addCustomError(normalizedPath, errorMessage);
                        } else {
                            engine.reportCustomError(normalizedPath, errorMessage);
                            const plugin: IPlugin | undefined = engine.getPluginByPath(normalizedPath);
                            if (plugin) {
                                plugin.setVisualValidationState(false, errorMessage);
                            }
                        }
                    },
                    resumeNavigation: () => {
                        if (inEventDispatch) {
                            if (!hasHardError) {
                                resumeRequestedSync = true;
                            }
                        } else {
                            advance();
                        }
                    }
                },
                true
            );

            inEventDispatch = false;
            if (allowed === false) {
                isPrevented = true;
                resumeRequestedSync = false;
            }
            if ((!isPrevented || resumeRequestedSync) && !hasHardError) {
                advance();
            }
        };

        navigateTo(0);

        const navBar = new HBox({
            width: "100%",
            justifyContent: FlexJustifyContent.SpaceBetween,
            alignItems: FlexAlignItems.Center,
            items: [prevButton, nextButton]
        }).addStyleClass("sapUiSmallMarginTop");

        const header = new VBox({
            width: "100%",
            items: [
                new HBox({
                    justifyContent: FlexJustifyContent.SpaceBetween,
                    alignItems: FlexAlignItems.Center,
                    width: "100%",
                    items: [stepTitleControl, stepCounterLabel]
                }),
                progressBar
            ]
        }).addStyleClass("sapUiSmallMarginBottom");

        return new VBox({
            width: "100%",
            items: [header, contentArea, navBar]
        });
    }
}
