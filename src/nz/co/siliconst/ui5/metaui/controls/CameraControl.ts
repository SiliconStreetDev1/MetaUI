import BaseHardwareControl from "./BaseHardwareControl";
import Button from "sap/m/Button";
import VBox from "sap/m/VBox";
import HTML from "sap/ui/core/HTML";
import MessageToast from "sap/m/MessageToast";
import Image from "sap/m/Image";
import { Logger } from "../utils/Logger";

/**
 * CameraControl
 * Provides a live video feed to capture photos.
 */
export default class CameraControl extends BaseHardwareControl {
    static readonly renderer = "nz.co.siliconst.ui5.metaui.controls.BaseHardwareControlRenderer";
    static readonly metadata = {
        properties: {},
        events: {}
    };

    private startBtn!: Button;
    private vBox!: VBox;
    private captureBtn!: Button;
    private retakeBtn!: Button;
    private videoHtml!: HTML;
    private previewImage!: Image;
    
    private videoEl: HTMLVideoElement | null = null;
    private mediaStream: MediaStream | null = null;

    /**
     * Initializes the control and builds the internal camera UI.
     */
    public init(): void {
        super.init();

        this.videoHtml = new HTML({
            content: "<video width='400' height='300' autoplay playsinline style='background-color: #000; display: none;'></video>",
            afterRendering: this.onVideoRendered.bind(this)
        }).addStyleClass("sapUiSmallMarginBottom");

        this.previewImage = new Image({
            width: "400px",
            visible: false
        }).addStyleClass("sapUiSmallMarginBottom");

        this.startBtn = new Button({
            icon: "sap-icon://video",
            text: "Start Camera",
            press: this.handleStartCameraPress.bind(this)
        });

        this.captureBtn = new Button({
            icon: "sap-icon://camera",
            text: "Capture",
            visible: false,
            press: this.captureImage.bind(this)
        });

        this.retakeBtn = new Button({
            icon: "sap-icon://undo",
            text: "Retake",
            visible: false,
            press: this.retakeImage.bind(this)
        });

        this.vBox = new VBox({
            items: [this.videoHtml, this.previewImage, this.startBtn, this.captureBtn, this.retakeBtn]
        });

        this.setAggregation("_content", this.vBox);
    }

    private async onVideoRendered(): void {
        const domRef = this.videoHtml.getDomRef() as HTMLElement;
        if (!domRef) return;
        
        this.videoEl = domRef as HTMLVideoElement;
        
        const val = this.getValue();
        if (val && typeof val === "string" && val.startsWith("data:image")) {
            this.showPreview(val);
        } else if (this.captureBtn.getVisible() && this.videoHtml.getVisible()) {
            this.startCamera();
        }
    }

    private handleStartCameraPress(): void {
        this.startCamera();
        this.startBtn.setVisible(false);
        this.captureBtn.setVisible(true);
        if (this.videoEl) {
            this.videoEl.style.display = "block";
        }
    }

    private async startCamera(): Promise<void> {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            if (this.videoEl) {
                this.videoEl.srcObject = this.mediaStream;
            }
        } catch (err) {
            Logger.error("Camera access denied or unavailable", (err as Error).message, "CameraControl");
            MessageToast.show("Camera access denied or unavailable.");
        }
    }

    private stopCamera(): void {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
    }

    private captureImage(): void {
        if (!this.videoEl) return;
        
        const canvas = document.createElement("canvas");
        canvas.width = this.videoEl.videoWidth || 400;
        canvas.height = this.videoEl.videoHeight || 300;
        
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.drawImage(this.videoEl, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
            this.setValueAndFire(dataUrl);
            this.showPreview(dataUrl);
            MessageToast.show("Image captured successfully.");
        }
    }

    private retakeImage(): void {
        this.setValueAndFire(null);
        this.previewImage.setVisible(false);
        this.videoHtml.setVisible(true);
        this.captureBtn.setVisible(true);
        this.retakeBtn.setVisible(false);
        
        // startCamera is now handled safely by onVideoRendered hook
    }

    private showPreview(dataUrl: string): void {
        this.stopCamera();
        this.videoHtml.setVisible(false);
        this.previewImage.setSrc(dataUrl);
        this.previewImage.setVisible(true);
        this.captureBtn.setVisible(false);
        this.retakeBtn.setVisible(true);
    }

    /**
     * Sets the value of the control programmatically.
     * @param value The base64 data URL string representing the image.
     */
     public setValue(value: unknown): this {
        super.setValue(value);
        if (value && typeof value === "string" && value.startsWith("data:image")) {
            this.showPreview(value);
        } else if (!value) {
            // Only retake if we were showing a preview
            if (this.previewImage.getVisible()) {
                this.retakeImage();
            }
        }
        return this;
    }

    /**
     * Cleans up the hardware streams when the control is destroyed.
     */
    public exit(): void {
        this.stopCamera();
        super.exit();
    }
}
