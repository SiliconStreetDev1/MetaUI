/**
 * @file PayloadValidator.ts
 * @description Headless recursive validator for nested object, array, reference, and dictionary payloads.
 */

import { IPropertyMetadata, ISchema } from "../interfaces/ISchema";
import { IPlugin, IPluginValidationResult } from "../interfaces/IPlugin";
import { PipelineManager } from "./PipelineManager";
import { SchemaWalker } from "./SchemaWalker";
import { isRecord } from "../utils/TypeGuards";
import { I18n, TEXT_KEY } from "../utils/I18n";
import { SCHEMA_TYPE, MAX_SCHEMA_DEPTH } from "../constants/MetaUIConstants";
import { isEmptyValue } from "../plugins/validators/RequiredValidatorPlugin";
import { Logger } from "../utils/Logger";

/**
 * JSON Schema assertion keywords a `not` sub-schema can declare that the MetaUI validation pipeline
 * is able to evaluate. A `not` that declares none of these asserts nothing the engine can test, so it
 * is reported instead of being silently treated as satisfied — see {@link PayloadValidator.isEvaluableNot}.
 *
 * `type` is deliberately absent: `SchemaNormalizer` synthesizes a type for every node, so its presence
 * says nothing about what the schema author wrote. Structural type mismatches are still enforced by
 * {@link PayloadValidator.matchesStructuralType}, which the `not` evaluation runs through.
 */
/** Scalar value constraints that a container value would bypass entirely. */
const SCALAR_ASSERTION_KEYWORDS: readonly (keyof IPropertyMetadata)[] = [
    "const",
    "enum",
    "pattern",
    "format",
    "maxLength",
    "minLength",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf"
];

const EVALUABLE_NOT_KEYWORDS: readonly (keyof IPropertyMetadata)[] = [
    "const",
    "enum",
    "pattern",
    "format",
    "maxLength",
    "minLength",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "maxItems",
    "minItems",
    "uniqueItems",
    "maxProperties",
    "minProperties",
    "properties",
    "items",
    "not"
];

/**
 * Headless recursive validator for nested object, array, reference, and dictionary payloads.
 */
export class PayloadValidator {
    /**
     * Overlays a local `$ref` node onto the definition it points at.
     *
     * `SchemaNormalizer` emits every JSON Schema keyword as an own property, so an absent
     * `maxLength` is present with the value `undefined`. A plain `{ ...resolved, ...local }`
     * therefore overwrote every constraint of the referenced definition with `undefined` and
     * silently disabled validation for the whole subtree. Only keys the local node actually
     * carries a value for may override the definition.
     *
     * @param resolved The resolved `$ref` definition.
     * @param local The local node carrying the `$ref` plus any sibling overrides.
     * @returns The merged metadata, with the definition's constraints preserved.
     */
    private static mergeResolvedDefinition<T extends IPropertyMetadata | ISchema>(resolved: T, local: T): T {
        const merged: Record<string, unknown> = { ...(resolved as Record<string, unknown>) };
        for (const [key, value] of Object.entries(local as Record<string, unknown>)) {
            if (value !== undefined) {
                merged[key] = value;
            }
        }
        const resolvedRec = resolved as Record<string, unknown>;
        const localRec = local as Record<string, unknown>;
        merged.type = resolvedRec.type || localRec.type || "object";
        merged.properties = resolvedRec.properties || localRec.properties;
        merged.items = resolvedRec.items || localRec.items;
        return merged as T;
    }

