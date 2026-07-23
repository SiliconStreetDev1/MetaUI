import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import BusyDialog from "sap/m/BusyDialog";
import { Logger } from "../../../utils/Logger";

export interface IHostDialog {
    generate(): Promise<void> | void;
    triggerSubmit(): boolean;
    fireEvent(eventName: string, parameters?: Record<string, unknown>): this;
}

/**
 * Extracts all popup and dialog generation logic from the Host control.
 */
export class DialogDelegate {
    private host: IHostDialog & Control;
    private activeDialog: Dialog | null = null;
    private requestedWidth: string = "auto";
    private calculatedOptimalWidth: string = "auto";

    /**
     * Initializes a new DialogDelegate to handle dialog-based rendering.
     * @param host The parent DynamicHost or GeneratorHost control.
     */
    constructor(host: IHostDialog & Control) {
        this.host = host;
    }

    /**
     * Dialog Modality: Opens the generated layout inside a sap.m.Dialog.
     * Automatically wires up customizable submit (default: 'OK') and 'Cancel' buttons.
     */
    public async openInDialog(title: string = "Form", submitButtonText: string = "OK", isGenerated: boolean, cancelButtonText: string = "Cancel", dialogWidth: string = "auto", parentView?: Control): Promise<void> {
        this.requestedWidth = dialogWidth;
        this.calculatedOptimalWidth = dialogWidth; // Default fallback

        // Mask the complex asynchronous rendering to prevent visual snapping
        const busyDialog = new BusyDialog({ text: "Building Form..." });
        busyDialog.open();

        try {
            // Force manual generation BEFORE mounting the dialog so the optimal width is perfectly calculated first
            const genResult = this.host.generate();
            if (genResult instanceof Promise) {
                await genResult;
            }
        } catch (err) {
            busyDialog.close();
            Logger.error("[MetaUI] Catastrophic error during pre-generation of dialog content", (err as Error).message, "DialogDelegate");
            return;
        }

        busyDialog.close();

        // The Engine heuristically updated `calculatedOptimalWidth` during `generate()`. Apply it on frame 1.
        const finalWidth = this.requestedWidth === "auto" && this.calculatedOptimalWidth !== "auto" ? this.calculatedOptimalWidth : this.requestedWidth;

        const dialog = new Dialog({
            title: title,
            contentWidth: finalWidth,
            content: [this.host], // Mount host inside the dialog
            beginButton: new Button({
                text: submitButtonText,
                type: "Emphasized",
                press: () => {
                    try {
                        const success = this.host.triggerSubmit();
                        if (success) {
                            dialog.close();
                        }
                    } catch (err) {
                        Logger.error("[MetaUI] Catastrophic error during validation/submit pipeline", (err as Error).message, "DialogDelegate");
                        this.host.fireEvent("validationError", { fieldPath: "root", message: (err as Error).message });
                    }
                }
            }),
            endButton: new Button({
                text: cancelButtonText,
                press: () => {
                    this.host.fireEvent("cancel");
                    dialog.close();
                }
            }),
            afterClose: () => {
                this.activeDialog = null;
                dialog.destroy();
            }
        });

        this.activeDialog = dialog;

        if (parentView && typeof parentView.addDependent === "function") {
            parentView.addDependent(dialog);
        }

        dialog.open();
    }

    /**
     * Allows the Engine to retroactively expand the dialog once the schema is fully parsed.
     */
    public updateDialogWidthDynamically(optimalWidth: string): void {
        this.calculatedOptimalWidth = optimalWidth;
        // Only dynamically stretch if the dialog is ALREADY open (e.g., hybrid inference late-loading)
        if (this.activeDialog && this.requestedWidth === "auto" && optimalWidth !== "auto") {
            this.activeDialog.setContentWidth(optimalWidth);
        }
    }
}
