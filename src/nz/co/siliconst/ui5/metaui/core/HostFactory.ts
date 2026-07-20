import GeneratorHost from "../controls/host/GeneratorHost";
import InferredGeneratorHost from "../controls/host/InferredGeneratorHost";
import { Logger } from "../utils/Logger";

/**
 * Factory class responsible for instantiating the correct UI5 Control Host strategy.
 * 
 * By extracting instantiation logic here, we decouple the DynamicHost facade from 
 * the concrete implementations, adhering to strict Dependency Inversion and allowing 
 * for future extensibility if more host strategies are added.
 */
export default class HostFactory {
    
    /**
     * Creates and returns the appropriate GeneratorHost instance.
     * 
     * @param hasSchema Whether an explicit schema was provided in the bindings.
     * @returns The instantiated UI5 Control.
     */
    public static createHost(hasSchema: boolean): GeneratorHost {
        if (hasSchema) {
            Logger.debug("[MetaUI]", "HostFactory: Instantiating Explicit GeneratorHost", "HostFactory");
            return new GeneratorHost();
        } else {
            Logger.debug("[MetaUI]", "HostFactory: Instantiating InferredGeneratorHost", "HostFactory");
            return new InferredGeneratorHost();
        }
    }
}
