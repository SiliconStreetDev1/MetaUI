/**
 * @file ReferencePlugin.ts
 * @description Renders a button that lazily loads a referenced schema definition from the global dictionary
 * and opens it in a nested dialog. Implements headless validation for the deferred schema.
 */

import { BasePlugin } from "./BasePlugin";
import { IPluginValidationResult } from "../../interfaces/IPlugin";
import { UI5_EVENT, UI5_AGGREGATION } from "../../constants/MetaUIConstants";
import { ISchema, IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import Button from "sap/m/Button";
import JSONModel from "sap/ui/model/json/JSONModel";
import { GlobalPipeline } from "../../core/PipelineManager";
import { Logger } from "../../utils/Logger";

export class ReferencePlugin extends BasePlugin {
    /**
     * Interface for the duck-typed parent GeneratorHost.
     */
    private _asHost(control: Control): { getSchemaDefinition(ref: string): ISchema; getProperty(name: string): unknown; fireEvent(name: string, params?: unknown): void; } | null {
        const host = control as unknown as { getSchemaDefinition?: Function; getProperty?: Function; fireEvent?: Function; };
        if (typeof host.getSchemaDefinition === "function") {
            return host as { getSchemaDefinition(ref: string): ISchema; getProperty(name: string): unknown; fireEvent(name: string, params?: unknown): void; };
        }
        return null;
    }

    /**
     * Finds the closest GeneratorHost in the control hierarchy.
     */
    private findParentHost(control: Control): unknown {
        let parent = control.getParent();
        while (parent) {
            if (this._asHost(parent)) {
                return parent;
            }
            parent = parent.getParent();
        }
        return null;
    }

    public render(field: IPropertyMetadata, bindingPath: string, modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = field;
        const propKey = bindingPath.startsWith("/") ? bindingPath.substring(1) : bindingPath;
        const label = field.ui?.label || propKey;

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: !this.isEditable ? `View Link: ${label}` : `Edit Link: ${label}`,
            icon: "sap-icon://chain-link",
            press: (oEvent: Event) => {
                const btn = oEvent.getSource() as Button;
                if (!this.metadata?.$ref) {
                    Logger.error(`[ReferencePlugin] FATAL: this.metadata.$ref is MISSING or UNDEFINED! Cannot resolve child schema.`);
                    return;
                }
                
                const rawParentHost = this.findParentHost(btn) as Control;
                const parentHost = rawParentHost ? this._asHost(rawParentHost) : null;
                if (!parentHost) {
                    Logger.error("[ReferencePlugin] FATAL: Could not locate parent GeneratorHost via duck typing `getSchemaDefinition`.");
                    return;
                }

                const subSchema = parentHost.getSchemaDefinition(this.metadata.$ref);
                if (!subSchema) {
                    const keys = Object.keys(parentHost.getProperty("schemaDefinitions") || {});
                    Logger.error(`[ReferencePlugin] FATAL: Schema definition not found for reference: ${this.metadata.$ref}. Dumping parent schemaDefinitions keys: ${keys.join(", ")}`);
                    return;
                }

                const parentModel = btn.getModel(modelName) as JSONModel;
                if (!parentModel) {
                    Logger.error(`[ReferencePlugin] FATAL: Could not get JSONModel named '${modelName}' from the button.`);
                    return;
                }
                
                const bindingContext = btn.getBindingContext(modelName);
                let updatePath = bindingPath;
                if (bindingContext && !bindingPath.startsWith("/")) {
                    const ctxPath = bindingContext.getPath();
                    updatePath = ctxPath.endsWith("/") ? ctxPath + bindingPath : (ctxPath === "/" ? "/" + bindingPath : ctxPath + "/" + bindingPath);
                }
                
                const rawData = parentModel.getProperty(updatePath);
                const nestedData = rawData ? JSON.parse(JSON.stringify(rawData)) : {};

                sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/DynamicHost"], (DynamicHostModule: unknown) => {
                    const DynamicHostClass = (DynamicHostModule as any).default || DynamicHostModule;
                    const host = new DynamicHostClass({
                        schemaDefinition: subSchema,
                        schemaDefinitions: parentHost.getProperty("schemaDefinitions"), // Pass the dictionary down
                        data: nestedData,
                        editable: this.isEditable,
                        useMessageManager: this.useMessageManager
                    });

                    // Event Piping: Bubble validation events up to the parent host
                    host.attachEvent("validationError", (e: Event) => {
                        parentHost.fireEvent("validationError", e.getParameters());
                    });
                    host.attachEvent("validationSuccess", (e: Event) => {
                        parentHost.fireEvent("validationSuccess", e.getParameters());
                    });

                    if (!!this.isEditable) {
                        host.attachEvent(UI5_EVENT.SUBMIT, (e: Event) => {
                            const payload = (e.getParameter("payload") as unknown);
                            parentModel.setProperty(updatePath, payload);
                            
                            if (this.onChange) {
                                this.onChange(true, propKey);
                            }
                        });
                    }

                    const buttonText = field.ui?.dialogButtonText || (!this.isEditable ? "Close" : "OK");
                    try {
                        host.openInDialog(`Nested Link: ${label}`, buttonText, undefined, undefined, btn);
                    } catch (e) {
                        Logger.error(`[ReferencePlugin] FATAL ERROR CALLING openInDialog:`, (e as Error).message);
                    }
                });
            }
        });

        return this.control as Control;
    }

    /**
     * Headless validation: since child controls are not rendered, we manually validate the nested payload against the lazily resolved schema.
     */
    public validate(): IPluginValidationResult {
        if (!this.metadata?.$ref || !this.control) return { isValid: true };
        
        const rawParentHost = this.findParentHost(this.control) as Control;
        const parentHost = rawParentHost ? this._asHost(rawParentHost) : null;
        if (!parentHost) return { isValid: true };
        
        const subSchema = parentHost.getSchemaDefinition(this.metadata.$ref);
        if (!subSchema || !subSchema.properties) return { isValid: true };
        
        const parentModel = this.control.getModel(this.modelName) as JSONModel;
        if (!parentModel) return { isValid: true };
        
        let updatePath = this.getAbsoluteBindingPath();
        
        const nestedData = parentModel.getProperty(updatePath) || {};
        
        // Basic headless validation over the subSchema properties
        for (const key of Object.keys(subSchema.properties)) {
            const propMeta = subSchema.properties[key] as IPropertyMetadata;
            const val = nestedData[key];
            
            if (propMeta.required && (val === undefined || val === null || val === "")) {
                const errMsg = `Field '${key}' is required in referenced object.`;
                this.setVisualValidationState(false, errMsg);
                return { isValid: false, errorMessage: errMsg };
            }
            
            const validatorsToRun: string[] = [];
            const argsMap: Record<string, unknown> = {};

            if (propMeta.maxLength !== undefined) {
                validatorsToRun.push("maxLength");
                argsMap["maxLength"] = propMeta.maxLength;
            }
            if (propMeta.minLength !== undefined) {
                validatorsToRun.push("minLength");
                argsMap["minLength"] = propMeta.minLength;
            }
            if (propMeta.pattern !== undefined) {
                validatorsToRun.push("pattern");
                argsMap["pattern"] = { regex: propMeta.pattern };
            }
            if (propMeta.minimum !== undefined || propMeta.maximum !== undefined) {
                validatorsToRun.push("range");
                argsMap["range"] = { min: propMeta.minimum, max: propMeta.maximum };
            }
            
            const format = propMeta.ui?.format;
            if (format === "email" || format === "url" || format === "iban") {
                validatorsToRun.push(format);
            }
            
            if (validatorsToRun.length > 0) {
                const res = GlobalPipeline.executeValidation(val, validatorsToRun, argsMap);
                if (!res.isValid) {
                    const errMsg = `Field '${key}' in reference: ${res.errorMessage}`;
                    this.setVisualValidationState(false, errMsg);
                    return { isValid: false, errorMessage: errMsg };
                }
            }
        }
        
        this.setVisualValidationState(true);
        return { isValid: true };
    }

    protected getValue(): null {
        return null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as Button).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
