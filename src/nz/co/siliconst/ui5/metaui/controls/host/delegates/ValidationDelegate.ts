/**
 * @file ValidationDelegate.ts
 * @description Handles Fiori MessageManager integration and provides a standardized Error Boundary UI fallback.
 */

import IllustratedMessage from "sap/m/IllustratedMessage";
import Messaging from "sap/ui/core/Messaging";
import Control from "sap/ui/core/Control";
import { StateManager } from "../../../core/StateManager";
import { Engine } from "../../../core/Engine";
import { IPluginValidationResult } from "../../../interfaces/IPlugin";
import { Logger } from "../../../utils/Logger";
import { OpenApiRefResolver } from "../../../openapi/OpenApiRefResolver";
import { SchemaNormalizer } from "../../../core/SchemaNormalizer";
import { isRecord } from "../../../utils/TypeGuards";
import type { ISchema } from "../../../interfaces/ISchema";
import Message from "sap/ui/core/message/Message";
import MessageType from "sap/ui/core/message/MessageType";

/**
 * Host contract required by {@link ValidationDelegate} to manage validation state and error boundaries.
 */
export interface IHostValidation {
    getProperty(name: string): unknown;
    setProperty(name: string, value: unknown, suppressInvalidate?: boolean): unknown;
    setAggregation(aggregationName: string, object: Control, suppressInvalidate?: boolean): this;
    getStateManager(): StateManager | null;
    fireEvent(eventId: string, parameters?: object): unknown;
    addCustomError(fieldPath: string, message: string): void;
    clearCustomError(fieldPath: string): void;
}

/**
 * Handles Fiori MessageManager integration and provides a standardized Error Boundary UI fallback.
 */
export class ValidationDelegate {
    private host: IHostValidation;
    private readonly beforeSubmitErrorPaths: Set<string> = new Set();

    /**
     * Initializes the ValidationDelegate for publishing validation messages to the global MessageManager.
     * @param host The parent host interface.
     */
    constructor(host: IHostValidation) {
        this.host = host;
    }

    /**
     * Removes non-custom validation messages owned by the host's StateManager from the global MessageManager.
     * Custom errors (`code === "CustomError"`) are preserved until explicitly cleared via `clearCustomError`.
     */
    public removeAllMessages(): void {
        const stateManager = this.host.getStateManager();
        if (stateManager && this.host.getProperty("useMessageManager")) {
            const messages: Message[] = Messaging.getMessageModel().getData();
            const processorId = stateManager.getModel().getId();
            const messagesToRemove = messages.filter((m: Message) =>
                m.getMessageProcessor()?.getId() === processorId && m.getCode() !== "CustomError"
            );
            if (messagesToRemove.length > 0) {
                Messaging.removeMessages(messagesToRemove);
            }
        }
    }

    /**
     * Pushes a validation message to the console, and optionally to the MessageManager.
     * @param path The JSON pointer path of the field.
     * @param text The error message.
     * @param label The human-readable label of the field (optional).
     */
    public pushMessage(path: string, text: string, label?: string): void {
        const targetPath = path ? `/${path.replace(/^\//, "")}` : "";
        const displayLabel = label || path;
        const displayText = path ? `Field '${displayLabel}': ${text}` : text;

        if (path) {
            Logger.warn(`[MetaUI Validation Error] ${displayText}`);
        } else {
            Logger.warn(`[MetaUI Validation Error] Global - ${text}`);
        }

        if (this.host.getProperty("useMessageManager") === true) {
            const stateManager = this.host.getStateManager();
            Messaging.addMessages(new Message({
                message: displayText,
                additionalText: displayLabel !== targetPath ? displayLabel : undefined,
                type: MessageType.Error,
                target: targetPath,
                processor: stateManager?.getModel()
            }));
        }
    }

    /**
     * Imperatively invalidates a field in the global MessageManager when `useMessageManager` is active.
     * Uses a specific `'CustomError'` code to distinguish it from internal schema validations.
     *
     * @param fieldPath The internal JSON path of the field to highlight.
     * @param message The custom error message to display.
     */
    public addCustomError(fieldPath: string, message: string): void {
        if (this.host.getProperty("useMessageManager") !== true) {
            return;
        }

        const stateManager = this.host.getStateManager();
        if (!stateManager) {
            return;
        }

        this.clearCustomError(fieldPath);

        Messaging.addMessages(new Message({
            message: message,
            type: MessageType.Error,
            target: `/${fieldPath.replace(/^\//, "")}`,
            processor: stateManager.getModel(),
            code: "CustomError"
        }));
    }

    /**
     * Reverts a custom error state on a field in the global MessageManager.
     *
     * @param fieldPath The internal JSON path of the field to clear.
     */
    public clearCustomError(fieldPath: string): void {
        if (this.host.getProperty("useMessageManager") !== true) {
            return;
        }

        const stateManager = this.host.getStateManager();
        if (!stateManager) {
            return;
        }

        const target = `/${fieldPath.replace(/^\//, "")}`;
        const processorId = stateManager.getModel().getId();
        const messages = Messaging.getMessageModel().getData() as Message[];

        const messagesToRemove = messages.filter(m =>
            m.getTarget() === target &&
            m.getCode() === "CustomError" &&
            m.getMessageProcessor()?.getId() === processorId
        );

        if (messagesToRemove.length > 0) {
            Messaging.removeMessages(messagesToRemove);
        }
    }

