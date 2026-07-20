import MessagePage from "sap/m/MessagePage";
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
     */
    public registerObject(control: Control): void {
        if (this.host.getProperty("useMessageManager")) {
            Messaging.registerObject(control, true); // true = recurse all children
        }
    }

    /**
     * Unregisters a control from the global MessageManager.
     */
    public unregisterObject(control: Control): void {
        if (this.host.getProperty("useMessageManager")) {
            Messaging.unregisterObject(control);
        }
    }

    /**
     * Clears all messages from the global MessageManager.
     */
    public removeAllMessages(): void {
        if (this.host.getProperty("useMessageManager")) {
            Messaging.removeAllMessages();
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

        if (this.host.getProperty("useMessageManager")) {
            sap.ui.require(["sap/ui/core/message/Message"], (MessageClass: typeof import("sap/ui/core/message/Message").default) => {
                const messageManager = Messaging;
                const stateManager = this.host.getStateManager();
                messageManager.addMessages(new MessageClass({
                    message: displayText,
                    type: coreLibrary.MessageType.Error,
                    target: targetPath,
                    processor: stateManager?.getModel()
                }));
            });
        }
    }

    /**
     * Imperatively invalidates a field and highlights it with an error message.
     */
    public addCustomError(fieldPath: string, message: string): void {
        const useMessageManager = this.host.getProperty("useMessageManager") as boolean;
        const stateManager = this.host.getStateManager();
        if (useMessageManager && stateManager) {
            sap.ui.require(["sap/ui/core/message/Message"], (MessageClass: typeof import("sap/ui/core/message/Message").default) => {
                const messageManager = Messaging;
                messageManager.addMessages(new MessageClass({
                    message: message,
                    type: coreLibrary.MessageType.Error,
                    target: `/${fieldPath.replace(/^\//, "")}`,
                    processor: stateManager.getModel()
                }));
            });
        }
    }

    /**
     * Reverts a custom error state on a field.
     */
    public clearCustomError(fieldPath: string): void {
        const useMessageManager = this.host.getProperty("useMessageManager") as boolean;
        const stateManager = this.host.getStateManager();
        if (useMessageManager && stateManager) {
            const messageManager = Messaging;
            const messages = messageManager.getMessageModel().getData();
            const target = `/${fieldPath.replace(/^\//, "")}`;

            const messageToRemove = messages.find((m: sap.ui.core.message.Message) =>
                m.getTarget() === target && m.getMessageProcessor() && m.getMessageProcessor().getId() === stateManager.getModel().getId()
            );
            if (messageToRemove) {
                messageManager.removeMessages(messageToRemove);
            }
        }
    }

    /**
     * Triggers a visual Error Page (Crash Boundary) when generation catastrophically fails.
     */
    public mountCrashBoundary(error: Error): void {
        Logger.error("[MetaUI] Engine failed to generate layout. Preventing Launchpad crash.", error.message, "ValidationDelegate");

        const errorPage = new MessagePage({
            text: "UI Generation Failed",
            description: "The dynamic schema could not be rendered. Please check the Fiori console for diagnostic logs.",
            icon: "sap-icon://error"
        });

        this.host.setAggregation("_content", errorPage);
    }
}
