/**
 * @file PayloadDelegate.ts
 * @description Owns the host's `showPayload` affordance: a transparent icon button over the host's top-right
 * corner that opens the live payload as JSON in a read-only dialog.
 */

import Button from "sap/m/Button";
import ToggleButton from "sap/m/ToggleButton";
import MessageToast from "sap/m/MessageToast";
import { ButtonType } from "sap/m/library";
import Event from "sap/ui/base/Event";
import { Logger } from "../../../utils/Logger";
import { I18n, TEXT_KEY } from "../../../utils/I18n";
import type GeneratorHost from "../GeneratorHost";
import type { ISchema } from "../../../interfaces/ISchema";

/**
 * SAP icon shown on the affordance, in the corner and beside a collapsed form's button.
 *
 * `syntax` renders braces, which is what JSON looks like. `source-code` was tried first and reads
 * as two stray chevrons at this size rather than as anything clickable.
 */
const PAYLOAD_ICON = "sap-icon://syntax";

/**
 * The viewer is an ordinary MetaUI form: one read-only `codeEditor` field and no label. Rendering it through the
 * engine is what keeps `sap.ui.codeeditor` lazy — the plugin, and with it the library, loads only when a viewer
 * is first opened.
 */
const VIEWER_SCHEMA: ISchema = {
    type: "object",
    ui: { labelSpan: 0 },
    properties: {
        json: { type: "string", ui: { widget: "codeEditor", args: "json", rows: 20 } }
    }
};

/**
 * Shows the host's live payload on demand. One instance per `GeneratorHost`.
 *
 * Whether the affordance is shown is the host's own `showPayload` when that has been set or bound, and otherwise
 * the library-wide default set through `DynamicHost.setShowPayloadDefault`. Turning it on adds a pressable 16px
 * icon in the host's top-right corner, rendered outside the content flow so it costs the form no width or
 * height, and never re-generates the form. When `SpaceDelegate` has collapsed the form to a button, the icon
 * gives way to a second button beside that one.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls.host.delegates
 * @internal
 */
export class PayloadDelegate {
    private static showByDefault = false;
    private static readonly liveDelegates = new Set<PayloadDelegate>();

    private icon: Button | null = null;

    constructor(private readonly host: GeneratorHost) {
        PayloadDelegate.liveDelegates.add(this);
    }

    /**
     * Sets whether hosts that do not set `showPayload` themselves show the payload affordance, and applies it to
     * every host already rendered.
     *
     * @param show True to show it by default.
     */
    public static setShowByDefault(show: boolean): void {
        this.showByDefault = show;
        for (const delegate of this.liveDelegates) {
            delegate.host.refreshPayloadAffordances();
        }
    }

    /**
     * Returns the library-wide default for hosts that do not set `showPayload` themselves.
     *
     * @returns {boolean} The current default.
     */
    public static getShowByDefault(): boolean {
        return this.showByDefault;
    }

    /**
     * Reports whether this host shows the payload affordance: its own `showPayload` once set or bound, and the
     * library-wide default until then.
     *
     * @returns {boolean} True when the affordance is shown.
     */
    public isActive(): boolean {
        return this.host.isPropertyInitial("showPayload")
            ? PayloadDelegate.showByDefault
            : this.host.getProperty("showPayload") === true;
    }

    /**
     * Shows or hides the corner icon. The icon is created the first time it is needed; until then the host
     * carries nothing for this feature. Only the icon is touched, never the generated content.
     */
    public sync(): void {
        const show = this.isActive() && !this.host.isSpaceCollapsed();
        if (show && !this.icon) {
            // A Button, not a bare Icon: an icon with a press handler has no focus ring, no hover or
            // pressed state and no button semantics for a screen reader, so it reads as stray glyph
            // rather than something to click. Transparent keeps it visually quiet over the form.
            this.icon = this.createPayloadButton();
            this.host.setAggregation("_payload", this.icon);
        }
        if (this.icon && this.icon.getVisible() !== show) {
            this.icon.setVisible(show);
        }
    }

