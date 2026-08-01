/**
 * @file PluginRegistry.ts
 * @description Centralized hub for mapping UI5 controls to SAP schema data types.
 * Enforces the Registry Pattern to decouple the core engine from specific UI5 control implementations.
 * NOW WITH UNIVERSAL LAZY LOADING.
 */

import { IPlugin } from "../interfaces/IPlugin";
import { FieldType, ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { SCHEMA_TYPE, WIDGET_TYPE, LAYOUT_STRATEGY } from "../constants/MetaUIConstants";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { IPolicyConditionPlugin, IPolicyEffectPlugin } from "../interfaces/IPolicyPlugin";
import { Logger } from "../utils/Logger";
import { DefaultLayoutGenerator } from "./DefaultLayoutGenerator";

export class PluginRegistry {
    private static instance: PluginRegistry;
    
    private fieldIndex: Record<string, string> = {};
    private actionIndex: Record<string, string> = {};
    private layoutIndex: Record<string, string> = {};
    
    private policyConditionIndex: Record<string, string> = {};
    private policyEffectIndex: Record<string, string> = {};

    private activePromises: Record<string, Promise<unknown>> = {};

    private constructor() {
        // Core Mappings
        this.registerPluginPath(SCHEMA_TYPE.STRING, undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin");
        this.registerPluginPath(SCHEMA_TYPE.NUMBER, undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin");
        this.registerPluginPath(SCHEMA_TYPE.INTEGER, undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin");
        this.registerPluginPath(SCHEMA_TYPE.DATE, undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin");
        this.registerPluginPath(SCHEMA_TYPE.BOOLEAN, undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/BooleanPlugin");
        this.registerPluginPath(SCHEMA_TYPE.ARRAY, undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/ArrayPlugin");
        this.registerPluginPath(SCHEMA_TYPE.OBJECT, undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/ObjectPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, "default", "nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin");
        this.registerPluginPath(SCHEMA_TYPE.OBJECT, WIDGET_TYPE.DICTIONARY_MAP, "nz/co/siliconst/ui5/metaui/plugins/controls/DictionaryMapPlugin");
        this.registerPluginPath(SCHEMA_TYPE.OBJECT, WIDGET_TYPE.REFERENCE, "nz/co/siliconst/ui5/metaui/plugins/controls/ReferencePlugin");

        // Widget Overrides
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.TIME, "nz/co/siliconst/ui5/metaui/plugins/controls/TimePlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.DATETIME, "nz/co/siliconst/ui5/metaui/plugins/controls/DateTimePlugin");
        this.registerPluginPath(SCHEMA_TYPE.BOOLEAN, WIDGET_TYPE.SWITCH, "nz/co/siliconst/ui5/metaui/plugins/controls/SwitchPlugin");
        this.registerPluginPath(SCHEMA_TYPE.NUMBER, WIDGET_TYPE.STEP, "nz/co/siliconst/ui5/metaui/plugins/controls/StepInputPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.SELECT, "nz/co/siliconst/ui5/metaui/plugins/controls/DropdownPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.TEXT_AREA, "nz/co/siliconst/ui5/metaui/plugins/controls/TextAreaPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.CODE_EDITOR, "nz/co/siliconst/ui5/metaui/plugins/controls/CodeEditorPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.LINK, "nz/co/siliconst/ui5/metaui/plugins/controls/LinkPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.PASSWORD, "nz/co/siliconst/ui5/metaui/plugins/controls/PasswordPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.EMAIL, "nz/co/siliconst/ui5/metaui/plugins/controls/EmailPlugin");
        
        // Phase 1 Mappings
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.FILE_UPLOADER, "nz/co/siliconst/ui5/metaui/plugins/controls/FileUploaderPlugin");
        this.registerPluginPath(SCHEMA_TYPE.ARRAY, WIDGET_TYPE.MULTI_SELECT, "nz/co/siliconst/ui5/metaui/plugins/controls/MultiSelectPlugin");
        this.registerPluginPath(SCHEMA_TYPE.ARRAY, WIDGET_TYPE.MULTI_INPUT, "nz/co/siliconst/ui5/metaui/plugins/controls/MultiInputPlugin");
        this.registerPluginPath(SCHEMA_TYPE.NUMBER, WIDGET_TYPE.SLIDER, "nz/co/siliconst/ui5/metaui/plugins/controls/SliderPlugin");
        this.registerPluginPath(SCHEMA_TYPE.NUMBER, WIDGET_TYPE.RATING, "nz/co/siliconst/ui5/metaui/plugins/controls/RatingIndicatorPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.MESSAGE_STRIP, "nz/co/siliconst/ui5/metaui/plugins/controls/MessageStripPlugin");

        // Phase 5 Mappings (Hardware)
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.CAMERA, "nz/co/siliconst/ui5/metaui/plugins/controls/CameraPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.SIGNATURE, "nz/co/siliconst/ui5/metaui/plugins/controls/SignaturePlugin");
        this.registerPluginPath(SCHEMA_TYPE.OBJECT, WIDGET_TYPE.LOCATION, "nz/co/siliconst/ui5/metaui/plugins/controls/GeolocationPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.SCANNER, "nz/co/siliconst/ui5/metaui/plugins/controls/BarcodeScannerPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.VOICE_INPUT, "nz/co/siliconst/ui5/metaui/plugins/controls/VoiceInputPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.RICH_TEXT, "nz/co/siliconst/ui5/metaui/plugins/controls/RichTextPlugin");

        // Actions & Datasources
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.URL_BUTTON, "nz/co/siliconst/ui5/metaui/plugins/actions/UrlNavigationActionPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.SUBMIT_BUTTON, "nz/co/siliconst/ui5/metaui/plugins/actions/SubmitFormActionPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.ODATA_SELECT, "nz/co/siliconst/ui5/metaui/plugins/datasources/ODataListBindingPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.REMOTE_DROPDOWN, "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteDropdownPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.LIVE_SEARCH, "nz/co/siliconst/ui5/metaui/plugins/datasources/LiveSearchPlugin");
        this.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.REMOTE_VALUE_HELP, "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteValueHelpPlugin");

        // Layouts
        this.registerLayoutPath(LAYOUT_STRATEGY.FORM, "nz/co/siliconst/ui5/metaui/layouts/FormLayout");
        this.registerLayoutPath(LAYOUT_STRATEGY.TABLE, "nz/co/siliconst/ui5/metaui/layouts/TableLayout");
        this.registerLayoutPath(LAYOUT_STRATEGY.WIZARD, "nz/co/siliconst/ui5/metaui/layouts/WizardLayout");
        this.registerLayoutPath(LAYOUT_STRATEGY.COMPACT, "nz/co/siliconst/ui5/metaui/layouts/CompactLayout");

        // Policy Condition Plugins
        this.registerPolicyConditionPath("NumericGreaterThan", "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/NumericGreaterThanConditionPlugin");
        this.registerPolicyConditionPath("NumericLessThan", "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/NumericLessThanConditionPlugin");
        this.registerPolicyConditionPath("StringEquals", "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/StringEqualsConditionPlugin");
        this.registerPolicyConditionPath("IsNull", "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/IsNullConditionPlugin");
        this.registerPolicyConditionPath("IsNotNull", "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/IsNotNullConditionPlugin");

        // Policy Effect Plugins
        this.registerPolicyEffectPath("Show", "nz/co/siliconst/ui5/metaui/plugins/policies/effects/VisibilityEffectPlugin");
        this.registerPolicyEffectPath("Hide", "nz/co/siliconst/ui5/metaui/plugins/policies/effects/VisibilityEffectPlugin");
        this.registerPolicyEffectPath("Validate", "nz/co/siliconst/ui5/metaui/plugins/policies/effects/ValidityEffectPlugin");
        this.registerPolicyEffectPath("Invalidate", "nz/co/siliconst/ui5/metaui/plugins/policies/effects/ValidityEffectPlugin");
        this.registerPolicyEffectPath("Require", "nz/co/siliconst/ui5/metaui/plugins/policies/effects/RequirementEffectPlugin");
        this.registerPolicyEffectPath("Optional", "nz/co/siliconst/ui5/metaui/plugins/policies/effects/RequirementEffectPlugin");
        this.registerPolicyEffectPath("Enable", "nz/co/siliconst/ui5/metaui/plugins/policies/effects/EditableEffectPlugin");
        this.registerPolicyEffectPath("Disable", "nz/co/siliconst/ui5/metaui/plugins/policies/effects/EditableEffectPlugin");
    }

    public static getInstance(): PluginRegistry {
        if (!PluginRegistry.instance) {
            PluginRegistry.instance = new PluginRegistry();
        }
        return PluginRegistry.instance;
    }

    public registerPluginPath(type: FieldType, widgetName: string | undefined, path: string): void {
        const key = widgetName ? `${type}:${widgetName}` : type;
        this.fieldIndex[key] = path;
    }

    public registerActionPath(actionName: string, path: string): void {
        this.actionIndex[actionName] = path;
    }

    public registerLayoutPath(strategy: string, path: string): void {
        this.layoutIndex[strategy] = path;
    }

    public registerPolicyConditionPath(conditionKey: string, path: string): void {
        this.policyConditionIndex[conditionKey] = path;
    }

    public registerPolicyEffectPath(effectName: string, path: string): void {
        this.policyEffectIndex[effectName] = path;
    }

    private getFieldPath(type: FieldType, widgetName?: string): string {
        let path;
        if (widgetName) {
            path = this.fieldIndex[`${type}:${widgetName}`];
        }
        if (!path) {
            path = this.fieldIndex[type];
        }
        if (!path) {
            throw new Error(`No plugin path mapped for FieldType: ${type} (widget: ${widgetName})`);
        }
        return path;
    }

    private getLayoutPath(strategy: string): string {
        const path = this.layoutIndex[strategy];
        if (!path) {
            throw new Error(`No layout path mapped for strategy: ${strategy}`);
        }
        return path;
    }

    /**
     * Statically traverses the schema structure to identify all required plugins
     * and layouts without actually instantiating them.
     * 
     * @param {ISchema} schema The root JSON schema payload to traverse
     * @returns {Set<string>} A distinct set of UI5 module paths required to render the schema
     */
    public getPathsToLoad(schema: ISchema): Set<string> {
        const pathsToLoad = new Set<string>();
        
        // 1. Gather layout strategy
        const strategy = schema.layoutStrategy || (schema.type === SCHEMA_TYPE.ARRAY ? LAYOUT_STRATEGY.TABLE : LAYOUT_STRATEGY.FORM);
        pathsToLoad.add(this.getLayoutPath(strategy));

        // 2. Recursively gather field plugins
        const scanProperties = (props: Record<string, IPropertyMetadata>) => {
            for (const key in props) {
                const prop = props[key];
                try {
                    pathsToLoad.add(this.getFieldPath(prop.type || SCHEMA_TYPE.STRING, prop.ui?.widget));
                } catch (e) {
                    const msg = `[MetaUI LazyLoad] Could not find mapped plugin for field ${key}: ${(e as Error).message}`;
                    Logger.error(msg);
                    throw new Error(msg);
                }
                if (prop.properties) scanProperties(prop.properties);
                if (prop.items && prop.items.properties) scanProperties(prop.items.properties);
                if (prop.items && prop.items.type) {
                    try {
                        pathsToLoad.add(this.getFieldPath(prop.items.type, prop.items.ui?.widget));
                    } catch (e) {
                        const msg = `[MetaUI LazyLoad] Could not find mapped plugin for array item type ${prop.items.type}: ${(e as Error).message}`;
                        Logger.error(msg);
                        throw new Error(msg);
                    }
                }
            }
        };

        if (schema.properties) {
            scanProperties(schema.properties);
        } else if (schema.items && schema.items.properties) {
            scanProperties(schema.items.properties);
        }

        // 3. Gather Policy Plugins
        if (schema.uiPolicies) {
            for (const policy of schema.uiPolicies) {
                if (policy.condition) {
                    for (const key of Object.keys(policy.condition)) {
                        if (this.policyConditionIndex[key]) {
                            pathsToLoad.add(this.policyConditionIndex[key]);
                        }
                    }
                }
                if (policy.effect && this.policyEffectIndex[policy.effect]) {
                    pathsToLoad.add(this.policyEffectIndex[policy.effect]);
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
     * @param {ISchema} schema The root JSON schema payload to parse
     * @returns {Promise<void>} Resolves when all dependencies are securely in the UI5 require cache
     */
    public async preloadDependencies(schema: ISchema): Promise<void> {
        const pathsToLoad = this.getPathsToLoad(schema);

        // 3. Batch execute sap.ui.require via Promises
        const promises = Array.from(pathsToLoad).map(path => {
            if (!this.activePromises[path]) {
                this.activePromises[path] = new Promise((resolve, reject) => {
                    sap.ui.require([path], 
                        (Module: unknown) => {
                            if (!this.extractConstructor(Module)) {
                                Logger.error(`[MetaUI PluginRegistry] Module ${path} loaded successfully but exported no valid constructor.`);
                                delete this.activePromises[path];
                                reject(new Error(`Invalid module export: ${path}`));
                            } else {
                                resolve(Module);
                            }
                        }, 
                        (err: unknown) => {
                            Logger.error(`Failed to lazy load module: ${path}`);
                            // CRITICAL: Delete from cache so future attempts can retry the network request
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
     * Extracts a valid constructor from a dynamically required module.
     */
    private extractConstructor(Module: unknown): unknown {
        if (!Module) return null;
        if (typeof Module === "function") return Module;
        const mod = Module as Record<string, unknown>;
        if (mod.default && typeof mod.default === "function") return mod.default;
        
        // Handle namespace exports (e.g. { FormLayout: class... })
        const keys = Object.keys(mod);
        for (const key of keys) {
            if (typeof mod[key] === "function") {
                return mod[key];
            }
        }
        return null;
    }

    public getPluginScore(type: FieldType, widgetName?: string): number {
        try {
            const path = this.getFieldPath(type, widgetName);
            const Module = sap.ui.require(path);
            const Constructor = this.extractConstructor(Module) as Record<string, unknown>;
            if (Constructor && typeof Constructor.layoutScore === "number") {
                return Constructor.layoutScore as number;
            }
        } catch (e) {
            // Ignore if module not loaded or mapping missing, fallback to 1
        }
        return 1;
    }

    public isPluginNativelyWide(type: FieldType, widgetName?: string): boolean {
        try {
            const path = this.getFieldPath(type, widgetName);
            const Module = sap.ui.require(path);
            const Constructor = this.extractConstructor(Module) as Record<string, unknown>;
            if (Constructor && typeof Constructor.isNativelyWide === "boolean") {
                return Constructor.isNativelyWide as boolean;
            }
        } catch (e) {
            // Ignore errors, default false
        }
        return false;
    }

    /**
     * Instantiates the requested plugin for the given field type.
     */
    public getPlugin(type: FieldType, widgetName?: string): IPlugin {
        const path = this.getFieldPath(type, widgetName);
        const Module = sap.ui.require(path);
        const PluginClass = this.extractConstructor(Module) as new () => IPlugin;
        
        if (!PluginClass) {
            throw new Error(`[MetaUI Plugin Instantiation] Plugin ${path} was not preloaded or has no constructor!`);
        }
        
        return new PluginClass();
    }

    /**
     * Instantiates the requested layout manager for the given strategy.
     */
    public getLayout(strategy: string): ILayoutManager {
        const path = this.getLayoutPath(strategy);
        const Module = sap.ui.require(path);
        const LayoutClass = this.extractConstructor(Module) as new () => ILayoutManager;
        
        if (!LayoutClass) {
            throw new Error(`[MetaUI Layout Instantiation] Layout ${path} was not preloaded or has no constructor!`);
        }
        
        return new LayoutClass();
    }

    /**
     * Gets a specific condition plugin.
     */
    public getPolicyConditionPlugin(conditionKey: string): IPolicyConditionPlugin | undefined {
        const path = this.policyConditionIndex[conditionKey];
        if (!path) return undefined;
        
        const Module = sap.ui.require(path);
        const PluginClass = this.extractConstructor(Module) as new () => IPolicyConditionPlugin;
        if (!PluginClass) return undefined;
        
        return new PluginClass();
    }

    /**
     * Gets a specific effect plugin.
     */
    public getPolicyEffectPlugin(effectName: string): IPolicyEffectPlugin | undefined {
        const path = this.policyEffectIndex[effectName];
        if (!path) return undefined;
        
        const Module = sap.ui.require(path);
        const PluginClass = this.extractConstructor(Module) as new () => IPolicyEffectPlugin;
        if (!PluginClass) return undefined;
        
        return new PluginClass();
    }
}
