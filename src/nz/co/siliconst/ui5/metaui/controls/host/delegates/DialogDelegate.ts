import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import { Logger } from "../../../utils/Logger";

export interface IHostDialog {
    generate(): void;
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
    public openInDialog(title: string = "Form", submitButtonText: string = "OK", isGenerated: boolean, cancelButtonText: string = "Cancel", dialogWidth: string = "auto", parentView?: Control): void {
        // UI5 PURITY: Do not manually force generate() here.
        // Opening the dialog mounts the host, natively firing onBeforeRendering() which triggers generation cleanly.

        this.requestedWidth = dialogWidth;
        const dialog = new Dialog({
            title: title,
            contentWidth: dialogWidth,
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
        if (this.activeDialog && this.requestedWidth === "auto" && optimalWidth !== "auto") {
            this.activeDialog.setContentWidth(optimalWidth);
        }
    }
}
