/**
 * @file VoiceInputControl.ts
 * @description Hardware control for speech-to-text transcription using the Web Speech API.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
import BaseHardwareControl, { $BaseHardwareControlSettings } from "./BaseHardwareControl";
import BaseHardwareControlRenderer from "./BaseHardwareControlRenderer";
import HBox from "sap/m/HBox";
import Input from "sap/m/Input";
import Button from "sap/m/Button";
import FlexItemData from "sap/m/FlexItemData";
import { ButtonType, FlexAlignItems } from "sap/m/library";

/**
 * Minimal structural typing for the browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).
 */
interface ISpeechRecognitionAlternative {
    transcript: string;
}

interface ISpeechRecognitionResult {
    0: ISpeechRecognitionAlternative;
    length: number;
}

interface ISpeechRecognitionEvent {
    results: ArrayLike<ISpeechRecognitionResult>;
}

interface ISpeechRecognitionInstance {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: ISpeechRecognitionEvent) => void) | null;
    onerror: ((event: { error?: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
}

interface IWindowWithSpeechRecognition {
    SpeechRecognition?: new () => ISpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => ISpeechRecognitionInstance;
}

/**
 * Custom UI5 control combining a text `Input` with a microphone `Button` powered by the Web Speech API.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 * @public
 */
export default class VoiceInputControl extends BaseHardwareControl {
    static renderer = BaseHardwareControlRenderer;

    /** Device name used in the user-visible message when speech recognition is unavailable. */
    private static readonly CAPABILITY_NAME = "Speech recognition";

    private textInput!: Input;
    private recordBtn!: Button;
    private recognition: ISpeechRecognitionInstance | null = null;
    private isRecording: boolean = false;

    constructor(idOrSettings?: string | $BaseHardwareControlSettings, settings?: $BaseHardwareControlSettings) {
        super(idOrSettings, settings);
    }

    /**
     * Initializes the internal HBox layout containing the transcription `Input` and Microphone `Button`.
     */
    public init(): void {
        if (BaseHardwareControl.prototype.init) {
            BaseHardwareControl.prototype.init.call(this);
        }

        this.textInput = new Input({
            width: "100%",
            placeholder: "Speak or type here...",
            layoutData: new FlexItemData({ growFactor: 1 }),
            change: () => {
                const newVal = this.textInput.getValue();
                this.setProperty("value", newVal, true);
                this.fireEvent("capture", { value: newVal });
            }
        }).addStyleClass("sapUiTinyMarginEnd");

        this.recordBtn = new Button({
            icon: "sap-icon://microphone",
            tooltip: "Start Voice Input",
            type: ButtonType.Default,
            press: () => {
                this.toggleRecording();
            }
        });

        const layout = new HBox({
            width: "100%",
            alignItems: FlexAlignItems.Center,
            items: [this.textInput, this.recordBtn]
        });

        this.setAggregation("_content", layout);
    }

    /**
     * Synchronizes the `Input` and `Button` editability/value before rendering.
     */
    public onBeforeRendering(): void {
        this.syncHardwareState();
        if (this.textInput) {
            const currentVal = this.getProperty("value");
            const nextStr = typeof currentVal === "string" ? currentVal : "";
            if (this.textInput.getValue() !== nextStr) {
                this.textInput.setValue(nextStr);
            }
        }
    }

    /**
     * Synchronizes the inner transcription `Input` and microphone `Button` with `readOnly`, `valueState`, and `valueStateText`.
     */
    protected override syncHardwareState(): void {
        const isReadOnly = Boolean(this.getProperty("readOnly"));
        if (this.textInput) {
            this.textInput.setEditable(!isReadOnly);
            this.textInput.setValueState(this.getValueState());
            this.textInput.setValueStateText(this.getValueStateText());
        }
        if (this.recordBtn) {
            this.recordBtn.setEnabled(!isReadOnly);
        }
    }

    /**
     * Updates the `value` property and synchronizes the internal `Input` text.
     *
     * @param sValue The new transcription text string.
     * @returns {this} This control instance for chaining.
     */
    public setValue(sValue: string | null): this {
        this.setProperty("value", sValue, true);
        if (this.textInput) {
            const nextStr = sValue || "";
            if (this.textInput.getValue() !== nextStr) {
                this.textInput.setValue(nextStr);
            }
        }
        return this;
    }

    /**
     * Starts or stops Web Speech API recognition.
     */
    private toggleRecording(): void {
        if (this.getProperty("readOnly")) {
            return;
        }

        if (this.isRecording && this.recognition) {
            this.recognition.stop();
            return;
        }

        const speechWindow: IWindowWithSpeechRecognition = window as IWindowWithSpeechRecognition;
        const SpeechRecognitionCtor =
            speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

        if (!SpeechRecognitionCtor) {
            // Firefox ships no SpeechRecognition constructor at all. Returning after a log left the
            // microphone button looking live and changed nothing a user or a test could observe.
            this.reportCapabilityFailure(VoiceInputControl.CAPABILITY_NAME, "unsupported");
            return;
        }

        this.recognition = new SpeechRecognitionCtor();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = navigator.language || "en-US";

        this.recognition.onresult = (event: ISpeechRecognitionEvent) => {
            if (this.isDestroyed()) {
                return;
            }
            if (event.results && event.results.length > 0 && event.results[0][0]) {
                const transcript = event.results[0][0].transcript;
                this.clearCapabilityFailure();
                this.setValue(transcript);
                this.fireEvent("capture", { value: transcript });
            }
        };

        this.recognition.onerror = (event: { error?: string }) => {
            if (this.isDestroyed()) {
                return;
            }
            const code = event.error || "unknown";
            const denied = code === "not-allowed" || code === "service-not-allowed";
            this.reportCapabilityFailure(VoiceInputControl.CAPABILITY_NAME, denied ? "denied" : "failed", code);
        };

        this.recognition.onend = () => {
            this.isRecording = false;
            if (this.recordBtn && !this.recordBtn.isDestroyed()) {
                this.recordBtn.setType(ButtonType.Default);
            }
        };

        this.isRecording = true;
        this.recordBtn.setType(ButtonType.Emphasized);
        this.recognition.start();
    }

    /**
     * Stops any active speech recognition session when the control is destroyed.
     */
    public exit(): void {
        if (this.isRecording && this.recognition) {
            this.recognition.stop();
            this.recognition = null;
            this.isRecording = false;
        }
    }
}
