import BaseHardwareControl from "./BaseHardwareControl";
import Button from "sap/m/Button";
import VBox from "sap/m/VBox";
import TextArea from "sap/m/TextArea";
import MessageToast from "sap/m/MessageToast";
import HBox from "sap/m/HBox";
import { Logger } from "../utils/Logger";

/**
 * VoiceInputControl
 * Provides a UI to dictate text using the browser's native Web Speech API.
 */
export default class VoiceInputControl extends BaseHardwareControl {
    static readonly renderer = "nz.co.siliconst.ui5.metaui.controls.BaseHardwareControlRenderer";
    static readonly metadata = {
        properties: {},
        events: {}
    };

    private vBox!: VBox;
    private textArea!: TextArea;
    private startBtn!: Button;
    private stopBtn!: Button;
    
    private recognition: any = null;
    private isRecording: boolean = false;

    public init(): void {
        super.init();

        this.textArea = new TextArea({
            rows: 3,
            width: "100%",
            placeholder: "Dictated text will appear here...",
            liveChange: (oEvent: sap.ui.base.Event) => {
                this.setValueAndFire(oEvent.getParameter("value"));
            }
        });

        this.startBtn = new Button({
            icon: "sap-icon://microphone",
            text: "Start Dictation",
            type: "Emphasized",
            press: this.toggleDictation.bind(this)
        });

        const hBox = new HBox({
            items: [this.startBtn]
        }).addStyleClass("sapUiSmallMarginTop");

        this.vBox = new VBox({
            items: [this.textArea, hBox]
        });

        this.setAggregation("_content", this.vBox);
        this.initSpeechRecognition();
    }

    private toggleDictation(): void {
        if (this.isRecording) {
            this.stopDictation();
        } else {
            this.startDictation();
        }
    }

    private initSpeechRecognition(): void {
        const SpeechRecognition = (window as unknown).SpeechRecognition || (window as unknown).webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.recognition.onresult = (event: any) => {
                let finalTranscript = "";
                let interimTranscript = "";

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                // Append the new final transcript to whatever was already in the textarea
                const currentVal = this.getValue() || "";
                const newVal = currentVal ? currentVal + " " + finalTranscript : finalTranscript;
                
                if (finalTranscript) {
                    this.textArea.setValue(newVal);
                    this.setValueAndFire(newVal);
                } else if (interimTranscript) {
                    // Just show interim temporarily in textarea without saving to model
                    this.textArea.setValue(currentVal ? currentVal + " " + interimTranscript : interimTranscript);
                }
            };

            this.recognition.onstart = () => {
                this.isRecording = true;
                this.startBtn.setIcon("sap-icon://stop");
                this.startBtn.setText("Stop Recording");
                this.startBtn.setType("Reject");
                MessageToast.show("Listening... Please speak now.");
            };

            this.recognition.onerror = (event: any) => {
                Logger.error("Speech recognition error", event.error, "VoiceInputControl");
                sap.ui.require(["sap/m/MessageBox"], (MessageBox: unknown) => {
                    MessageBox.error("Microphone Error: " + event.error + "\n\nPlease ensure you have a working microphone attached and have not blocked access in your browser settings.");
                });
                this.stopDictation();
            };
            
            this.recognition.onend = () => {
                // If it ends natively (e.g. timeout), update UI
                this.stopDictation();
            };
        } else {
            Logger.warn("Web Speech API not supported in this browser.", "", "VoiceInputControl");
            this.startBtn.setEnabled(false);
            this.startBtn.setTooltip("Speech Recognition is not supported in this browser.");
        }
    }

    private startDictation(): void {
        if (!this.recognition) return;
        
        try {
            this.recognition.start();
            MessageToast.show("Requesting microphone access...");
            // Provide immediate UI feedback in case browser delays the onstart event
            this.startBtn.setIcon("sap-icon://stop");
            this.startBtn.setText("Requesting mic...");
            this.startBtn.setType("Reject");
        } catch (err: any) {
            Logger.error("Failed to start speech recognition", err.message || err, "VoiceInputControl");
            sap.ui.require(["sap/m/MessageBox"], (MessageBox: unknown) => {
                MessageBox.error("Failed to start dictation. Please ensure you have a working microphone and have granted browser permissions.\n\nDetails: " + (err.message || err));
            });
            this.stopDictation();
        }
    }

    private stopDictation(): void {
        if (!this.recognition) return;
        
        try {
            this.recognition.stop();
        } catch(e) {}
        
        this.isRecording = false;
        this.startBtn.setIcon("sap-icon://microphone");
        this.startBtn.setText("Start Dictation");
        this.startBtn.setType("Emphasized");
    }

    public onBeforeRendering(): void {
        const readOnly = this.getProperty("readOnly");
        this.textArea.setEditable(!readOnly);
        
        // Only enable if it's not readonly AND the browser supports speech recognition
        this.startBtn.setEnabled(!readOnly && !!this.recognition);

        const currentVal = this.getProperty("value");
        if (currentVal !== undefined && currentVal !== null) {
            // Only update text area if we aren't currently dictating interim results
            if (!this.isRecording) {
                this.textArea.setValue(currentVal as string);
            }
        }
    }

    public exit(): void {
        this.stopDictation();
        if (this.recognition) {
            this.recognition.onstart = null;
            this.recognition.onresult = null;
            this.recognition.onerror = null;
            this.recognition.onend = null;
            this.recognition = null;
        }
        super.exit();
    }
}
