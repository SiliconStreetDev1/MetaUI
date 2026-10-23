/**
 * @file IbanValidatorPlugin.ts
 * @description Validates International Bank Account Numbers (ISO 13616).
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Full IBAN validation: structural check plus the ISO 7064 MOD 97-10 checksum.
 * Spaces are ignored and letters are case-insensitive, matching how IBANs are printed.
 */
export class IbanValidatorPlugin implements IValidator {
    /**
     * Activates when `ui.format` is set to `"iban"`.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        const fmt = propMeta.ui?.format || propMeta.format;
        return { active: fmt === "iban" };
    }

    /**
     * @param parsedValue The value to test.
     * @returns {IValidationResult} Invalid if the structure or checksum is wrong.
     */
    public validate(parsedValue: unknown): IValidationResult {
        if (parsedValue === null || parsedValue === undefined || parsedValue === "") return { isValid: true };
        if (typeof parsedValue !== "string") {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.iban) };
        }

        const iban = parsedValue.replace(/\s+/g, "").toUpperCase();
        if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.iban) };
        }

        if (IbanValidatorPlugin.mod97(iban) !== 1) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.ibanChecksum) };
        }
        return { isValid: true };
    }

    /**
     * Computes the ISO 7064 MOD 97-10 remainder. The country code and check digits are moved to the end,
     * letters are expanded to numbers (A=10 … Z=35), and the remainder is computed digit by digit to avoid
     * exceeding the safe integer range.
     *
     * @param iban A normalized (uppercase, no spaces) IBAN.
     * @returns {number} The remainder; 1 for a valid IBAN.
     */
    private static mod97(iban: string): number {
        const rearranged = iban.slice(4) + iban.slice(0, 4);
        let remainder = 0;
        for (const char of rearranged) {
            const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
            for (const digit of digits) {
                remainder = (remainder * 10 + Number(digit)) % 97;
            }
        }
        return remainder;
    }
}
