/**
 * @file LayoutElementWalker.ts
 * @description Shared layout traversal walker, labelled field factory, and array sub-schema builder
 * used across FormLayout, WizardStepRenderer, CompactLayout, and TableLayout.
 */

import Label from "sap/m/Label";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import FlexItemData from "sap/m/FlexItemData";
import { FlexRendertype } from "sap/m/library";
import Control from "sap/ui/core/Control";
import Title from "sap/ui/core/Title";
import SimpleForm from "sap/ui/layout/form/SimpleForm";
import GridData from "sap/ui/layout/GridData";
import { ILayoutElement, IPropertyMetadata, ISchema, IUIDirective } from "../interfaces/ISchema";
import { Engine } from "../core/Engine";
import { SchemaNormalizer } from "../core/SchemaNormalizer";
import { ControlDirectiveUtil } from "../utils/ControlDirectiveUtil";
import { Logger } from "../utils/Logger";
import { deepClone, isRecord, readBoolean, readNumber } from "../utils/TypeGuards";

const MAX_LAYOUT_DEPTH = 30;

/**
 * Result returned by {@link LayoutFieldFactory.createLabelledField}.
 */
export interface ILabelledFieldResult {
    label: Label;
    control: Control;
    effectiveMeta: IPropertyMetadata;
    absolutePath: string;
    isFullWidth: boolean;
}

/**
 * Visitor sink contract implemented by concrete layout renderers (`FormLayout`, `WizardStepRenderer`,
 * `CompactLayout`, and `TableLayout`).
 */
export interface ILayoutWalkerSink {
    onSectionHeader?(label: string, containerType: ILayoutElement["type"]): void;
    onEnterContainer?(element: ILayoutElement): void;
    onExitContainer?(element: ILayoutElement): void;
    onHorizontalControls?(controls: ILayoutElement[]): void;
    onScalarField(element: ILayoutElement, bindingPath: string, meta: IPropertyMetadata): void;
    onTableSubLayout?(element: ILayoutElement, bindingPath: string, propKey: string, meta: IPropertyMetadata): void;
}

/**
 * Factory for cloning field metadata without aliasing `meta.ui` and synthesizing paired `Label` + `Control` widgets.
 *
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @public
 */
export class LayoutFieldFactory {
    /**
     * Constructs a standard responsive `SimpleForm` configured with MetaUI's 1-column grid spans,
     * applying optional root-level `ui.labelSpan` or `ui.controlProps` grid overrides.
     *
     * @param title Optional form title.
     * @param rootUi Optional root schema `ui` directive containing `labelSpan` or `controlProps`.
     * @returns {SimpleForm} Configured `SimpleForm` instance.
     */
    public static createSimpleForm(title?: string, rootUi?: IUIDirective): SimpleForm {
        const cp = isRecord(rootUi?.controlProps) ? rootUi.controlProps : undefined;
        const uniformSpan =
            typeof rootUi?.labelSpan === "number" && rootUi.labelSpan >= 1 && rootUi.labelSpan <= 12
                ? Math.round(rootUi.labelSpan)
                : undefined;
        const resolveSpan = (key: string, fallback: number): number => {
            const raw = cp ? readNumber(cp, key) : undefined;
            if (typeof raw === "number" && raw >= 1 && raw <= 12) {
                return Math.round(raw);
            }
            return uniformSpan ?? fallback;
        };
        const resolveEmptySpan = (key: string, fallback: number): number => {
            const raw = cp ? readNumber(cp, key) : undefined;
            return typeof raw === "number" && raw >= 0 && raw <= 11 ? Math.round(raw) : fallback;
        };
        const resolveCols = (key: string, fallback: number): number => {
            const raw = cp ? readNumber(cp, key) : undefined;
            return typeof raw === "number" && raw >= 1 && raw <= 4 ? Math.round(raw) : fallback;
        };
        return new SimpleForm({
            editable: true,
            title,
            layout: "ResponsiveGridLayout",
            labelSpanXL: resolveSpan("labelSpanXL", 4),
            labelSpanL: resolveSpan("labelSpanL", 4),
            labelSpanM: resolveSpan("labelSpanM", 4),
            labelSpanS: resolveSpan("labelSpanS", 12),
            adjustLabelSpan: (cp ? readBoolean(cp, "adjustLabelSpan") : undefined) ?? false,
            emptySpanXL: resolveEmptySpan("emptySpanXL", 0),
            emptySpanL: resolveEmptySpan("emptySpanL", 0),
            emptySpanM: resolveEmptySpan("emptySpanM", 0),
            emptySpanS: resolveEmptySpan("emptySpanS", 0),
            columnsXL: resolveCols("columnsXL", 1),
            columnsL: resolveCols("columnsL", 1),
            columnsM: resolveCols("columnsM", 1),
            singleContainerFullSize: (cp ? readBoolean(cp, "singleContainerFullSize") : undefined) ?? false
        });
    }

