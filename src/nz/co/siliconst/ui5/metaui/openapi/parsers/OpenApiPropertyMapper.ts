/**
 * @file OpenApiPropertyMapper.ts
 * @description Extracts and maps OpenAPI properties into MetaUI IPropertyMetadata using strict type guards.
 */

import { IPropertyMetadata } from "../../interfaces/ISchema";
import { OpenApiRefResolver } from "../OpenApiRefResolver";
import { OpenApiUIMapper } from "../OpenApiUIMapper";
import { OpenApiConstraintMapper } from "./OpenApiConstraintMapper";
import { DataInferenceBuilder } from "../../core/DataInferenceBuilder";
import {
    DeclinedSchemaFieldsMap,
    IPropertyProducerContract,
    SchemaDirectiveNormalizer
} from "../../core/SchemaDirectiveNormalizer";
import { ITreeChild, ITreeShape, RawRecordShape, SchemaWalker } from "../../core/SchemaWalker";
import { WIDGET_TYPE, MAX_SCHEMA_DEPTH } from "../../constants/MetaUIConstants";
import { Logger } from "../../utils/Logger";
import {
    JsonRecord,
    isRecord,
    readString,
    readBoolean,
    readRecord,
    readStringArray
} from "../../utils/TypeGuards";

/** Internal descriptor for a polymorphic (`oneOf` / `anyOf`) child branch during `OpenApiPropertyMapper` traversal. */
interface IOpenApiPolymorphicBranchTask {
    node: IOpenApiMappingNode;
    isRawRecord: boolean;
    refPath?: string;
    refName?: string;
    inlined?: JsonRecord;
    explicitTitle?: string;
    branchReq?: string[];
}

/** Internal mutable frame walked by `SchemaWalker` during `OpenApiPropertyMapper.mapPropertyMetadata`. */
interface IOpenApiMappingNode {
    rawProp: unknown;
    keyName: string;
    isRequired: boolean;
    activeRefs: Set<string>;
    result?: IPropertyMetadata;
    refPath?: string;
    inlineChild?: IOpenApiMappingNode;
    metaProp?: IPropertyMetadata;
    currentProp?: JsonRecord;
    resolvedType?: string;
    oneOfBranches?: IOpenApiPolymorphicBranchTask[];
    anyOfBranches?: IOpenApiPolymorphicBranchTask[];
    notChild?: IOpenApiMappingNode;
    propChildren?: IOpenApiMappingNode[];
    additionalPropChild?: IOpenApiMappingNode;
    itemsChild?: IOpenApiMappingNode;
}

/** Tree shape yielding the prepared child tasks of an `IOpenApiMappingNode` in pre-order sequence. */
const OpenApiMappingShape: ITreeShape<IOpenApiMappingNode> = {
    defaultMaxDepth: MAX_SCHEMA_DEPTH,
    *children(node: IOpenApiMappingNode): Iterable<ITreeChild<IOpenApiMappingNode>> {
        if (node.inlineChild) {
            yield {
                key: node.inlineChild.keyName,
                node: node.inlineChild,
                kind: "branch",
                branchKeyword: "$ref",
                scopeSegment: "$ref",
                bindingSegment: node.inlineChild.keyName
            };
            return;
        }
        if (node.oneOfBranches) {
            for (let i = 0; i < node.oneOfBranches.length; i++) {
                const child = node.oneOfBranches[i].node;
                const idxKey = String(i);
                yield {
                    key: idxKey,
                    node: child,
                    kind: "branch",
                    branchKeyword: "oneOf",
                    scopeSegment: `oneOf/${idxKey}`,
                    bindingSegment: `oneOf/${idxKey}`
                };
            }
        }
        if (node.anyOfBranches) {
            for (let i = 0; i < node.anyOfBranches.length; i++) {
                const child = node.anyOfBranches[i].node;
                const idxKey = String(i);
                yield {
                    key: idxKey,
                    node: child,
                    kind: "branch",
                    branchKeyword: "anyOf",
                    scopeSegment: `anyOf/${idxKey}`,
                    bindingSegment: `anyOf/${idxKey}`
                };
            }
        }
        if (node.notChild) {
            yield {
                key: "not",
                node: node.notChild,
                kind: "branch",
                branchKeyword: "not",
                scopeSegment: "not",
                bindingSegment: "not"
            };
        }
        if (node.propChildren) {
            for (const child of node.propChildren) {
                yield {
                    key: child.keyName,
                    node: child,
                    kind: "property",
                    scopeSegment: `properties/${child.keyName}`,
                    bindingSegment: child.keyName
                };
            }
        }
        if (node.additionalPropChild) {
            yield {
                key: "additionalProperties",
                node: node.additionalPropChild,
                kind: "additional",
                branchKeyword: "additionalProperties",
                scopeSegment: "additionalProperties",
                bindingSegment: "additionalProperties"
            };
        }
        if (node.itemsChild) {
            yield {
                key: "items",
                node: node.itemsChild,
                kind: "item",
                scopeSegment: "items",
                bindingSegment: "items"
            };
        }
    }
};

