/**
 * @file PluginRegistry.ts
 * @description Centralized hub for mapping UI5 controls to SAP schema data types.
 * Enforces the Registry Pattern to decouple the core engine from specific UI5 control implementations.
 */

import { IPlugin } from "../interfaces/IPlugin";
import { FieldType } from "../interfaces/ISchema";

import { Registry } from "./Registry";
import { Logger } from "../utils/Logger";

import { StringPlugin } from "../plugins/controls/StringPlugin";
import { NumberPlugin } from "../plugins/controls/NumberPlugin";
import { DatePlugin } from "../plugins/controls/DatePlugin";
import { TimePlugin } from "../plugins/controls/TimePlugin";
import { DateTimePlugin } from "../plugins/controls/DateTimePlugin";
import { BooleanPlugin } from "../plugins/controls/BooleanPlugin";
import { SwitchPlugin } from "../plugins/controls/SwitchPlugin";
import { ArrayPlugin } from "../plugins/controls/ArrayPlugin";
import { ObjectPlugin } from "../plugins/controls/ObjectPlugin";
import { DropdownPlugin } from "../plugins/controls/DropdownPlugin";
import { TextAreaPlugin } from "../plugins/controls/TextAreaPlugin";

// New Phase 1 Controls
import { FileUploaderPlugin } from "../plugins/controls/FileUploaderPlugin";
import { MultiSelectPlugin } from "../plugins/controls/MultiSelectPlugin";
import { SliderPlugin } from "../plugins/controls/SliderPlugin";
import { RatingIndicatorPlugin } from "../plugins/controls/RatingIndicatorPlugin";
import { MessageStripPlugin } from "../plugins/controls/MessageStripPlugin";

// New Phase 5 Hardware / Base64 Plugins
import { CameraPlugin } from "../plugins/controls/CameraPlugin";
import { SignaturePlugin } from "../plugins/controls/SignaturePlugin";
import { GeolocationPlugin } from "../plugins/controls/GeolocationPlugin";
import { BarcodeScannerPlugin } from "../plugins/controls/BarcodeScannerPlugin";
import { VoiceInputPlugin } from "../plugins/controls/VoiceInputPlugin";
import { RichTextPlugin } from "../plugins/controls/RichTextPlugin";

// New Phase 4 Actions & Datasources
import { UrlNavigationActionPlugin } from "../plugins/actions/UrlNavigationActionPlugin";
import { SubmitFormActionPlugin } from "../plugins/actions/SubmitFormActionPlugin";
import { ODataListBindingPlugin } from "../plugins/datasources/ODataListBindingPlugin";

/**
 * Singleton orchestrator responsible for maintaining the registry of all available UI control plugins.
 * Resolves standard JSON schema types to their respective UI5 native controls.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class PluginRegistry {
    /** The single instance of the PluginRegistry. */
    private static instance: PluginRegistry;
    
    /** Internal strongly typed registry holding plugin constructors. */
    private readonly registry: Registry<new () => IPlugin> = new Registry<new () => IPlugin>("Controls");

    private constructor() {
        // Built-in Default Mappings
        this.register("string", StringPlugin);
        this.register("number", NumberPlugin);
        this.register("integer", NumberPlugin);
        this.register("date", DatePlugin);
        this.register("boolean", BooleanPlugin);
        this.register("array", ArrayPlugin);
        this.register("object", ObjectPlugin);

        // Widget Overrides
        this.register("string", TimePlugin, "time");
        this.register("string", DateTimePlugin, "datetime");
        this.register("boolean", SwitchPlugin, "switch");
        this.register("string", DropdownPlugin, "select");
        this.register("string", TextAreaPlugin, "textArea");
        
        // Phase 1 Mappings
        this.register("string", FileUploaderPlugin, "fileUploader");
        this.register("array", MultiSelectPlugin, "multiSelect");
        this.register("number", SliderPlugin, "slider");
        this.register("number", RatingIndicatorPlugin, "rating");
        this.register("string", MessageStripPlugin, "messageStrip");

        // Phase 5 Mappings (Hardware)
        this.register("string", CameraPlugin, "camera");
        this.register("string", SignaturePlugin, "signature");
        this.register("object", GeolocationPlugin, "location");
        this.register("string", BarcodeScannerPlugin, "scanner");
        this.register("string", VoiceInputPlugin, "voiceInput");
        this.register("string", RichTextPlugin, "richText");

        // Phase 4 Mappings
        this.register("string", UrlNavigationActionPlugin, "urlButton");
        this.register("string", SubmitFormActionPlugin, "submitButton");
        this.register("string", ODataListBindingPlugin, "odataSelect");
    }

    /**
     * Retrieves the singular instance of the PluginRegistry.
     * @returns {PluginRegistry} The active instance.
     */
    public static getInstance(): PluginRegistry {
        if (!PluginRegistry.instance) {
            PluginRegistry.instance = new PluginRegistry();
        }
        return PluginRegistry.instance;
    }

    /**
     * Registers a new control plugin to be utilized by the Layout Managers.
     * 
     * @param type The JSON Schema primitive type (e.g., 'string', 'number').
     * @param pluginConstructor The class constructor for the plugin implementation.
     * @param widgetName Optional UI hint to override the default type handler (e.g., 'textArea' for a 'string').
     */
    public register(type: FieldType, pluginConstructor: new () => IPlugin, widgetName?: string): void {
        const key = widgetName ? `${type}:${widgetName}` : type;
        this.registry.register(key, pluginConstructor);
    }

    /**
     * Resolves and instantiates the correct control plugin based on the field type and widget hint.
     * Falls back to the primitive type handler if the specific widget is not registered.
     * 
     * @param type The JSON Schema primitive type.
     * @param widgetName The specific UI widget hint (if provided in schema.ui.widget).
     * @returns {IPlugin} A new instance of the resolved plugin.
     * @throws {Error} If no handler is registered for the specified type.
     */
    public getPlugin(type: FieldType, widgetName?: string): IPlugin {
        let PluginClass;
        
        if (widgetName) {
            PluginClass = this.registry.get(`${type}:${widgetName}`);
        }
        
        if (!PluginClass) {
            PluginClass = this.registry.get(type);
        }

        if (!PluginClass) {
            const msg = `No control plugin registered for FieldType: ${type}${widgetName ? ` (widget: ${widgetName})` : ''}`;
            Logger.error("[MetaUI PluginRegistry]", msg);
            Logger.showErrorPopup(`Plugin Registry Error.\n\nDetails: ${msg}`);
            throw new Error(`[MetaUI] ${msg}`);
        }
        
        try {
            return new PluginClass();
        } catch (error) {
            const msg = (error as Error).message;
            Logger.error(`[MetaUI PluginRegistry] Failed to instantiate plugin for ${type}`, msg);
            Logger.showErrorPopup(`Failed to instantiate plugin for '${type}'.\n\nDetails: ${msg}`);
            throw new Error(`[MetaUI Plugin Instantiation] ${msg}`);
        }
    }
}