    /**
     * Validates a value against a property's metadata and recursively validates any nested
     * object properties, dictionary entries, or array items.
     *
     * @param metadata The schema metadata for the property.
     * @param value The live value from the model.
     * @param resolveDefinition Optional resolver for `$ref` schema definitions.
     * @param depth Current recursion depth guard.
     * @param isDynamicallyRequired Optional dynamic required override.
     * @param activeNodes Path-scoped set of visited schema objects for cycle detection.
     * @param activeRefs Path-scoped set of active `$ref` pointers for cycle detection.
     * @returns Validation outcome with `isValid` and optional `errorMessage`.
     */
    public static validateTree(
        metadata: IPropertyMetadata,
        value: unknown,
        resolveDefinition?: (ref: string) => ISchema | null,
        depth: number = 0,
        isDynamicallyRequired?: boolean,
        activeNodes: WeakSet<object> = new WeakSet<object>(),
        activeRefs: Set<string> = new Set<string>()
    ): { isValid: boolean; errorMessage?: string } {
        // WALKER_EXEMPT: PayloadValidator.validateTree co-inductively validates (metadata, value) pairs across runtime array elements, dictionary entries, and negated `not` sub-schemas.
        if (depth > MAX_SCHEMA_DEPTH) {
            // Reporting valid here is a claim the validator has not checked. Say so: a silent
            // 'isValid: true' from an unvalidated subtree is exactly the plausible-looking green
            // that nobody investigates.
            Logger.warn(
                "[MetaUI PayloadValidator]",
                `Payload nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); this subtree was reported ` +
                    `valid without being validated.`,
                "PayloadValidator"
            );
            return { isValid: true };
        }
        if (metadata.ui?.visible === false) {
            return { isValid: true };
        }
        if (activeNodes.has(metadata)) {
            Logger.warn(
                "[MetaUI PayloadValidator]",
                "Circular schema reference detected; stopping recursion to prevent infinite loop.",
                "PayloadValidator"
            );
            return { isValid: true };
        }
        if (metadata.$ref && activeRefs.has(metadata.$ref)) {
            Logger.warn(
                "[MetaUI PayloadValidator]",
                `Circular $ref detected (${metadata.$ref}); stopping recursion to prevent infinite loop.`,
                "PayloadValidator"
            );
            return { isValid: true };
        }

        let effectiveMeta: IPropertyMetadata = metadata;
        let resolved: ISchema | null = null;
        let resolvedRequiredList: string[] | undefined;
        if (metadata.$ref && resolveDefinition) {
            resolved = resolveDefinition(metadata.$ref);
            if (resolved) {
                if (activeNodes.has(resolved)) {
                    Logger.warn(
                        "[MetaUI PayloadValidator]",
                        `Circular $ref definition detected (${metadata.$ref}); stopping recursion to prevent infinite loop.`,
                        "PayloadValidator"
                    );
                    return { isValid: true };
                }
                effectiveMeta = this.mergeResolvedDefinition(resolved as IPropertyMetadata, metadata);
                if (Array.isArray(resolved.required)) {
                    resolvedRequiredList = resolved.required;
                }
            }
        }

        activeNodes.add(metadata);
        if (metadata.$ref) {
            activeRefs.add(metadata.$ref);
        }
        if (resolved) {
            activeNodes.add(resolved);
        }

        try {
            // 1. Validate top-level constraints on this node (including required, const, enum, integer, min/maxProperties)
            const selfResult = PipelineManager.getInstance().runValidators(value, effectiveMeta, isDynamicallyRequired);
            if (!selfResult.isValid) {
                return selfResult;
            }

            if (value === undefined || value === null) {
                return { isValid: true };
            }

            // 2. Reject a value whose shape contradicts the declared type. Without this, an object or
            // array schema handed a scalar (or a scalar schema handed an object) reported `isValid: true`
            // and skipped the whole subtree, because the recursion below is guarded on the value's shape
            // and no registered validator asserts structure.
            if (!PayloadValidator.matchesStructuralType(effectiveMeta, value)) {
                return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.invalidValue) };
            }

            // 3. A `not` sub-schema rejects exactly the values that satisfy it.
            if (effectiveMeta.not) {
                const notResult = PayloadValidator.evaluateNot(
                    effectiveMeta.not,
                    value,
                    resolveDefinition,
                    depth,
                    activeNodes,
                    activeRefs
                );
                if (!notResult.isValid) {
                    return notResult;
                }
            }

