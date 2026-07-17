/**
 * @file EventBus.ts
 * @description Internal pub/sub channel for managing cross-field dependencies.
 */

import { IEventBus, IFieldChangeEvent } from "../interfaces/IEventBus";

/**
 * Singleton orchestrator for localized state changes across the generated UI layout.
 */
export class EventBus implements IEventBus {
    private static instance: EventBus;
    private listeners: Array<(event: IFieldChangeEvent) => void> = [];

    private constructor() {
        // Enforce singleton
    }

    /**
     * Retrieves the singular instance of the EventBus.
     * @returns The EventBus singleton.
     */
    public static getInstance(): EventBus {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }

    /**
     * Publishes a value change event to all internal subscribers.
     * @param event The structured payload of the field change.
     */
    public publishFieldChange(event: IFieldChangeEvent): void {
        this.listeners.forEach(listener => listener(event));
    }

    /**
     * Registers a callback listener to react to field changes.
     * @param listener The callback function.
     */
    public subscribe(listener: (event: IFieldChangeEvent) => void): void {
        this.listeners.push(listener);
    }
}
