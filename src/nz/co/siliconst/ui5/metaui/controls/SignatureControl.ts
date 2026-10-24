/**
 * @file SignatureControl.ts
 * @description Hardware control providing an HTML5 Canvas signature pad with mouse and touch drawing support.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
import BaseHardwareControl, { $BaseHardwareControlSettings } from "./BaseHardwareControl";
import BaseHardwareControlRenderer from "./BaseHardwareControlRenderer";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Button from "sap/m/Button";
import HTML from "sap/ui/core/HTML";
import { ButtonType } from "sap/m/library";
import { UrlValidator } from "../utils/UrlValidator";
import { I18n, TEXT_KEY } from "../utils/I18n";

/**
 * Custom UI5 control that renders an interactive HTML5 `<canvas>` for capturing handwritten signatures as Base64 PNGs.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 * @internal
 */
export default class SignatureControl extends BaseHardwareControl {
    static renderer = BaseHardwareControlRenderer;
    private isDrawing: boolean = false;
    private canvasElement: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private clearButton!: Button;

    constructor(idOrSettings?: string | $BaseHardwareControlSettings, settings?: $BaseHardwareControlSettings) {
        super(idOrSettings, settings);
    }

    /**
     * Initializes the internal VBox layout containing the signature `<canvas>` and the Clear button.
     */
    public init(): void {
        if (BaseHardwareControl.prototype.init) {
            BaseHardwareControl.prototype.init.call(this);
        }

        const controlId = this.getId();

        const canvasStyle =
            "border: 1px solid #89919a; border-radius: 4px; background: #ffffff; touch-action: none; display: block; max-width: 100%;";
        const htmlCanvas = new HTML({
            content:
                `<div class="sapUiTinyMarginBottom">` +
                `<canvas id="${controlId}-sig-canvas" width="400" height="150" style="${canvasStyle}"></canvas>` +
                `</div>`,
            afterRendering: () => {
                this.setupCanvasEvents();
            }
        });

        this.clearButton = new Button({
            text: I18n.getText(TEXT_KEY.signatureClear),
            icon: "sap-icon://eraser",
            type: ButtonType.Transparent,
            press: () => {
                this.clearCanvas();
            }
        });

        const toolbar = new HBox({
            items: [this.clearButton]
        });

        const layout = new VBox({
            items: [htmlCanvas, toolbar]
        });

        this.setAggregation("_content", layout);
    }

    /**
     * Updates the Clear button's `enabled` state and detaches stale canvas listeners before rendering.
     */
    public onBeforeRendering(): void {
        this.cleanupCanvasEvents();
        this.syncHardwareState();
    }

    /**
     * Synchronizes the Clear button's `enabled` state with the current `readOnly` property.
     */
    protected override syncHardwareState(): void {
        if (this.clearButton) {
            this.clearButton.setEnabled(!this.getProperty("readOnly"));
        }
    }

    /**
     * Detaches DOM mouse and touch event handlers from the signature `<canvas>` element.
     */
    private cleanupCanvasEvents(): void {
        if (this.canvasElement) {
            this.canvasElement.onmousedown = null;
            this.canvasElement.onmousemove = null;
            this.canvasElement.onmouseup = null;
            this.canvasElement.onmouseleave = null;
            this.canvasElement.ontouchstart = null;
            this.canvasElement.ontouchmove = null;
            this.canvasElement.ontouchend = null;
            this.canvasElement = null;
        }
        this.ctx = null;
        this.isDrawing = false;
    }

    /**
     * Cleans up canvas DOM listeners and references when the control is destroyed.
     */
    public exit(): void {
        this.cleanupCanvasEvents();
    }

    /**
     * Attaches mouse and touch drawing listeners to the `<canvas>` element after rendering,
     * and restores any existing Base64 image onto the canvas.
     */
    private setupCanvasEvents(): void {
        const controlId = this.getId();
        this.canvasElement = document.getElementById(`${controlId}-sig-canvas`) as HTMLCanvasElement | null;
        if (!this.canvasElement) {
            return;
        }

        this.ctx = this.canvasElement.getContext("2d");
        if (this.ctx) {
            this.ctx.strokeStyle = "#000000";
            this.ctx.lineWidth = 2;
            this.ctx.lineCap = "round";
        }

        const existingVal = this.getProperty("value") as string | null;
        if (existingVal && UrlValidator.isSafeImageSource(existingVal) && this.ctx && this.canvasElement) {
            const img = new window.Image();
            img.onload = () => {
                if (!this.isDestroyed() && this.ctx && this.canvasElement) {
                    this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
                    this.ctx.drawImage(img, 0, 0);
                }
            };
            img.src = existingVal;
        }

        const getCoords = (e: MouseEvent | TouchEvent): { x: number; y: number } => {
            if (!this.canvasElement) {
                return { x: 0, y: 0 };
            }
            const rect = this.canvasElement.getBoundingClientRect();
            if ("touches" in e && e.touches.length > 0) {
                return {
                    x: e.touches[0].clientX - rect.left,
                    y: e.touches[0].clientY - rect.top
                };
            }
            const mouseEvt = e as MouseEvent;
            return {
                x: mouseEvt.clientX - rect.left,
                y: mouseEvt.clientY - rect.top
            };
        };

        const startDraw = (e: MouseEvent | TouchEvent): void => {
            if (this.getProperty("readOnly") || !this.ctx) {
                return;
            }
            this.isDrawing = true;
            const pos = getCoords(e);
            this.ctx.beginPath();
            this.ctx.moveTo(pos.x, pos.y);
        };

        const moveDraw = (e: MouseEvent | TouchEvent): void => {
            if (!this.isDrawing || this.getProperty("readOnly") || !this.ctx) {
                return;
            }
            if ("touches" in e) {
                e.preventDefault();
            }
            const pos = getCoords(e);
            this.ctx.lineTo(pos.x, pos.y);
            this.ctx.stroke();
        };

        const endDraw = (): void => {
            if (!this.isDrawing) {
                return;
            }
            this.isDrawing = false;
            if (this.canvasElement) {
                const dataUrl = this.canvasElement.toDataURL("image/png");
                this.setProperty("value", dataUrl, true);
                this.fireEvent("capture", { value: dataUrl });
            }
        };

        this.canvasElement.onmousedown = startDraw;
        this.canvasElement.onmousemove = moveDraw;
        this.canvasElement.onmouseup = endDraw;
        this.canvasElement.onmouseleave = endDraw;

        this.canvasElement.ontouchstart = startDraw;
        this.canvasElement.ontouchmove = moveDraw;
        this.canvasElement.ontouchend = endDraw;
    }

    /**
     * Updates the `value` property and redraws or clears the `<canvas>` if currently mounted.
     *
     * @param sValue The Base64 PNG signature data URL or `null`.
     * @returns {this} This control instance for chaining.
     */
    public setValue(sValue: string | null): this {
        this.setProperty("value", sValue, true);
        if (this.ctx && this.canvasElement) {
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            if (sValue && UrlValidator.isSafeImageSource(sValue)) {
                const img = new window.Image();
                img.onload = () => {
                    if (!this.isDestroyed() && this.ctx && this.canvasElement) {
                        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
                        this.ctx.drawImage(img, 0, 0);
                    }
                };
                img.src = sValue;
            }
        }
        return this;
    }

    /**
     * Clears the signature canvas and resets `value` to `null`.
     */
    private clearCanvas(): void {
        if (this.getProperty("readOnly")) {
            return;
        }
        if (this.ctx && this.canvasElement) {
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        }
        this.setProperty("value", null, true);
        this.fireEvent("capture", { value: null });
    }
}
