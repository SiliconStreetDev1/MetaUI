import IllustratedMessage from "sap/m/IllustratedMessage";
import Messaging from "sap/ui/core/Messaging";
import Control from "sap/ui/core/Control";
import { StateManager } from "../../../core/StateManager";
import { Logger } from "../../../utils/Logger";
import Message from "sap/ui/core/message/Message";
import coreLibrary from "sap/ui/core/library";

export interface IHostValidation {
    getProperty(name: string): unknown;
    setAggregation(aggregationName: string, object: sap.ui.core.Control, suppressInvalidate?: boolean): this;
    getStateManager(): StateManager | null;
}

/**
 * Handles Fiori MessageManager integration and provides a standardized Error Boundary UI fallback.
 */
export class ValidationDelegate {
    private host: IHostValidation;

    /**
     * Initializes the ValidationDelegate for registering controls to the global MessageManager.
     * @param host The parent host interface.
     */
    constructor(host: IHostValidation) {
        this.host = host;
    }

    /**
     * Registers a control and all its children with the global MessageManager.
     * (Deprecated: Native registration causes UI5 to aggressively clear custom schema validation messages 
     * on every keystroke. MetaUI handles valueState manually via plugins).
     */
    public registerObject(control: Control): void {
        // Do nothing to prevent UI5 from hijacking valueState and clearing our manual messages
    }

    /**
     * Unregisters a control from the global MessageManager.
     */
    public unregisterObject(control: Control): void {
        // Do nothing
    }

    public removeAllMessages(): void {
        const stateManager = this.host.getStateManager();
        if (stateManager && this.host.getProperty("useMessageManager")) {
            const messageManager = Messaging;
            const messages = messageManager.getMessageModel().getData();
            const messagesToRemove = messages.filter((m: sap.ui.core.message.Message) =>
                m.getMessageProcessor() && m.getMessageProcessor().getId() === stateManager.getModel().getId()
            );
            if (messagesToRemove && messagesToRemove.length > 0) {
                messageManager.removeMessages(messagesToRemove);
            }
        }
    }

    /**
     * Pushes a validation message to the console, and optionally to the MessageManager.
     */
    public pushMessage(path: string, text: string): void {
        const targetPath = path ? `/${path.replace(/^\//, "")}` : "";
        const displayText = path ? `Field '${path}': ${text}` : text;

        if (path) {
            Logger.warn(`[MetaUI Validation Error] ${displayText}`);
        } else {
            Logger.warn(`[MetaUI Validation Error] Global - ${text}`);
        }

        if (this.host.getProperty("useMessageManager") === true) {
            const messageManager = Messaging;
            const stateManager = this.host.getStateManager();
            messageManager.addMessages(new Message({
                message: displayText,
                type: coreLibrary.MessageType.Error,
                target: targetPath,
                processor: stateManager?.getModel()
            }));
        }
    }

    /**
     * Imperatively invalidates a field and highlights it with an error message.
     * Uses a specific 'CustomError' code to distinguish it from internal schema validations.
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

        Messaging.addMessages(new Message({
            message: message,
            type: coreLibrary.MessageType.Error,
            target: `/${fieldPath.replace(/^\//, "")}`,
            processor: stateManager.getModel(),
            code: "CustomError"
        }));
    }

    /**
     * Reverts a custom error state on a field, safely ignoring native schema validations.
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
        const messages = Messaging.getMessageModel().getData() as sap.ui.core.message.Message[];

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
}
