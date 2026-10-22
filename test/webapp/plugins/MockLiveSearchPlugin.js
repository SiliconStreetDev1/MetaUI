sap.ui.define([
    "nz/co/siliconst/ui5/metaui/plugins/datasources/LiveSearchPlugin"
], function (LiveSearchPluginModule) {
    "use strict";

    /**
     * A Mock subclass of the real LiveSearchPlugin.
     * Intercepts the fetchSuggestions method to inject artificial latency,
     * ensuring the test application operates independently of a real backend, while
     * keeping the core MetaUI engine pure.
     */
    class MockLiveSearchPlugin extends LiveSearchPluginModule.LiveSearchPlugin {
        scheduleSearch(input, term, ds) {
            if (!ds || !ds.url) {
                return;
            }
            if (!term || term.trim().length < 2) {
                input.destroySuggestionItems();
                return;
            }
            super.scheduleSearch(input, term, ds);
        }
    }

    return {
        MockLiveSearchPlugin: MockLiveSearchPlugin
    };
});
