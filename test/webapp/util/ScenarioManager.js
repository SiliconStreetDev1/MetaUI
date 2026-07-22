sap.ui.define([
    "sap/ui/base/Object",
    "sap/base/Log"
], function (UI5Object, Log) {
    "use strict";

    /**
     * @class
     * ScenarioManager handles the asynchronous fetching, caching, and serving 
     * of externalized scenario JSON files.
     * 
     * This module adheres to the Single Responsibility Principle by completely 
     * detaching data retrieval from the view controllers.
     * 
     * @extends sap.ui.base.Object
     * @alias metaui.sandbox.util.ScenarioManager
     */
    var ScenarioManager = UI5Object.extend("metaui.sandbox.util.ScenarioManager", {
        
        constructor: function () {
            UI5Object.apply(this, arguments);
            this._cache = {};
            this._index = null;
        }

    });

    /**
     * Fetches the index of all available scenarios.
     * 
     * @public
     * @returns {Promise<Array<{key: string, name: string}>>} Promise resolving to the index array.
     */
    ScenarioManager.prototype.getIndex = function () {
        if (this._index) {
            return Promise.resolve(this._index);
        }

        var sUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/scenarios/index.json");
        return fetch(sUrl)
            .then(function (res) {
                if (!res.ok) throw new Error("Failed to load scenario index");
                return res.json();
            })
            .then(function (data) {
                this._index = data;
                return data;
            }.bind(this))
            .catch(function (err) {
                Log.error("[ScenarioManager]", "Failed to load index: " + err.message);
                throw err;
            });
    };

    /**
     * Fetches the payload for a specific scenario by key.
     * Results are cached to prevent redundant network requests.
     * 
     * @public
     * @param {string} sKey The unique key of the scenario (e.g., 'kitchen_sink')
     * @returns {Promise<{data: object, schema?: object}>} Promise resolving to the scenario payload.
     */
    ScenarioManager.prototype.getScenario = function (sKey) {
        if (this._cache[sKey]) {
            return Promise.resolve(this._cache[sKey]);
        }

        var sUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/scenarios/" + sKey + ".json");
        return fetch(sUrl)
            .then(function (res) {
                if (!res.ok) throw new Error("Failed to load scenario: " + sKey);
                return res.json();
            })
            .then(function (data) {
                this._cache[sKey] = data;
                return data;
            }.bind(this))
            .catch(function (err) {
                Log.error("[ScenarioManager]", "Failed to fetch scenario " + sKey + ": " + err.message);
                throw err;
            });
    };

    // Return a singleton instance to be shared across the Sandbox
    return new ScenarioManager();
});
