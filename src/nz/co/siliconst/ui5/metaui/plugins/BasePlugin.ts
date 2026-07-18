/**
 * @file BasePlugin.ts
 * @description Abstract foundation for all MetaUI plugins, enforcing lifecycle hooks for v2 Schema.
 */

import { IPlugin } from "../interfaces/IPlugin";
import { IPropertyMetadata } from "../interfaces/ISchema";
import { EventBus } from "../core/EventBus";
import Control from "sap/ui/core/Control";

export abstract class BasePlugin implements IPlugin {
    protected control: Control | null = null;
    protected metadata: IPropertyMetadata | null = null;
    protected fieldKey: string = "";

    public abstract render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName?: string): Control;

    public abstract validate(): boolean;

    public onStateChange(newMetadata: IPropertyMetadata): void {
        this.metadata = newMetadata;
        this.applyState();
    }

    protected abstract applyState(): void;

    /**
     * Helper to apply common UI directives (like readOnly, visibleOn) directly to any control.
     */
    protected applyCommonDirectives(control: any, metadata: IPropertyMetadata, modelName: string = "meta"): void {
        if (metadata.ui?.readOnly !== undefined && typeof control.setEditable === "function") {
            control.setEditable(!metadata.ui.readOnly);
        }

        if (metadata.ui?.visibleOn) {
            const expr = `{= ${metadata.ui.visibleOn.replace(/\$root\./g, `${modelName}>/`).replace(/\./g, '/')} }`;
            control.bindProperty("visible", { parts: [{ path: "meta>/" }], formatter: () => false });
            // The ConditionEngine handles actual binding injection, but here we can set a fallback or natively bind if we bypass ConditionEngine.
            control.bindProperty("visible", expr);
        }
        
        if (metadata.ui?.enabledOn && typeof control.setEnabled === "function") {
            const expr = `{= ${metadata.ui.enabledOn.replace(/\$root\./g, `${modelName}>/`).replace(/\./g, '/')} }`;
            control.bindProperty("enabled", expr);
        }
    }

    protected publishChange(newValue: any): void {
        if (this.metadata && this.fieldKey) {
            EventBus.getInstance().publishFieldChange({
                fieldName: this.fieldKey,
                newValue: newValue
            });
        }
    }
}