    /**
     * Clones an `IPropertyMetadata` record with an isolated deep copy of `ui` so runtime state
     * mutations (`PluginStateBase.applyEditable`) never mutate the normalized schema in-place.
     *
     * @param meta The source property metadata.
     * @param widgetOverride Optional layout-level widget override.
     * @param forceReadOnly Optional flag to force `readOnly: true` on both metadata and `ui`.
     * @returns {IPropertyMetadata} Cloned property metadata with an independent `ui` block.
     */
    public static cloneFieldMetadata(
        meta: IPropertyMetadata,
        widgetOverride?: string,
        forceReadOnly: boolean = false
    ): IPropertyMetadata {
        const clonedUi = meta.ui ? deepClone(meta.ui) : {};
        if (widgetOverride) {
            clonedUi.widget = widgetOverride;
        }
        if (forceReadOnly) {
            clonedUi.readOnly = true;
        }
        return {
            ...meta,
            readOnly: forceReadOnly ? true : meta.readOnly,
            ui: Object.keys(clonedUi).length > 0 || meta.ui ? clonedUi : undefined
        };
    }

    /**
     * Synthesizes a paired `sap.m.Label` and generated field `Control` with visibility directives,
     * accessibility label association, and native width calculation.
     *
     * @param element The `Control` layout element.
     * @param bindingPath The resolved relative binding path (e.g., `'Header/Id'`).
     * @param meta The resolved property metadata.
     * @param modelName The bound UI5 JSONModel name.
     * @param engine The active `Engine` instance.
     * @returns {ILabelledFieldResult} The paired label, control, effective metadata, path, and width flag.
     */
    public static createLabelledField(
        element: ILayoutElement,
        bindingPath: string,
        meta: IPropertyMetadata,
        modelName: string,
        engine: Engine
    ): ILabelledFieldResult {
        const labelText = element.label || meta.ui?.label || meta.title || bindingPath;
        const label = new Label({
            text: labelText,
            required: meta.required === true
        });
        const effectiveMeta = this.cloneFieldMetadata(meta, element.widget);
        const absolutePath = `/${bindingPath}`;

        if (effectiveMeta.ui?.visible === false || effectiveMeta.ui?.visibleOn) {
            ControlDirectiveUtil.applyCommonDirectives(
                label,
                label,
                { type: "string", ui: { visible: effectiveMeta.ui.visible, visibleOn: effectiveMeta.ui.visibleOn } },
                absolutePath,
                true,
                modelName
            );
        }

        const control = engine.generateField(effectiveMeta, absolutePath, modelName);
        const activePlugin = engine.getPluginByPath(absolutePath);
        if (activePlugin) {
            activePlugin.setAssociatedLabel(label);
        } else {
            label.setLabelFor(control);
        }

        const isNativelyWide = engine.pluginRegistry.isPluginNativelyWide(
            effectiveMeta.type || "string",
            effectiveMeta.ui?.widget
        );
        const isFullWidth =
            effectiveMeta.ui?.fullWidth !== undefined ? effectiveMeta.ui.fullWidth : isNativelyWide;

        return { label, control, effectiveMeta, absolutePath, isFullWidth };
    }

