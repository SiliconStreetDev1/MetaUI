/**
 * @file PluginRegistry.ts
 * @description Centralized hub for mapping UI5 controls to SAP schema data types.
 * Enforces the Registry Pattern to decouple the core engine from specific UI5 control implementations.
 */

import { IPlugin } from "../interfaces/IPlugin";
import { FieldType, ISchema, IPropertyMetadata, ILayoutElement } from "../interfaces/ISchema";
import { SCHEMA_TYPE, LAYOUT_STRATEGY } from "../constants/MetaUIConstants";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { IPolicyConditionPlugin, IPolicyEffectPlugin } from "../interfaces/IPolicyPlugin";
import { DefaultPluginBootstrapper } from "./DefaultPluginBootstrapper";
import { Registry } from "./Registry";
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

    /** Registers a UI5 module path for a `(type, widget)` combination. */
    public registerPluginPath(type: FieldType, widgetName: string | undefined, path: string): void {
        const key = widgetName ? `${type}:${widgetName}` : type;
        this.fieldIndex.items.set(key, path);
    }

    /** Registers a custom action plugin path. */
    public registerActionPath(actionName: string, path: string): void {
        this.actionIndex.items.set(actionName, path);
    }

    /** Registers a layout strategy module path. */
    public registerLayoutPath(strategy: string, path: string): void {
        this.layoutIndex.items.set(strategy, path);
    }

    /** Registers a policy condition operator module path. */
    public registerPolicyConditionPath(conditionKey: string, path: string): void {
        this.policyConditionIndex.items.set(conditionKey, path);
    }

    /** Registers a policy effect module path. */
    public registerPolicyEffectPath(effectName: string, path: string): void {
        this.policyEffectIndex.items.set(effectName, path);
    }

    private getFieldPath(type: FieldType, widgetName?: string): string {
        let path: string | undefined;
        if (widgetName) {
            path = this.fieldIndex.get(`${type}:${widgetName}`);
            if (!path) {
                Logger.warn(
                    `[MetaUI PluginRegistry] Unregistered widget '${widgetName}' for type '${type}'; ` +
                        `falling back to default '${type}' plugin.`
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
        const strategy =
            schema.layoutStrategy || (schema.type === SCHEMA_TYPE.ARRAY ? LAYOUT_STRATEGY.TABLE : LAYOUT_STRATEGY.FORM);
        pathsToLoad.add(this.getLayoutPath(strategy));

        const scanProperty = (prop: IPropertyMetadata, key: string): void => {
            if (!prop || typeof prop !== "object") return;
            if (prop.type || prop.ui?.widget) {
                try {
                    pathsToLoad.add(this.getFieldPath(prop.type || SCHEMA_TYPE.STRING, prop.ui?.widget));
                } catch (e) {
                    const msg = `[MetaUI LazyLoad] Could not find mapped plugin for field ${key}: ${(e as Error).message}`;
                    Logger.error(msg);
                    throw new Error(msg);
                }
            }
            if (prop.properties) scanProperties(prop.properties);
            if (prop.items) {
                if (prop.items.properties || prop.items.$ref) {
                    pathsToLoad.add(this.getLayoutPath(LAYOUT_STRATEGY.TABLE));
                    if (prop.items.properties) {
                        scanProperties(prop.items.properties);
                    }
                }
                if (prop.items.type || prop.items.ui?.widget) {
                    try {
                        pathsToLoad.add(this.getFieldPath(prop.items.type || SCHEMA_TYPE.STRING, prop.items.ui?.widget));
                    } catch (e) {
                        const msg =
                            `[MetaUI LazyLoad] Could not find mapped plugin for array item type ` +
                            `${prop.items.type}: ${(e as Error).message}`;
                        Logger.error(msg);
                        throw new Error(msg);
                    }
                }
                if (prop.items.oneOf) prop.items.oneOf.forEach((b, idx) => scanProperty(b, `${key}.items.oneOf[${idx}]`));
                if (prop.items.anyOf) prop.items.anyOf.forEach((b, idx) => scanProperty(b, `${key}.items.anyOf[${idx}]`));
                if (prop.items.allOf) prop.items.allOf.forEach((b, idx) => scanProperty(b, `${key}.items.allOf[${idx}]`));
            }
            if (isRecord(prop.additionalProperties) && typeof prop.additionalProperties.type === "string") {
                const addProp = prop.additionalProperties as IPropertyMetadata;
                try {
                    pathsToLoad.add(this.getFieldPath(addProp.type, addProp.ui?.widget));
                } catch (e) {
                    Logger.warn(
                        `[MetaUI LazyLoad] Could not preload additionalProperties plugin for '${key}': ${(e as Error).message}`
                    );
                }
                if (addProp.properties) scanProperties(addProp.properties);
            }
            if (prop.oneOf) prop.oneOf.forEach((b, idx) => scanProperty(b, `${key}.oneOf[${idx}]`));
            if (prop.anyOf) prop.anyOf.forEach((b, idx) => scanProperty(b, `${key}.anyOf[${idx}]`));
            if (prop.allOf) prop.allOf.forEach((b, idx) => scanProperty(b, `${key}.allOf[${idx}]`));
            if (prop.uiLayout) scanLayoutElements(prop.uiLayout, prop.properties);
        };

        const scanProperties = (props: Record<string, IPropertyMetadata>): void => {
            for (const key of Object.keys(props)) {
                scanProperty(props[key], key);
            }
        };

        const scanLayoutElements = (
            elements: ILayoutElement[] | undefined,
            propsContext?: Record<string, IPropertyMetadata>
        ): void => {
            if (!Array.isArray(elements)) return;
            for (const el of elements) {
                if (el.widget) {
                    let resolvedType: FieldType = SCHEMA_TYPE.STRING;
                    if (el.scope && propsContext) {
                        const propKey = el.scope.split("/").pop();
                        if (propKey && propsContext[propKey]?.type) {
                            resolvedType = propsContext[propKey].type;
                        }
                    }
                    try {
                        pathsToLoad.add(this.getFieldPath(resolvedType, el.widget));
                    } catch (e) {
                        Logger.debug(
                            "[MetaUI PluginRegistry]",
                            `Skipping preload for layout widget '${el.widget}' on type '${resolvedType}': ${(e as Error).message}`
                        );
                    }
                }
                if (el.elements) {
                    scanLayoutElements(el.elements, propsContext);
                }
            }
        };

        if (schema.properties) {
            scanProperties(schema.properties);
        }
        if (schema.items) {
            scanProperty({ type: SCHEMA_TYPE.ARRAY, items: schema.items }, "items");
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
            scanProperty(
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
                defKey
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
     * Defers the generation of the UI until all required UI5 modules have been
     * downloaded asynchronously. Maintains a cache of active promises to prevent
     * redundant network requests for the same module.
     *
     * @param {ISchema} schema The root JSON schema payload to parse.
     * @param {Record<string, ISchema>} [normalizedDefinitions] Optional external `$ref` definitions dictionary.
     * @returns {Promise<void>} Resolves when all dependencies are securely in the UI5 require cache.
     */
    public async preloadDependencies(
        schema: ISchema,
        normalizedDefinitions?: Record<string, ISchema>
    ): Promise<void> {
        const pathsToLoad = this.getPathsToLoad(schema, normalizedDefinitions);
        const promises = Array.from(pathsToLoad).map((path) => {
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
        await Promise.all(promises);
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
        const path = this.getFieldPath(type, widgetName);
        return this.requireAndConstruct<IPlugin>(path, "Plugin")!;
    }

    /** Instantiates the requested layout manager for the given strategy. */
    public getLayout(strategy: string): ILayoutManager {
        const path = this.getLayoutPath(strategy);
        return this.requireAndConstruct<ILayoutManager>(path, "Layout")!;
    }

    /** Gets a specific condition plugin. */
    public getPolicyConditionPlugin(conditionKey: string): IPolicyConditionPlugin | undefined {
        const path = this.policyConditionIndex.get(conditionKey);
        return path ? this.requireAndConstruct<IPolicyConditionPlugin>(path) : undefined;
    }

    /** Gets a specific effect plugin. */
    public getPolicyEffectPlugin(effectName: string): IPolicyEffectPlugin | undefined {
        const path = this.policyEffectIndex.get(effectName);
        return path ? this.requireAndConstruct<IPolicyEffectPlugin>(path) : undefined;
    }
}
