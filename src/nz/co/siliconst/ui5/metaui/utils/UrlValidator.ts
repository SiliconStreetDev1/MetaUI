/**
 * @file UrlValidator.ts
 * @description Validates URL strings against safe navigation and media protocols to prevent XSS via javascript: or data: HTML URIs.
 */

const SAFE_NAVIGATION_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Validates URL strings against safe navigation and media protocols to prevent XSS via unsafe URI schemes.
 */
export class UrlValidator {
    /**
     * Checks whether a URL string uses a safe navigation protocol (http:, https:, mailto:, tel:)
     * or is a safe relative path (starting with /, ./, ../, or #).
     *
     * @param rawUrl The candidate URL string to check.
     * @returns True if safe to navigate to or render in a Link href.
     */
    public static isSafeNavigationUrl(rawUrl: unknown): rawUrl is string {
        if (typeof rawUrl !== "string") {
            return false;
        }
        const trimmed = rawUrl.trim();
        if (!trimmed) {
            return false;
        }
        if (
            (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) ||
            trimmed.startsWith("./") ||
            trimmed.startsWith("../") ||
            trimmed.startsWith("#")
        ) {
            return true;
        }
        try {
            const parsed = new URL(trimmed);
            return SAFE_NAVIGATION_PROTOCOLS.has(parsed.protocol.toLowerCase());
        } catch {
            return false;
        }
    }

    /**
     * Checks whether a URL or data URI is safe to render as an image source.
     * Permits safe navigation URLs as well as `data:image/*` base64 URIs.
     *
     * @param rawSrc The candidate image source string.
     * @returns True if safe to assign to an Image src.
     */
    public static isSafeImageSource(rawSrc: unknown): rawSrc is string {
        if (typeof rawSrc !== "string") {
            return false;
        }
        const trimmed = rawSrc.trim();
        if (!trimmed) {
            return false;
        }
        if (/^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,/i.test(trimmed)) {
            return true;
        }
        if (
            (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) ||
            trimmed.startsWith("./") ||
            trimmed.startsWith("../")
        ) {
            return true;
        }
        try {
            const parsed = new URL(trimmed);
            const proto = parsed.protocol.toLowerCase();
            return proto === "http:" || proto === "https:";
        } catch {
            return false;
        }
    }
}
