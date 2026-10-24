/**
 * @file UrlValidator.ts
 * @description Validates URL strings against safe navigation, media, UI-resource and outbound-fetch
 * policies to prevent XSS via javascript: or data: HTML URIs and to constrain where a schema-supplied
 * `ui.dataSource.url` is allowed to send requests.
 */

import { Logger } from "./Logger";

const SAFE_NAVIGATION_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const SAFE_FETCH_PROTOCOLS = new Set(["http:", "https:"]);
const SAP_ICON_URI = /^sap-icon:\/\/[A-Za-z0-9/_-]+$/;
const SYNTHETIC_ORIGIN = "http://metaui.invalid";

/**
 * Cross-origin policy applied to schema-supplied `ui.dataSource.url` endpoints.
 *
 * - `"any"` (default) permits any `http:`/`https:` endpoint. Scheme validation still applies.
 * - `"same-origin"` permits only endpoints resolving to the document origin.
 * - `"allowlist"` permits the document origin plus the explicitly registered origins.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @public
 */
export type DataSourceOriginMode = "any" | "same-origin" | "allowlist";

/**
 * Validates URL strings against safe navigation and media protocols to prevent XSS via unsafe URI schemes,
 * and enforces the outbound-fetch policy for schema-supplied data source endpoints.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @public
 */
export class UrlValidator {
    private static dataSourceOriginMode: DataSourceOriginMode = "any";
    private static dataSourceAllowedOrigins: ReadonlySet<string> = new Set<string>();
    private static readonly reportedCrossOrigins: Set<string> = new Set<string>();

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
            // CATCH_EXEMPT: a throw from new URL() is the 'not a parseable URL' answer this
            // predicate exists to give. Returning false is the result, not a degradation, and the
            // caller is responsible for reporting the rejected link to the user.
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
            // CATCH_EXEMPT: a throw from new URL() is the 'not a parseable image source' answer this
            // predicate exists to give. Returning false is the result, not a degradation, and the
            // caller is responsible for reporting the rejected source to the user.
            return false;
        }
    }

    /**
     * Checks whether a value is safe to assign to a UI5 property declared as `sap.ui.core.URI`
     * (`href`, `src`, `icon`, `logo`, …) from an untrusted schema. Accepts the navigation protocols,
     * raster `data:image/*` URIs, relative paths, the UI5 icon-font scheme and the empty string.
     *
     * @param rawUri The candidate URI string.
     * @returns True if the value may be written to a `sap.ui.core.URI` property.
     */
    public static isSafeUiResourceUri(rawUri: unknown): rawUri is string {
        if (typeof rawUri !== "string") {
            return false;
        }
        const trimmed = rawUri.trim();
        if (!trimmed) {
            return true;
        }
        if (SAP_ICON_URI.test(trimmed)) {
            return true;
        }
        return this.isSafeImageSource(trimmed) || this.isSafeNavigationUrl(trimmed);
    }

    /**
     * Installs the cross-origin policy applied to every schema-supplied `ui.dataSource.url`.
     * Applications that render schemas they do not control should narrow this to `"same-origin"`
     * or to an explicit `"allowlist"`.
     *
     * @param mode The policy mode to apply.
     * @param allowedOrigins Origins (e.g. `"https://api.example.com"`) permitted in `"allowlist"` mode.
     */
    public static setDataSourceOriginPolicy(mode: DataSourceOriginMode, allowedOrigins: readonly string[] = []): void {
        this.dataSourceOriginMode = mode;
        const normalized = new Set<string>();
        for (const origin of allowedOrigins) {
            try {
                normalized.add(new URL(origin).origin);
            } catch {
                Logger.warn(`Ignoring unparseable allowlist origin '${origin}'.`, undefined, "UrlValidator");
            }
        }
        this.dataSourceAllowedOrigins = normalized;
        this.reportedCrossOrigins.clear();
    }

    /**
     * Reads the currently installed data source origin policy.
     *
     * @returns {{ mode: DataSourceOriginMode; origins: string[] }} The active mode and allowlisted origins.
     */
    public static getDataSourceOriginPolicy(): { mode: DataSourceOriginMode; origins: string[] } {
        return { mode: this.dataSourceOriginMode, origins: [...this.dataSourceAllowedOrigins] };
    }

    /**
     * Checks whether a schema-supplied endpoint may be contacted with `fetch`. The scheme allowlist
     * (`http:`/`https:` plus document-relative paths) is always enforced; the cross-origin decision
     * follows the policy installed via {@link UrlValidator.setDataSourceOriginPolicy}.
     *
     * @param rawUrl The candidate endpoint URL from `ui.dataSource.url` or `valueHelp.url`.
     * @returns True if the endpoint may be requested.
     */
    public static isSafeDataSourceUrl(rawUrl: unknown): rawUrl is string {
        if (typeof rawUrl !== "string") {
            return false;
        }
        const trimmed = rawUrl.trim();
        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("\\") || trimmed.startsWith("/\\")) {
            return false;
        }
        const base = this.resolveDocumentOrigin();
        let parsed: URL;
        try {
            parsed = new URL(trimmed, base);
        } catch {
            // CATCH_EXEMPT: a throw from new URL() means the candidate is not a resolvable fetch
            // target, which is exactly what this predicate reports. Returning false denies the
            // fetch, and the caller surfaces the refusal; nothing is silently degraded here.
            return false;
        }
        if (!SAFE_FETCH_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
            return false;
        }
        if (parsed.origin === base) {
            return true;
        }
        if (this.dataSourceOriginMode === "same-origin") {
            return false;
        }
        if (this.dataSourceOriginMode === "allowlist" && !this.dataSourceAllowedOrigins.has(parsed.origin)) {
            return false;
        }
        this.reportCrossOrigin(parsed.origin);
        return true;
    }

    /**
     * Emits a one-time warning per cross-origin endpoint so that a permissive default policy is still visible.
     *
     * @param origin The resolved cross-origin target.
     */
    private static reportCrossOrigin(origin: string): void {
        if (this.reportedCrossOrigins.has(origin)) {
            return;
        }
        this.reportedCrossOrigins.add(origin);
        Logger.warn(
            `Schema-supplied data source targets cross-origin '${origin}'. ` +
            "Call UrlValidator.setDataSourceOriginPolicy('same-origin'|'allowlist', …) when schemas are untrusted.",
            undefined,
            "UrlValidator"
        );
    }

    /**
     * Resolves the current document origin, falling back to a synthetic origin outside a browser
     * so that relative endpoints stay resolvable in headless tooling.
     *
     * @returns {string} The origin used as the base for relative data source URLs.
     */
    private static resolveDocumentOrigin(): string {
        const origin = typeof window !== "undefined" && window.location ? window.location.origin : "";
        return origin && origin !== "null" ? origin : SYNTHETIC_ORIGIN;
    }
}
