/**
 * @file SpaceDelegate.ts
 * @description Watches the width a host is given and, when it is below what any form layout can use,
 * says so instead of rendering a mangled form: a button that opens the form in a dialog, or a banner where
 * the host is already inside one.
 */

import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import MessageStrip from "sap/m/MessageStrip";
import { MessageType } from "sap/ui/core/library";
import ResizeHandler from "sap/ui/core/ResizeHandler";
import HBox from "sap/m/HBox";
import { Logger } from "../../../utils/Logger";
import { I18n, TEXT_KEY } from "../../../utils/I18n";
import { GenerationDelegate } from "./GenerationDelegate";
import type GeneratorHost from "../GeneratorHost";

/**
 * Owns the one measurement of available space in the host layer. Layouts and plugins never measure: the
 * host's own width is read here, on render and on resize, and the decision is made here.
 *
 * Below {@link SpaceDelegate.MIN_USABLE_WIDTH} the generated content is hidden and a button that opens the
 * same form through `openInDialog` is shown in its place, so a narrow table cell stays one line tall and the
 * user still gets a usable form. A host that is already inside a dialog cannot usefully open another, so there
 * the form stays and a banner explains why it looks cramped. Either way a warning names the host and the
 * width it was given.
 *
 * The button or banner lives in the host's own `_space` aggregation, rendered ahead of `_content`, so the
 * generated content keeps its place in the host and nothing about its structure changes.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls.host.delegates
 * @internal
 */
export class SpaceDelegate {
    /**
     * Narrowest host width, in CSS pixels, at which a form is rendered. Measured on a five-field form
     * (text, date, select, integer, check box) with labels stacked: every value is legible down to 160px,
     * and at 148px the date value is already clipped. 180px keeps one measured step of headroom.
     */
    public static readonly MIN_USABLE_WIDTH = 180;

    /**
     * Width a collapsed host must regain before the form comes back. The gap above
     * {@link SpaceDelegate.MIN_USABLE_WIDTH} stops a container hovering at the threshold, or a scroll bar
     * appearing and disappearing, from swapping the content on every resize.
     */
    public static readonly RESTORE_WIDTH = 196;

    /** Resize events are settled for this long before the width is re-read. */
    private static readonly DEBOUNCE_MS = 200;

    private tooNarrow = false;
    private resizeListenerId: string | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private content: Control | null = null;
    private collapseButton: Button | null = null;
    private collapseNotice: HBox | null = null;
    private payloadButton: Button | null = null;
    private banner: MessageStrip | null = null;

    constructor(private readonly host: GeneratorHost) {}

    /**
     * Takes charge of freshly generated content. The last decision is applied straight away, so regenerating
     * a host that is still too narrow does not flash the full form first; the host re-checks it against the
     * real width as soon as it renders. The button and banner are rebuilt only when needed, so a host that
     * fits — every row host in a table, typically — carries no extra controls.
     *
     * @param content The generated content, status banners included, as placed in `_content`.
     */
    public attach(content: Control): void {
        this.content = content;
        this.releaseNotices();
        this.applyDecision();
        this.observe();
    }

    /**
     * Re-reads the host's width; the decision changes only when the width crosses a threshold. It is re-applied
     * on every call regardless, because moving the host into or out of a dialog changes how a too-narrow host
     * is presented without changing which side of the threshold it is on. A width of zero means the host is
     * hidden or detached, which says nothing about the space it will get, so it is ignored.
     */
    public measure(): void {
        const width = this.host.getDomRef()?.getBoundingClientRect().width ?? 0;
        if (width <= 0 || !this.content) {
            return;
        }
        const next = this.tooNarrow ? width < SpaceDelegate.RESTORE_WIDTH : width < SpaceDelegate.MIN_USABLE_WIDTH;
        const crossed = next !== this.tooNarrow;
        this.tooNarrow = next;
        this.applyDecision();
        if (crossed && next) {
            const outcome = this.isCollapsed()
                ? "collapsed it to a button that opens the form in a dialog"
                : "it is inside a dialog, so the form is shown under a warning banner";
            Logger.warn(
                `Host '${this.host.getId()}' was given ${Math.round(width)}px, below the ` +
                    `${SpaceDelegate.MIN_USABLE_WIDTH}px a form needs; ${outcome}.`,
                undefined,
                "SpaceDelegate"
            );
        }
    }

