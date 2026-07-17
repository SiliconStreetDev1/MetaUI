/**
 * @file IEventBus.ts
 * @description Pub/Sub interface for localized cross-field communication and state logic.
 */

/**
 * Describes a state change payload fired by a plugin.
 */
export interface IFieldChangeEvent {
    fieldName: string;
    newValue: any;
}

/**
 * Contract for the internal event orchestrator to manage conditional UI logic.
 */
export interface IEventBus {
    /**
     * Publishes a value change event to the internal channel.
     * @param event The structured event detailing which field changed and its new value.
     */
    publishFieldChange(event: IFieldChangeEvent): void;

    /**
     * Subscribes a listener to react to field value changes.
     * @param listener The callback function to execute when a change occurs.
     */
    subscribe(listener: (event: IFieldChangeEvent) => void): void;
}
