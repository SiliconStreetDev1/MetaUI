sap.ui.define([
    "metaui/sandbox/controller/scenarios/BaseScenarioHelper"
], function (BaseScenarioHelper) {
    "use strict";

    /**
     * @class BasicFormScenarioHelper
     * @description Scenario helper for the Basic Form tests.
     */
    return BaseScenarioHelper.extend("metaui.sandbox.controller.scenarios.BasicFormScenarioHelper", {

        /**
         * Fired before the final validation pipeline executes.
         */
        onBeforeSubmit: function (oEvent) {
            // Apply base logic (e.g. checking if "Name" is "error")
            BaseScenarioHelper.prototype.onBeforeSubmit.apply(this, arguments);
            
            // Add custom basic form logic here if needed
        }

    });
});
