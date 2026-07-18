/**
 * @file IPlugin.ts
 * @description Contract for all discrete UI control generation plugins.
 * Enforces a strict lifecycle for rendering, validation, and dynamic state updates.
 */

import Control from "sap/ui/core/Control";
import { IPropertyMetadata } from "./ISchema";

export interface IPlugin {
    render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName?: string): Control;
    validate(): boolean;
    onStateChange(newMetadata: IPropertyMetadata): void;
}
