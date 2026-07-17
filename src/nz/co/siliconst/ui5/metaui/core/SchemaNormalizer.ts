/**
 * @file SchemaNormalizer.ts
 * @description Transforms and validates incoming JSON payloads into the strict ISchema matrix.
 */

import { ISchema } from "../interfaces/ISchema";

/**
 * Utility class ensuring data fidelity before layout construction begins.
 */
export class SchemaNormalizer {
    
    /**
     * Validates that the provided raw payload conforms to the required ISchema structures.
     * @param rawSchema The heterogeneous JSON object provided to the Engine.
     * @returns The strictly cast ISchema matrix.
     * @throws Error if the mandatory schema properties are missing.
     */
    public static normalize(rawSchema: any): ISchema {
        if (!rawSchema || typeof rawSchema !== 'object') {
            throw new Error("[MetaUI] Invalid Schema Payload: Payload is not an object.");
        }
        
        if (!rawSchema.mode || !rawSchema.rootFields || !rawSchema.tables) {
            throw new Error("[MetaUI] Invalid Schema Payload: Missing required structures (mode, rootFields, tables).");
        }

        // Return the strongly typed and validated schema block.
        return rawSchema as ISchema;
    }
}