    /** Re-applies the current decision, for when something it shows changed — the payload affordance. */
    public refresh(): void {
        if (this.content) {
            this.applyDecision();
        }
    }

    /**
     * Reports whether the host shows its form collapsed to a button.
     *
     * @returns {boolean} True when the host is too narrow and not inside a dialog.
     */
    public isCollapsed(): boolean {
        return this.tooNarrow && !this.isInsideDialog();
    }

    /** Stops observing the host and destroys the controls it created. */
    public destroy(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.resizeListenerId) {
            ResizeHandler.deregister(this.resizeListenerId);
            this.resizeListenerId = null;
        }
        this.releaseNotices();
        this.content = null;
    }

    /** Registers the debounced resize observer once per host. */
    private observe(): void {
        if (this.resizeListenerId) {
            return;
        }
        this.resizeListenerId = ResizeHandler.register(this.host, () => {
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            this.debounceTimer = setTimeout(() => {
                this.debounceTimer = null;
                this.measure();
            }, SpaceDelegate.DEBOUNCE_MS);
        }) || null;
    }

    /** Shows the button, the banner or neither in `_space`, and hides the content only when collapsed. */
    private applyDecision(): void {
        const collapse = this.isCollapsed();
        const warn = this.tooNarrow && !collapse;
        if (collapse && !this.collapseNotice) {
            this.collapseButton = this.createCollapseButton();
            this.payloadButton = this.host.createCollapsedPayloadButton();
            this.collapseNotice = new HBox({ items: [this.collapseButton, this.payloadButton] });
        }
        const payloadShown = collapse && this.host.isPayloadViewerActive();
        if (this.payloadButton && this.payloadButton.getVisible() !== payloadShown) {
            this.payloadButton.setVisible(payloadShown);
        }
        if (warn && !this.banner) {
            this.banner = GenerationDelegate.createStatusStrip(
                I18n.getText(TEXT_KEY.spaceTooNarrow),
                MessageType.Warning,
                "sapUiTinyMarginBottom"
            );
        }
        const notice = collapse ? this.collapseNotice : warn ? this.banner : null;
        const shown = this.host.getAggregation("_space") as Control | null;
        if (notice && shown !== notice) {
            this.host.setAggregation("_space", notice);
        } else if (!notice && shown && shown.getVisible()) {
            shown.setVisible(false);
        }
        if (notice && !notice.getVisible()) {
            notice.setVisible(true);
        }
        if (this.content && this.content.getVisible() === collapse) {
            this.content.setVisible(!collapse);
        }
        this.host.syncPayloadIcon();
    }

    /**
     * Builds the one-line stand-in for a collapsed form: `Edit <title>` on an editable host, `View <title>`
     * on a read-only one, opening the same form through the host's own `openInDialog`.
     *
     * @returns {Button} The collapse button.
     */
    private createCollapseButton(): Button {
        const label = this.host.getParsedSchema()?.title || I18n.getText(TEXT_KEY.dialogDefaultTitle);
        const editable = this.host.getProperty("editable") !== false;
        return new Button({
            text: I18n.getText(editable ? TEXT_KEY.nestedEdit : TEXT_KEY.nestedView, [label]),
            icon: "sap-icon://form",
            press: () => {
                void this.host.openInDialog(label, I18n.getText(editable ? TEXT_KEY.dialogSubmit : TEXT_KEY.editorClose));
            }
        });
    }

    /** Takes the button and banner out of the host and destroys them, so the next decision builds fresh ones. */
    private releaseNotices(): void {
        if (!this.host.isDestroyed() && this.host.getAggregation("_space")) {
            this.host.destroyAggregation("_space", true);
        }
        for (const notice of [this.collapseNotice, this.banner]) {
            if (notice && !notice.isDestroyed()) {
                notice.destroy();
            }
        }
        this.collapseNotice = null;
        this.collapseButton = null;
        this.payloadButton = null;
        this.banner = null;
    }

    /**
     * Reports whether the host is rendered inside a dialog, where collapsing to a button that opens yet another
     * dialog would help nobody.
     *
     * @returns {boolean} True when a `sap.m.Dialog` is an ancestor of the host.
     */
    private isInsideDialog(): boolean {
        let parent = this.host.getParent();
        while (parent) {
            if (typeof parent.isA === "function" && parent.isA("sap.m.Dialog")) {
                return true;
            }
            parent = parent.getParent();
        }
        return false;
    }
}
