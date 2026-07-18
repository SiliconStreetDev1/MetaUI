/**
 * @file ConditionEngine.ts
 * @description Evaluates dynamic rules to alter the schema in real-time.
 */

import { EventBus } from "./EventBus";
import { ISchema } from "../interfaces/ISchema";
import { IFieldChangeEvent } from "../interfaces/IEventBus";

/**
 * Engine that listens to the EventBus and evaluates cross-field dependencies.
 */
export class ConditionEngine {
    private schema: ISchema;
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

    /**
     * Internal handler to evaluate business rules when a field is updated.
     * @param event The structured change event.
     */
    private handleEvent(event: IFieldChangeEvent): void {
        // Architecture hook: Logic to evaluate conditions against the schema 
        // and update plugin properties will be injected here in later phases.
    }

    /**
     * Cleans up EventBus listeners to prevent memory leaks on destruction.
     */
    public destroy(): void {
        EventBus.getInstance().unsubscribe(this.boundHandler);
    }
}
