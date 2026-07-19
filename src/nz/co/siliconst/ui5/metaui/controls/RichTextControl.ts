import BaseHardwareControl from "./BaseHardwareControl";
import BaseHardwareControlRenderer from "./BaseHardwareControlRenderer";
import RenderManager from "sap/ui/core/RenderManager";
import VBox from "sap/m/VBox";
import RichTextEditor from "sap/ui/richtexteditor/RichTextEditor";

/**
 * @file RichTextControl.ts
 * @description Native UI5 Control for rich text input.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
export default class RichTextControl extends BaseHardwareControl {
    private vBox!: VBox;
    private richTextEditor!: RichTextEditor;

    static readonly renderer = BaseHardwareControlRenderer;

    static readonly metadata = {
        properties: {},
        events: {},
        aggregations: {
            _content: { type: "sap.m.VBox", multiple: false, visibility: "hidden" }
        }
    };

    public init(): void {
        super.init();

        this.richTextEditor = new RichTextEditor({
            width: "100%",
            height: "300px",
            showGroupFont: true,
            showGroupInsert: true,
            tooltip: "Rich Text Editor",
            change: (oEvent: any) => {
                const val = oEvent.getParameter("newValue");
                this.setValueAndFire(val);
            }
        });

        this.vBox = new VBox({
            items: [this.richTextEditor]
        });

        this.setAggregation("_content", this.vBox);
    }

    public onBeforeRendering(): void {
        const readOnly = this.getProperty("readOnly");
        this.richTextEditor.setEditable(!readOnly);

        const currentVal = this.getProperty("value");
        if (currentVal !== undefined && currentVal !== null) {
            // Prevent recursive update if the value matches the editor's current value
            if (this.richTextEditor.getValue() !== currentVal) {
                this.richTextEditor.setValue(currentVal as string);
            }
        }
    }
}
