sap.ui.define([], function () {
    "use strict";

    /**
     * Authoritative Test Oracle mapping every (type, widget) pair registered in DefaultPluginBootstrapper.ts
     * to its module path, expected UI5 control metadata names (edit + display), value readers, serialization type,
     * row-cloning capability, and error-state mechanism, per Rule 23 and Phase 13.7 (docs/TEST_MATRIX_SPEC.md).
     */
    var PLUGIN_MAP = {
        "string": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin",
            controlClass: "sap.m.Input",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "String Field" } },
            sampleValue: "Hello MetaUI",
            mutatedValue: "Updated String",
            invalidValue: ""
        },
        "string:default": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin",
            controlClass: "sap.m.Input",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { widget: "default", label: "Default String" } },
            sampleValue: "Default Val",
            mutatedValue: "Mutated Default",
            invalidValue: ""
        },
        "number": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin",
            controlClass: "sap.m.Input",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "number",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "number", minimum: 10, maximum: 500, ui: { label: "Number Field" } },
            sampleValue: 42,
            mutatedValue: 120,
            invalidValue: 2
        },
        "integer": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin",
            controlClass: "sap.m.Input",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "number",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "integer", minimum: 1, maximum: 100, ui: { label: "Integer Field" } },
            sampleValue: 15,
            mutatedValue: 50,
            invalidValue: -5
        },
        "date": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin",
            controlClass: "sap.m.DatePicker",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "date", ui: { label: "Date Field" } },
            sampleValue: "2026-12-31",
            mutatedValue: "2027-01-15",
            invalidValue: ""
        },
        "boolean": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/BooleanPlugin",
            controlClass: "sap.m.CheckBox",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "boolean",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "boolean", ui: { label: "Boolean Field" } },
            sampleValue: true,
            mutatedValue: false,
            invalidValue: null
        },
        "array": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/ArrayPlugin",
            controlClass: "sap.m.Button",
            displayControlClass: "sap.m.Button",
            displaySameAsEdit: true,
            displayValueCheck: "getText",
            serializesTo: "array",
            supportsRowClone: true,
            errorStateMechanism: "buttonReject",
            sampleMeta: {
                type: "array",
                items: { type: "object", properties: { Col1: { type: "string" } } },
                ui: { label: "Array Field" }
            },
            sampleValue: [{ Col1: "Val1" }],
            mutatedValue: [{ Col1: "Val1" }, { Col1: "Val2" }],
            invalidValue: []
        },
        "object": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/ObjectPlugin",
            controlClass: "sap.m.Button",
            displayControlClass: "sap.m.Button",
            displaySameAsEdit: true,
            displayValueCheck: "getText",
            serializesTo: "object",
            supportsRowClone: true,
            errorStateMechanism: "buttonReject",
            sampleMeta: {
                type: "object",
                properties: { Key: { type: "string" } },
                ui: { label: "Object Field" }
            },
            sampleValue: { Key: "Value" },
            mutatedValue: { Key: "Updated" },
            invalidValue: { Key: "" }
        },
        "object:dictionaryMap": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/DictionaryMapPlugin",
            controlClass: "sap.m.VBox",
            displayControlClass: "sap.m.VBox",
            displaySameAsEdit: true,
            displayValueCheck: "dictionaryEntries",
            serializesTo: "object",
            supportsRowClone: false,
            errorStateMechanism: "none",
            sampleMeta: {
                type: "object",
                additionalProperties: { type: "string" },
                ui: { label: "Dictionary Map", widget: "dictionaryMap" }
            },
            sampleValue: { env: "prod", region: "nz" },
            mutatedValue: { env: "staging", region: "nz" }
        },
        "object:reference": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/ReferencePlugin",
            controlClass: "sap.m.Button",
            displayControlClass: "sap.m.Button",
            displaySameAsEdit: true,
            displayValueCheck: "getText",
            serializesTo: "object",
            supportsRowClone: true,
            errorStateMechanism: "buttonReject",
            sampleMeta: {
                type: "object",
                $ref: "#/definitions/MockReference",
                ui: { label: "Reference Field", widget: "reference" }
            },
            sampleValue: { NestedString: "REF-89021" },
            mutatedValue: { NestedString: "REF-99999" },
            invalidValue: { NestedString: "" }
        },
        "object:polymorphic": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/PolymorphicPlugin",
            controlClass: "sap.m.VBox",
            displayControlClass: "sap.m.VBox",
            displaySameAsEdit: true,
            displayValueCheck: "polymorphicChild",
            serializesTo: "object",
            supportsRowClone: false,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "object",
                ui: { label: "Polymorphic Field", widget: "polymorphic" },
                discriminator: { propertyName: "kind" },
                oneOf: [
                    { title: "Text Variant", properties: { kind: { type: "string", const: "text" }, textVal: { type: "string" } } },
                    { title: "Num Variant", properties: { kind: { type: "string", const: "num" }, numVal: { type: "number" } } }
                ]
            },
            sampleValue: { kind: "text", textVal: "Alpha" },
            mutatedValue: { kind: "num", numVal: 99 }
        },
        "string:date": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin",
            controlClass: "sap.m.DatePicker",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", format: "date", ui: { label: "String Date Field", widget: "date" } },
            sampleValue: "2026-12-31",
            mutatedValue: "2027-01-15",
            invalidValue: ""
        },
        "string:datePicker": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin",
            controlClass: "sap.m.DatePicker",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "String DatePicker", widget: "datePicker" } },
            sampleValue: "2026-12-31",
            mutatedValue: "2027-01-15",
            invalidValue: ""
        },
        "date:date": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin",
            controlClass: "sap.m.DatePicker",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "date", ui: { label: "Date Widget Field", widget: "date" } },
            sampleValue: "2026-12-31",
            mutatedValue: "2027-01-15",
            invalidValue: ""
        },
        "date:datePicker": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin",
            controlClass: "sap.m.DatePicker",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "date", ui: { label: "DatePicker Field", widget: "datePicker" } },
            sampleValue: "2026-12-31",
            mutatedValue: "2027-01-15",
            invalidValue: ""
        },
        "string:time": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/TimePlugin",
            controlClass: "sap.m.TimePicker",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "Time Field", widget: "time" } },
            sampleValue: "15:45:00",
            mutatedValue: "09:30:00",
            invalidValue: ""
        },
        "string:datetime": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/DateTimePlugin",
            controlClass: "sap.m.DateTimePicker",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "DateTime Field", widget: "datetime" } },
            sampleValue: "2026-12-31T15:45:00Z",
            mutatedValue: "2027-06-01T10:00:00Z",
            invalidValue: ""
        },
        "boolean:switch": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/SwitchPlugin",
            controlClass: "sap.m.Switch",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "boolean",
            supportsRowClone: true,
            errorStateMechanism: "none",
            sampleMeta: { type: "boolean", ui: { label: "Switch Field", widget: "switch" } },
            sampleValue: false,
            mutatedValue: true,
            invalidValue: null
        },
        "number:step": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/StepInputPlugin",
            controlClass: "sap.m.StepInput",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "number",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "number", minimum: 0, maximum: 10, multipleOf: 1, ui: { label: "Step Field", widget: "step" } },
            sampleValue: 5,
            mutatedValue: 8,
            invalidValue: -5
        },
        "integer:step": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/StepInputPlugin",
            controlClass: "sap.m.StepInput",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "number",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "integer", minimum: 0, maximum: 10, multipleOf: 1, ui: { label: "Int Step Field", widget: "step" } },
            sampleValue: 3,
            mutatedValue: 7,
            invalidValue: -5
        },
        "string:select": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/DropdownPlugin",
            controlClass: "sap.m.Select",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "string",
                ui: { label: "Select Field", widget: "select" },
                valueHelp: [{ key: "OPT_1", text: "Option 1" }, { key: "OPT_2", text: "Option 2" }]
            },
            sampleValue: "OPT_2",
            mutatedValue: "OPT_1",
            invalidValue: ""
        },
        "number:select": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/DropdownPlugin",
            controlClass: "sap.m.Select",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "number",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "number",
                ui: { label: "Number Select", widget: "select" },
                valueHelp: [{ key: "10", text: "Ten" }, { key: "20", text: "Twenty" }]
            },
            sampleValue: 10,
            mutatedValue: 20,
            invalidValue: ""
        },
        "integer:select": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/DropdownPlugin",
            controlClass: "sap.m.Select",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "number",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "integer",
                ui: { label: "Integer Select", widget: "select" },
                valueHelp: [{ key: "1", text: "One" }, { key: "2", text: "Two" }]
            },
            sampleValue: 1,
            mutatedValue: 2,
            invalidValue: ""
        },
        "string:textArea": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/TextAreaPlugin",
            controlClass: "sap.m.TextArea",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "TextArea Field", widget: "textArea", rows: 3 } },
            sampleValue: "Line 1\nLine 2",
            mutatedValue: "Updated multiline text",
            invalidValue: ""
        },
        "string:codeEditor": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/CodeEditorPlugin",
            controlClass: "sap.ui.codeeditor.CodeEditor",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: false,
            errorStateMechanism: "none",
            sampleMeta: { type: "string", ui: { label: "Code Editor", widget: "codeEditor" } },
            sampleValue: "function test() { return true; }",
            mutatedValue: "const x = 42;"
        },
        "string:link": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/LinkPlugin",
            controlClass: "sap.m.Link",
            displayControlClass: "sap.m.Link",
            displaySameAsEdit: true,
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "none",
            sampleMeta: { type: "string", ui: { label: "Link Field", widget: "link" } },
            sampleValue: "https://ui5.sap.com",
            mutatedValue: "https://sap.com",
            invalidValue: ""
        },
        "string:password": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/PasswordPlugin",
            controlClass: "sap.m.Input",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "Password Field", widget: "password" } },
            sampleValue: "Secret123!",
            mutatedValue: "NewSecret456!",
            invalidValue: ""
        },
        "string:email": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/EmailPlugin",
            controlClass: "sap.m.Input",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "Email Field", widget: "email" } },
            sampleValue: "user@example.com",
            mutatedValue: "admin@siliconst.com",
            invalidValue: ""
        },
        "string:fileUploader": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/FileUploaderPlugin",
            controlClass: "sap.m.VBox",
            displayControlClass: "sap.m.VBox",
            displaySameAsEdit: true,
            displayValueCheck: "fileUploaderText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "File Uploader", widget: "fileUploader" } },
            sampleValue: "https://example.com/doc.pdf",
            mutatedValue: "https://example.com/updated.pdf",
            invalidValue: ""
        },
        "array:multiSelect": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/MultiSelectPlugin",
            controlClass: "sap.m.MultiComboBox",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "array",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "array",
                enum: ["OPT_1", "OPT_2", "OPT_3"],
                ui: { label: "Multi Select", widget: "multiSelect" }
            },
            sampleValue: ["OPT_1", "OPT_3"],
            mutatedValue: ["OPT_2"],
            invalidValue: []
        },
        "array:multiInput": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/MultiInputPlugin",
            controlClass: "sap.m.MultiInput",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "array",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "array",
                items: { type: "string" },
                ui: { label: "Multi Input", widget: "multiInput" }
            },
            sampleValue: ["Tag1", "Tag2"],
            mutatedValue: ["Tag1", "Tag2", "Tag3"],
            invalidValue: []
        },
        "number:slider": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/SliderPlugin",
            controlClass: "sap.m.Slider",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "number",
            supportsRowClone: true,
            errorStateMechanism: "none",
            sampleMeta: { type: "number", minimum: 0, maximum: 100, multipleOf: 5, ui: { label: "Slider", widget: "slider" } },
            sampleValue: 75,
            mutatedValue: 50,
            invalidValue: null
        },
        "integer:slider": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/SliderPlugin",
            controlClass: "sap.m.Slider",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "number",
            supportsRowClone: true,
            errorStateMechanism: "none",
            sampleMeta: { type: "integer", minimum: 0, maximum: 100, multipleOf: 5, ui: { label: "Int Slider", widget: "slider" } },
            sampleValue: 40,
            mutatedValue: 60,
            invalidValue: null
        },
        "number:rating": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/RatingIndicatorPlugin",
            controlClass: "sap.m.RatingIndicator",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "number",
            supportsRowClone: true,
            errorStateMechanism: "none",
            sampleMeta: { type: "number", maximum: 5, ui: { label: "Rating", widget: "rating" } },
            sampleValue: 4,
            mutatedValue: 5,
            invalidValue: null
        },
        "integer:rating": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/RatingIndicatorPlugin",
            controlClass: "sap.m.RatingIndicator",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "number",
            supportsRowClone: true,
            errorStateMechanism: "none",
            sampleMeta: { type: "integer", maximum: 5, ui: { label: "Int Rating", widget: "rating" } },
            sampleValue: 3,
            mutatedValue: 5,
            invalidValue: null
        },
        "string:messageStrip": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/MessageStripPlugin",
            controlClass: "sap.m.MessageStrip",
            displayControlClass: "sap.m.MessageStrip",
            displaySameAsEdit: true,
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: false,
            errorStateMechanism: "none",
            sampleMeta: { type: "string", ui: { widget: "messageStrip" } },
            sampleValue: "System is operating normally",
            mutatedValue: "Updated system notice"
        },
        "string:camera": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/CameraPlugin",
            controlClass: "nz.co.siliconst.ui5.metaui.controls.CameraControl",
            displayControlClass: "sap.m.Image",
            displayValueCheck: "getSrc",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "Camera", widget: "camera" } },
            sampleValue: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            mutatedValue: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            invalidValue: ""
        },
        "string:signature": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/SignaturePlugin",
            controlClass: "nz.co.siliconst.ui5.metaui.controls.SignatureControl",
            displayControlClass: "sap.m.Image",
            displayValueCheck: "getSrc",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "Signature", widget: "signature" } },
            sampleValue: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            mutatedValue: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            invalidValue: ""
        },
        "object:location": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/GeolocationPlugin",
            controlClass: "nz.co.siliconst.ui5.metaui.controls.GeolocationControl",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "object",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "object",
                properties: { lat: { type: "number" }, lng: { type: "number" } },
                ui: { label: "Geolocation", widget: "location" }
            },
            sampleValue: { lat: -36.8485, lng: 174.7633 },
            mutatedValue: { lat: -41.2865, lng: 174.7762 },
            invalidValue: null
        },
        "string:scanner": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/BarcodeScannerPlugin",
            controlClass: "sap.m.HBox",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "Barcode Scanner", widget: "scanner" } },
            sampleValue: "9300000000012",
            mutatedValue: "9300000000099",
            invalidValue: ""
        },
        "string:voiceInput": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/VoiceInputPlugin",
            controlClass: "nz.co.siliconst.ui5.metaui.controls.VoiceInputControl",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "Voice Input", widget: "voiceInput" } },
            sampleValue: "Recorded speech text",
            mutatedValue: "Updated voice transcript",
            invalidValue: ""
        },
        "string:richText": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/controls/RichTextPlugin",
            controlClass: "nz.co.siliconst.ui5.metaui.controls.RichTextControl",
            displayControlClass: "sap.m.FormattedText",
            displayValueCheck: "equal",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "Rich Text", widget: "richText" } },
            sampleValue: "<b>Bold</b> and <i>Italic</i>",
            mutatedValue: "<p>Updated rich text</p>",
            invalidValue: ""
        },
        "string:urlButton": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/actions/UrlNavigationActionPlugin",
            controlClass: "sap.m.Button",
            displayControlClass: "sap.m.Button",
            displaySameAsEdit: true,
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: false,
            errorStateMechanism: "buttonReject",
            sampleMeta: { type: "string", ui: { label: "URL Action", widget: "urlButton", args: "https://sap.com" } },
            sampleValue: "Launch SAP",
            mutatedValue: "Open Portal"
        },
        "string:submitButton": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/actions/SubmitFormActionPlugin",
            controlClass: "sap.m.Button",
            displayControlClass: "sap.m.Button",
            displaySameAsEdit: true,
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: false,
            errorStateMechanism: "buttonReject",
            sampleMeta: { type: "string", ui: { label: "Submit Action", widget: "submitButton" } },
            sampleValue: "Save Record",
            mutatedValue: "Submit Now"
        },
        "string:clearButton": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/actions/ClearFormActionPlugin",
            controlClass: "sap.m.Button",
            displayControlClass: "sap.m.Button",
            displaySameAsEdit: true,
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: false,
            errorStateMechanism: "buttonReject",
            sampleMeta: { type: "string", ui: { label: "Clear Action", widget: "clearButton" } },
            sampleValue: "Reset Form",
            mutatedValue: "Clear All"
        },
        "string:odataSelect": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/datasources/ODataListBindingPlugin",
            controlClass: "sap.m.ComboBox",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: { type: "string", ui: { label: "OData Select", widget: "odataSelect" } },
            sampleValue: "ID_500",
            mutatedValue: "ID_600",
            invalidValue: ""
        },
        "string:remoteDropdown": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteDropdownPlugin",
            controlClass: "sap.m.Select",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "string",
                ui: { label: "Remote Dropdown", widget: "remoteDropdown" },
                valueHelp: { url: "/mockData/scenarios/index.json", keyPath: "category", textPath: "category" }
            },
            sampleValue: "NZ",
            mutatedValue: "AU",
            invalidValue: ""
        },
        "string:remoteSelect": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteDropdownPlugin",
            controlClass: "sap.m.Select",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "string",
                ui: { label: "Remote Select", widget: "remoteSelect" },
                valueHelp: { url: "/mockData/scenarios/index.json", keyPath: "category", textPath: "category" }
            },
            sampleValue: "NZ",
            mutatedValue: "AU",
            invalidValue: ""
        },
        "string:combobox": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteDropdownPlugin",
            controlClass: "sap.m.ComboBox",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "string",
                ui: { label: "ComboBox", widget: "combobox" },
                valueHelp: [{ key: "CB_1", text: "Combo 1" }, { key: "CB_2", text: "Combo 2" }]
            },
            sampleValue: "CB_1",
            mutatedValue: "CB_2",
            invalidValue: ""
        },
        "string:liveSearch": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/datasources/LiveSearchPlugin",
            controlClass: "sap.m.Input",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "string",
                ui: { label: "Live Search", widget: "liveSearch" },
                valueHelp: { url: "/mockData/scenarios/index.json", keyPath: "category", textPath: "category" }
            },
            sampleValue: "Siliconst",
            mutatedValue: "MetaUI",
            invalidValue: ""
        },
        "string:remoteValueHelp": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteValueHelpPlugin",
            controlClass: "sap.m.Input",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "string",
                ui: { label: "Remote Value Help", widget: "remoteValueHelp" },
                valueHelp: { url: "/mockData/scenarios/index.json", keyPath: "category", textPath: "category" }
            },
            sampleValue: "PROD-99",
            mutatedValue: "PROD-100",
            invalidValue: ""
        },
        "string:valueHelp": {
            modulePath: "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteValueHelpPlugin",
            controlClass: "sap.m.Input",
            displayControlClass: "sap.m.Text",
            displayValueCheck: "getText",
            serializesTo: "string",
            supportsRowClone: true,
            errorStateMechanism: "valueState",
            sampleMeta: {
                type: "string",
                ui: { label: "Value Help", widget: "valueHelp" },
                valueHelp: { url: "/mockData/scenarios/index.json", keyPath: "category", textPath: "category" }
            },
            sampleValue: "PROD-99",
            mutatedValue: "PROD-100",
            invalidValue: ""
        }
    };

    var LAYOUT_MAP = {
        "form": "nz/co/siliconst/ui5/metaui/layouts/FormLayout",
        "table": "nz/co/siliconst/ui5/metaui/layouts/TableLayout",
        "wizard": "nz/co/siliconst/ui5/metaui/layouts/WizardLayout",
        "compact": "nz/co/siliconst/ui5/metaui/layouts/CompactLayout"
    };

    var POLICY_CONDITION_MAP = {
        "NumericGreaterThan": "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/NumericGreaterThanConditionPlugin",
        "NumericLessThan": "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/NumericLessThanConditionPlugin",
        "DateLessThan": "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/DateLessThanConditionPlugin",
        "StringEquals": "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/StringEqualsConditionPlugin",
        "IsNull": "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/IsNullConditionPlugin",
        "IsNotNull": "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/IsNotNullConditionPlugin"
    };

    var POLICY_EFFECT_MAP = {
        "Show": "nz/co/siliconst/ui5/metaui/plugins/policies/effects/BinaryEffectPlugin",
        "Hide": "nz/co/siliconst/ui5/metaui/plugins/policies/effects/BinaryEffectPlugin",
        "Validate": "nz/co/siliconst/ui5/metaui/plugins/policies/effects/BinaryEffectPlugin",
        "Invalidate": "nz/co/siliconst/ui5/metaui/plugins/policies/effects/BinaryEffectPlugin",
        "Require": "nz/co/siliconst/ui5/metaui/plugins/policies/effects/BinaryEffectPlugin",
        "Optional": "nz/co/siliconst/ui5/metaui/plugins/policies/effects/BinaryEffectPlugin",
        "Enable": "nz/co/siliconst/ui5/metaui/plugins/policies/effects/BinaryEffectPlugin",
        "Disable": "nz/co/siliconst/ui5/metaui/plugins/policies/effects/BinaryEffectPlugin"
    };

    var VALIDATOR_LIST = [
        "required",
        "minLength",
        "maxLength",
        "pattern",
        "range",
        "multipleOf",
        "arrayItems",
        "email",
        "url",
        "iban",
        "enum",
        "const",
        "integer",
        "objectProperties"
    ];

    var FORMATTER_LIST = [
        "date",
        "phone",
        "textCase",
        "currency"
    ];

    return {
        PLUGIN_MAP: PLUGIN_MAP,
        LAYOUT_MAP: LAYOUT_MAP,
        POLICY_CONDITION_MAP: POLICY_CONDITION_MAP,
        POLICY_EFFECT_MAP: POLICY_EFFECT_MAP,
        VALIDATOR_LIST: VALIDATOR_LIST,
        FORMATTER_LIST: FORMATTER_LIST
    };
});
