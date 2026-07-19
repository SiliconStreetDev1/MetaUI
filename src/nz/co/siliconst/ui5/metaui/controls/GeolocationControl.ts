/**
 * @file GeolocationControl.ts
 * @description Native UI5 Control for GPS capture.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
import BaseHardwareControl from "./BaseHardwareControl";
import BaseHardwareControlRenderer from "./BaseHardwareControlRenderer";
import RenderManager from "sap/ui/core/RenderManager";
import Button from "sap/m/Button";
import Input from "sap/m/Input";
import VBox from "sap/m/VBox";
import MessageToast from "sap/m/MessageToast";

export default class GeolocationControl extends BaseHardwareControl {
    private vBox: VBox;
    private locationBtn: Button;
    private resultInput: Input;

    static readonly renderer = BaseHardwareControlRenderer;

    static readonly metadata = {
        aggregations: {
            _content: { type: "sap.m.VBox", multiple: false, visibility: "hidden" }
        }
    };

    public init(): void {
        super.init();

        this.locationBtn = new Button({
            icon: "sap-icon://map",
            text: "Get Location",
            press: this.getLocation.bind(this)
        });

        this.resultInput = new Input({
            editable: false,
            visible: false
        });

        this.vBox = new VBox({
            items: [this.locationBtn, this.resultInput]
        });

        this.setAggregation("_content", this.vBox);
    }

    public onBeforeRendering(): void {
        const metadata = this.getProperty("schemaMetadata");
        if (metadata && metadata.ui && metadata.ui.label) {
            this.locationBtn.setText(metadata.ui.label);
        }

        const readOnly = this.getProperty("readOnly");
        this.locationBtn.setEnabled(!readOnly);

        const currentVal = this.getProperty("value");
        if (currentVal) {
            this.resultInput.setValue(currentVal as string);
            this.resultInput.setVisible(true);
        }
    }

    private getLocation(): void {
        if (!navigator.geolocation) {
            MessageToast.show("Geolocation is not supported by your browser");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const locStr = `${position.coords.latitude}, ${position.coords.longitude}`;
                this.resultInput.setValue(locStr);
                this.resultInput.setVisible(true);
                this.setValueAndFire(locStr);
                MessageToast.show("Location acquired.");
            },
            () => {
                MessageToast.show("Unable to retrieve your location");
            }
        );
    }


}
