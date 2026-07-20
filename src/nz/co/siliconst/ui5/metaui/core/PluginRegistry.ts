/**
 * @file PluginRegistry.ts
 * @description Centralized hub for mapping UI5 controls to SAP schema data types.
 * Enforces the Registry Pattern to decouple the core engine from specific UI5 control implementations.
 * NOW WITH UNIVERSAL LAZY LOADING.
 */

import { IPlugin } from "../interfaces/IPlugin";
import { FieldType, ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { Logger } from "../utils/Logger";
import { DefaultLayoutGenerator } from "./DefaultLayoutGenerator";

export class PluginRegistry {
    private static instance: PluginRegistry;
    
    private fieldIndex: Record<string, string> = {};
    private actionIndex: Record<string, string> = {};
    private layoutIndex: Record<string, string> = {};
    
    private activePromises: Record<string, Promise<unknown>> = {};

    private constructor() {
        // Core Mappings
        this.registerPluginPath("string", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin");
        this.registerPluginPath("number", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin");
        this.registerPluginPath("integer", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin");
        this.registerPluginPath("date", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin");
        this.registerPluginPath("boolean", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/BooleanPlugin");
        this.registerPluginPath("array", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/ArrayPlugin");
        this.registerPluginPath("object", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/ObjectPlugin");

        // Widget Overrides
        this.registerPluginPath("string", "time", "nz/co/siliconst/ui5/metaui/plugins/controls/TimePlugin");
        this.registerPluginPath("string", "datetime", "nz/co/siliconst/ui5/metaui/plugins/controls/DateTimePlugin");
        this.registerPluginPath("boolean", "switch", "nz/co/siliconst/ui5/metaui/plugins/controls/SwitchPlugin");
        this.registerPluginPath("string", "select", "nz/co/siliconst/ui5/metaui/plugins/controls/DropdownPlugin");
        this.registerPluginPath("string", "textArea", "nz/co/siliconst/ui5/metaui/plugins/controls/TextAreaPlugin");
        this.registerPluginPath("string", "codeEditor", "nz/co/siliconst/ui5/metaui/plugins/controls/CodeEditorPlugin");
        
        // Phase 1 Mappings
        this.registerPluginPath("string", "fileUploader", "nz/co/siliconst/ui5/metaui/plugins/controls/FileUploaderPlugin");
        this.registerPluginPath("array", "multiSelect", "nz/co/siliconst/ui5/metaui/plugins/controls/MultiSelectPlugin");
        this.registerPluginPath("number", "slider", "nz/co/siliconst/ui5/metaui/plugins/controls/SliderPlugin");
        this.registerPluginPath("number", "rating", "nz/co/siliconst/ui5/metaui/plugins/controls/RatingIndicatorPlugin");
        this.registerPluginPath("string", "messageStrip", "nz/co/siliconst/ui5/metaui/plugins/controls/MessageStripPlugin");

        // Phase 5 Mappings (Hardware)
        this.registerPluginPath("string", "camera", "nz/co/siliconst/ui5/metaui/plugins/controls/CameraPlugin");
        this.registerPluginPath("string", "signature", "nz/co/siliconst/ui5/metaui/plugins/controls/SignaturePlugin");
        this.registerPluginPath("object", "location", "nz/co/siliconst/ui5/metaui/plugins/controls/GeolocationPlugin");
        this.registerPluginPath("string", "scanner", "nz/co/siliconst/ui5/metaui/plugins/controls/BarcodeScannerPlugin");
        this.registerPluginPath("string", "voiceInput", "nz/co/siliconst/ui5/metaui/plugins/controls/VoiceInputPlugin");
        this.registerPluginPath("string", "richText", "nz/co/siliconst/ui5/metaui/plugins/controls/RichTextPlugin");

        // Actions & Datasources
        this.registerPluginPath("string", "urlButton", "nz/co/siliconst/ui5/metaui/plugins/actions/UrlNavigationActionPlugin");
        this.registerPluginPath("string", "submitButton", "nz/co/siliconst/ui5/metaui/plugins/actions/SubmitFormActionPlugin");
        this.registerPluginPath("string", "odataSelect", "nz/co/siliconst/ui5/metaui/plugins/datasources/ODataListBindingPlugin");
        this.registerPluginPath("string", "remoteDropdown", "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteDropdownPlugin");
        this.registerPluginPath("string", "liveSearch", "nz/co/siliconst/ui5/metaui/plugins/datasources/LiveSearchPlugin");
        this.registerPluginPath("string", "remoteValueHelp", "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteValueHelpPlugin");

        // Layouts
        this.registerLayoutPath("form", "nz/co/siliconst/ui5/metaui/layouts/FormLayout");
        this.registerLayoutPath("table", "nz/co/siliconst/ui5/metaui/layouts/TableLayout");
        this.registerLayoutPath("wizard", "nz/co/siliconst/ui5/metaui/layouts/WizardLayout");
        this.registerLayoutPath("compact", "nz/co/siliconst/ui5/metaui/layouts/CompactLayout");
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
        const strategy = schema.layoutStrategy || (schema.type === "array" ? "table" : "form");
        pathsToLoad.add(this.getLayoutPath(strategy));

        // 2. Recursively gather field plugins
        const scanProperties = (props: Record<string, IPropertyMetadata>) => {
            for (const key in props) {
                const prop = props[key];
                try {
                    pathsToLoad.add(this.getFieldPath(prop.type || "string", prop.ui?.widget));
                } catch (e) {
                    Logger.warn(`[MetaUI LazyLoad] Could not find mapped plugin for field ${key}`);
                }
                if (prop.properties) scanProperties(prop.properties);
                if (prop.items && prop.items.properties) scanProperties(prop.items.properties);
                if (prop.items && prop.items.type) {
                    try {
                        pathsToLoad.add(this.getFieldPath(prop.items.type, prop.items.ui?.widget));
                    } catch (e) {
                        Logger.warn(`[MetaUI LazyLoad] Could not find mapped plugin for array item type ${prop.items.type}`);
                    }
                }
            }
        };

        if (schema.properties) {
            scanProperties(schema.properties);
        } else if (schema.items && schema.items.properties) {
            scanProperties(schema.items.properties);
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
                        (Module: unknown) => resolve(Module), 
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

    private extractConstructor(Module: unknown): new () => IPlugin | ILayoutManager | null {
        if (!Module) return null;
        if (typeof Module === "function") return Module;
        if (Module.default && typeof Module.default === "function") return Module.default;
        
        // Handle namespace exports (e.g. { FormLayout: class... })
        const keys = Object.keys(Module);
        for (const key of keys) {
            if (typeof Module[key] === "function") {
                return Module[key];
            }
        }
        return null;
    }

    public getPlugin(type: FieldType, widgetName?: string): IPlugin {
        const path = this.getFieldPath(type, widgetName);
        const Module = sap.ui.require(path);
        const PluginClass = this.extractConstructor(Module);
        
        if (!PluginClass) {
            throw new Error(`[MetaUI Plugin Instantiation] Plugin ${path} was not preloaded or has no constructor!`);
        }
        
        return new PluginClass();
    }

    public getLayout(strategy: string): ILayoutManager {
        const path = this.getLayoutPath(strategy);
        const Module = sap.ui.require(path);
        const LayoutClass = this.extractConstructor(Module);
        
        if (!LayoutClass) {
            throw new Error(`[MetaUI Layout Instantiation] Layout ${path} was not preloaded or has no constructor!`);
        }
        
        return new LayoutClass();
    }
}
