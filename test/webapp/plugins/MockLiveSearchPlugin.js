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
        fetchSuggestions(input, query) {
            var vhConfig = this.metadata && this.metadata.valueHelp;
            if (!vhConfig || !vhConfig.url) {
                return;
            }
            
            if (!query) {
                input.removeAllSuggestionItems();
                return;
            }
            
            input.setBusy(true);
            
            // Simulate network latency for sandbox testing
            setTimeout(() => {
                // Call the original fetchSuggestions method which performs the actual fetch
                super.fetchSuggestions(input, query);
            }, 500); // 500ms artificial delay
        }
    }

    return {
        MockLiveSearchPlugin: MockLiveSearchPlugin
    };
});