    /**
     * Synthesizes a horizontal `VBox` cell wrapping a paired `Label` + `Control` for `HorizontalLayout` rows.
     *
     * @param element The `Control` layout element.
     * @param bindingPath The resolved relative binding path.
     * @param meta The resolved property metadata.
     * @param modelName The bound UI5 JSONModel name.
     * @param engine The active `Engine` instance.
     * @returns {{ cellBox: VBox; absolutePath: string }} The horizontal cell wrapper and its absolute binding path.
     */
    public static createHorizontalCell(
        element: ILayoutElement,
        bindingPath: string,
        meta: IPropertyMetadata,
        modelName: string,
        engine: Engine
    ): { cellBox: VBox; absolutePath: string } {
        const { label, control, effectiveMeta, absolutePath } = this.createLabelledField(
            element,
            bindingPath,
            meta,
            modelName,
            engine
        );
        const cellBox = new VBox({
            renderType: FlexRendertype.Bare,
            items: [label, control],
            layoutData: new FlexItemData({ growFactor: 1, baseSize: "0%" })
        }).addStyleClass("sapUiTinyMarginEnd");
        cellBox.data("metauiFieldWrapper", true);
        if (effectiveMeta.ui?.visible === false || effectiveMeta.ui?.visibleOn) {
            ControlDirectiveUtil.applyCommonDirectives(
                cellBox,
                cellBox,
                { type: "string", ui: { visible: effectiveMeta.ui.visible, visibleOn: effectiveMeta.ui.visibleOn } },
                absolutePath,
                true,
                modelName
            );
        }
        return { cellBox, absolutePath };
    }
}

/**
 * Factory for detecting and constructing inline array table sub-schemas.
 *
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @public
 */
export class ArraySubSchemaFactory {
    /**
     * Determines whether an array property should be delegated to an inline `TableLayout` sub-layout.
     *
     * @param meta The property metadata to inspect.
     * @returns {boolean} True if the property represents an inline array of objects without an explicit widget override.
     */
    public static isTableSubLayout(meta: IPropertyMetadata): boolean {
        const isCollectionOfRecords = Boolean(meta.items?.type === "object" || meta.items?.properties);
        const hasExplicitWidget = Boolean(meta.ui?.widget);
        return (
            meta.type === "array" &&
            isCollectionOfRecords &&
            !hasExplicitWidget &&
            meta.ui?.renderMode !== "dialog"
        );
    }

    /**
     * Builds the child `ISchema` passed to `engine.generateLayout` for an inline array table.
     *
     * @param elementLabel Optional label override on the layout element.
     * @param fallbackTitle Fallback title (e.g., `propKey` or `bindingPath`).
     * @param meta The array property metadata.
     * @returns {ISchema} The synthesized array sub-schema.
     */
    public static build(elementLabel: string | undefined, fallbackTitle: string, meta: IPropertyMetadata): ISchema {
        const clonedUi = meta.ui ? deepClone(meta.ui) : undefined;
        return {
            type: "array",
            title: elementLabel || meta.ui?.label || fallbackTitle,
            items: meta.items || { type: "object", properties: {} },
            uiLayout: meta.items?.uiLayout,
            readOnly: meta.readOnly,
            minItems: meta.minItems,
            maxItems: meta.maxItems,
            uniqueItems: meta.uniqueItems,
            ui: meta.readOnly || clonedUi?.readOnly ? { ...(clonedUi || {}), readOnly: true } : clonedUi
        };
    }
}

/**
 * Shared recursive walker for `uiLayout` element trees.
 *
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @public
 */