    /**
     * Triggers a visual Error Page (Crash Boundary) when generation catastrophically fails.
     */
    public mountCrashBoundary(error: Error): void {
        Logger.error("[MetaUI] Engine failed to generate layout. Preventing Launchpad crash.", error.message, "ValidationDelegate");

        const errorPage = new IllustratedMessage({
            title: "UI Generation Failed",
            description: "The dynamic schema could not be rendered. Please check the Fiori console for diagnostic logs."
        });

        this.host.setAggregation("_content", errorPage);
    }

    /**
     * Publishes an array of field validation errors returned by `Engine.validateAll` to the `MessageManager`.
     * @param errors The list of field validation errors.
     */
    public reportValidationErrors(errors: IPluginValidationResult[]): void {
        if (this.host.getProperty("useMessageManager") === true) {
            this.pushMessage(
                "",
                "One or more fields failed schema validation. Please review the highlighted fields."
            );
        }
        const stateManager = this.host.getStateManager();
        const processorId = stateManager?.getModel().getId();
        const existingMsgs = (Messaging.getMessageModel().getData() as Message[]) || [];
        for (const err of errors) {
            if (err.fieldKey && err.errorMessage) {
                const targetPath = `/${err.fieldKey.replace(/^\//, "")}`;
                const alreadyExists =
                    processorId !== undefined &&
                    existingMsgs.some(
                        (m) => m.getMessageProcessor()?.getId() === processorId && m.getTarget() === targetPath
                    );
                if (!alreadyExists) {
                    this.pushMessage(err.fieldKey, err.errorMessage, err.fieldLabel);
                }
            }
        }
    }

    /**
     * Fires `validationStateChanged` and `validationError` / `validationSuccess` on a field validation change.
     *
     * @param isValid Whether the changed field passed validation.
     * @param fieldKey The field path that changed.
     * @param errorMessage Optional validation error message.
     * @param overallIsValid Optional overall form validity computed from the `ValidationLedger`.
     */
    public notifyFieldValidation(
        isValid: boolean,
        fieldKey?: string,
        errorMessage?: string,
        overallIsValid?: boolean
    ): void {
        const effectiveFormValid = overallIsValid !== undefined ? overallIsValid : isValid;
        if (effectiveFormValid !== (this.host.getProperty("isValid") as boolean)) {
            this.host.setProperty("isValid", effectiveFormValid, true);
            this.host.fireEvent("validationStateChanged", { isValid: effectiveFormValid });
        }
        this.host.fireEvent(isValid ? "validationSuccess" : "validationError", {
            fieldPath: fieldKey || "",
            ...(isValid ? {} : { message: errorMessage || "Invalid input" })
        });
    }

    /**
     * Clears any custom errors previously registered by a `beforeSubmit` event handler via `addError`,
     * without disturbing persistent custom errors registered via `host.addCustomError()`.
     */
    public clearBeforeSubmitErrors(): void {
        if (this.beforeSubmitErrorPaths.size === 0) {
            return;
        }
        for (const path of Array.from(this.beforeSubmitErrorPaths)) {
            this.host.clearCustomError(path);
        }
        this.beforeSubmitErrorPaths.clear();
    }

    /**
     * Fires `beforeSubmit` and returns true if the consumer did not call `preventDefault()` or `addError()`.
     * @param payload The extracted clean payload.
     * @returns {boolean} True if submission may proceed.
     */
    public confirmBeforeSubmit(payload: unknown): boolean {
        this.clearBeforeSubmitErrors();
        let isPrevented = false;
        this.host.fireEvent("beforeSubmit", {
            payload,
            preventDefault: () => {
                isPrevented = true;
            },
            addError: (propertyPath: string, errorMessage: string) => {
                isPrevented = true;
                this.beforeSubmitErrorPaths.add(propertyPath);
                this.host.addCustomError(propertyPath, errorMessage);
            }
        });
        return !isPrevented;
    }

    /**
     * Resolves a `$ref` path against normalized definitions or lazily normalizes the host's `schemaDefinitions`.
     * @param refPath The `$ref` path string.
     * @param cachedDefs Optional cached definitions map.
     * @returns {{ definition: ISchema | undefined; normalizedDefs: Record<string, ISchema> | undefined }}
     */
    public resolveDefinition(
        refPath: string,
        cachedDefs?: Record<string, ISchema>
    ): { definition: ISchema | undefined; normalizedDefs: Record<string, ISchema> | undefined } {
        let defs = cachedDefs;
        if (!defs) {
            const rawDefs = this.host.getProperty("schemaDefinitions");
            if (isRecord(rawDefs)) {
                defs = {};
                for (const key of Object.keys(rawDefs)) {
                    defs[key] = SchemaNormalizer.normalizeDefinition(rawDefs[key], key);
                }
            }
        }
        if (!defs || !refPath) {
            return { definition: undefined, normalizedDefs: defs };
        }
        const key = OpenApiRefResolver.extractRefName(refPath);
        return { definition: defs[key], normalizedDefs: defs };
    }

    /**
     * Collects diagnostic DOM metadata from the active Engine plugins.
     * @param engine The active Engine instance, if any.
     * @returns {Record<string, unknown>[]} Array of `{ path, controlId }` descriptors.
     */
    public collectDebugDomMetadata(engine: Engine | null): Record<string, unknown>[] {
        if (!engine) return [];
        return engine.getActivePlugins().map((entry) => ({
            path: entry.path,
            controlId:
                typeof entry.plugin.getControlId === "function"
                    ? entry.plugin.getControlId()
                    : typeof entry.plugin.getFieldLabel === "function"
                      ? entry.plugin.getFieldLabel()
                      : entry.path,
            label: typeof entry.plugin.getFieldLabel === "function" ? entry.plugin.getFieldLabel() : entry.path
        }));
    }
}
