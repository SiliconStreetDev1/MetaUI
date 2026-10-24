/**
 * @file PluginRegistry.ts
 * @description Centralized hub for mapping UI5 controls to SAP schema data types.
 * Enforces the Registry Pattern to decouple the core engine from specific UI5 control implementations.
 */

import { IPlugin } from "../interfaces/IPlugin";
import { FieldType, ISchema, IPropertyMetadata, ILayoutElement } from "../interfaces/ISchema";
import { SCHEMA_TYPE, LAYOUT_STRATEGY, MAX_SCHEMA_DEPTH, MAX_LAYOUT_DEPTH } from "../constants/MetaUIConstants";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { IPolicyConditionPlugin, IPolicyEffectPlugin } from "../interfaces/IPolicyPlugin";
import { DefaultPluginBootstrapper } from "./DefaultPluginBootstrapper";
import { DefaultLayoutGenerator } from "./DefaultLayoutGenerator";
import { Registry } from "./Registry";
import { SchemaNormalizer } from "./SchemaNormalizer";
import { SchemaWalker, LayoutElementShape, ISchemaWalkOptions, SchemaVisitor } from "./SchemaWalker";
import { Logger } from "../utils/Logger";
import { isRecord } from "../utils/TypeGuards";

/**
 * Central singleton registry mapping `(type, widget)` pairs, layout strategies and policy operators
 * to lazy-loaded UI5 module paths.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class PluginRegistry {
    private static instance: PluginRegistry;

    private readonly fieldIndex: Registry<string> = new Registry<string>("FieldPluginIndex");
    private readonly actionIndex: Registry<string> = new Registry<string>("ActionPluginIndex");
    private readonly layoutIndex: Registry<string> = new Registry<string>("LayoutIndex");
    private readonly policyConditionIndex: Registry<string> = new Registry<string>("PolicyConditionIndex");
    private readonly policyEffectIndex: Registry<string> = new Registry<string>("PolicyEffectIndex");
    private activePromises: Record<string, Promise<unknown>> = {};

    /**
     * Diagnostics already emitted by this registry, keyed by what they describe.
     *
     * A single misconfigured field is walked repeatedly - once per preload scan, once per host and
     * once per validation pass - so an undeduplicated warning was printed nine times for one typo and
     * buried every other message on the page. The warning still fires; it fires once.
     */
    private readonly emittedDiagnostics: Set<string> = new Set<string>();

    /**
     * Memoised policy plugin instances, keyed by operator / effect name.
     *
     * `PolicyEngine` resolves a condition plugin once per condition key per rule and an effect plugin
     * once per *target* per rule, on every evaluation pass. Each unmemoised resolution cost a
     * synchronous `sap.ui.require()` plus a `new Ctor()` - 1.39 us against the ~0.005 us of actual work
     * the instance then performs, which made plugin lookup 40-78% of all policy evaluation time.
     *
     * Memoising is only sound because both policy plugin contracts are stateless: every
     * `IPolicyConditionPlugin.evaluate` and `IPolicyEffectPlugin.resolveState` implementation is a pure
     * function of its arguments, holds no instance fields and has no lifecycle. **A policy plugin that
     * carries per-call state would be shared across every rule in every form by this cache.**
     *
     * `IPlugin` action plugins are deliberately NOT cached: they are `BasePlugin` subclasses that own a
     * rendered control and are destroyed with their field, so sharing one instance across two fields
     * would alias their controls and let one field's `destroy()` tear down the other's.
     */
    private readonly policyConditionInstances: Map<string, IPolicyConditionPlugin> = new Map();
    private readonly policyEffectInstances: Map<string, IPolicyEffectPlugin> = new Map();

    /** Emits `message` as a warning the first time this registry sees `key`, and never again. */
    private warnOnce(key: string, message: string): void {
        if (this.emittedDiagnostics.has(key)) {
            return;
        }
        this.emittedDiagnostics.add(key);
        Logger.warn(message);
    }

    private constructor() {
        DefaultPluginBootstrapper.registerDefaults(this);
    }

    /** @returns {PluginRegistry} The global singleton instance. */
    public static getInstance(): PluginRegistry {
        if (!PluginRegistry.instance) {
            PluginRegistry.instance = new PluginRegistry();
        }
        return PluginRegistry.instance;
    }

    /**
     * Registers a UI5 module path for a `(type, widget)` combination.
     *
     * Goes through {@link Registry.register} so replacing an existing mapping emits the registry's
     * overwrite warning instead of silently shadowing a built-in plugin.
     */
    public registerPluginPath(type: FieldType, widgetName: string | undefined, path: string): void {
        const key = widgetName ? `${type}:${widgetName}` : type;
        this.fieldIndex.register(key, path);
    }

    /**
     * Checks whether a plugin module path is registered for the given `(type, widgetName)` pair.
     *
     * @param type The schema field type.
     * @param widgetName Optional widget name; when omitted, checks the default mapping for `type`.
     * @returns {boolean} True if a mapping exists in the field plugin index.
     */
    public hasPluginPath(type: FieldType, widgetName?: string): boolean {
        const key = widgetName ? `${type}:${widgetName}` : type;
        return this.fieldIndex.has(key);
    }

    /**
     * Returns all widget names registered under the given `type` (excluding the bare default `type` entry).
     *
     * @param type The schema field type to inspect.
     * @returns {string[]} Registered widget names for `type`.
     */
    public getRegisteredWidgets(type: FieldType): string[] {
        const prefix = `${type}:`;
        return this.fieldIndex
            .getKeys()
            .filter((k) => k.startsWith(prefix))
            .map((k) => k.slice(prefix.length));
    }

    /**
     * Checks whether a layout strategy module path is registered.
     *
     * @param strategy The layout strategy name (e.g. `"form"`, `"table"`).
     * @returns {boolean} True if `strategy` is registered in the layout index.
     */
    public hasLayoutPath(strategy: string): boolean {
        return this.layoutIndex.has(strategy);
    }

    /**
     * Returns all registered layout strategy names.
     *
     * @returns {string[]} Registered layout strategy keys.
     */
    public getRegisteredLayouts(): string[] {
        return this.layoutIndex.getKeys();
    }

    /** Registers a custom action plugin path, resolvable through {@link PluginRegistry.getActionPlugin}. */
    public registerActionPath(actionName: string, path: string): void {
        this.actionIndex.register(actionName, path);
    }

    /** Registers a layout strategy module path. */
    public registerLayoutPath(strategy: string, path: string): void {
        this.layoutIndex.register(strategy, path);
    }

    /** Registers a policy condition operator module path, discarding any memoised instance for that key. */
    public registerPolicyConditionPath(conditionKey: string, path: string): void {
        this.policyConditionIndex.register(conditionKey, path);
        this.policyConditionInstances.delete(conditionKey);
    }

    /** Registers a policy effect module path, discarding any memoised instance for that effect. */
    public registerPolicyEffectPath(effectName: string, path: string): void {
        this.policyEffectIndex.register(effectName, path);
        this.policyEffectInstances.delete(effectName);
    }

    private getFieldPath(type: FieldType, widgetName?: string): string {
        let path: string | undefined;
        if (widgetName) {
            path = this.fieldIndex.get(`${type}:${widgetName}`) ?? this.getActionPath(widgetName);
            if (!path) {
                this.warnOnce(
                    `unregistered-widget:${type}:${widgetName}`,
                    `[MetaUI PluginRegistry] Unregistered widget '${widgetName}' for type '${type}'; ` +
                        `falling back to default '${type}' plugin. (Reported once per registry.)`
                );
            }
        }
        if (!path) {
            path = this.fieldIndex.get(type);
        }
        if (!path) {
            throw new Error(`No plugin path mapped for FieldType: ${type} (widget: ${widgetName})`);
        }
        return path;
    }

    private getLayoutPath(strategy: string): string {
        const path = this.layoutIndex.get(strategy);
        if (!path) {
            throw new Error(`No layout path mapped for strategy: ${strategy}`);
        }
        return path;
    }

    /**
     * Statically traverses the schema structure to identify all required plugins
     * and layouts without actually instantiating them.
     *
     * @param {ISchema} schema The root JSON schema payload to traverse.
     * @returns {Set<string>} A distinct set of UI5 module paths required to render the schema.
     */
    public getPathsToLoad(schema: ISchema, normalizedDefinitions?: Record<string, ISchema>): Set<string> {
        const pathsToLoad = new Set<string>();
        const strategy = DefaultLayoutGenerator.resolveLayoutStrategy(schema);
        pathsToLoad.add(this.getLayoutPath(strategy));

        const scanLayoutElements = (
            elements: ILayoutElement[] | undefined,
            propsContext?: Record<string, IPropertyMetadata>
        ): void => {
            if (!Array.isArray(elements)) return;
            const warnedDepthParents = new Set<string>();
            SchemaWalker.walk<ILayoutElement>(
                elements,
                (ctx) => {
                    const el = ctx.node;
                    if (el.widget) {
                        let resolvedType: FieldType = SCHEMA_TYPE.STRING;
                        if (el.scope && propsContext) {
                            // A nested scope such as '#/properties/Header/properties/Code' must be walked in full.
                            // Taking only the last segment looked 'Code' up in the ROOT property map, missed it, and
                            // preloaded the default 'string' plugin - so the real widget failed to render at runtime.
                            const { meta } = SchemaNormalizer.resolveScope(
                                { type: "object", properties: propsContext },
                                el.scope
                            );
                            if (meta?.type) {
                                resolvedType = meta.type;
                            }
                        }
                        try {
                            pathsToLoad.add(this.getFieldPath(resolvedType, el.widget));
                        } catch (e) {
                            // Logger.debug is suppressed in production, which made this the one genuinely
                            // silent failure in the registry: the widget is skipped and the field later
                            // renders as something the schema never asked for, with nothing in the console.
                            this.warnOnce(
                                `unpreloadable-layout-widget:${resolvedType}:${el.widget}`,
                                `[MetaUI PluginRegistry] Skipping preload for uiLayout widget '${el.widget}' on type ` +
                                    `'${resolvedType}': ${(e as Error).message} (Reported once per registry.)`
                            );
                        }
                    }
                },
                {
                    shape: LayoutElementShape,
                    silentTruncationLog: true,
                    onTruncate: (scope, reason) => {
                        if (reason === "cycle") {
                            Logger.warn(
                                "[MetaUI PluginRegistry] Circular uiLayout element reference detected; stopping recursion."
                            );
                            return;
                        }
                        const parentContainer = scope.replace(/\/elements\/\d+$/, "");
                        if (!warnedDepthParents.has(parentContainer)) {
                            warnedDepthParents.add(parentContainer);
                            Logger.warn(
                                `[MetaUI PluginRegistry] uiLayout nesting exceeded MAX_LAYOUT_DEPTH (${MAX_LAYOUT_DEPTH}); ` +
                                    `layout elements below this level were not scanned for plugin preloading.`
                            );
                        }
                    }
                }
            );
        };

        const formatDiagKey = (scope: string, fallbackKey: string): string => {
            const propIdx = scope.lastIndexOf("/properties/");
            const tail =
                propIdx >= 0
                    ? scope.slice(propIdx + "/properties/".length)
                    : scope.startsWith("#/definitions/")
                      ? scope.slice("#/definitions/".length)
                      : scope.startsWith("#/")
                        ? scope.slice(2)
                        : fallbackKey;
            return tail
                .replace(/\/items\//g, ".items.")
                .replace(/\/(oneOf|anyOf|allOf)\/(\d+)/g, ".$1[$2]");
        };

        const arrayItemNodes = new WeakSet<object>();
        const pendingItemTypeNodes = new WeakSet<object>();
        const additionalPropNodes = new WeakSet<object>();

        const addArrayItemFieldPath = (itemNode: IPropertyMetadata): void => {
            if (!pendingItemTypeNodes.has(itemNode)) return;
            pendingItemTypeNodes.delete(itemNode);
            if (itemNode.type || itemNode.ui?.widget) {
                try {
                    pathsToLoad.add(this.getFieldPath(itemNode.type || SCHEMA_TYPE.STRING, itemNode.ui?.widget));
                } catch (e) {
                    const msg =
                        `[MetaUI LazyLoad] Could not find mapped plugin for array item type ` +
                        `${itemNode.type}: ${(e as Error).message}`;
                    Logger.error(msg);
                    throw new Error(msg);
                }
            }
        };

        const visitor: SchemaVisitor = (ctx) => {
            if (ctx.parent && pendingItemTypeNodes.has(ctx.parent) && ctx.parent.properties?.[ctx.key] !== ctx.rawNode) {
                addArrayItemFieldPath(ctx.parent);
            }
            if (ctx.parent && ctx.parent.not === ctx.rawNode && ctx.key === "not") {
                return "skip-subtree";
            }
            if (ctx.parent && additionalPropNodes.has(ctx.parent)) {
                if (ctx.parent.properties?.[ctx.key] !== ctx.rawNode) {
                    return "skip-subtree";
                }
            }
            if (ctx.parent && arrayItemNodes.has(ctx.parent)) {
                if (ctx.parent.additionalProperties === ctx.rawNode && ctx.key === "additionalProperties") {
                    return "skip-subtree";
                }
            }
            if (ctx.parent && ctx.parent.additionalProperties === ctx.rawNode && ctx.key === "additionalProperties") {
                if (typeof ctx.node.type !== "string") {
                    return "skip-subtree";
                }
                const parentScope = ctx.scope.slice(0, -"/additionalProperties".length);
                const parentKey = formatDiagKey(parentScope, ctx.key);
                try {
                    pathsToLoad.add(this.getFieldPath(ctx.node.type, ctx.node.ui?.widget));
                } catch (e) {
                    Logger.warn(
                        `[MetaUI LazyLoad] Could not preload additionalProperties plugin for '${parentKey}': ` +
                            `${(e as Error).message}`
                    );
                }
                if (!ctx.node.properties) {
                    return "skip-subtree";
                }
                additionalPropNodes.add(ctx.node);
                return;
            }
            if (ctx.isArrayItem) {
                if (ctx.node.properties || ctx.node.$ref) {
                    pathsToLoad.add(this.getLayoutPath(LAYOUT_STRATEGY.TABLE));
                }
                pendingItemTypeNodes.add(ctx.node);
                if (!ctx.node.properties) {
                    addArrayItemFieldPath(ctx.node);
                }
                arrayItemNodes.add(ctx.node);
                return;
            }
            if (ctx.node.type || ctx.node.ui?.widget) {
                const diagKey = formatDiagKey(ctx.scope, ctx.key);
                try {
                    pathsToLoad.add(this.getFieldPath(ctx.node.type || SCHEMA_TYPE.STRING, ctx.node.ui?.widget));
                } catch (e) {
                    const msg =
                        `[MetaUI LazyLoad] Could not find mapped plugin for field ${diagKey}: ` +
                        `${(e as Error).message}`;
                    Logger.error(msg);
                    throw new Error(msg);
                }
            }
            return;
        };

        const walkOptions: ISchemaWalkOptions = {
            resolveRefs: false,
            visitCombinators: true,
            silentTruncationLog: true,
            shouldVisitChild: (_child, _key, parent, isArrayItem) => {
                if (isArrayItem) {
                    if (Array.isArray(parent.items)) return false;
                    if (arrayItemNodes.has(parent) || additionalPropNodes.has(parent)) return false;
                }
                return true;
            },
            onLeave: (ctx) => {
                if (ctx.isArrayItem) {
                    addArrayItemFieldPath(ctx.node);
                    arrayItemNodes.delete(ctx.node);
                    return;
                }
                if (ctx.parent && ctx.parent.additionalProperties === ctx.rawNode && ctx.key === "additionalProperties") {
                    additionalPropNodes.delete(ctx.node);
                    return;
                }
                if (ctx.node.uiLayout) {
                    scanLayoutElements(ctx.node.uiLayout, ctx.node.properties);
                }
            },
            onTruncate: (scope, reason) => {
                if (reason === "depth") {
                    Logger.warn(
                        `Schema nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}) at '${scope}'; ` +
                        `plugins below this level were not preloaded.`,
                        undefined,
                        "PluginRegistry"
                    );
                } else {
                    Logger.warn(
                        `Circular schema reference detected at '${scope}'; stopping plugin preload recursion.`,
                        undefined,
                        "PluginRegistry"
                    );
                }
            }
        };

        if (schema.properties) {
            SchemaWalker.walk({ type: SCHEMA_TYPE.OBJECT, properties: schema.properties }, visitor, walkOptions);
        }
        if (schema.items) {
            SchemaWalker.walk(
                { type: SCHEMA_TYPE.ARRAY, items: schema.items },
                visitor,
                { ...walkOptions, visitRoot: true, baseScope: "#/items" }
            );
        }
        if (schema.uiLayout) {
            scanLayoutElements(schema.uiLayout, schema.properties || schema.items?.properties);
        }

        const allDefs: Record<string, ISchema> = {
            ...(schema.definitions || {}),
            ...(normalizedDefinitions || {})
        };
        for (const defKey of Object.keys(allDefs)) {
            const defSchema = allDefs[defKey];
            SchemaWalker.walk(
                {
                    type: defSchema.type || SCHEMA_TYPE.OBJECT,
                    properties: defSchema.properties,
                    items: defSchema.items,
                    oneOf: defSchema.oneOf,
                    anyOf: defSchema.anyOf,
                    allOf: defSchema.allOf,
                    additionalProperties: defSchema.additionalProperties,
                    ui: defSchema.ui
                },
                visitor,
                { ...walkOptions, visitRoot: true, baseScope: `#/definitions/${defKey}` }
            );
        }

        if (schema.uiPolicies) {
            for (const policy of schema.uiPolicies) {
                if (policy.condition) {
                    for (const key of Object.keys(policy.condition)) {
                        const condPath = this.policyConditionIndex.get(key);
                        if (condPath) {
                            pathsToLoad.add(condPath);
                        }
                    }
                }
                if (policy.effect) {
                    const effPath = this.policyEffectIndex.get(policy.effect);
                    if (effPath) {
                        pathsToLoad.add(effPath);
                    }
                }
            }
        }

        return pathsToLoad;
    }

    /**
     * Defers the generation of the UI until every required UI5 module has been resolved one way or
     * the other. Maintains a cache of active promises to prevent redundant network requests for the
     * same module.
     *
     * **This settles; it never rejects.** A single unresolvable module path used to reject the whole
     * batch, which aborted `GeneratorHost` generation and left the user with no form at all. The
     * modules that *did* load are in the require cache either way, so the fields that need them must
     * still render. A field whose module is missing fails later, in `Engine.generateField`, where it
     * degrades to the per-field `[Error generating field X]` placeholder and raises the form-level
     * `MessageStrip` - the same visible degradation a plugin whose `render()` throws already produces.
     *
     * @param {ISchema} schema The root JSON schema payload to parse.
     * @param {Record<string, ISchema>} [normalizedDefinitions] Optional external `$ref` definitions dictionary.
     * @returns {Promise<void>} Resolves once every dependency has either loaded or failed loudly.
     */
    public async preloadDependencies(
        schema: ISchema,
        normalizedDefinitions?: Record<string, ISchema>
    ): Promise<void> {
        const pathsToLoad = this.getPathsToLoad(schema, normalizedDefinitions);
        const orderedPaths = Array.from(pathsToLoad);
        const promises = orderedPaths.map((path) => {
            if (!this.activePromises[path]) {
                this.activePromises[path] = new Promise((resolve, reject) => {
                    sap.ui.require(
                        [path],
                        (Module: unknown) => {
                            if (!this.extractConstructor(Module)) {
                                Logger.error(
                                    `[MetaUI PluginRegistry] Module ${path} loaded successfully but exported no valid constructor.`
                                );
                                delete this.activePromises[path];
                                reject(new Error(`Invalid module export: ${path}`));
                            } else {
                                resolve(Module);
                            }
                        },
                        (err: unknown) => {
                            Logger.error(`Failed to lazy load module: ${path}`);
                            delete this.activePromises[path];
                            reject(err);
                        }
                    );
                });
            }
            return this.activePromises[path];
        });

        const outcomes = await Promise.allSettled(promises);
        const unloadable = orderedPaths.filter((_, index) => outcomes[index].status === "rejected");
        if (unloadable.length > 0) {
            Logger.error(
                `[MetaUI PluginRegistry] ${unloadable.length} of ${orderedPaths.length} required modules could not be ` +
                    `loaded: ${unloadable.join(", ")}. The fields that need them will render an inline error ` +
                    `placeholder; every other field renders normally.`
            );
        }
    }

    /**
     * Extracts a valid plugin or layout constructor from a dynamically required UI5 AMD module.
     * Prefers `Module.default`, then a named `*Plugin` / `*Layout` export, or the sole exported function.
     *
     * @param Module The loaded AMD module value.
     * @returns {unknown} The resolved constructor function, or `null` if none is valid.
     */
    private extractConstructor(Module: unknown): unknown {
        if (!Module) {
            return null;
        }
        if (typeof Module === "function") {
            return Module;
        }
        if (isRecord(Module)) {
            if (typeof Module.default === "function") {
                return Module.default;
            }
            const fnKeys = Object.keys(Module).filter((key) => typeof Module[key] === "function");
            const namedMatch = fnKeys.find((key) => key.endsWith("Plugin") || key.endsWith("Layout"));
            if (namedMatch) {
                return Module[namedMatch];
            }
            if (fnKeys.length === 1) {
                return Module[fnKeys[0]];
            }
        }
        return null;
    }

    /**
     * Reads a static metadata property (`layoutScore` or `isNativelyWide`) from a preloaded plugin class.
     */
    private getStaticPluginProperty<T>(
        type: FieldType,
        widgetName: string | undefined,
        propName: string,
        expectedType: "number" | "boolean",
        fallback: T
    ): T {
        try {
            const path = this.getFieldPath(type, widgetName);
            const Module: unknown = sap.ui.require(path);
            const Constructor = this.extractConstructor(Module) as Record<string, unknown> | null;
            if (Constructor && typeof Constructor[propName] === expectedType) {
                return Constructor[propName] as T;
            }
        } catch (e) {
            Logger.warn(
                `[MetaUI PluginRegistry] Failed to read ${propName} for ${type}:${widgetName ?? "default"}: ${(e as Error).message}`
            );
        }
        return fallback;
    }

    /** Reads the static `layoutScore` heuristic declared on a plugin class, defaulting to 1. */
    public getPluginScore(type: FieldType, widgetName?: string): number {
        return this.getStaticPluginProperty(type, widgetName, "layoutScore", "number", 1);
    }

    /** Reads the static `isNativelyWide` flag declared on a plugin class, defaulting to false. */
    public isPluginNativelyWide(type: FieldType, widgetName?: string): boolean {
        return this.getStaticPluginProperty(type, widgetName, "isNativelyWide", "boolean", false);
    }

    private requireAndConstruct<T>(path: string, kindLabel?: string): T | undefined {
        const Module: unknown = sap.ui.require(path);
        const Ctor = this.extractConstructor(Module) as (new () => T) | null;
        if (!Ctor) {
            if (kindLabel) {
                throw new Error(
                    `[MetaUI ${kindLabel} Instantiation] ${kindLabel} ${path} was not preloaded or has no constructor!`
                );
            }
            return undefined;
        }
        return new Ctor();
    }

    /** Instantiates the requested plugin for the given field type. */
    public getPlugin(type: FieldType, widgetName?: string): IPlugin {
        if (widgetName && !this.fieldIndex.has(`${type}:${widgetName}`)) {
            const actionPlugin = this.getActionPlugin(widgetName);
            if (actionPlugin) {
                return actionPlugin;
            }
        }
        const path = this.getFieldPath(type, widgetName);
        return this.requireAndConstruct<IPlugin>(path, "Plugin")!;
    }

    /** Instantiates the requested layout manager for the given strategy. */
    public getLayout(strategy: string): ILayoutManager {
        const path = this.getLayoutPath(strategy);
        return this.requireAndConstruct<ILayoutManager>(path, "Layout")!;
    }

    /**
     * Resolves the module path registered for a custom action by {@link PluginRegistry.registerActionPath}.
     *
     * @param actionName The registered action name.
     * @returns {string | undefined} The registered module path, or undefined when the action is unknown.
     */
    public getActionPath(actionName: string): string | undefined {
        return this.actionIndex.get(actionName);
    }

    /**
     * Instantiates a custom action plugin registered by {@link PluginRegistry.registerActionPath}.
     *
     * Deliberately **not** memoised, unlike the policy plugin getters: an `IPlugin` owns the control it
     * rendered and is destroyed with its field, so handing two fields the same instance would alias
     * their controls. It is also not on a hot path - `PolicyEngine` is.
     *
     * @param actionName The registered action name.
     * @returns {IPlugin | undefined} The instantiated action plugin, or undefined when unregistered or not preloaded.
     */
    public getActionPlugin(actionName: string): IPlugin | undefined {
        const path = this.actionIndex.get(actionName);
        return path ? this.requireAndConstruct<IPlugin>(path) : undefined;
    }

    /**
     * Resolves a policy plugin instance, memoising it so the hot `PolicyEngine` path pays the
     * `sap.ui.require()` + `new Ctor()` round trip once per key instead of once per rule per pass.
     *
     * A registered key whose module is not in the AMD cache is reported once, explicitly, because
     * `PolicyEngine` cannot tell that case apart from an unknown operator: it logs
     * "Unrecognized condition operator" per rule, per target, per pass, which both misdiagnoses the
     * cause and buries it. Nothing is memoised on that path, so a later
     * {@link PluginRegistry.preloadDependencies} still repairs it.
     */
    private resolvePolicyPlugin<T>(
        kind: "condition" | "effect",
        key: string,
        index: Registry<string>,
        cache: Map<string, T>
    ): T | undefined {
        const cached = cache.get(key);
        if (cached) {
            return cached;
        }
        const path = index.get(key);
        if (!path) {
            return undefined;
        }
        const plugin = this.requireAndConstruct<T>(path);
        if (!plugin) {
            this.warnOnce(
                `unpreloaded-policy-${kind}:${key}`,
                `[MetaUI PluginRegistry] Policy ${kind} '${key}' is registered to '${path}', but that module is not ` +
                    `in the UI5 module cache, so every rule using it is being discarded as unrecognized. Call ` +
                    `preloadDependencies() for the schema before evaluating its policies. (Reported once per registry.)`
            );
            return undefined;
        }
        cache.set(key, plugin);
        return plugin;
    }

    /** Gets a specific condition plugin. Memoised: see {@link PluginRegistry.resolvePolicyPlugin}. */
    public getPolicyConditionPlugin(conditionKey: string): IPolicyConditionPlugin | undefined {
        return this.resolvePolicyPlugin<IPolicyConditionPlugin>(
            "condition",
            conditionKey,
            this.policyConditionIndex,
            this.policyConditionInstances
        );
    }

    /** Gets a specific effect plugin. Memoised: see {@link PluginRegistry.resolvePolicyPlugin}. */
    public getPolicyEffectPlugin(effectName: string): IPolicyEffectPlugin | undefined {
        return this.resolvePolicyPlugin<IPolicyEffectPlugin>(
            "effect",
            effectName,
            this.policyEffectIndex,
            this.policyEffectInstances
        );
    }
}
