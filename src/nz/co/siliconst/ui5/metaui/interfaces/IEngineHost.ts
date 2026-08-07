import Control from "sap/ui/core/Control";
import { StateManager } from "../core/StateManager";
import { ISchema } from "./ISchema";

/**
 * Contract defining what the Engine requires from its hosting container
 * (e.g. GeneratorHost or InferredGeneratorHost).
 */
export interface IEngineHost {
    /** Retrieves the central StateManager managing the active data models. */
    getStateManager(): StateManager | null;
    
    /** Retrieves the current active schema for the host. */
    getParsedSchema?(): ISchema | Record<string, unknown> | null;
    
    /** The active JSONModel name where data is bound. */
    activeModelName: string;
    
    /** The root generated layout control. */
    generatedContent: Control | null;
}