/**
 * Members of `IPropertyMetadata` and `IUIDirective` that the OpenAPI producer
 * (`OpenApiPropertyMapper` + `OpenApiConstraintMapper` + `OpenApiUIMapper`) deliberately does not write.
 *
 * Bare keys name `IPropertyMetadata` members; `ui.`-prefixed keys name `IUIDirective` members.
 * Every member must either be written by one of those three classes or appear here with a reason,
 * or the `[PRODUCER_COMPLETENESS]` gate in `scripts/run-tests.js` fails the build.
 *
 * OpenApiUIMapper.build writes exactly the subset an OpenAPI document expresses by itself: label
 * (from title), readOnly, widget and format. Every other `ui` directive is author-supplied and is
 * carried verbatim by the `Object.assign(ui, swaggerProp.ui)` pass-through, then normalized by
 * `SchemaDirectiveNormalizer.normalizeUI` -- every OpenAPI result is re-normalized, because
 * `GenerationDelegate.prepareSchemaAndData` feeds the builder output into `SchemaNormalizer.normalize`.
 * Normalizing them twice here would duplicate that logic, which is the divergence this gate prevents.
 * The gate separately asserts the Object.assign pass-through still exists, because these declines
 * depend on it.
 */
export const DECLINED_SCHEMA_FIELDS: DeclinedSchemaFieldsMap = {
    allOf:
        "OpenApiConstraintMapper.resolveAllOf merges every branch into the parent before mapping, so each " +
            "branch's properties and constraints already appear on the parent; the unmerged branches have no " +
            "remaining consumer (PluginRegistry.getPathsToLoad reaches the same plugin set through the merged properties).",

    "ui.isKey":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.visible":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.enabled":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.visibleOn":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.enabledOn":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.valueState":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.rows":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.expandable":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.fullWidth":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.controlProps":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.options":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.dataSource":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.validators":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.formatter":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.formatters":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.args":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.dialogButtonText":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.layoutBudget":
        "Author-supplied directive carried verbatim by OpenApiUIMapper's Object.assign; LayoutScorer also sets it from the measured " +
            "footprint after normalization, so this producer must not guess at one.",
    "ui.renderMode":
        "Author-supplied directive carried verbatim by OpenApiUIMapper's Object.assign; LayoutScorer decides inline vs dialog from " +
            "the measured footprint after normalization, so a value written here would be overwritten or would pre-empt the scorer.",
    "ui.labelSpan":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
};

/**
 * Translates OpenAPI 2.0 and 3.0 property definitions into normalized MetaUI `IPropertyMetadata` descriptors.
 *
 * @namespace nz.co.siliconst.ui5.metaui.openapi.parsers
 * @public
 */
export class OpenApiPropertyMapper {
    /** Shared producer contract descriptor for OpenAPI 2.0/3.0 property metadata extraction. */
    public static readonly PRODUCER_CONTRACT: IPropertyProducerContract<unknown, unknown> = {
        name: "OpenApiPropertyMapper",
        declinedFields: DECLINED_SCHEMA_FIELDS,
        extractPropertyMetadata: (
            input: unknown,
            keyName: string,
            isRequired: boolean,
            openApiRoot?: unknown
        ): IPropertyMetadata => OpenApiPropertyMapper.mapPropertyMetadata(input, keyName, isRequired, openApiRoot)
    };

