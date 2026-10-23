/**
 * @file GeolocationPlugin.ts
 * @description Renders a GeolocationControl component for capturing latitude/longitude coordinates.
 */

import { HardwareControlPlugin } from "./HardwareControlPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import GeolocationControl from "../../controls/GeolocationControl";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";
import { isRecord } from "../../utils/TypeGuards";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Plugin responsible for rendering the hardware `GeolocationControl` widget.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class GeolocationPlugin extends HardwareControlPlugin<GeolocationControl> {
    protected readonly HardwareControlClass = GeolocationControl;

    /**
     * Renders formatted coordinate text (`Lat: x, Lng: y`) in display mode.
     *
     * @param _metadata The property metadata.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The configured Text control.
     */
    protected renderDisplayControl(
        _metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        const geoBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => {
                if (isRecord(val) && val.lat !== undefined && val.lng !== undefined) {
                    return I18n.getText(TEXT_KEY.geolocationCoordinates, [String(val.lat), String(val.lng)]);
                }
                if (typeof val === "string") {
                    return val;
                }
                return "";
            }
        }) as PropertyBindingInfo;
        return this.createDisplayText(engineScopeId, bindingPath, geoBinding);
    }
}
