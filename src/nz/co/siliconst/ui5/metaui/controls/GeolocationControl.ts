/**
 * @file GeolocationControl.ts
 * @description Hardware control for acquiring GPS coordinates via the browser Geolocation API (navigator.geolocation).
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
import { Logger } from "../utils/Logger";
import { isRecord } from "../utils/TypeGuards";

/**
 * Custom UI5 control that captures `{ lat, lng }` coordinates using `navigator.geolocation.getCurrentPosition`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 * @public
 */
export default class GeolocationControl extends BaseHardwareControl {
    static renderer = BaseHardwareControlRenderer;
    private coordInput!: Input;
    private locateBtn!: Button;

    constructor(idOrSettings?: string | $BaseHardwareControlSettings, settings?: $BaseHardwareControlSettings) {
        super(idOrSettings, settings);
    }

    /**
     * Initializes the internal HBox layout containing the read-only coordinate display `Input` and Locate `Button`.
     */
    public init(): void {
        if (BaseHardwareControl.prototype.init) {
            BaseHardwareControl.prototype.init.call(this);
        }

        this.coordInput = new Input({
            editable: false,
            placeholder: "Latitude, Longitude",
            width: "100%",
            layoutData: new FlexItemData({ growFactor: 1 })
        }).addStyleClass("sapUiTinyMarginEnd");

        this.locateBtn = new Button({
            text: "Get Location",
            icon: "sap-icon://locate-me",
            type: ButtonType.Emphasized,
            press: () => {
                this.acquireLocation();
            }
        });

        const layout = new HBox({
            width: "100%",
            alignItems: FlexAlignItems.Center,
            items: [this.coordInput, this.locateBtn]
        });

        this.setAggregation("_content", layout);
    }

    /**
     * Synchronizes the Locate button's `enabled` state and coordinate display before rendering.
     */
    public onBeforeRendering(): void {
        this.syncHardwareState();
        this.updateDisplayFromValue(this.getProperty("value"));
    }

    /**
     * Synchronizes the inner coordinate `Input` and Locate `Button` with `readOnly`, `valueState`, and `valueStateText`.
     */
    protected override syncHardwareState(): void {
        if (this.locateBtn) {
            this.locateBtn.setEnabled(!this.getProperty("readOnly"));
        }
        if (this.coordInput) {
            this.coordInput.setValueState(this.getValueState());
            this.coordInput.setValueStateText(this.getValueStateText());
        }
    }

    /**
     * Updates the `value` property (`{ lat, lng }` or string) and refreshes the coordinate text field.
     *
     * @param vValue The new geolocation value.
     * @returns {this} This control instance for chaining.
     */
    public setValue(vValue: unknown): this {
        this.setProperty("value", vValue, true);
        this.updateDisplayFromValue(vValue);
        return this;
    }

    /**
     * Formats the stored coordinate value (`{ lat, lng }` object or string) into the display `Input`.
     *
     * @param vValue The coordinate value to format.
     */
    private updateDisplayFromValue(vValue: unknown): void {
        if (!this.coordInput) {
            return;
        }
        let formatted = "";
        if (isRecord(vValue) && vValue.lat !== undefined && vValue.lng !== undefined) {
            formatted = `${vValue.lat}, ${vValue.lng}`;
        } else if (typeof vValue === "string") {
            formatted = vValue;
        }
        if (this.coordInput.getValue() !== formatted) {
            this.coordInput.setValue(formatted);
        }
    }

    /**
     * Requests the current position from `navigator.geolocation` and stores `{ lat, lng }` in `value`.
     */
    private acquireLocation(): void {
        if (this.getProperty("readOnly")) {
            return;
        }
        if (!navigator.geolocation) {
            Logger.warn("[MetaUI GeolocationControl]", "Geolocation API is not supported by this browser.", "GeolocationControl");
            return;
        }

        this.locateBtn.setBusy(true);
        navigator.geolocation.getCurrentPosition(
            (pos: GeolocationPosition) => {
                if (this.isDestroyed()) {
                    return;
                }
                this.locateBtn.setBusy(false);
                const coordsObj = {
                    lat: Number(pos.coords.latitude.toFixed(6)),
                    lng: Number(pos.coords.longitude.toFixed(6))
                };
                this.setValue(coordsObj);
                this.fireEvent("capture", { value: coordsObj });
            },
            (err: GeolocationPositionError) => {
                if (this.isDestroyed()) {
                    return;
                }
                this.locateBtn.setBusy(false);
                Logger.error(
                    "[MetaUI GeolocationControl]",
                    `Failed to acquire geolocation: ${err.message}`,
                    "GeolocationControl"
                );
            }
        );
    }
}