    /**
     * Recursively translates an OpenAPI `properties` block into a MetaUI `IPropertyMetadata` dictionary.
     *
     * @param properties The OpenAPI `properties` record.
     * @param requiredKeys Array of required property keys from the parent object.
     * @param openApiRoot The OpenAPI root document for resolving `$ref` pointers.
     * @param depth Current recursion depth to prevent stack overflows on circular references.
     * @param activeRefs Set of active `$ref` strings on the recursion stack.
     * @returns {Record<string, IPropertyMetadata>} The normalized MetaUI property dictionary.
     */
    public static mapProperties(
        properties: unknown,
        requiredKeys: string[],
        openApiRoot: unknown,
        depth: number = 0,
        activeRefs: Set<string> = new Set()
    ): Record<string, IPropertyMetadata> {
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                `Nested schema exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                `${isRecord(properties) ? Object.keys(properties).length : 0} propert(ies) were dropped.`,
                undefined,
                "OpenApiPropertyMapper"
            );
            return normalizedProps;
        }
        if (!isRecord(properties)) {
            return normalizedProps;
        }
        const rootContainer: JsonRecord = { properties };
        SchemaWalker.walk(
            rootContainer,
            (ctx) => {
                const isRequired = requiredKeys.includes(ctx.key);
                // Not depth + 1: mapProperties and mapPropertyMetadata are the two halves of a
                // single nesting level (mapProperties -> mapPropertyMetadata -> applyNestedTypes
                // -> mapProperties). Incrementing in both halves charged two units per level and
                // made MAX_SCHEMA_DEPTH bite at half its stated value.
                normalizedProps[ctx.key] = this.mapPropertyMetadata(
                    ctx.node,
                    ctx.key,
                    isRequired,
                    openApiRoot,
                    depth,
                    activeRefs
                );
                return "skip-subtree";
            },
            {
                shape: RawRecordShape,
                maxDepth: 0,
                silentTruncationLog: true,
                onInvalidProperty: (propKey) => {
                    const isRequired = requiredKeys.includes(propKey);
                    normalizedProps[propKey] = this.mapPropertyMetadata(
                        {},
                        propKey,
                        isRequired,
                        openApiRoot,
                        depth,
                        activeRefs
                    );
                }
            }
        );

        return normalizedProps;
    }

    /**
     * Translates a single OpenAPI property schema block into a MetaUI `IPropertyMetadata` descriptor.
     *
     * @param swaggerProp The raw OpenAPI property schema to map.
     * @param keyName The property key name.
     * @param isRequired Whether this property is mandatory on its parent object.
     * @param openApiRoot The OpenAPI root document for resolving `$ref` pointers.
     * @param depth Current recursion depth.
     * @param activeRefs Set of active `$ref` strings on the recursion stack.
     * @returns {IPropertyMetadata} The normalized MetaUI property metadata.
     */
    public static mapPropertyMetadata(
        swaggerProp: unknown,
        keyName: string,
        isRequired: boolean,
        openApiRoot: unknown,
        depth: number = 0,
        activeRefs: Set<string> = new Set()
    ): IPropertyMetadata {
        const rootTask: IOpenApiMappingNode = {
            rawProp: swaggerProp,
            keyName,
            isRequired,
            activeRefs
        };
        const maxDepth = MAX_SCHEMA_DEPTH - depth;

        SchemaWalker.walk(
            rootTask,
            (ctx) => {
                const task = ctx.node;
                let currentProp: JsonRecord = isRecord(task.rawProp) ? task.rawProp : {};

                const refResult = this.resolveReference(task, currentProp, openApiRoot);
                if (refResult) {
                    task.result = refResult;
                    return "skip-subtree";
                }
                if (task.inlineChild) {
                    return;
                }

                currentProp = OpenApiConstraintMapper.resolveAllOf(currentProp, openApiRoot, 0, task.activeRefs);

                const { type } = SchemaDirectiveNormalizer.resolveSchemaType(currentProp);
                const metaProp: IPropertyMetadata = {
                    type,
                    title: readString(currentProp, "title"),
                    description: readString(currentProp, "description"),
                    format: readString(currentProp, "format"),
                    required: task.isRequired
                };

                const uiDirective = OpenApiUIMapper.build(currentProp, task.keyName);
                if (Object.keys(uiDirective).length > 0) {
                    metaProp.ui = uiDirective;
                }

                OpenApiConstraintMapper.applyConstraints(metaProp, currentProp);
                OpenApiConstraintMapper.applyStateModifiers(metaProp, currentProp);

                // A MetaUI 'uiLayout' block authored inside an OpenAPI property schema was dropped here,
                // so the layout silently vanished for OpenAPI sources while surviving for JSON Schema.
                // Found by [PRODUCER_COMPLETENESS]. Validation is shared with SchemaNormalizer and is
                // deliberately loud: an unknown element type throws rather than hiding a field.
                const mappedLayout = SchemaDirectiveNormalizer.normalizeLayout(currentProp.uiLayout);
                if (mappedLayout) {
                    metaProp.uiLayout = mappedLayout;
                }

                const enumValues = SchemaDirectiveNormalizer.normalizeEnum(currentProp.enum);
                if (enumValues) {
                    metaProp.enum = enumValues;
                    metaProp.valueHelp = enumValues.map((val) => ({ key: String(val), text: String(val) }));
                    metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.SELECT, valueHelp: metaProp.valueHelp };
                } else if (Array.isArray(currentProp.enum)) {
                    this.applyUnsatisfiableEnum(metaProp, task.keyName);
                }

                task.metaProp = metaProp;
                task.currentProp = currentProp;
                task.resolvedType = type;

                this.prepareChildTasks(task, currentProp, type, openApiRoot, ctx.depth + 1 > maxDepth);
                return;
            },
            {
                shape: OpenApiMappingShape,
                visitRoot: true,
                maxDepth,
                silentTruncationLog: true,
                onTruncate: (_scope, _reason, rawNode) => {
                    if (!rawNode) {
                        return;
                    }
                    // The descriptor below is a placeholder, not a mapping: the real type and every
                    // constraint on this property are discarded. Say so rather than letting a field
                    // silently render as an empty object.
                    Logger.warn(
                        `Property '${rawNode.keyName}' exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                        `its type and constraints were not mapped.`,
                        undefined,
                        "OpenApiPropertyMapper"
                    );
                    rawNode.result = {
                        type: "object",
                        ui: { label: DataInferenceBuilder.generateLabel(rawNode.keyName) }
                    };
                },
                onLeave: (ctx) => {
                    const task = ctx.node;
                    if (task.inlineChild && task.inlineChild.result) {
                        const mapped = task.inlineChild.result;
                        if (task.keyName === "items" && task.refPath) {
                            mapped.$ref = task.refPath;
                        }
                        task.result = mapped;
                        return;
                    }
                    if (task.metaProp && task.currentProp && task.resolvedType) {
                        this.applyPolymorphism(task.metaProp, task.currentProp, task);
                        this.applyNestedTypes(task.metaProp, task.currentProp, task.resolvedType, task);
                        task.result = task.metaProp;
                    }
                }
            }
        );

        return rootTask.result || {
            type: "object",
            ui: { label: DataInferenceBuilder.generateLabel(keyName) }
        };
    }

    /**
     * Renders a property whose `enum` admits no value at all — normally the result of an `allOf` composition
     * whose branches declare disjoint enums. Dropping the empty list would turn an unsatisfiable field into a
     * free-text input, so the field is published as an empty, disabled select and the contradiction is logged.
     */
    private static applyUnsatisfiableEnum(metaProp: IPropertyMetadata, keyName: string): void {
        Logger.error(
            `Property '${keyName}' has an empty 'enum': no value satisfies it. ` +
            `Rendering it as a disabled, empty selection rather than as unconstrained free text.`,
            undefined,
            "OpenApiPropertyMapper"
        );
        metaProp.enum = [];
        metaProp.valueHelp = [];
        metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.SELECT, valueHelp: [], enabled: false };
    }

    private static prepareChildTasks(
        task: IOpenApiMappingNode,
        currentProp: JsonRecord,
        type: string,
        openApiRoot: unknown,
        nextLevelExceedsDepth: boolean
    ): void {
        if (Array.isArray(currentProp.oneOf)) {
            task.oneOfBranches = currentProp.oneOf.map((item, i) =>
                this.preparePolymorphicBranch(item, `Variant${i}`, openApiRoot, task.activeRefs)
            );
        }

        if (Array.isArray(currentProp.anyOf)) {
            task.anyOfBranches = currentProp.anyOf.map((item, i) =>
                this.preparePolymorphicBranch(item, `AnyVariant${i}`, openApiRoot, task.activeRefs)
            );
        }

        if (isRecord(currentProp.not)) {
            task.notChild = {
                rawProp: currentProp.not,
                keyName: "NotVariant",
                isRequired: false,
                activeRefs: task.activeRefs
            };
        }

        if (type === "object") {
            const rawProps = readRecord(currentProp, "properties");
            if (rawProps) {
                if (nextLevelExceedsDepth) {
                    Logger.warn(
                        `Nested schema exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                        `${Object.keys(rawProps).length} propert(ies) were dropped.`,
                        undefined,
                        "OpenApiPropertyMapper"
                    );
                    task.propChildren = [];
                } else {
                    const childRequired = readStringArray(currentProp, "required") || [];
                    task.propChildren = Object.keys(rawProps).map((key) => {
                        const rawChild = rawProps[key];
                        return {
                            rawProp: isRecord(rawChild) ? rawChild : {},
                            keyName: key,
                            isRequired: childRequired.includes(key),
                            activeRefs: task.activeRefs
                        };
                    });
                }
            }

            if (isRecord(currentProp.additionalProperties)) {
                task.additionalPropChild = {
                    rawProp: currentProp.additionalProperties,
                    keyName: "value",
                    isRequired: false,
                    activeRefs: task.activeRefs
                };
            }
        } else if (type === "array" && isRecord(currentProp.items)) {
            task.itemsChild = {
                rawProp: currentProp.items,
                keyName: "items",
                isRequired: false,
                activeRefs: task.activeRefs
            };
        }
    }

    private static preparePolymorphicBranch(
        rawItem: unknown,
        fallbackName: string,
        openApiRoot: unknown,
        activeRefs: Set<string>
    ): IOpenApiPolymorphicBranchTask {
        if (!isRecord(rawItem)) {
            return {
                isRawRecord: false,
                node: {
                    rawProp: {},
                    keyName: fallbackName,
                    isRequired: false,
                    activeRefs
                }
            };
        }
        const refPath = readString(rawItem, "$ref");
        if (refPath && !activeRefs.has(refPath)) {
            const resolvedBranch = SchemaDirectiveNormalizer.inlinePolymorphicBranchRef(rawItem, refPath, openApiRoot);
            if (resolvedBranch) {
                const { inlined, refName } = resolvedBranch;
                const nextRefs = new Set(activeRefs);
                nextRefs.add(refPath);
                return {
                    isRawRecord: true,
                    refPath,
                    refName,
                    inlined,
                    node: {
                        rawProp: inlined,
                        keyName: refName,
                        isRequired: false,
                        activeRefs: nextRefs
                    }
                };
            }
        }
        const explicitTitle = readString(rawItem, "title");
        return {
            isRawRecord: true,
            explicitTitle,
            branchReq: readStringArray(rawItem, "required"),
            node: {
                rawProp: rawItem,
                keyName: explicitTitle || "",
                isRequired: false,
                activeRefs
            }
        };
    }

    private static resolveReference(
        task: IOpenApiMappingNode,
        currentProp: JsonRecord,
        openApiRoot: unknown
    ): IPropertyMetadata | null {
        const refPath = readString(currentProp, "$ref");
        if (!refPath) {
            return null;
        }

        const uiDirective = OpenApiUIMapper.build(currentProp, task.keyName);
        if (task.activeRefs.has(refPath)) {
            return {
                type: "object",
                $ref: refPath,
                title: readString(currentProp, "title"),
                description: readString(currentProp, "description"),
                required: task.isRequired,
                nullable: readBoolean(currentProp, "nullable"),
                readOnly: readBoolean(currentProp, "readOnly"),
                ui: { ...uiDirective, widget: WIDGET_TYPE.REFERENCE }
            };
        }

        const resolvedRaw = OpenApiRefResolver.resolve(refPath, openApiRoot);
        const resolved = isRecord(resolvedRaw) ? resolvedRaw : undefined;
        const resolvedType = readString(currentProp, "type") || (resolved ? readString(resolved, "type") : undefined);
        const isPolymorphicRef =
            resolved !== undefined &&
            (Array.isArray(resolved.oneOf) || Array.isArray(resolved.anyOf) || resolved.discriminator !== undefined);

        if (
            (resolvedType && ["string", "number", "integer", "boolean"].includes(resolvedType)) ||
            isPolymorphicRef ||
            task.keyName === "items"
        ) {
            const inlineProp: JsonRecord = { ...(resolved || {}), ...currentProp };
            delete inlineProp.$ref;
            const nextRefs = new Set(task.activeRefs);
            nextRefs.add(refPath);
            task.refPath = refPath;
            task.inlineChild = {
                rawProp: inlineProp,
                keyName: task.keyName,
                isRequired: task.isRequired,
                activeRefs: nextRefs
            };
            return null;
        }

        const resolvedTitle = readString(currentProp, "title") || (resolved ? readString(resolved, "title") : undefined);
        const resolvedDesc =
            readString(currentProp, "description") || (resolved ? readString(resolved, "description") : undefined);

        return {
            type: "object",
            $ref: refPath,
            title: resolvedTitle,
            description: resolvedDesc,
            required: task.isRequired,
            nullable: readBoolean(currentProp, "nullable"),
            readOnly: readBoolean(currentProp, "readOnly"),
            ui: { ...uiDirective, widget: WIDGET_TYPE.REFERENCE }
        };
    }

    private static applyPolymorphism(
        metaProp: IPropertyMetadata,
        currentProp: JsonRecord,
        task: IOpenApiMappingNode
    ): void {
        OpenApiConstraintMapper.applyDiscriminator(metaProp, currentProp);

        if (task.oneOfBranches) {
            metaProp.oneOf = task.oneOfBranches.map((branch) => this.mapPolymorphicBranch(branch));
        }

        if (task.anyOfBranches) {
            metaProp.anyOf = task.anyOfBranches.map((branch) => this.mapPolymorphicBranch(branch));
        }

        if (task.notChild && task.notChild.result) {
            metaProp.not = task.notChild.result;
        }

        if (metaProp.oneOf || metaProp.anyOf || metaProp.discriminator) {
            metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.POLYMORPHIC };
        }
    }

    private static mapPolymorphicBranch(branch: IOpenApiPolymorphicBranchTask): IPropertyMetadata {
        const mapped: IPropertyMetadata = branch.node.result || { type: "object" };
        if (branch.inlined && branch.refPath && branch.refName) {
            mapped.$ref = branch.refPath;
            mapped.title = readString(branch.inlined, "title") || branch.refName;
            const resolvedReq = readStringArray(branch.inlined, "required");
            if (resolvedReq) {
                mapped.required = resolvedReq;
            }
            return mapped;
        }
        if (branch.isRawRecord) {
            if (!branch.explicitTitle && mapped.ui && !mapped.ui.label) {
                delete mapped.ui.label;
            }
            if (branch.branchReq) {
                mapped.required = branch.branchReq;
            }
        }
        return mapped;
    }

    private static applyNestedTypes(
        metaProp: IPropertyMetadata,
        currentProp: JsonRecord,
        type: string,
        task: IOpenApiMappingNode
    ): void {
        if (type === "object") {
            const rawProps = readRecord(currentProp, "properties");
            if (rawProps) {
                const mappedProps: Record<string, IPropertyMetadata> = {};
                if (task.propChildren) {
                    for (const child of task.propChildren) {
                        if (child.result) {
                            mappedProps[child.keyName] = child.result;
                        }
                    }
                }
                metaProp.properties = mappedProps;
            }

            if (currentProp.additionalProperties === true) {
                metaProp.additionalProperties = true;
            } else if (currentProp.additionalProperties === false) {
                // A closed object. Carried through verbatim: DataInferenceBuilder.mergeHybridProperties
                // keys off `=== false` to stop inferred keys leaking into it.
                metaProp.additionalProperties = false;
            } else if (task.additionalPropChild && task.additionalPropChild.result) {
                metaProp.additionalProperties = task.additionalPropChild.result;
                metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.DICTIONARY_MAP };
            }

            if (
                !rawProps &&
                !currentProp.additionalProperties &&
                !metaProp.oneOf &&
                !metaProp.anyOf &&
                !metaProp.enum &&
                !metaProp.format &&
                !metaProp.ui?.widget
            ) {
                metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.CODE_EDITOR };
            }
        } else if (type === "array" && task.itemsChild && task.itemsChild.result) {
            metaProp.items = task.itemsChild.result;
            if (metaProp.items.type !== "object") {
                const itemEnum = metaProp.items.enum;
                metaProp.ui = {
                    ...(metaProp.ui || {}),
                    widget: itemEnum && itemEnum.length > 0 ? WIDGET_TYPE.MULTI_SELECT : WIDGET_TYPE.MULTI_INPUT
                };
            }
        }
    }
}
