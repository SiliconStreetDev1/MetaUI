/**
 * @file Engine.ts
 * @description The central orchestrator that routes data between the Layout Factory and Plugin Registry (v2).
 */

import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { IPlugin } from "../interfaces/IPlugin";
import { ConditionEngine } from "./ConditionEngine";
import Control from "sap/ui/core/Control";
import VBox from "sap/m/VBox";

export class Engine {
    private conditionEngine: ConditionEngine | null = null;
    private activePlugins: IPlugin[] = [];
    
    public build(schema: ISchema, layoutManager: ILayoutManager, modelName: string = "meta"): Control {
        this.conditionEngine = new ConditionEngine(schema);
        this.activePlugins = [];

        const trackPlugin = (plugin: IPlugin) => this.activePlugins.push(plugin);
        
        // Implicit layout routing based on root type
        if (schema.type === "array") {
            if (!schema.items) {
                throw new Error("[MetaUI] Array schema must define 'items'.");
            }
            return layoutManager.renderTable(schema.items, `${modelName}>/`, schema.title);
        }
        
        if (schema.type === "object") {
            const container = new VBox({ renderType: "Bare" });
            const props = schema.properties || {};
            
            // Separate scalar properties (form fields) from root array properties (inline tables)
            const formProps: Record<string, IPropertyMetadata> = {};
            const tableProps: { key: string; meta: IPropertyMetadata }[] = [];
            
            for (const key of Object.keys(props)) {
                if (props[key].type === "array") {
                    tableProps.push({ key, meta: props[key] });
                } else {
                    formProps[key] = props[key];
                }
            }
            
            // Render the top-level form if there are scalar fields
            if (Object.keys(formProps).length > 0) {
                container.addItem(layoutManager.renderForm(formProps, modelName, schema.title, trackPlugin));
            }
            
            // Render root-level arrays as massive native tables below the form
            for (const tableProp of tableProps) {
                if (tableProp.meta.items) {
                    container.addItem(layoutManager.renderTable(tableProp.meta.items, `${modelName}>/${tableProp.key}`, tableProp.meta.ui?.label || tableProp.key));
                }
            }
            
            return container;
        }
        
        throw new Error(`[MetaUI] Unsupported schema type: ${schema.type}`);
    }

    public validateAll(): boolean {
        let isValid = true;
        for (const plugin of this.activePlugins) {
            if (!plugin.validate()) {
                isValid = false;
            }
        }
        return isValid;
    }

    public destroy(): void {
        if (this.conditionEngine) {
            this.conditionEngine.destroy();
            this.conditionEngine = null;
        }
        this.activePlugins = [];
    }
}