export class LayoutElementWalker {
    /**
     * Resolves a `Control` layout element's `scope` and sets `engine.hasPartialRenderingErrors = true` on failure.
     *
     * @param element The `Control` layout element.
     * @param schema The root or item schema.
     * @param engine The active `Engine` instance.
     * @param layoutName Diagnostic caller name for error logs.
     * @returns {{ meta: IPropertyMetadata; bindingPath: string; propKey: string } | null} Resolved scope tuple or `null`.
     */
    public static resolveControlElement(
        element: ILayoutElement,
        schema: ISchema,
        engine: Engine,
        layoutName: string
    ): { meta: IPropertyMetadata; bindingPath: string; propKey: string } | null {
        if (!element.scope || !element.scope.startsWith("#/properties/")) {
            Logger.error(`[MetaUI] Invalid scope '${element.scope}' in uiLayout Control.`, "", layoutName);
            engine.hasPartialRenderingErrors = true;
            return null;
        }
        const { meta, bindingPath, propKey } = SchemaNormalizer.resolveScope(schema, element.scope);
        if (!meta) {
            Logger.error(`[MetaUI] Property '${propKey}' not found in schema definitions.`, "", layoutName);
            engine.hasPartialRenderingErrors = true;
            return null;
        }
        return { meta, bindingPath, propKey };
    }

    /**
     * Creates a standard `ILayoutWalkerSink` that populates a `SimpleForm` (shared by `FormLayout` and `WizardStepRenderer`).
     *
     * @param form Target `SimpleForm` control.
     * @param schema Active `ISchema`.
     * @param modelName UI5 JSONModel name.
     * @param engine Active `Engine` instance.
     * @param layoutName Diagnostic caller name (`'FormLayout'` or `'WizardLayout'`).
     * @param fieldPaths Optional collector array for generated absolute binding paths.
     * @param onFieldRendered Optional callback invoked when any field or horizontal row is added.
     * @returns {ILayoutWalkerSink} Configured walker sink for `SimpleForm` population.
     */
    public static createSimpleFormSink(
        form: SimpleForm,
        schema: ISchema,
        modelName: string,
        engine: Engine,
        layoutName: string,
        fieldPaths?: string[],
        onFieldRendered?: () => void
    ): ILayoutWalkerSink {
        return {
            onSectionHeader: (label: string) => {
                form.addContent(new Title({ text: label }));
            },
            onHorizontalControls: (directControls: ILayoutElement[]) => {
                onFieldRendered?.();
                const rowBox = new HBox({ width: "100%", renderType: FlexRendertype.Bare });
                rowBox.setLayoutData(new GridData({ span: "XL12 L12 M12 S12" }));
                for (const ctrlEl of directControls) {
                    const resolved = this.resolveControlElement(ctrlEl, schema, engine, layoutName);
                    if (!resolved) continue;
                    const { cellBox, absolutePath } = LayoutFieldFactory.createHorizontalCell(
                        ctrlEl,
                        resolved.bindingPath,
                        resolved.meta,
                        modelName,
                        engine
                    );
                    fieldPaths?.push(absolutePath);
                    rowBox.addItem(cellBox);
                }
                form.addContent(new Label({ text: "" }));
                form.addContent(rowBox);
            },
            onTableSubLayout: (element: ILayoutElement, bindingPath: string, propKey: string, meta: IPropertyMetadata) => {
                onFieldRendered?.();
                try {
                    const subSchema = ArraySubSchemaFactory.build(element.label, propKey, meta);
                    const absolutePath = `/${bindingPath}`;
                    const control = engine.generateLayout(subSchema, modelName, absolutePath);
                    if (control) {
                        fieldPaths?.push(absolutePath);
                        control.setLayoutData(new GridData({ span: "XL12 L12 M12 S12" }));
                        form.addContent(control);
                    }
                } catch (error) {
                    const msg = (error as Error).message;
                    Logger.error(`[MetaUI] Failed to render inline array field ${bindingPath}`, msg, layoutName);
                    Logger.showErrorPopup(`Failed to render array field '${bindingPath}'.\n\nDetails: ${msg}`);
                }
            },
            onScalarField: (element: ILayoutElement, bindingPath: string, meta: IPropertyMetadata) => {
                onFieldRendered?.();
                try {
                    const { label, control, absolutePath, isFullWidth } = LayoutFieldFactory.createLabelledField(
                        element,
                        bindingPath,
                        meta,
                        modelName,
                        engine
                    );
                    fieldPaths?.push(absolutePath);
                    const hideLabels =
                        schema.ui?.labelSpan === 0 ||
                        (isRecord(schema.ui?.controlProps) && readNumber(schema.ui.controlProps, "labelSpanS") === 0);
                    if (isFullWidth || hideLabels) {
                        control.setLayoutData(new GridData({ span: "XL12 L12 M12 S12" }));
                    }
                    if (hideLabels) {
                        form.addDependent(label);
                    } else {
                        form.addContent(label);
                    }
                    form.addContent(control);
                } catch (error) {
                    const msg = (error as Error).message;
                    Logger.error(`[MetaUI] Failed to render field ${bindingPath}`, msg, layoutName);
                    Logger.showErrorPopup(`Failed to render field '${bindingPath}'.\n\nDetails: ${msg}`);
                }
            }
        };
    }

