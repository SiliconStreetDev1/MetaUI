import BaseHardwareControl from "./BaseHardwareControl";
import Button from "sap/m/Button";
import VBox from "sap/m/VBox";
import HTML from "sap/ui/core/HTML";
import MessageToast from "sap/m/MessageToast";

/**
 * SignatureControl
 * Provides an HTML5 Canvas for capturing signatures.
 */
export default class SignatureControl extends BaseHardwareControl {
    static readonly renderer = "nz.co.siliconst.ui5.metaui.controls.BaseHardwareControlRenderer";
    static readonly metadata = {
        properties: {},
        events: {}
    };

    private vBox!: VBox;
    private clearBtn!: Button;
    private canvasHtml!: HTML;
    private isDrawing = false;
    private canvasCtx: CanvasRenderingContext2D | null = null;
    private canvasEl: HTMLCanvasElement | null = null;

    public init(): void {
        super.init();

        this.canvasHtml = new HTML({
            content: "<canvas width='400' height='200' style='border: 1px solid #ccc; background-color: #fff; touch-action: none; cursor: crosshair;'></canvas>",
            afterRendering: this.onCanvasRendered.bind(this)
        }).addStyleClass("sapUiSmallMarginBottom");

        this.clearBtn = new Button({
            icon: "sap-icon://sys-cancel",
            text: "Clear Signature",
            press: this.clearSignature.bind(this)
        });

        this.vBox = new VBox({
            items: [this.canvasHtml, this.clearBtn]
        });

        this.setAggregation("_content", this.vBox);
    }

    private onCanvasRendered(): void {
        const domRef = this.canvasHtml.getDomRef() as HTMLElement;
        if (!domRef) return;
        
        this.canvasEl = domRef as HTMLCanvasElement;
        this.canvasCtx = this.canvasEl.getContext("2d");
        if (this.canvasCtx) {
            this.canvasCtx.lineWidth = 2;
            this.canvasCtx.lineCap = "round";
            this.canvasCtx.strokeStyle = "#000";
        }

        // Mouse events
        this.canvasEl.addEventListener("mousedown", this.startDrawing.bind(this));
        this.canvasEl.addEventListener("mousemove", this.draw.bind(this));
        this.canvasEl.addEventListener("mouseup", this.stopDrawing.bind(this));
        this.canvasEl.addEventListener("mouseout", this.stopDrawing.bind(this));
        
        // Touch events
        this.canvasEl.addEventListener("touchstart", this.startDrawingTouch.bind(this), { passive: false });
        this.canvasEl.addEventListener("touchmove", this.drawTouch.bind(this), { passive: false });
        this.canvasEl.addEventListener("touchend", this.stopDrawing.bind(this));

        // Restore existing signature if any
        const val = this.getValue();
        if (val && typeof val === "string" && val.startsWith("data:image")) {
            this.loadImageOntoCanvas(val);
        }
    }

    private loadImageOntoCanvas(dataUrl: string): void {
        const img = new window.Image();
        img.onload = () => {
            if (this.canvasCtx && this.canvasEl) {
                this.canvasCtx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
                this.canvasCtx.drawImage(img, 0, 0, this.canvasEl.width, this.canvasEl.height);
            }
        };
        img.src = dataUrl;
    }

    private getCoordinates(e: MouseEvent | TouchEvent): { x: number, y: number } {
        if (!this.canvasEl) return { x: 0, y: 0 };
        const rect = this.canvasEl.getBoundingClientRect();
        
        let clientX, clientY;
        if (e.type.startsWith("touch")) {
            clientX = (e as TouchEvent).touches[0].clientX;
            clientY = (e as TouchEvent).touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }
        
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    private startDrawing(e: MouseEvent): void {
        this.isDrawing = true;
        this.draw(e);
    }

    private startDrawingTouch(e: TouchEvent): void {
        e.preventDefault(); // Prevent scrolling
        this.isDrawing = true;
        this.drawTouch(e);
    }

    private draw(e: MouseEvent): void {
        if (!this.isDrawing || !this.canvasCtx) return;
        const pos = this.getCoordinates(e);
        this.canvasCtx.lineTo(pos.x, pos.y);
        this.canvasCtx.stroke();
        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(pos.x, pos.y);
    }

    private drawTouch(e: TouchEvent): void {
        if (!this.isDrawing || !this.canvasCtx) return;
        e.preventDefault(); // Prevent scrolling
        const pos = this.getCoordinates(e);
        this.canvasCtx.lineTo(pos.x, pos.y);
        this.canvasCtx.stroke();
        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(pos.x, pos.y);
    }

    private stopDrawing(): void {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        if (this.canvasCtx) {
            this.canvasCtx.beginPath(); // Reset path
            this.saveSignature();
        }
    }

    private clearSignature(): void {
        if (this.canvasCtx && this.canvasEl) {
            this.canvasCtx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
        }
        this.setValueAndFire(null);
        MessageToast.show("Signature cleared.");
    }

    private saveSignature(): void {
        if (this.canvasEl) {
            const dataUrl = this.canvasEl.toDataURL("image/png");
            this.setValueAndFire(dataUrl);
        }
    }

    public setValue(value: any): this {
        super.setValue(value);
        if (value && typeof value === "string" && value.startsWith("data:image")) {
            this.loadImageOntoCanvas(value);
        } else if (!value && this.canvasCtx && this.canvasEl) {
            this.canvasCtx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
        }
        return this;
    }
}