            // 4. Recursively validate object properties and dictionary entries
            if (effectiveMeta.type === "object" && isRecord(value)) {
                if (effectiveMeta.properties) {
                    for (const [propKey, rawPropMeta] of Object.entries(effectiveMeta.properties)) {
                        if (rawPropMeta.ui?.visible === false) {
                            continue;
                        }
                        const needsReqOverride =
                            Boolean(resolvedRequiredList && resolvedRequiredList.includes(propKey)) &&
                            rawPropMeta.required === undefined &&
                            !activeNodes.has(rawPropMeta);
                        const propMeta: IPropertyMetadata = needsReqOverride
                            ? { ...rawPropMeta, required: true }
                            : rawPropMeta;
                        if (needsReqOverride) {
                            activeNodes.add(rawPropMeta);
                        }
                        let childResult: { isValid: boolean; errorMessage?: string };
                        try {
                            childResult = PayloadValidator.validateTree(
                                propMeta,
                                value[propKey],
                                resolveDefinition,
                                depth + 1,
                                undefined,
                                activeNodes,
                                activeRefs
                            );
                        } finally {
                            if (needsReqOverride) {
                                activeNodes.delete(rawPropMeta);
                            }
                        }
                        if (!childResult.isValid) {
                            const label = propMeta.ui?.label || propKey;
                            return {
                                isValid: false,
                                errorMessage: I18n.getText(TEXT_KEY.fieldPrefix, [
                                    label,
                                    childResult.errorMessage || I18n.getText(TEXT_KEY.invalidValue)
                                ])
                            };
                        }
                    }
                }

                if (effectiveMeta.additionalProperties && typeof effectiveMeta.additionalProperties === "object") {
                    const valueMeta = effectiveMeta.additionalProperties;
                    for (const [entryKey, entryVal] of Object.entries(value)) {
                        if (effectiveMeta.properties && entryKey in effectiveMeta.properties) {
                            continue;
                        }
                        const entryResult = PayloadValidator.validateTree(
                            valueMeta,
                            entryVal,
                            resolveDefinition,
                            depth + 1,
                            undefined,
                            activeNodes,
                            activeRefs
                        );
                        if (!entryResult.isValid) {
                            return {
                                isValid: false,
                                errorMessage: I18n.getText(TEXT_KEY.fieldPrefix, [
                                    entryKey,
                                    entryResult.errorMessage || I18n.getText(TEXT_KEY.invalidValue)
                                ])
                            };
                        }
                    }
                }
            }

            // 5. Recursively validate array items
            if (effectiveMeta.type === "array" && Array.isArray(value) && effectiveMeta.items) {
                const itemMeta = effectiveMeta.items;
                for (let i = 0; i < value.length; i++) {
                    const itemResult = PayloadValidator.validateTree(
                        itemMeta,
                        value[i],
                        resolveDefinition,
                        depth + 1,
                        undefined,
                        activeNodes,
                        activeRefs
                    );
                    if (!itemResult.isValid) {
                        return {
                            isValid: false,
                            errorMessage: I18n.getText(TEXT_KEY.rowPrefix, [
                                i + 1,
                                itemResult.errorMessage || I18n.getText(TEXT_KEY.invalidItem)
                            ])
                        };
                    }
                }
            }

