/**
 * @file Engine.ts
 * @description The central orchestrator that routes data between the Layout Factory and Plugin Registry.
 */

import { ISchema } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { ConditionEngine } from "./ConditionEngine";
import Control from "sap/ui/core/Control";
import VBox from "sap/m/VBox";

/**
 * The MetaUI Engine. Responsible for bootstrapping the layout generation.
 * Follows strict Orchestrator patterns; delegates all actual rendering to LayoutManagers.
 */
export class Engine {
    private conditionEngine: ConditionEngine | null = null;
    
    /**
     * Evaluates the schema and delegates generation to the layout factory.
     * @param schema The fully normalized schema definition.
     * @param layoutManager The injected layout factory class.
     * @returns The populated UI5 layout container.
     */
    public build(schema: ISchema, layoutManager: ILayoutManager): Control {
        // Bootstrap the condition engine to start listening for field events in this schema
        this.conditionEngine = new ConditionEngine(schema);
        
        if (schema.mode === "form") {
            return layoutManager.renderForm(schema);
        } else if (schema.mode === "table") {
            if (!schema.tables || schema.tables.length === 0) {
                throw new Error("[MetaUI] Table mode requires at least one table definition.");
            }
            return layoutManager.renderTable(schema.tables[0]);
        } else if (schema.mode === "mixed") {
            const container = new VBox({ renderType: "Bare" });
            
            // 1. Render the top-level form if there are root fields
            if (schema.rootFields && schema.rootFields.length > 0) {
                container.addItem(layoutManager.renderForm(schema));
            }
            
            // 2. Render all tables sequentially below the form
            if (schema.tables && schema.tables.length > 0) {
                schema.tables.forEach(tableMeta => {
                    container.addItem(layoutManager.renderTable(tableMeta));
                });
            }
            
            return container;
        }
        
        throw new Error(`[MetaUI] Mode '${schema.mode}' is not yet implemented or invalid.`);
    }
}