    /**
     * Recursively walks an array of `ILayoutElement` nodes with a depth guard and dispatches to `sink`.
     *
     * @param elements The layout elements to walk.
     * @param schema The active `ISchema`.
     * @param engine The active `Engine`.
     * @param sink The layout visitor sink.
     * @param layoutName Diagnostic layout name for logs.
     * @param depth Current recursion depth.
     * @returns {number} Total number of `Control` elements encountered during traversal.
     */
    public static walk(
        elements: ILayoutElement[],
        schema: ISchema,
        engine: Engine,
        sink: ILayoutWalkerSink,
        layoutName: string,
        depth: number = 0
    ): number {
        if (depth > MAX_LAYOUT_DEPTH) {
            Logger.warn(`[MetaUI ${layoutName}] Max layout nesting depth (${MAX_LAYOUT_DEPTH}) exceeded.`, "", layoutName);
            return 0;
        }
        let controlCount = 0;
        for (const element of elements) {
            if (element.type === "HorizontalLayout") {
                if (element.label) {
                    sink.onSectionHeader?.(element.label, element.type);
                }
                if (sink.onHorizontalControls) {
                    const directControls = (element.elements || []).filter((e) => e.type === "Control");
                    const nonControls = (element.elements || []).filter((e) => e.type !== "Control");
                    controlCount += directControls.length;
                    if (directControls.length > 0) {
                        sink.onHorizontalControls(directControls);
                    }
                    if (nonControls.length > 0) {
                        controlCount += this.walk(nonControls, schema, engine, sink, layoutName, depth + 1);
                    }
                } else {
                    sink.onEnterContainer?.(element);
                    if (Array.isArray(element.elements) && element.elements.length > 0) {
                        controlCount += this.walk(element.elements, schema, engine, sink, layoutName, depth + 1);
                    }
                    sink.onExitContainer?.(element);
                }
            } else if (
                element.type === "Group" ||
                element.type === "WizardStep" ||
                element.type === "VerticalLayout"
            ) {
                sink.onEnterContainer?.(element);
                if (element.label) {
                    sink.onSectionHeader?.(element.label, element.type);
                }
                if (Array.isArray(element.elements) && element.elements.length > 0) {
                    controlCount += this.walk(element.elements, schema, engine, sink, layoutName, depth + 1);
                }
                sink.onExitContainer?.(element);
            } else if (element.type === "Control") {
                controlCount++;
                const resolved = this.resolveControlElement(element, schema, engine, layoutName);
                if (!resolved) {
                    continue;
                }
                if (sink.onTableSubLayout && ArraySubSchemaFactory.isTableSubLayout(resolved.meta)) {
                    sink.onTableSubLayout(element, resolved.bindingPath, resolved.propKey, resolved.meta);
                } else {
                    sink.onScalarField(element, resolved.bindingPath, resolved.meta);
                }
            } else {
                Logger.warn(`[MetaUI] Unsupported layout element type '${element.type}'.`, "", layoutName);
            }
        }
        return controlCount;
    }
}
