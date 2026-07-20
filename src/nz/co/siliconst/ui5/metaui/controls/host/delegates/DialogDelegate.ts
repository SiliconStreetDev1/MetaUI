import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import { Logger } from "../../../utils/Logger";

export interface IHostDialog {
    generate(): void;
    triggerSubmit(): boolean;
    fireEvent(eventName: string, parameters?: any): void;
}

/**
 * Extracts all popup and dialog generation logic from the Host control.
 */
export class DialogDelegate {
    private host: IHostDialog & Control;

    constructor(host: IHostDialog & Control) {
        this.host = host;
    }

    /**
     * Dialog Modality: Opens the generated layout inside a sap.m.Dialog.
     * Automatically wires up customizable submit (default: 'OK') and 'Cancel' buttons.
     */
    public openInDialog(title: string = "Form", submitButtonText: string = "OK", isGenerated: boolean): void {
        if (!isGenerated) {
            this.host.generate();
        }

        const dialog = new Dialog({
            title: title,
            contentWidth: "800px",
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
                text: "Cancel",
                press: () => {
                    this.host.fireEvent("cancel");
                    dialog.close();
                }
            }),
            afterClose: () => {
                dialog.destroy();
            }
        });

        dialog.open();
    }
}
