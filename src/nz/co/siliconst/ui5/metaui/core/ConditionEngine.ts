/**
 * @file ConditionEngine.ts
 * @description Evaluates dynamic rules to alter the schema in real-time.
 */

import { EventBus } from "./EventBus";
import { ISchema } from "../interfaces/ISchema";
import { IFieldChangeEvent } from "../interfaces/IEventBus";
import { IPlugin } from "../interfaces/IPlugin";
import { Registry } from "./Registry";

export type ConditionOperator = (a: any, b: any) => boolean;

export const OperatorRegistry = new Registry<ConditionOperator>("Operators");

// Register basic default operators
OperatorRegistry.register("==", (a, b) => a == b);
OperatorRegistry.register("===", (a, b) => a === b);
OperatorRegistry.register("!=", (a, b) => a != b);
OperatorRegistry.register("!==", (a, b) => a !== b);
OperatorRegistry.register(">", (a, b) => a > b);
OperatorRegistry.register("<", (a, b) => a < b);
OperatorRegistry.register(">=", (a, b) => a >= b);
OperatorRegistry.register("<=", (a, b) => a <= b);

/**
 * Engine that listens to the EventBus and evaluates cross-field dependencies (e.g. visibleOn, enabledOn).
 * It delegates actual evaluations to the configurable `OperatorRegistry`.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class ConditionEngine {
    /** The active form schema being evaluated. */
    private schema: ISchema;
    /** The cached bound event handler reference for strict garbage collection. */
    private boundHandler: (event: IFieldChangeEvent) => void;

    /**
     * Initializes the ConditionEngine with the active schema.
     * @param schema The current UI layout schema.
     */
    constructor(schema: ISchema) {
        this.schema = schema;
        this.boundHandler = this.handleEvent.bind(this);
        this.initializeListeners();
    }

    /**
     * Subscribes to the EventBus for real-time field change interception.
     */
    private initializeListeners(): void {
        EventBus.getInstance().subscribe(this.boundHandler);
    }

    /** Internal map tracking active plugins against their binding paths for real-time state updates. */
    private plugins: Map<string, IPlugin> = new Map();

    /**
     * Internal handler to evaluate business rules when a field is updated.
     * @param event The structured change event.
     */
    private handleEvent(event: IFieldChangeEvent): void {
        // Evaluate conditions via registered operators if a rule system is added later
    }

    /**
     * Registers a rendered plugin so the condition engine can push dynamic state updates to it.
     * 
     * @param bindingPath The JSON path representing the field within the payload.
     * @param plugin The instantiated plugin handling the field.
     */
    public registerPlugin(bindingPath: string, plugin: IPlugin): void {
        this.plugins.set(bindingPath, plugin);
    }

    /**
     * Cleans up EventBus listeners to prevent memory leaks on destruction.
     */
    public destroy(): void {
        EventBus.getInstance().unsubscribe(this.boundHandler);
    }
}