            return { isValid: true };
        } finally {
            activeNodes.delete(metadata);
            if (metadata.$ref) {
                activeRefs.delete(metadata.$ref);
            }
            if (resolved) {
                activeNodes.delete(resolved);
            }
        }
    }

    /**
     * Reports whether a live value has a shape this node's own constraints can be applied to.
     *
     * The rule is not "the value matches the declared type" but the narrower "no declared constraint is
     * skipped because of the value's shape". A node that asserts nothing has nothing to skip, so a shape
     * mismatch on it is not an error — which matters because `DataInferenceBuilder` types a column from
     * its first row, and a heterogeneous column must not be reported invalid against the very data it
     * was inferred from. A node that *does* assert something had that assertion silently bypassed: a
     * string handed to `{ type: "object", properties: … }` never reached a single property check, and an
     * object handed to `{ type: "string", maxLength: 1 }` never reached `maxLength`.
     *
     * Scalar types are not separated from one another: a UI5 control legitimately hands back a string for
     * a numeric field until its parser has run, and `IntegerValidatorPlugin` owns the numeric check.
     * `object` is likewise not separated from `array`, for the same inference reason.
     *
     * A value the pipeline already treats as empty (`""`, `[]`, `NaN` — see `isEmptyValue`) is exempt, so
     * this check cannot contradict the short-circuit every other validator honours, and a `Date` instance
     * is a scalar as far as the model is concerned.
     *
     * @param meta The schema metadata for the node.
     * @param value The live value from the model.
     * @returns {boolean} True when the value's shape lets this node's constraints be applied.
     */
    public static matchesStructuralType(meta: IPropertyMetadata, value: unknown): boolean {
        if (isEmptyValue(value) || value instanceof Date) {
            return true;
        }
        const isContainerValue = Array.isArray(value) || isRecord(value);
        const isContainerType = meta.type === SCHEMA_TYPE.OBJECT || meta.type === SCHEMA_TYPE.ARRAY;
        if (isContainerValue === isContainerType) {
            return true;
        }
        return isContainerType
            ? !PayloadValidator.assertsContainerConstraint(meta)
            : !PayloadValidator.assertsScalarConstraint(meta);
    }

    /**
     * True when an object/array node, or anything beneath it, declares something the shape-guarded
     * recursion would have checked. The walk is recursive because the skipped work is the whole subtree:
     * a purely structural node whose leaves assert nothing loses no enforcement when it is skipped, and
     * that is exactly the shape `DataInferenceBuilder` produces for a heterogeneous column.
     */
    private static assertsContainerConstraint(meta: IPropertyMetadata): boolean {
        let found = false;
        SchemaWalker.walk(
            meta,
            (ctx) => {
                const n = ctx.node;
                if (ctx.depth > 0 && PayloadValidator.assertsScalarConstraint(n)) {
                    found = true;
                    return "stop";
                }
                if (
                    typeof n.$ref === "string" ||
                    n.required === true ||
                    (Array.isArray(n.required) && n.required.length > 0) ||
                    n.minProperties !== undefined ||
                    n.maxProperties !== undefined ||
                    n.minItems !== undefined ||
                    n.maxItems !== undefined ||
                    n.uniqueItems === true
                ) {
                    found = true;
                    return "stop";
                }
                return;
            },
            {
                visitRoot: true,
                resolveRefs: false,
                visitAdditionalProperties: true,
                silentTruncationLog: true,
                onTruncate: (_scope, reason) => {
                    if (reason === "depth") {
                        // Returning false skips validation of the whole subtree, so a cap reached here is a
                        // silent loss of enforcement, not a neutral answer.
                        Logger.warn(
                            "[MetaUI PayloadValidator]",
                            `Constraint scan exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); this subtree was treated as ` +
                                `asserting nothing, so any constraint below this level is not enforced.`,
                            "PayloadValidator"
                        );
                    }
                }
            }
        );
        return found;
    }

    /** True when a scalar node declares a value constraint that a container value would bypass. */
    private static assertsScalarConstraint(meta: IPropertyMetadata): boolean {
        return SCALAR_ASSERTION_KEYWORDS.some((keyword) => meta[keyword] !== undefined);
    }

    /**
     * Evaluates a `not` sub-schema. A value that *satisfies* the sub-schema violates the constraint,
     * so the sub-schema is run through {@link PayloadValidator.validateTree} and the verdict inverted.
     *
     * A sub-schema that asserts nothing the pipeline can evaluate would invert to "reject everything",
     * which is worse than the gap it replaces, so it is reported and the value is accepted instead.
     * `SchemaValidator` reports the same condition once per schema, before anything is rendered.
     *
     * @param notMeta The normalized `not` sub-schema.
     * @param value The live value from the model.
     * @param resolveDefinition Optional resolver for `$ref` schema definitions.
     * @param depth Current recursion depth guard.
     * @param activeNodes Path-scoped set of visited schema objects for cycle detection.
     * @param activeRefs Path-scoped set of active `$ref` pointers for cycle detection.
     * @returns {{ isValid: boolean; errorMessage?: string }} Invalid when the value matches the sub-schema.
     */
    private static evaluateNot(
        notMeta: IPropertyMetadata,
        value: unknown,
        resolveDefinition: ((ref: string) => ISchema | null) | undefined,
        depth: number,
        activeNodes: WeakSet<object>,
        activeRefs: Set<string>
    ): { isValid: boolean; errorMessage?: string } {
        // WALKER_EXEMPT: Mutually-recursive helper of PayloadValidator.validateTree for co-inductive (notMeta, value) negation evaluation.
        if (!PayloadValidator.isEvaluableNot(notMeta)) {
            Logger.warn(
                "[MetaUI PayloadValidator]",
                "A 'not' sub-schema declares no constraint this engine can evaluate; it is not enforced. " +
                    "Give it one of: " +
                    EVALUABLE_NOT_KEYWORDS.join(", ") +
                    "."
            );
            return { isValid: true };
        }
        // `validateTree` evaluates a nested `not` itself, so double negation resolves without a second path.
        const matches = PayloadValidator.validateTree(
            notMeta,
            value,
            resolveDefinition,
            depth + 1,
            undefined,
            activeNodes,
            activeRefs
        ).isValid;
        return matches ? { isValid: false, errorMessage: I18n.getText(TEXT_KEY.invalidValue) } : { isValid: true };
    }

    /**
     * Reports whether a `not` sub-schema declares at least one assertion the validation pipeline can
     * evaluate. `SchemaValidator` uses the same predicate so the structural report and the runtime
     * behaviour can never disagree about which `not` blocks are enforced.
     *
     * @param notMeta The normalized `not` sub-schema.
     * @returns {boolean} True when the sub-schema asserts something testable.
     */
    public static isEvaluableNot(notMeta: unknown): boolean {
        return isRecord(notMeta) && EVALUABLE_NOT_KEYWORDS.some((keyword) => notMeta[keyword] !== undefined);
    }

    /**
     * Recursively validates inline and root array/table payloads and missing object/array properties.
     *
     * @param schema The normalized schema node.
     * @param payload The current payload node.
     * @param currentPath The slash-separated property path.
     * @param getPluginByPath Lookup for active plugins registered in the Engine.
     * @param resolveDefinition Optional resolver for `$ref` definitions.
     * @param getDynamicRowRequired Optional lookup for dynamic `$row` policy `required` overrides.
     * @param isPathHidden Optional predicate reporting whether a path is hidden.
     * @param depth Current recursion depth guard.
     * @param activeNodes Path-scoped set of visited schema objects for cycle detection.
     * @param activeRefs Path-scoped set of active `$ref` pointers for cycle detection.
     * @returns {IPluginValidationResult[]} Array of validation outcomes for array/table cells.
     */
    public static validatePayloadArrays(
        schema: ISchema,
        payload: unknown,
        currentPath: string,
        getPluginByPath: (path: string) => IPlugin | undefined,
        resolveDefinition?: (ref: string) => ISchema | null,
        getDynamicRowRequired?: (path: string) => boolean | undefined,
        isPathHidden?: (path: string) => boolean,
        depth: number = 0,
        activeNodes: WeakSet<object> = new WeakSet<object>(),
        activeRefs: Set<string> = new Set<string>()
    ): IPluginValidationResult[] {
        // WALKER_EXEMPT: PayloadValidator.validatePayloadArrays co-inductively walks (schema, payload) across runtime array rows (targetArray[index]) and registered UI5 plugin paths.
        const errors: IPluginValidationResult[] = [];
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                "[MetaUI PayloadValidator]",
                `Array payload walk exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                    `subtree '${currentPath || "/"}' was not validated.`,
                "PayloadValidator"
            );
            return errors;
        }
        if (!schema || payload === null || payload === undefined || typeof payload !== "object") return errors;
        if (currentPath && (getPluginByPath(currentPath) || isPathHidden?.(currentPath))) return errors;
        if (schema.ui?.visible === false) return errors;

        const schemaRef = "$ref" in schema ? (schema as IPropertyMetadata).$ref : undefined;
        if (activeNodes.has(schema) || (schemaRef && activeRefs.has(schemaRef))) {
            Logger.warn(
                "[MetaUI PayloadValidator]",
                "Circular schema or $ref reference detected in validatePayloadArrays; stopping recursion.",
                "PayloadValidator"
            );
            return errors;
        }
        let effectiveSchema: ISchema = schema;
        let resolved: ISchema | null = null;
        if (schemaRef && resolveDefinition) {
            resolved = resolveDefinition(schemaRef);
            if (resolved) {
                if (activeNodes.has(resolved)) {
                    Logger.warn(
                        "[MetaUI PayloadValidator]",
                        `Circular $ref definition detected (${schemaRef}) in validatePayloadArrays; stopping recursion.`,
                        "PayloadValidator"
                    );
                    return errors;
                }
                effectiveSchema = this.mergeResolvedDefinition(resolved as ISchema, schema);
            }
        }
        activeNodes.add(schema);
        if (schemaRef) {
            activeRefs.add(schemaRef);
        }
        if (resolved) {
            activeNodes.add(resolved);
        }
        const parentRequiredList = Array.isArray(effectiveSchema.required) ? effectiveSchema.required : undefined;

        try {
            if (effectiveSchema.type === "object" && effectiveSchema.properties && isRecord(payload)) {
                for (const key of Object.keys(effectiveSchema.properties)) {
                    const rawPropSchema = effectiveSchema.properties[key];
                    const childPath = currentPath ? `${currentPath}/${key}` : key;
                    if (rawPropSchema.ui?.visible === false || isPathHidden?.(childPath)) {
                        continue;
                    }
                    let propSchema: IPropertyMetadata = rawPropSchema;
                    if (rawPropSchema.$ref && resolveDefinition) {
                        if (activeRefs.has(rawPropSchema.$ref)) {
                            Logger.warn(
                                "[MetaUI PayloadValidator]",
                                `Circular $ref detected (${rawPropSchema.$ref}) in validatePayloadArrays; stopping recursion.`,
                                "PayloadValidator"
                            );
                            continue;
                        }
                        const resolvedProp = resolveDefinition(rawPropSchema.$ref);
                        if (resolvedProp) {
                            if (activeNodes.has(resolvedProp)) {
                                Logger.warn(
                                    "[MetaUI PayloadValidator]",
                                    `Circular $ref definition detected (${rawPropSchema.$ref}) ` +
                                        "in validatePayloadArrays; stopping recursion.",
                                    "PayloadValidator"
                                );
                                continue;
                            }
                            propSchema = this.mergeResolvedDefinition(
                                resolvedProp as IPropertyMetadata,
                                rawPropSchema as IPropertyMetadata
                            );
                        }
                    }
                    const isPropRequired =
                        propSchema.required === true || Boolean(parentRequiredList && parentRequiredList.includes(key));
                    if (isPropRequired && propSchema.required !== true && !activeNodes.has(rawPropSchema)) {
                        propSchema = { ...propSchema, required: true };
                    }
                    const childValue = payload[key];
                    if (propSchema.type === "object" || propSchema.type === "array") {
                        if (childValue === undefined) {
                            if (!getPluginByPath(childPath)) {
                                const valToTest =
                                    propSchema.type === "array" && (propSchema.minItems ?? 0) > 0 && !isPropRequired
                                        ? []
                                        : childValue;
                                const selfRes = PipelineManager.getInstance().assembleAndExecute(
                                    propSchema,
                                    valToTest,
                                    isPropRequired
                                );
                                if (!selfRes.isValid) {
                                    errors.push({
                                        isValid: false,
                                        errorMessage: selfRes.errorMessage,
                                        fieldKey: childPath,
                                        fieldLabel: propSchema.ui?.label || key
                                    });
                                }
                            }
                        } else {
                            errors.push(
                                ...PayloadValidator.validatePayloadArrays(
                                    propSchema as ISchema,
                                    childValue,
                                    childPath,
                                    getPluginByPath,
                                    resolveDefinition,
                                    getDynamicRowRequired,
                                    isPathHidden,
                                    depth + 1,
                                    activeNodes,
                                    activeRefs
                                )
                            );
                        }
                    }
                }
            } else if (
                effectiveSchema.type === "array" &&
                (Array.isArray(payload) || (!currentPath && isRecord(payload) && Array.isArray(payload.items)))
            ) {
                const targetArray: unknown[] = Array.isArray(payload)
                    ? payload
                    : ((payload as Record<string, unknown>).items as unknown[]);
                const arrayPathPrefix = Array.isArray(payload) ? currentPath : "items";
                const constraintTargetPath = currentPath || "items";
                const arrayRes = PipelineManager.getInstance().assembleAndExecute(
                    effectiveSchema as IPropertyMetadata,
                    targetArray
                );
                if (!arrayRes.isValid) {
                    const fieldLabel = effectiveSchema.ui?.label || effectiveSchema.title || constraintTargetPath;
                    errors.push({
                        isValid: false,
                        errorMessage: arrayRes.errorMessage,
                        fieldKey: constraintTargetPath,
                        fieldLabel
                    });
                } else {
                    errors.push({ isValid: true, fieldKey: constraintTargetPath });
                }
                if (effectiveSchema.items) {
                    const rawItems = effectiveSchema.items;
                    const resolvedItems = rawItems.$ref ? resolveDefinition?.(rawItems.$ref) || rawItems : rawItems;
                    const reqArray = Array.isArray(resolvedItems?.required) ? resolvedItems.required : undefined;
                    targetArray.forEach((item: unknown, index: number) => {
                        const itemPath = arrayPathPrefix ? `${arrayPathPrefix}/${index}` : `${index}`;
                        if (resolvedItems && resolvedItems.type === "object" && resolvedItems.properties) {
                            const rowRecord = isRecord(item) ? item : {};
                            for (const key of Object.keys(resolvedItems.properties)) {
                                const rawPropMeta = resolvedItems.properties[key];
                                const propPath = `${itemPath}/${key}`;
                                if (rawPropMeta.ui?.visible === false || isPathHidden?.(propPath)) {
                                    errors.push({ isValid: true, fieldKey: propPath });
                                    continue;
                                }
                                const dynReq = getDynamicRowRequired?.(propPath);
                                const isReq =
                                    dynReq !== undefined
                                        ? dynReq
                                        : rawPropMeta.required === true || Boolean(reqArray && reqArray.includes(key));
                                const propMeta: IPropertyMetadata = { ...rawPropMeta, required: isReq };
                                // Every cell goes through validateTree, scalar or not. Routing simple cells
                                // straight to the pipeline skipped the two checks validateTree adds on top of
                                // it — the `not` sub-schema and the structural type guard — so a table column
                                // enforced less than the same property did outside a table.
                                const res = PayloadValidator.validateTree(
                                    propMeta,
                                    rowRecord[key],
                                    resolveDefinition,
                                    depth + 1,
                                    isReq,
                                    activeNodes,
                                    activeRefs
                                );
                                const fieldLabel = propMeta.ui?.label || key;
                                errors.push(
                                    res.isValid
                                        ? { isValid: true, fieldKey: propPath }
                                        : {
                                              isValid: false,
                                              errorMessage: res.errorMessage,
                                              fieldKey: propPath,
                                              fieldLabel
                                          }
                                );
                            }
                        } else if (resolvedItems) {
                            const itemMeta = resolvedItems as IPropertyMetadata;
                            if (itemMeta.ui?.visible === false || isPathHidden?.(itemPath)) {
                                errors.push({ isValid: true, fieldKey: itemPath });
                                return;
                            }
                            const res = PayloadValidator.validateTree(
                                itemMeta,
                                item,
                                resolveDefinition,
                                depth + 1,
                                undefined,
                                activeNodes,
                                activeRefs
                            );
                            const fieldLabel = itemMeta.ui?.label || itemPath;
                            errors.push(
                                res.isValid
                                    ? { isValid: true, fieldKey: itemPath }
                                    : { isValid: false, errorMessage: res.errorMessage, fieldKey: itemPath, fieldLabel }
                            );
                        }
                    });
                }
            }
            return errors;
        } finally {
            activeNodes.delete(schema);
            if (schemaRef) {
                activeRefs.delete(schemaRef);
            }
            if (resolved) {
                activeNodes.delete(resolved);
            }
        }
    }
}
