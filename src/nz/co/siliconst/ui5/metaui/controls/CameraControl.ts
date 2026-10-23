/**
 * @file CameraControl.ts
 * @description Hardware control for capturing snapshots from the device camera via WebRTC (navigator.mediaDevices.getUserMedia).
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
import BaseHardwareControl, { $BaseHardwareControlSettings } from "./BaseHardwareControl";
import BaseHardwareControlRenderer from "./BaseHardwareControlRenderer";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Button from "sap/m/Button";
import Image from "sap/m/Image";
import HTML from "sap/ui/core/HTML";
import { ButtonType } from "sap/m/library";
import { UrlValidator } from "../utils/UrlValidator";

/**
 * Custom UI5 control that streams video from the user's camera and captures Base64 PNG snapshots.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 * @public
 */
export default class CameraControl extends BaseHardwareControl {
    static renderer = BaseHardwareControlRenderer;

    /** Device name used in the user-visible message when the camera is unavailable. */
    private static readonly CAPABILITY_NAME = "Camera";

    private videoElement: HTMLVideoElement | null = null;
    private mediaStream: MediaStream | null = null;
    private imagePreview!: Image;
    private captureBtn!: Button;
    private clearBtn!: Button;
    private htmlVideo!: HTML;

    constructor(idOrSettings?: string | $BaseHardwareControlSettings, settings?: $BaseHardwareControlSettings) {
        super(idOrSettings, settings);
    }

    /**
     * Initializes the internal VBox layout containing the HTML5 `<video>` element, preview `Image`, and action buttons.
     */
    public init(): void {
        if (BaseHardwareControl.prototype.init) {
            BaseHardwareControl.prototype.init.call(this);
        }

        const controlId = this.getId();

        const videoStyle =
            "border: 1px solid #89919a; border-radius: 4px; background: #1d2d3e; display: block; max-width: 100%;";
        this.htmlVideo = new HTML({
            content:
                `<div class="sapUiTinyMarginBottom">` +
                `<video id="${controlId}-video" width="320" height="240" autoplay playsinline style="${videoStyle}"></video>` +
                `<canvas id="${controlId}-canvas" width="320" height="240" hidden></canvas>` +
                `</div>`
        });

        this.imagePreview = new Image({
            width: "320px",
            height: "240px",
            visible: false
        }).addStyleClass("sapUiTinyMarginBottom");

        this.captureBtn = new Button({
            text: "Start Camera / Capture",
            icon: "sap-icon://camera",
            type: ButtonType.Emphasized,
            press: () => {
                void this.handleCameraAction();
            }
        }).addStyleClass("sapUiTinyMarginEnd");

        this.clearBtn = new Button({
            text: "Clear / Retake",
            icon: "sap-icon://delete",
            type: ButtonType.Transparent,
            visible: false,
            press: () => {
                this.clearCamera();
            }
        });

        const buttonRow = new HBox({
            items: [this.captureBtn, this.clearBtn]
        });

        const layout = new VBox({
            items: [this.htmlVideo, this.imagePreview, buttonRow]
        });

        this.setAggregation("_content", layout);
    }

    /**
     * Synchronizes button enabled/visibility states with the `readOnly` and `value` properties before rendering.
     */
    public onBeforeRendering(): void {
        this.syncHardwareState();
        this.syncPreviewWithValue(this.getProperty("value") as string | null);
    }

    /**
     * Synchronizes the inner action buttons with the current `readOnly` property.
     */
    protected override syncHardwareState(): void {
        const isReadOnly = Boolean(this.getProperty("readOnly"));
        if (this.captureBtn) {
            this.captureBtn.setEnabled(!isReadOnly);
        }
        if (this.clearBtn) {
            this.clearBtn.setEnabled(!isReadOnly);
        }
    }