    /**
     * Builds the affordance. One shape for both placements — the host's corner and beside a collapsed
     * form's own button — so the two never drift apart in look or behaviour.
     *
     * @returns {Button} The transparent icon button that opens the viewer.
     */
    private createPayloadButton(): Button {
        // The button carries no text, so its tooltip is also its accessible name: sap.m.Button
        // renders the tooltip as the aria-label of an icon-only button.
        return new Button({
            icon: PAYLOAD_ICON,
            type: ButtonType.Transparent,
            tooltip: I18n.getText(TEXT_KEY.payloadShow),
            press: () => this.open()
        });
    }

    /**
     * Builds the affordance that stands beside a collapsed form's own button.
     *
     * @returns {Button} The button.
     */
    public createCollapsedButton(): Button {
        return this.createPayloadButton();
    }

    /**
     * Opens the payload as it is now — `StateManager.extractPayload()` read at the moment of the press, so an
     * edit made since render is included — in a read-only dialog through the host's own `openInDialog` path.
     * The footer adds a Formatted / Raw toggle and Copy beside Close.
     */
    public open(): void {
        const stateManager = this.host.getStateManager();
        if (!stateManager) {
            Logger.warn(
                `Host '${this.host.getId()}' has no generated form yet, so there is no payload to show.`,
                undefined,
                "PayloadDelegate"
            );
            MessageToast.show(I18n.getText(TEXT_KEY.payloadUnavailable));
            return;
        }
        const payload: unknown = stateManager.extractPayload() ?? null;
        const formatted = JSON.stringify(payload, null, 2);
        const raw = JSON.stringify(payload);
        // Loaded at press time rather than imported: GeneratorHost owns this delegate, so a static import would be
        // circular. The module's only runtime export is the class, which is what the loader hands back.
        sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/host/GeneratorHost"], (HostClass: typeof GeneratorHost) => {
            const viewer = new HostClass({
                schemaDefinition: VIEWER_SCHEMA,
                data: { json: formatted },
                editable: false,
                showPayload: false
            });
            const rawToggle = new ToggleButton({
                text: I18n.getText(TEXT_KEY.payloadRaw),
                press: (oEvent: Event) => {
                    const pressed = (oEvent.getSource() as ToggleButton).getPressed();
                    viewer.getStateManager()?.getModel().setProperty("/json", pressed ? raw : formatted);
                }
            });
            const copy = new Button({
                text: I18n.getText(TEXT_KEY.payloadCopy),
                press: () => this.copy(rawToggle.getPressed() ? raw : formatted)
            });
            void viewer
                .openInDialog(I18n.getText(TEXT_KEY.payloadTitle), I18n.getText(TEXT_KEY.editorClose), undefined, "40rem", undefined, [
                    rawToggle,
                    copy
                ])
                .finally(() => {
                    if (!viewer.isDestroyed()) {
                        viewer.destroy();
                    }
                });
        });
    }

    /** Stops tracking this host for the library-wide default. The icon is destroyed with the host. */
    public destroy(): void {
        PayloadDelegate.liveDelegates.delete(this);
        this.icon = null;
    }

    /**
     * Writes the text to the clipboard and says whether it worked. The Clipboard API exists only in a secure
     * context, so its absence is reported rather than assumed away.
     *
     * @param text The JSON as currently shown.
     */
    private copy(text: string): void {
        const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
        if (!clipboard || typeof clipboard.writeText !== "function") {
            this.reportCopyFailure("the Clipboard API is not available (it requires a secure context)");
            return;
        }
        clipboard.writeText(text).then(
            () => MessageToast.show(I18n.getText(TEXT_KEY.payloadCopied)),
            (err: unknown) => this.reportCopyFailure(err instanceof Error ? err.message : String(err))
        );
    }

    /**
     * Reports a failed copy to the user and the log.
     *
     * @param reason Why the copy failed.
     */
    private reportCopyFailure(reason: string): void {
        Logger.warn(`Copying the payload of host '${this.host.getId()}' failed: ${reason}.`, undefined, "PayloadDelegate");
        MessageToast.show(I18n.getText(TEXT_KEY.payloadCopyFailed));
    }
}
