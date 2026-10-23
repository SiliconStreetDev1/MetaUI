/**
 * @file SchemaValidator.ts
 * @description Structural validation utility to catch developer errors in the JSON schema itself.
 */

import { FieldType, ISchema } from "../interfaces/ISchema";
import { SCHEMA_TYPE, MAX_SCHEMA_DEPTH } from "../constants/MetaUIConstants";
import { PayloadValidator } from "./PayloadValidator";
import { SchemaWalker } from "./SchemaWalker";
import { isRecord, readString, readRecord } from "../utils/TypeGuards";
import { Logger } from "../utils/Logger";

const ALLOWED_TYPES: readonly FieldType[] = [
    SCHEMA_TYPE.STRING,
    SCHEMA_TYPE.NUMBER,
    SCHEMA_TYPE.INTEGER,
    SCHEMA_TYPE.BOOLEAN,
    SCHEMA_TYPE.DATE,
    SCHEMA_TYPE.OBJECT,
    SCHEMA_TYPE.ARRAY
];

/**
 * Validates a normalized or raw JSON schema object for structural soundness before rendering.
 */
export class SchemaValidator {
    /**
     * Validates a parsed JSON schema object for structural correctness.
     * @param schema The schema object to validate.
     * @param initialDepth Optional starting depth for nested validation calls.
     * @returns {string[]} An array of error strings. Empty if no errors.
     */
    public static validateSchemaStructure(schema: unknown, initialDepth: number = 0): string[] {
        const errors: string[] = [];

        if (!isRecord(schema)) {
            return ["Root schema must be an object."];
        }

        SchemaWalker.walk(
            schema as Partial<ISchema>,
            (ctx) => {
                const rawNode: unknown = ctx.rawNode;
                if (!isRecord(rawNode)) {
                    return;
                }
                const rootType = readString(rawNode, "type");
                if (rootType !== SCHEMA_TYPE.OBJECT && rootType !== SCHEMA_TYPE.ARRAY) {
                    errors.push(`Root schema must have type 'object' or 'array'. Found: '${String(rawNode.type)}'`);
                }

                const properties = readRecord(rawNode, "properties");
                const hasAlternativeObjectStructure =
                    rawNode.additionalProperties !== undefined ||
                    Array.isArray(rawNode.oneOf) ||
                    Array.isArray(rawNode.anyOf) ||
                    Array.isArray(rawNode.allOf) ||
                    typeof rawNode.$ref === "string";
                if (rootType === SCHEMA_TYPE.OBJECT && !properties && !hasAlternativeObjectStructure) {
                    errors.push("Object schema is missing the 'properties' node.");
                }

                if (rootType === SCHEMA_TYPE.ARRAY) {
                    const items = readRecord(rawNode, "items");
                    if (!items && typeof rawNode.$ref !== "string") {
                        errors.push("Array schema is missing the 'items' node.");
                    } else if (items) {
                        const itemsType = readString(items, "type");
                        if (
                            itemsType &&
                            itemsType !== SCHEMA_TYPE.OBJECT &&
                            itemsType !== SCHEMA_TYPE.ARRAY &&
                            !(ALLOWED_TYPES as readonly string[]).includes(itemsType)
                        ) {
                            errors.push(
                                `Array items has invalid type '${itemsType}'. Allowed: ${ALLOWED_TYPES.join(", ")}`
                            );
                        }
                    }
                } else {
                    errors.push(...SchemaValidator.checkNotSubSchema(rawNode, "Root schema"));
                }
            },
            {
                visitRoot: true,
                resolveRefs: false,
                initialDepth,
                silentTruncationLog: true,
                onInvalidProperty: (key) => {
                    errors.push(`Property '${key}' must be an object.`);
                },
                shouldVisitChild: (child, key, parent, isArrayItem) => {
                    const parentUnknown: unknown = parent;
                    const childUnknown: unknown = child;
                    if (!isRecord(parentUnknown) || !isRecord(childUnknown)) {
                        return false;
                    }
                    if (isArrayItem) {
                        if (readString(parentUnknown, "type") !== SCHEMA_TYPE.ARRAY) {
                            return false;
                        }
                        const itemsType = readString(childUnknown, "type");
                        return itemsType === SCHEMA_TYPE.OBJECT || itemsType === SCHEMA_TYPE.ARRAY;
                    }
                    errors.push(...SchemaValidator.checkNotSubSchema(childUnknown, `Property '${key}'`));
                    const propType = readString(childUnknown, "type");
                    if (!propType) {
                        errors.push(`Property '${key}' is missing 'type'.`);
                        return false;
                    }
                    if (!(ALLOWED_TYPES as readonly string[]).includes(propType)) {
                        errors.push(
                            `Property '${key}' has invalid type '${propType}'. Allowed: ${ALLOWED_TYPES.join(", ")}`
                        );
                        return false;
                    }
                    if (
                        propType === SCHEMA_TYPE.ARRAY &&
                        !isRecord(childUnknown.items) &&
                        typeof childUnknown.$ref !== "string" &&
                        !Array.isArray(childUnknown.enum) &&
                        childUnknown.valueHelp === undefined &&
                        !(isRecord(childUnknown.ui) && childUnknown.ui.valueHelp !== undefined)
                    ) {
                        errors.push(`Array property '${key}' is missing 'items'.`);
                        return false;
                    }
                    return propType === SCHEMA_TYPE.OBJECT && isRecord(childUnknown.properties);
                },
                onLeave: (ctx) => {
                    const rawNode: unknown = ctx.rawNode;
                    if (isRecord(rawNode) && readString(rawNode, "type") === SCHEMA_TYPE.ARRAY) {
                        errors.push(...SchemaValidator.checkNotSubSchema(rawNode, "Root schema"));
                    }
                },
                onTruncate: (_scope, reason) => {
                    if (reason === "depth") {
                        Logger.warn(
                            "[MetaUI SchemaValidator]",
                            `Schema nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); this subtree was reported ` +
                                `structurally valid without being checked.`
                        );
                    }
                }
            }
        );

        return errors;
    }

    /**
     * Reports a `not` sub-schema the validation pipeline cannot evaluate.
     *
     * A `not` block that asserts nothing testable is accepted by {@link PayloadValidator} rather than
     * inverted into "reject everything", so without this report the schema author would be told nothing
     * and would reasonably assume the constraint was enforced. The check is structural and runs once per
     * generation, not once per keystroke.
     *
     * @param node The schema node that may carry a `not` block.
     * @param label A human-readable name for the node, used in the message.
     * @returns {string[]} A single-entry array when the `not` block is unevaluable, otherwise empty.
     */
    private static checkNotSubSchema(node: Record<string, unknown>, label: string): string[] {
        if (node.not === undefined) {
            return [];
        }
        if (!isRecord(node.not)) {
            return [`${label} declares a 'not' that is not a schema object; it cannot be enforced.`];
        }
        if (!PayloadValidator.isEvaluableNot(node.not)) {
            return [
                `${label} declares a 'not' sub-schema with no constraint this engine can evaluate, ` +
                    `so it is not enforced. Declare a testable keyword inside it (for example 'const', ` +
                    `'enum', 'pattern', a length or a numeric bound).`
            ];
        }
        return [];
    }
}
