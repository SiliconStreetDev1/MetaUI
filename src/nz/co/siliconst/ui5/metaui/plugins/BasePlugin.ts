/**
 * @file BasePlugin.ts
 * @description Abstract foundation for all MetaUI plugins, enforcing lifecycle hooks.
 */

import { IPlugin } from "../interfaces/IPlugin";
import { IFieldMetadata } from "../interfaces/ISchema";
import { EventBus } from "../core/EventBus";
import Control from "sap/ui/core/Control";

/**
 * Abstract class providing baseline properties and event publishing hooks for all UI5 controls.
 */
export abstract class BasePlugin implements IPlugin {
    /** The actual generated UI5 control. */
    protected control: Control | null = null;
    /** The schema configuration associated with this specific field. */
    protected metadata: IFieldMetadata | null = null;

    /**
     * Must be implemented by concrete classes to generate the specific control.
     * @param fieldMetadata The immutable schema configuration.
     * @param bindingPath The exact model path where this field's data is stored.
     */
    public abstract render(fieldMetadata: IFieldMetadata, bindingPath: string): Control;

    /**
     * Must be implemented by concrete classes to run data integrity checks.
     */
    public abstract validate(): boolean;

    /**
     * Triggered by the ConditionEngine when cross-field rules alter this field's metadata.
     * @param newMetadata The dynamically updated rules.
     */
    public onStateChange(newMetadata: IFieldMetadata): void {
        this.metadata = newMetadata;
        this.applyState();
    }

    /**
     * Abstract hook for concrete plugins to re-bind their visibility or read-only states natively.
     */
    protected abstract applyState(): void;

    /**
     * Utility method for concrete plugins to easily broadcast changes to the EventBus.
     * @param newValue The newly entered/selected value.
     */
    protected publishChange(newValue: any): void {
        if (this.metadata) {
            EventBus.getInstance().publishFieldChange({
                fieldName: this.metadata.fieldName,
                newValue: newValue
            });
        }
    }
}
