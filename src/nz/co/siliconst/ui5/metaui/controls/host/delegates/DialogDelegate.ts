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
    public openInDialog(title: string = "Form", submitButtonText: string = "OK", isGenerated: boolean, cancelButtonText: string = "Cancel", dialogWidth: string = "800px", parentView?: Control): void {
        // UI5 PURITY: Do not manually force generate() here.
        // Opening the dialog mounts the host, natively firing onBeforeRendering() which triggers generation cleanly.

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
                dialog.destroy();
            }
        });

        if (parentView && typeof parentView.addDependent === "function") {
            parentView.addDependent(dialog);
        }

        dialog.open();
    }
}
