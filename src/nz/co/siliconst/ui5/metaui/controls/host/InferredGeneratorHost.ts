/**
 * @file InferredGeneratorHost.ts
 * @description Specialized host control for Full Inference Mode, generating UI layouts
 * dynamically from raw `data` / `dataJson` payloads without requiring an explicit schema.
 */

import GeneratorHost from "./GeneratorHost";
import { HOST_CONTROL_METADATA, HOST_CONTROL_RENDERER } from "./HostControlMetadata";

/**
 * Specialized host control alias for Full Inference Mode (`data` or `dataJson` without an explicit `schemaDefinition`).
 * Note: `GeneratorHost` and `GenerationDelegate` natively execute full and hybrid data inference via
 * `SchemaNormalizer` and `DataInferenceBuilder`. `InferredGeneratorHost` is retained as a public control
 * subclass in `library.ts` for backwards compatibility and runtime host inspection.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls.host
 * @public
 */
export default class InferredGeneratorHost extends GeneratorHost {
    static readonly metadata = HOST_CONTROL_METADATA;
    static renderer = HOST_CONTROL_RENDERER;
}

