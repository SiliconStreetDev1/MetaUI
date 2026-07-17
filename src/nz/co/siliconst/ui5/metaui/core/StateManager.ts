/**
 * @file StateManager.ts
 * @description Isolated internal state management. Decouples the MetaUI engine from external host models.
 */

import JSONModel from "sap/ui/model/json/JSONModel";
import ManagedObject from "sap/ui/base/ManagedObject";

/**
 * Manages the isolated internal data payload for the MetaUI engine.
 */
export class StateManager {
    private model: JSONModel;

    /**
     * Initializes the state manager with an optional initial payload.
     * @param initialData The initial JSON payload to populate the fields.
     */
    constructor(initialData: Record<string, any> = {}) {
        // Deep copy to ensure no reference leakage from the host application
        const safeData = JSON.parse(JSON.stringify(initialData));
        this.model = new JSONModel(safeData);
        this.model.setDefaultBindingMode("TwoWay");
    }

    /**
     * Retrieves the isolated JSONModel instance to attach to the root GeneratorHost control.
     * @returns The internal JSONModel.
     */
    public getModel(): JSONModel {
        return this.model;
    }

    /**
     * Binds a generated UI control property to a path in the internal model.
     * @param control The target UI5 Control.
     * @param property The UI5 property name (e.g., 'value').
     * @param bindingPath The exact path in the JSON payload.
     */
    public bindControl(control: ManagedObject, property: string, bindingPath: string): void {
        control.bindProperty(property, {
            path: bindingPath,
            model: "meta" // Assumes the model is bound to the root container with the name 'meta'
        });
    }

    /**
     * Extracts the flat JavaScript object representing the current state of the UI.
     * @returns A serialized record of the data payload, free of UI5 wrappers.
     */
    public extractPayload(): Record<string, any> {
        // Create a deep copy to prevent accidental mutations by the host
        const data = this.model.getData();
        return JSON.parse(JSON.stringify(data));
    }
}
