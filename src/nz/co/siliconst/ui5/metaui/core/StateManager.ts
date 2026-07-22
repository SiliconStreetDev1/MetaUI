/**
 * @file StateManager.ts
 * @description Isolated internal state management. Decouples the MetaUI engine from external host models.
 */

import JSONModel from "sap/ui/model/json/JSONModel";
import ManagedObject from "sap/ui/base/ManagedObject";
import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { GlobalPipeline } from "./PipelineManager";
import Message from "sap/ui/core/message/Message";
import coreLibrary from "sap/ui/core/library";
import Core from "sap/ui/core/Core";
import Messaging from "sap/ui/core/Messaging";


/**
 * Manages the isolated internal data payload for the MetaUI engine.
 */
export class StateManager {
    private model: JSONModel;
    private activeModelName: string;
    private schema: ISchema | null = null;
    private _useMessageManager: boolean = false;

    /**
     * Initializes the state manager with an authentic SAPUI5 JSONModel.
     * @param initialData The initial JSON payload to populate the fields.
     * @param schema The normalized schema for live validation.
     * @param modelName The UI5 model alias used for isolation.
     */
    constructor(initialData: Record<string, unknown> = {}, schema: ISchema, modelName: string = "meta") {
        this.activeModelName = modelName;
        this.schema = schema;
        
        // Deep copy to ensure no reference leakage from the host application
        const safeData = JSON.parse(JSON.stringify(initialData));
        this.model = new JSONModel(safeData);
        this.model.setDefaultBindingMode("TwoWay");

        // Centralized Model-Level Validation Interceptor
        const originalSetProperty = this.model.setProperty.bind(this.model);
        this.model.setProperty = (sPath: string, oValue: unknown, oContext?: unknown, bAsyncUpdate?: boolean) => {
            const result = originalSetProperty(sPath, oValue, oContext, bAsyncUpdate);
            this.validatePath(sPath, oValue);
            return result;
        };
    }

    /**
     * Updates the flag indicating whether this manager should push validation errors directly to the global MessageManager.
     */
    public setUseMessageManager(use: boolean): void {
        this._useMessageManager = use;
    }

    /**
     * Validates a specific path against the schema and updates the MessageManager.
     */
    private validatePath(sPath: string, value: unknown): void {
        const fieldKey = sPath.replace(/^\//, "");
        const metadata = this.findMetadataForPath(fieldKey);
        
        const messageManager = Messaging;
        const targetPath = sPath.startsWith("/") ? sPath : `/${sPath}`; // Pure UI5: target MUST be absolute path
        
        // 1. Remove existing messages (strictly for THIS model instance)
        if (this._useMessageManager) {
            const existingMessages = messageManager.getMessageModel().getData();
            const messagesToRemove = existingMessages.filter((msg: sap.ui.core.message.Message) => {
                const isMatch = msg.getTarget() === targetPath && msg.getMessageProcessor() && msg.getMessageProcessor().getId() === this.model.getId();
                return isMatch;
            });
            
            if (messagesToRemove.length > 0) {
                messageManager.removeMessages(messagesToRemove);
            }
        }

        if (!metadata) return;

        // 2. Run GlobalPipeline
        const validatorsToRun: string[] = [];
        const argsMap: Record<string, unknown> = {};

        if (metadata.required) {
            validatorsToRun.push("required");
        }
        if (metadata.type === "string" && metadata.maxLength) {
            validatorsToRun.push("maxLength");
            argsMap["maxLength"] = metadata.maxLength;
        }
        if (metadata.minLength) {
            validatorsToRun.push("minLength");
            argsMap["minLength"] = metadata.minLength;
        }
        if (metadata.pattern) {
            validatorsToRun.push("pattern");
            argsMap["pattern"] = metadata.pattern;
        }
        if (metadata.minimum !== undefined || metadata.maximum !== undefined) {
            validatorsToRun.push("range");
            argsMap["range"] = { min: metadata.minimum, max: metadata.maximum };
        }
        
        const format = metadata.ui?.format;
        if (format === "email" || format === "url" || format === "iban") {
            validatorsToRun.push(format);
        }
        if (metadata.ui?.validators) {
            for (const v of metadata.ui.validators) {
                if (typeof v === "string") {
                    validatorsToRun.push(v);
                } else if (v && v.name) {
                    validatorsToRun.push(v.name);
                    if (v.args !== undefined) {
                        argsMap[v.name] = v.args;
                    }
                }
            }
        }

        if (validatorsToRun.length > 0) {
            const validationResult = GlobalPipeline.executeValidation(value, validatorsToRun, argsMap);
            if (!validationResult.isValid && this._useMessageManager) {
                const newMsg = new Message({
                    message: validationResult.errorMessage || "Invalid value.",
                    type: coreLibrary.MessageType.Error,
                    target: targetPath,
                    processor: this.model
                });
                messageManager.addMessages(newMsg);
            }
        }
    }

    /**
     * Resolves the schema metadata for a given internal binding path.
     * @param path The flat binding path representing the field.
     * @returns The associated IPropertyMetadata, or undefined if not mapped.
     */
    private findMetadataForPath(path: string): IPropertyMetadata | undefined {
        if (!this.schema || !this.schema.properties) return undefined;
        // Basic single-level support for now. Nested object resolution would split by '.' or '/'
        return this.schema.properties[path];
    }



    /**
     * Retrieves the isolated JSONModel instance to attach to the root GeneratorHost control.
     * @returns The internal JSONModel.
     */
    public getModel(): JSONModel {
        return this.model;
    }

    /**
     * Binds a generated UI control property to a path in the internal model.
     * @param control The target UI5 Control.
     * @param property The UI5 property name (e.g., 'value').
     * @param bindingPath The exact path in the JSON payload.
     */
    public bindControl(control: ManagedObject, property: string, bindingPath: string): void {
        control.bindProperty(property, {
            path: bindingPath,
            model: "meta" // Assumes the model is bound to the root container with the name 'meta'
        });
    }

    /**
     * Extracts the flat JavaScript object representing the current state of the UI.
     * @returns A serialized record of the data payload, free of UI5 wrappers.
     */
    public extractPayload(): Record<string, unknown> {
        // Create a deep copy to prevent accidental mutations by the host
        const data = this.model.getData();
        return JSON.parse(JSON.stringify(data));
    }

    /**
     * Cleans up internal state and natively destroys the UI5 JSONModel to prevent memory leaks.
     */
    public destroy(): void {
        
        if (this.model) {
            this.model.destroy();
        }
    }
}
