sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, History, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("metaui.sandbox.controller.scenarios.ComplexClientTable", {
        onInit: function () {
            // Define the explicit schema
            var oSchema = {
                type: "object",
                layoutStrategy: "compact", // Request the dense layout explicitly
                properties: {
                    Theme: { type: "string", enum: ["Light", "Dark", "High Contrast"], ui: { label: "UI Theme", widget: "select" } },
                    AutoSave: { type: "boolean", ui: { label: "Auto Save" } },
                    RefreshRate: { type: "number", ui: { label: "Refresh Rate (s)" } },
                    MaxUsers: { type: "number", ui: { label: "Max Allowed Users" } },
                    Servers: {
                        type: "array",
                        ui: { label: "Assigned Servers" },
                        items: {
                            type: "object",
                            properties: {
                                Hostname: { type: "string", ui: { label: "Hostname" } },
                                IPAddress: { type: "string", ui: { label: "IP Address" } }
                            }
                        }
                    }
                }
            };

            // Define initial mock records
            var aRecords = [
                {
                    id: 1,
                    name: "Alpha Configuration",
                    metadataString: JSON.stringify({
                        Theme: "Dark",
                        AutoSave: true,
                        RefreshRate: 60,
                        MaxUsers: 100,
                        Servers: [
                            { Hostname: "web-01", IPAddress: "192.168.1.10" }
                        ]
                    }, null, 2)
                },
                {
                    id: 2,
                    name: "Beta Configuration",
                    metadataString: JSON.stringify({
                        Theme: "Light",
                        AutoSave: false,
                        RefreshRate: 120,
                        MaxUsers: 10,
                        Servers: []
                    }, null, 2)
                }
            ];

            var sSnippet = `
<!-- Complex Client Table Schema Example -->
<Table items="{viewModel>/records}">
    <columns>
        <Column><Text text="ID" /></Column>
        <Column><Text text="Metadata" /></Column>
    </columns>
    <items>
        <ColumnListItem>
            <cells>
                <Text text="{viewModel>id}" />
                <meta:DynamicHost 
                    schemaDefinition="{viewModel>/schemaDefinition}"
                    dataJson="{viewModel>metadataString}" 
                    dataJson="{viewModel>metadataString}" 
                    liveUpdate="{viewModel>/liveUpdate}"
                    displayMode="{viewModel>/displayMode}" />
            </cells>
        </ColumnListItem>
    </items>
</Table>
`;

            // Setup the local JSON Model
            this.viewModel = new JSONModel({
                schemaDefinition: oSchema,
                editorSchemaString: JSON.stringify(oSchema, null, 2),
                records: aRecords,
                editorDataString: JSON.stringify(aRecords, null, 2),
                liveOutputString: "",
                liveUpdate: true,
                displayMode: false,
                codeExamples: sSnippet.trim()
            });

            this.getView().setModel(this.viewModel, "viewModel");
        },

        onRegeneratePress: function () {
            try {
                var sSchemaStr = this.viewModel.getProperty("/editorSchemaString");
                var oParsedSchema = JSON.parse(sSchemaStr);
                this.viewModel.setProperty("/schemaDefinition", oParsedSchema);
                MessageToast.show("UI Regenerated from Schema successfully.");
            } catch (e) {
                MessageToast.show("Invalid JSON Schema syntax.");
            }
        },

        onAddRow: function () {
            var aRecords = this.viewModel.getProperty("/records");
            var nextId = aRecords.length > 0 ? aRecords[aRecords.length - 1].id + 1 : 1;
            aRecords.push({
                id: nextId,
                name: "New Item",
                metadataString: JSON.stringify({
                    Theme: "Light",
                    AutoSave: false,
                    RefreshRate: 30,
                    MaxUsers: 5,
                    Servers: []
                }, null, 2)
            });
            this.viewModel.setProperty("/records", aRecords);
            this.viewModel.setProperty("/editorDataString", JSON.stringify(aRecords, null, 2));
        },

        onDeleteRow: function (oEvent) {
            var oButton = oEvent.getSource();
            var oContext = oButton.getBindingContext("viewModel");
            var sPath = oContext.getPath();
            
            var iIndex = parseInt(sPath.split("/").pop(), 10);
            
            var aRecords = this.viewModel.getProperty("/records");
            aRecords.splice(iIndex, 1);
            this.viewModel.setProperty("/records", aRecords);
            this.viewModel.setProperty("/editorDataString", JSON.stringify(aRecords, null, 2));
        },

        onFieldChange: function () {
            if (this.viewModel.getProperty("/liveUpdate")) {
                var aRecords = this.viewModel.getProperty("/records");
                this.viewModel.setProperty("/editorDataString", JSON.stringify(aRecords, null, 2));
            }
        },

        onInboundStringChange: function (oEvent) {
            var newVal = oEvent.getParameter("value");
            try {
                var parsed = JSON.parse(newVal);
                if (Array.isArray(parsed)) {
                    this.viewModel.setProperty("/records", parsed);
                }
            } catch (e) {}
        },

        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                var oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo("home", {}, true);
            }
        }
    });
});
