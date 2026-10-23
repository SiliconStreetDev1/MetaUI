/**
 * @file DefaultPluginBootstrapper.ts
 * @description Composition root that registers all built-in control, action, datasource,
 * layout, and policy condition/effect plugin module paths into a PluginRegistry instance.
 */

import { SCHEMA_TYPE, WIDGET_TYPE, LAYOUT_STRATEGY } from "../constants/MetaUIConstants";
import type { PluginRegistry } from "./PluginRegistry";

const CONTROL_PLUGIN_BASE = "nz/co/siliconst/ui5/metaui/plugins/controls/";
const ACTION_PLUGIN_BASE = "nz/co/siliconst/ui5/metaui/plugins/actions/";
const DATASOURCE_PLUGIN_BASE = "nz/co/siliconst/ui5/metaui/plugins/datasources/";
const LAYOUT_BASE = "nz/co/siliconst/ui5/metaui/layouts/";
const POLICY_CONDITION_BASE = "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/";
const POLICY_EFFECT_BASE = "nz/co/siliconst/ui5/metaui/plugins/policies/effects/";

/**
 * Registers the standard built-in MetaUI plugin, layout, and policy operator module paths
 * onto a `PluginRegistry` instance.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class DefaultPluginBootstrapper {
    /**
     * Populates a `PluginRegistry` instance with all built-in mappings.
     *
     * @param registry The target `PluginRegistry` instance to configure.
     */
    public static registerDefaults(registry: PluginRegistry): void {
        // Core Control Mappings
        registry.registerPluginPath(SCHEMA_TYPE.STRING, undefined, `${CONTROL_PLUGIN_BASE}StringPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.NUMBER, undefined, `${CONTROL_PLUGIN_BASE}NumberPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.INTEGER, undefined, `${CONTROL_PLUGIN_BASE}NumberPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.DATE, undefined, `${CONTROL_PLUGIN_BASE}DatePlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.BOOLEAN, undefined, `${CONTROL_PLUGIN_BASE}BooleanPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.ARRAY, undefined, `${CONTROL_PLUGIN_BASE}ArrayPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.OBJECT, undefined, `${CONTROL_PLUGIN_BASE}ObjectPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, "default", `${CONTROL_PLUGIN_BASE}StringPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.OBJECT, WIDGET_TYPE.DICTIONARY_MAP, `${CONTROL_PLUGIN_BASE}DictionaryMapPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.OBJECT, WIDGET_TYPE.REFERENCE, `${CONTROL_PLUGIN_BASE}ReferencePlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.OBJECT, WIDGET_TYPE.POLYMORPHIC, `${CONTROL_PLUGIN_BASE}PolymorphicPlugin`);

        // Widget Overrides
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.DATE, `${CONTROL_PLUGIN_BASE}DatePlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.DATE_PICKER, `${CONTROL_PLUGIN_BASE}DatePlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.DATE, WIDGET_TYPE.DATE, `${CONTROL_PLUGIN_BASE}DatePlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.DATE, WIDGET_TYPE.DATE_PICKER, `${CONTROL_PLUGIN_BASE}DatePlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.TIME, `${CONTROL_PLUGIN_BASE}TimePlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.DATETIME, `${CONTROL_PLUGIN_BASE}DateTimePlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.BOOLEAN, WIDGET_TYPE.SWITCH, `${CONTROL_PLUGIN_BASE}SwitchPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.NUMBER, WIDGET_TYPE.STEP, `${CONTROL_PLUGIN_BASE}StepInputPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.INTEGER, WIDGET_TYPE.STEP, `${CONTROL_PLUGIN_BASE}StepInputPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.SELECT, `${CONTROL_PLUGIN_BASE}DropdownPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.NUMBER, WIDGET_TYPE.SELECT, `${CONTROL_PLUGIN_BASE}DropdownPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.INTEGER, WIDGET_TYPE.SELECT, `${CONTROL_PLUGIN_BASE}DropdownPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.TEXT_AREA, `${CONTROL_PLUGIN_BASE}TextAreaPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.CODE_EDITOR, `${CONTROL_PLUGIN_BASE}CodeEditorPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.LINK, `${CONTROL_PLUGIN_BASE}LinkPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.PASSWORD, `${CONTROL_PLUGIN_BASE}PasswordPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.EMAIL, `${CONTROL_PLUGIN_BASE}EmailPlugin`);

        // Extended Control Mappings
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.FILE_UPLOADER, `${CONTROL_PLUGIN_BASE}FileUploaderPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.ARRAY, WIDGET_TYPE.MULTI_SELECT, `${CONTROL_PLUGIN_BASE}MultiSelectPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.ARRAY, WIDGET_TYPE.MULTI_INPUT, `${CONTROL_PLUGIN_BASE}MultiInputPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.NUMBER, WIDGET_TYPE.SLIDER, `${CONTROL_PLUGIN_BASE}SliderPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.INTEGER, WIDGET_TYPE.SLIDER, `${CONTROL_PLUGIN_BASE}SliderPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.NUMBER, WIDGET_TYPE.RATING, `${CONTROL_PLUGIN_BASE}RatingIndicatorPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.INTEGER, WIDGET_TYPE.RATING, `${CONTROL_PLUGIN_BASE}RatingIndicatorPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.MESSAGE_STRIP, `${CONTROL_PLUGIN_BASE}MessageStripPlugin`);

        // Hardware & Rich Controls
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.CAMERA, `${CONTROL_PLUGIN_BASE}CameraPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.SIGNATURE, `${CONTROL_PLUGIN_BASE}SignaturePlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.OBJECT, WIDGET_TYPE.LOCATION, `${CONTROL_PLUGIN_BASE}GeolocationPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.VOICE_INPUT, `${CONTROL_PLUGIN_BASE}VoiceInputPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.RICH_TEXT, `${CONTROL_PLUGIN_BASE}RichTextPlugin`);

        // Actions & Datasources
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.URL_BUTTON, `${ACTION_PLUGIN_BASE}UrlNavigationActionPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.SUBMIT_BUTTON, `${ACTION_PLUGIN_BASE}SubmitFormActionPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.CLEAR_BUTTON, `${ACTION_PLUGIN_BASE}ClearFormActionPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.ODATA_SELECT, `${DATASOURCE_PLUGIN_BASE}ODataListBindingPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.REMOTE_DROPDOWN, `${DATASOURCE_PLUGIN_BASE}RemoteDropdownPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.REMOTE_SELECT, `${DATASOURCE_PLUGIN_BASE}RemoteDropdownPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.COMBOBOX, `${DATASOURCE_PLUGIN_BASE}RemoteDropdownPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.LIVE_SEARCH, `${DATASOURCE_PLUGIN_BASE}LiveSearchPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.REMOTE_VALUE_HELP, `${DATASOURCE_PLUGIN_BASE}RemoteValueHelpPlugin`);
        registry.registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.VALUE_HELP, `${DATASOURCE_PLUGIN_BASE}RemoteValueHelpPlugin`);

        // Layouts
        registry.registerLayoutPath(LAYOUT_STRATEGY.FORM, `${LAYOUT_BASE}FormLayout`);
        registry.registerLayoutPath(LAYOUT_STRATEGY.TABLE, `${LAYOUT_BASE}TableLayout`);
        registry.registerLayoutPath(LAYOUT_STRATEGY.WIZARD, `${LAYOUT_BASE}WizardLayout`);
        registry.registerLayoutPath(LAYOUT_STRATEGY.COMPACT, `${LAYOUT_BASE}CompactLayout`);

        // Policy Condition Plugins
        registry.registerPolicyConditionPath("NumericGreaterThan", `${POLICY_CONDITION_BASE}NumericGreaterThanConditionPlugin`);
        registry.registerPolicyConditionPath("NumericLessThan", `${POLICY_CONDITION_BASE}NumericLessThanConditionPlugin`);
        registry.registerPolicyConditionPath("StringEquals", `${POLICY_CONDITION_BASE}StringEqualsConditionPlugin`);
        registry.registerPolicyConditionPath("DateLessThan", `${POLICY_CONDITION_BASE}DateLessThanConditionPlugin`);
        registry.registerPolicyConditionPath("IsNull", `${POLICY_CONDITION_BASE}IsNullConditionPlugin`);
        registry.registerPolicyConditionPath("IsNotNull", `${POLICY_CONDITION_BASE}IsNotNullConditionPlugin`);

        // Policy Effect Plugins
        registry.registerPolicyEffectPath("Show", `${POLICY_EFFECT_BASE}BinaryEffectPlugin`);
        registry.registerPolicyEffectPath("Hide", `${POLICY_EFFECT_BASE}BinaryEffectPlugin`);
        registry.registerPolicyEffectPath("Validate", `${POLICY_EFFECT_BASE}BinaryEffectPlugin`);
        registry.registerPolicyEffectPath("Invalidate", `${POLICY_EFFECT_BASE}BinaryEffectPlugin`);
        registry.registerPolicyEffectPath("Require", `${POLICY_EFFECT_BASE}BinaryEffectPlugin`);
        registry.registerPolicyEffectPath("Optional", `${POLICY_EFFECT_BASE}BinaryEffectPlugin`);
        registry.registerPolicyEffectPath("Enable", `${POLICY_EFFECT_BASE}BinaryEffectPlugin`);
        registry.registerPolicyEffectPath("Disable", `${POLICY_EFFECT_BASE}BinaryEffectPlugin`);
    }
}