    /**
     * Starts the camera stream on first press, or captures a snapshot frame if the stream is already active.
     */
    private async handleCameraAction(): Promise<void> {
        if (this.getProperty("readOnly")) {
            return;
        }
        const controlId = this.getId();
        this.videoElement = document.getElementById(`${controlId}-video`) as HTMLVideoElement | null;

        if (!this.mediaStream) {
            try {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    if (this.isDestroyed()) {
                        stream.getTracks().forEach((track) => track.stop());
                        return;
                    }
                    this.clearCapabilityFailure();
                    this.mediaStream = stream;
                    if (this.videoElement) {
                        this.videoElement.srcObject = this.mediaStream;
                        this.captureBtn.setText("Take Snapshot");
                    }
                } else {
                    // WebKit on Windows exposes no `navigator.mediaDevices`. Logging and falling through
                    // left the button pressable and the control unchanged, which is indistinguishable
                    // from a camera that is simply slow to start.
                    this.reportCapabilityFailure(CameraControl.CAPABILITY_NAME, "unsupported");
                }
            } catch (err) {
                const error = err as Error;
                this.reportCapabilityFailure(
                    CameraControl.CAPABILITY_NAME,
                    CameraControl.isPermissionDenial(error) ? "denied" : "failed",
                    `${error.name || "Error"}: ${error.message}`
                );
            }
        } else {
            this.takeSnapshot();
        }
    }

    /**
     * Classifies a `getUserMedia` rejection as a permission refusal rather than a device failure.
     *
     * The names come from the Media Capture and Streams specification; `PermissionDeniedError` is the
     * legacy name older WebKit builds still throw, and `SecurityError` is what a non-secure origin raises.
     *
     * @param error The rejection from `navigator.mediaDevices.getUserMedia`.
     * @returns {boolean} True when the user or the origin policy refused access.
     */
    private static isPermissionDenial(error: Error): boolean {
        return error.name === "NotAllowedError" || error.name === "PermissionDeniedError" || error.name === "SecurityError";
    }

    /**
     * Draws the current video frame onto the hidden `<canvas>`, encodes it as a PNG data URL,
     * stops the camera stream, and updates `value`.
     */
    private takeSnapshot(): void {
        const controlId = this.getId();
        const canvas = document.getElementById(`${controlId}-canvas`) as HTMLCanvasElement | null;
        if (this.videoElement && canvas) {
            const context = canvas.getContext("2d");
            if (context) {
                context.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL("image/png");
                this.stopStream();
                this.setValue(dataUrl);
                this.fireEvent("capture", { value: dataUrl });
            }
        }
    }

    /**
     * Clears the captured image and resets the control to camera preview mode.
     */
    private clearCamera(): void {
        if (this.getProperty("readOnly")) {
            return;
        }
        this.stopStream();
        this.setProperty("value", null, true);
        this.syncPreviewWithValue(null);
        this.captureBtn.setText("Start Camera / Capture");
        this.fireEvent("capture", { value: null });
    }

    /**
     * Updates the `value` property and synchronizes the preview `Image` without firing synthetic user events.
     *
     * @param sValue The Base64 image data URL or `null`.
     * @returns {this} This control instance for chaining.
     */
    public setValue(sValue: string | null): this {
        this.setProperty("value", sValue, true);
        this.syncPreviewWithValue(sValue);
        return this;
    }

    /**
     * Synchronizes the internal preview `Image`, `<video>`, and buttons with the current `value`.
     *
     * @param sValue The current image data URL or `null`.
     */
    private syncPreviewWithValue(sValue: string | null): void {
        if (!this.imagePreview || !this.htmlVideo || !this.clearBtn || !this.captureBtn) {
            return;
        }
        if (sValue && UrlValidator.isSafeImageSource(sValue)) {
            this.imagePreview.setSrc(sValue);
            this.imagePreview.setVisible(true);
            this.htmlVideo.setVisible(false);
            this.clearBtn.setVisible(true);
            this.captureBtn.setVisible(false);
        } else {
            this.imagePreview.setSrc("");
            this.imagePreview.setVisible(false);
            this.htmlVideo.setVisible(true);
            this.clearBtn.setVisible(false);
            this.captureBtn.setVisible(true);
        }
    }

    /**
     * Stops all active WebRTC media tracks and releases the camera device.
     */
    private stopStream(): void {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop());
            this.mediaStream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
    }

    /**
     * Releases any active camera stream when the control is destroyed.
     */
    public exit(): void {
        this.stopStream();
    }
}
