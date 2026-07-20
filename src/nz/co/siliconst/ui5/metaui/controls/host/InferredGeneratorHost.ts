import GeneratorHost from "./GeneratorHost";
import { SchemaNormalizer } from "../../core/SchemaNormalizer";

/**
 * Inherited GeneratorHost that enables volatile Inference Mode.
 * It does not require a hardcoded schema and builds the UI purely by reflecting live data.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.controls.host
 */
export default class InferredGeneratorHost extends GeneratorHost {
    
    /** Inherit the standard Explicit GeneratorHost renderer */
    static renderer = "nz.co.siliconst.ui5.metaui.controls.host.GeneratorHostRenderer";

    /** Cached schema for intelligent diffing during inference mode hot-swaps */
    private parsedSchema: Record<string, unknown> | null = null;

    /**
     * Exposes the parsed schema to the DataSyncDelegate for diffing.
     */
    public getParsedSchema(): Record<string, unknown> | null {
        return this.parsedSchema;
    }

    /**
     * Overridden lifecycle hook to allow generation EVEN when no schema is present, 
     * triggering inference mode from input data.
     */
    public onBeforeRendering(): void {
        if (!this.generatedContent) {
            const hasSchema = !!this.getProperty("schemaDefinition");
            const hasData = !!this.getProperty("inputDataJson") || !!this.getProperty("inputData");
            
            if (hasSchema || hasData) {
                this.generate();
            }
        }
    }

    /**
     * Overrides generation to safely cache the inferred schema so the 
     * DataSyncDelegate can intelligently skip DOM teardowns on identical typing changes.
     */
    public generate(): void {
        // Run standard generation
        super.generate();

        // If generation succeeded and the StateManager is alive, cache the schema
        if (this.stateManager) {
            const rawSchema = this.getProperty("schemaDefinition");
            const inputData = this.stateManager.extractPayload();
            this.parsedSchema = SchemaNormalizer.normalize(rawSchema, inputData) as Record<string, unknown>;
        }
    }
}
