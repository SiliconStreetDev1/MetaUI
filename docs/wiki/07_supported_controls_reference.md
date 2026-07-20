# 07. Supported Controls Reference

MetaUI comes with a vast library of built-in controls. The engine uses a combination of the JSON Schema `type` and the `ui.widget` hint to instantiate the correct UI5 control. 

This document serves as a master reference for all natively supported plugins.

---

## Standard Primitives

### 1. String (Text Input)
The default control for text data. Mapped to `sap.m.Input`.
* **Type:** `"string"`
* **Validations:** `maxLength`, `pattern`, `minLength`
```json
{
    "FirstName": {
        "type": "string",
        "maxLength": 50,
        "ui": { "label": "First Name" }
    }
}
```

### 2. Number (Numeric Input)
Mapped to `sap.m.Input` with numeric type enforcement.
* **Type:** `"number"` or `"integer"`
* **Validations:** `minimum`, `maximum`, `multipleOf`
```json
{
    "Age": {
        "type": "integer",
        "minimum": 18,
        "ui": { "label": "Age" }
    }
}
```

### 3. Boolean (Switch/Checkbox)
Mapped to `sap.m.Switch` (default) or `sap.m.CheckBox`.
* **Type:** `"boolean"`
* **Options:** `ui.widget = "switch" | "checkbox"`
```json
{
    "IsActive": {
        "type": "boolean",
        "ui": { "label": "Account Active", "widget": "switch" }
    }
}
```

---

## Dates & Time

### 4. Date Picker
Mapped to `sap.m.DatePicker`.
* **Type:** `"string"`
* **Format:** `"date"`
```json
{
    "BirthDate": {
        "type": "string",
        "format": "date",
        "ui": { "label": "Date of Birth" }
    }
}
```

### 5. Date/Time Picker
Mapped to `sap.m.DateTimePicker`.
* **Type:** `"string"`
* **Format:** `"date-time"`
```json
{
    "AppointmentTime": {
        "type": "string",
        "format": "date-time",
        "ui": { "label": "Appointment Time" }
    }
}
```

---

## Selection Controls

### 6. Dropdown (Select)
Mapped to `sap.m.Select`. Requires `enum` or `ui.valueHelp` arrays.
* **Type:** `"string"`
* **Widget:** `"dropdown"`
```json
{
    "Status": {
        "type": "string",
        "ui": {
            "label": "Status",
            "widget": "dropdown",
            "valueHelp": [
                { "key": "NEW", "text": "New" },
                { "key": "WIP", "text": "In Progress" }
            ]
        }
    }
}
```

### 7. Multi-Select (ComboBox / MultiComboBox)
Mapped to `sap.m.MultiComboBox`. Data payload will be an array of strings.
* **Type:** `"array"`
* **Items Type:** `"string"`
* **Widget:** `"multiSelect"`
```json
{
    "Roles": {
        "type": "array",
        "items": { "type": "string" },
        "ui": {
            "label": "Assigned Roles",
            "widget": "multiSelect",
            "valueHelp": [
                { "key": "ADMIN", "text": "Administrator" },
                { "key": "USER", "text": "Standard User" }
            ]
        }
    }
}
```

---

## Advanced Integrations

### 8. Live Search (OData)
Provides a search field that fetches data dynamically.
* **Type:** `"string"`
* **Widget:** `"liveSearch"` (Implementation requires registering a custom data source plugin).

### 9. Remote Value Help Dialog
Triggers a complex pop-up table for selecting records from a backend system.
* **Type:** `"string"`
* **Widget:** `"searchHelp"`

### 10. File Uploader
Mapped to `sap.ui.unified.FileUploader`. Extracts file as Base64 or posts to a URL.
* **Type:** `"string"`
* **Widget:** `"fileUploader"`

### 10b. Code Editor
Provides a `sap.ui.codeeditor.CodeEditor` for syntax-highlighted code/JSON editing.
* **Type:** `"string"`
* **Widget:** `"codeEditor"`

---

## Hardware & Media (Base64 Outputs)

*All hardware plugins extract data directly into the JSON payload as Base64 strings or structured objects, requiring no native app wrapper.*

### 11. Camera
Triggers the native device camera to snap a photo (`image/jpeg`).
* **Type:** `"string"`
* **Widget:** `"camera"`

### 12. Signature Pad
Renders an HTML5 Canvas to capture freehand signatures (`image/png`).
* **Type:** `"string"`
* **Widget:** `"signature"`

### 13. Barcode Scanner
Uses native device cameras to scan 1D/2D barcodes and QR codes.
* **Type:** `"string"`
* **Widget:** `"scanner"`

### 14. Voice Dictation
Uses the browser's `SpeechRecognition` API to convert speech to text.
* **Type:** `"string"`
* **Widget:** `"voiceInput"`

### 15. Geolocation
Captures real-time GPS coordinates using the browser's geolocation API.
* **Type:** `"object"`
* **Widget:** `"location"`
* **Payload Format:** `{ "lat": -36.8485, "lng": 174.7633 }`

### 16. Rich Text Editor
Provides a full WYSIWYG HTML editor for rich descriptions.
* **Type:** `"string"`
* **Widget:** `"richText"`

---

## Layouts & Structure

### 17. Array Table
Automatically maps arrays of objects to an editable `sap.m.Table`.
* **Type:** `"array"`
* **Items Type:** `"object"`

### 18. Message Strip
A read-only visual banner to display warnings or information.
* **Type:** `"string"`
* **Widget:** `"messageStrip"`
