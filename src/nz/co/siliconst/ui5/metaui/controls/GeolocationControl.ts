/**
 * @file GeolocationControl.ts
 * @description Hardware control for acquiring GPS coordinates via the browser Geolocation API (navigator.geolocation).
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
import BaseHardwareControl, { $BaseHardwareControlSettings, HardwareFailureReason } from "./BaseHardwareControl";
import BaseHardwareControlRenderer from "./BaseHardwareControlRenderer";
import HBox from "sap/m/HBox";
import Input from "sap/m/Input";
import Button from "sap/m/Button";
import FlexItemData from "sap/m/FlexItemData";
import { ButtonType, FlexAlignItems } from "sap/m/library";
import { isRecord } from "../utils/TypeGuards";

/**
 * Custom UI5 control that captures `{ lat, lng }` coordinates using `navigator.geolocation.getCurrentPosition`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 * @public
 */
export default class GeolocationControl extends BaseHardwareControl {
    static renderer = BaseHardwareControlRenderer;

    /** Device name used in the user-visible message when a position cannot be obtained. */
    private static readonly CAPABILITY_NAME = "Location";

    /**
     * Milliseconds the browser is allowed to spend producing a fix.
     *
     * `getCurrentPosition` was previously called with no options object at all, so `timeout` took its
     * specified default of `0xFFFFFFFF` ms — roughly 50 days (W3C Geolocation API, §7 `PositionOptions`) —
     * and a request that never completed left the button spinning for the lifetime of the page.
     *
     * With `enableHighAccuracy` off the browser answers from its network location provider rather than
     * waiting for a GNSS fix, which resolves in well under two seconds on every engine measured, so ten
     * seconds is an order of magnitude of headroom and still inside the window where a person associates
     * the message with the button they pressed.
     */
    private static readonly POSITION_TIMEOUT_MS = 10000;

    /**
     * Extra milliseconds the control waits beyond {@link GeolocationControl.POSITION_TIMEOUT_MS} before
     * giving up on its own.
     *
     * The W3C Geolocation API states in §7.2 that "the time spent waiting for the document to become
     * visible and for obtaining permission to use the API is not included in the period covered by the
     * timeout member", and that the member "only applies when acquiring a position begins". A permission
     * prompt that is dismissed rather than answered therefore starts no browser timer at all and invokes
     * neither callback — Firefox's behaviour, reproduced with the spinner still running at ten seconds.
     * This watchdog is the only thing that can end that state. The grace period lets the browser's own
     * `TIMEOUT` error win whenever a browser timer *is* running, so the watchdog only ever fires for the
     * case the specification deliberately leaves uncovered.
     */
    private static readonly WATCHDOG_GRACE_MS = 2000;

    private coordInput!: Input;
    private locateBtn!: Button;
    private watchdogId: number | null = null;

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
     *
     * Every exit path — success, browser error, and the watchdog that covers the case where the browser
     * calls neither callback — clears the button's busy state exactly once.
     */
    private acquireLocation(): void {
        if (this.getProperty("readOnly")) {
            return;
        }
        if (!navigator.geolocation) {
            this.reportCapabilityFailure(GeolocationControl.CAPABILITY_NAME, "unsupported");
            return;
        }

        this.cancelWatchdog();
        this.locateBtn.setBusy(true);

        let settled = false;
        const settle = (): boolean => {
            if (settled || this.isDestroyed()) {
                return false;
            }
            settled = true;
            this.cancelWatchdog();
            this.locateBtn.setBusy(false);
            return true;
        };

        const watchdogMs = GeolocationControl.POSITION_TIMEOUT_MS + GeolocationControl.WATCHDOG_GRACE_MS;
        this.watchdogId = window.setTimeout(() => {
            this.watchdogId = null;
            if (!settle()) {
                return;
            }
            this.reportCapabilityFailure(
                GeolocationControl.CAPABILITY_NAME,
                "timeout",
                `neither callback ran within ${watchdogMs} ms; the permission prompt was most likely dismissed`
            );
        }, watchdogMs);

        try {
            navigator.geolocation.getCurrentPosition(
                (pos: GeolocationPosition) => {
                    if (!settle()) {
                        return;
                    }
                    this.clearCapabilityFailure();
                    const coordsObj = {
                        lat: Number(pos.coords.latitude.toFixed(6)),
                        lng: Number(pos.coords.longitude.toFixed(6))
                    };
                    this.setValue(coordsObj);
                    this.fireEvent("capture", { value: coordsObj });
                },
                (err: GeolocationPositionError) => {
                    if (!settle()) {
                        return;
                    }
                    this.reportCapabilityFailure(
                        GeolocationControl.CAPABILITY_NAME,
                        GeolocationControl.classifyPositionError(err),
                        `code ${err.code}: ${err.message}`
                    );
                },
                {
                    enableHighAccuracy: false,
                    timeout: GeolocationControl.POSITION_TIMEOUT_MS,
                    maximumAge: 0
                }
            );
        } catch (err) {
            // A synchronous throw — an insecure origin on some engines, or a stubbed-out API — is an
            // exit path too, and the one that would otherwise leave the spinner up until the watchdog.
            if (settle()) {
                this.reportCapabilityFailure(GeolocationControl.CAPABILITY_NAME, "failed", (err as Error).message);
            }
        }
    }

    /**
     * Maps a `GeolocationPositionError` code onto the shared hardware failure vocabulary.
     *
     * @param err The error handed to the `getCurrentPosition` error callback.
     * @returns {HardwareFailureReason} The reason reported to the user and the log.
     */
    private static classifyPositionError(err: GeolocationPositionError): HardwareFailureReason {
        switch (err.code) {
            case 1: // PERMISSION_DENIED
                return "denied";
            case 3: // TIMEOUT
                return "timeout";
            default: // POSITION_UNAVAILABLE (2) and anything a browser invents
                return "failed";
        }
    }

    /**
     * Stops the pending watchdog timer, if any.
     */
    private cancelWatchdog(): void {
        if (this.watchdogId !== null) {
            window.clearTimeout(this.watchdogId);
            this.watchdogId = null;
        }
    }

    /**
     * Cancels any pending watchdog timer when the control is destroyed, so a torn-down control
     * cannot be woken by its own timer.
     */
    public exit(): void {
        this.cancelWatchdog();
    }
}
