import UI5Object from "sap/ui/base/Object";

export interface OpenApiTarget {
    key: string;
    text: string;
}

/**
 * @class
 * OpenApiExtractor utility.
 * Dynamically crawls OpenAPI/Swagger JSON specifications to find all valid 
 * root endpoints and schema definitions that can be used as a schemaTarget.
 * 
 * @extends sap.ui.base.Object
 * @alias nz.co.siliconst.ui5.metaui.swagger.OpenApiExtractor
 */
export default class OpenApiExtractor extends UI5Object {

    /**
     * Parses an OpenAPI document and extracts an array of valid targets.
     * 
     * @public
     * @param oSchema The parsed JSON schema object.
     * @returns Array of target bindings.
     */
    public static extractTargets(rawSchema: unknown): OpenApiTarget[] {
        const aTargets: OpenApiTarget[] = [];
        if (!rawSchema || typeof rawSchema !== "object") {
            return aTargets;
        }

        const oSchema = rawSchema as Record<string, unknown>;

        // OpenAPI 3.0 (components/schemas)
        if (typeof oSchema.openapi === "string" && oSchema.openapi.startsWith("3.") && oSchema.components && typeof (oSchema.components as Record<string,unknown>).schemas === "object") {
            Object.keys((oSchema.components as Record<string,unknown>).schemas as Record<string,unknown>).forEach((sKey) => {
                aTargets.push({
                    key: "#/components/schemas/" + sKey,
                    text: "Schema: " + sKey
                });
            });
        }
        
        // Swagger 2.0 (definitions)
        if (typeof oSchema.swagger === "string" && oSchema.swagger.startsWith("2.") && typeof oSchema.definitions === "object" && oSchema.definitions !== null) {
            Object.keys(oSchema.definitions as Record<string,unknown>).forEach((sKey) => {
                aTargets.push({
                    key: "#/definitions/" + sKey,
                    text: "Definition: " + sKey
                });
            });
        }

        // Extract endpoints
        if (typeof oSchema.paths === "object" && oSchema.paths !== null) {
            Object.keys(oSchema.paths as Record<string,unknown>).forEach((sPath) => {
                const methods = (oSchema.paths as Record<string,unknown>)[sPath];
                if (methods && typeof methods === "object") {
                    Object.keys(methods).forEach((sMethod) => {
                        const escapedPath = sPath.replace(/\//g, "~1");
                        aTargets.push({
                            key: "#/paths/" + escapedPath + "/" + sMethod,
                            text: "Operation: " + sMethod.toUpperCase() + " " + sPath
                        });
                    });
                }
            });
        }

        // Primary Schema Detection
        if (aTargets.length > 1) {
            let bestScore = -1;
            let bestIndex = -1;
            
                    const info = oSchema.info as Record<string, unknown> | undefined;
            const title = (info && typeof info.title === "string") ? info.title.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
            const titleWords = (info && typeof info.title === "string") ? info.title.toLowerCase().split(/[\s_-]+/) : [];
            
            aTargets.forEach((target, index) => {
                let score = 0;
                
                // Only score Schemas/Definitions, not operations for the primary node heuristic
                if (target.key.includes("/schemas/") || target.key.includes("/definitions/")) {
                    const name = target.key.split("/").pop() || "";
                    const nameLower = name.toLowerCase();
                    const nameClean = nameLower.replace(/[^a-z0-9]/g, "");
                    
                    if (title && nameClean === title) score += 30; // Reduced from 100
                    else if (title && title.includes(nameClean)) score += 15; // Reduced from 50
                    else if (title && nameClean.includes(title)) score += 15; // Reduced from 50
                    
                    titleWords.forEach((word: string) => {
                        if (word.length > 3 && nameLower.includes(word)) score += 5; // Reduced from 10
                    });
                    
                    const genericRoots = ["root", "main", "app", "application", "payload", "document"];
                    if (genericRoots.some(r => nameLower.includes(r))) score += 5;

                    // Complexity Fallback
                    let schemaDef: Record<string, unknown> | null = null;
                    if (target.key.startsWith("#/components/schemas/") && typeof oSchema.components === "object" && oSchema.components !== null) {
                        const components = oSchema.components as Record<string, unknown>;
                        if (typeof components.schemas === "object" && components.schemas !== null) {
                            schemaDef = (components.schemas as Record<string, Record<string, unknown>>)[name] || null;
                        }
                    } else if (target.key.startsWith("#/definitions/") && typeof oSchema.definitions === "object" && oSchema.definitions !== null) {
                        schemaDef = (oSchema.definitions as Record<string, Record<string, unknown>>)[name] || null;
                    }

                    if (schemaDef && typeof schemaDef === "object") {
                        const scoreSchemaNode = (node: unknown) => {
                            if (!node || typeof node !== "object") return;
                            const nodeObj = node as Record<string, unknown>;
                            if (nodeObj.properties && typeof nodeObj.properties === "object") {
                                score += Object.keys(nodeObj.properties).length * 2; // +2 per property
                                Object.values(nodeObj.properties).forEach((prop: unknown) => {
                                    if (prop && typeof prop === "object") {
                                        const propObj = prop as Record<string, unknown>;
                                        if (propObj.$ref) score += 20; // +20 for referencing sub-schemas (aggregate root)
                                        if (propObj.items && typeof propObj.items === "object" && (propObj.items as Record<string, unknown>).$ref) score += 20;
                                    }
                                });
                            }
                            
                            if (nodeObj.required && Array.isArray(nodeObj.required)) {
                                score += nodeObj.required.length * 5; // +5 per required constraint
                            }
                        };

                        scoreSchemaNode(schemaDef);

                        // Handle OpenAPI composition structures
                        if (schemaDef.allOf && Array.isArray(schemaDef.allOf)) {
                            schemaDef.allOf.forEach(scoreSchemaNode);
                        }
                        if (schemaDef.anyOf && Array.isArray(schemaDef.anyOf)) {
                            schemaDef.anyOf.forEach(scoreSchemaNode);
                        }
                        if (schemaDef.oneOf && Array.isArray(schemaDef.oneOf)) {
                            schemaDef.oneOf.forEach(scoreSchemaNode);
                        }
                    }
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = index;
                }
            });

            if (bestIndex !== -1 && bestScore > 0) {
                const primary = aTargets.splice(bestIndex, 1)[0];
                primary.text = `(Recommended) ${primary.text}`;
                aTargets.unshift(primary);
            }
        }

        return aTargets;
    }
}
