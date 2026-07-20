sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, History, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("metaui.sandbox.controller.scenarios.ClientTable", {
        onInit: function () {
            // Define initial mock records
            var aRecords = [
                {
                    id: 1,
                    name: "Alpha Configuration",
                    metadataString: JSON.stringify({
                        Theme: "Dark",
                        AutoSave: true,
                        RefreshRate: 60
                    }, null, 2)
                },
                {
                    id: 2,
                    name: "Beta Configuration",
                    metadataString: JSON.stringify({
                        Theme: "Light",
                        MaxUsers: 10
                    }, null, 2)
                }
            ];

            var sSnippet = `
<!-- Client Table Inference Example -->
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
                records: aRecords,
                editorDataString: JSON.stringify(aRecords, null, 2),
                liveOutputString: "",
                liveUpdate: true,
                displayMode: false,
                codeExamples: sSnippet.trim()
            });

            this.getView().setModel(this.viewModel, "viewModel");
        },

        onAddRow: function () {
            var aRecords = this.viewModel.getProperty("/records");
            var nextId = aRecords.length > 0 ? aRecords[aRecords.length - 1].id + 1 : 1;
            aRecords.push({
                id: nextId,
                name: "New Item",
                metadataString: JSON.stringify({
                    Theme: "",
                    AutoSave: false,
                    RefreshRate: 0,
                    MaxUsers: 0
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
