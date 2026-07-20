/**
 * @file ExpressionBuilder.ts
 * @description Safely parses and builds UI5 expression bindings from JSON Schema condition rules.
 */

export class ExpressionBuilder {
    /**
     * Safely converts a raw condition rule (e.g. "$root.Status === 'NEW'") into a valid UI5 
     * expression binding string, preserving relative vs absolute paths.
     * 
     * @param rule The raw schema condition rule (e.g., "$root.Category === 'A' || SubCategory === 'B'").
     * @param bindingPath The absolute binding path of the current field (e.g., "/Items/0/Category").
     * @param modelName The UI5 JSONModel name (default "meta").
     * @returns {string} The fully formed UI5 expression binding (e.g., "{= ${meta>/Status} === 'NEW' }").
     */
    public static build(rule: string, bindingPath: string, modelName: string = "meta"): string {
        if (!rule) return "{= true }";

        let parsedRule = rule;

        // 1. Replace absolute $root paths
        // $root.Status -> ${meta>/Status}
        parsedRule = parsedRule.replace(/\$root\.([a-zA-Z0-9_.]+)/g, (match, path) => {
            return `\${${modelName}>/${path.replace(/\./g, '/')}}`;
        });

        // 2. Replace relative paths
        parsedRule = parsedRule.replace(/(?<!['"\${a-zA-Z0-9_.>/-])([a-zA-Z_][a-zA-Z0-9_.]+)(?!['"a-zA-Z0-9_.(])/g, (match, path) => {
            const reserved = ["true", "false", "null", "undefined", "Math", "String", "Number", "Array", "Object"];
            if (reserved.includes(path)) return path;

            // Resolve relative to the current binding path context
            let basePath = bindingPath.startsWith("/") ? bindingPath.substring(1) : bindingPath;
            const parts = basePath.split('/');
            parts.pop(); 
            const contextPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
            
            return `\${${modelName}>/${contextPrefix}${path.replace(/\./g, '/')}}`;
        });

        return `{= ${parsedRule} }`;
    }
}
