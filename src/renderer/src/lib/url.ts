import { searchUrl, DEFAULT_ENGINE_ID } from "./search";

const DOMAIN_LIKE = /^(localhost|(\d{1,3}\.){3}\d{1,3}|([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(:\d+)?(\/|\?|#|$)/;
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const BUILTIN_HOSTS = new Set(["newtab", "about", "settings"]);

export function isInternalUrl(url: string): boolean {
    return url.startsWith("skybrowse:");
}

export function normalizeInput(raw: string, engineId: string = DEFAULT_ENGINE_ID): string | null {
    const input = raw.trim();
    if (!input) return null;

    if (input.toLowerCase().startsWith("skybrowse:")) {
        try {
            const parsed = new URL(input);
            if (parsed.protocol === "skybrowse:") {
                const host = parsed.hostname.toLowerCase();
                if (BUILTIN_HOSTS.has(host)) {
                    return `skybrowse://${host}`;
                }
                return `skybrowse://${host || "newtab"}`;
            }
        } catch {
            /* fall through to search */
        }
        return "skybrowse://newtab";
    }

    if (SCHEME.test(input)) {
        try {
            const url = new URL(input);
            if (url.protocol === "https:" || url.protocol === "http:") {
                return url.href;
            }
            return searchUrl(engineId, input);
        } catch {
            return searchUrl(engineId, input);
        }
    }

    if (!input.includes(" ") && DOMAIN_LIKE.test(input)) {
        return `https://${input}`;
    }

    return searchUrl(engineId, input);
}
