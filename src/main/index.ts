import { app, BrowserWindow, WebContentsView, ipcMain, net, protocol, session } from "electron";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const isDev = !app.isPackaged;

const CHROME_HEIGHT = 90;
const NEWTAB_URL = "skybrowse://newtab";

const BUILTIN_PAGES = new Set(["newtab", "about", "settings"]);

protocol.registerSchemesAsPrivileged([
    {
        scheme: "skybrowse",
        privileges: { standard: true, secure: true }
    }
]);

let mainWindow: BrowserWindow | null = null;
const guests = new Map<string, WebContentsView>();
const builtinGuests = new Set<string>();
let activeGuestId: string | null = null;
let sidePanelOpen = false;
let htmlFullscreenId: string | null = null;
let preFullscreenActiveId: string | null = null;

const SIDE_PANEL_WIDTH = 340;

interface SkybrowseSettings {
    searchEngine: string;
    homepage: string;
    startupPage: "newtab" | "homepage";
}

const DEFAULT_SETTINGS: SkybrowseSettings = {
    searchEngine: "google",
    homepage: NEWTAB_URL,
    startupPage: "newtab"
};

const VALID_ENGINES = new Set(["google", "bing", "duckduckgo"]);

let cachedSettings: SkybrowseSettings | null = null;

function sanitizeSettings(input: unknown): SkybrowseSettings {
    const source = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

    const searchEngine =
        typeof source.searchEngine === "string" && VALID_ENGINES.has(source.searchEngine)
            ? source.searchEngine
            : DEFAULT_SETTINGS.searchEngine;

    const homepage =
        typeof source.homepage === "string" && isValidHomepage(source.homepage)
            ? normalizeHomepage(source.homepage)
            : DEFAULT_SETTINGS.homepage;

    const startupPage = source.startupPage === "homepage" ? "homepage" : DEFAULT_SETTINGS.startupPage;

    return { searchEngine, homepage, startupPage };
}

function normalizeHomepage(input: string): string {
    const trimmed = input.trim();
    if (trimmed.startsWith("skybrowse://")) {
        const host = trimmed.slice("skybrowse://".length).replace(/\/+$/, "").split("/")[0].toLowerCase();
        return BUILTIN_PAGES.has(host) ? `skybrowse://${host}` : DEFAULT_SETTINGS.homepage;
    }
    return trimmed;
}

function isValidHomepage(input: string): boolean {
    const trimmed = input.trim();
    if (trimmed.startsWith("skybrowse://")) {
        const host = trimmed.slice("skybrowse://".length).replace(/\/+$/, "").split("/")[0].toLowerCase();
        return BUILTIN_PAGES.has(host);
    }
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
        return false;
    }
}

function settingsPath(): string {
    return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings(): SkybrowseSettings {
    if (cachedSettings) return cachedSettings;
    try {
        const raw = fs.readFileSync(settingsPath(), "utf8");
        cachedSettings = sanitizeSettings(JSON.parse(raw));
    } catch {
        cachedSettings = { ...DEFAULT_SETTINGS };
    }
    return cachedSettings;
}

function saveSettings(settings: SkybrowseSettings): void {
    cachedSettings = settings;
    const tmpPath = `${settingsPath()}.tmp`;
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2), "utf8");
        fs.renameSync(tmpPath, settingsPath());
    } catch (error) {
        console.error("SkyBrowse: failed to persist settings", error);
        try { fs.unlinkSync(tmpPath); } catch { /* nothing to clean */ }
    }
    broadcastSettingsChanged();
}

function sanitizeSettingsUpdate(key: unknown, value: unknown): { ok: true; settings: SkybrowseSettings } | { ok: false; error: string } {
    if (typeof key !== "string") return { ok: false, error: "Unknown setting" };

    const current = loadSettings();

    switch (key) {
        case "searchEngine": {
            if (typeof value !== "string" || !VALID_ENGINES.has(value)) {
                return { ok: false, error: "Choose Google, Bing or DuckDuckGo" };
            }
            const settings = { ...current, searchEngine: value };
            saveSettings(settings);
            return { ok: true, settings };
        }
        case "startupPage": {
            if (value !== "newtab" && value !== "homepage") {
                return { ok: false, error: "Choose newtab or homepage" };
            }
            const nextStartup: SkybrowseSettings["startupPage"] = value === "homepage" ? "homepage" : "newtab";
            const settings = { ...current, startupPage: nextStartup };
            saveSettings(settings);
            return { ok: true, settings };
        }
        case "homepage": {
            if (typeof value !== "string" || !isValidHomepage(value)) {
                return { ok: false, error: "Enter a valid https:// URL or skybrowse://newtab" };
            }
            const settings = { ...current, homepage: normalizeHomepage(value) };
            saveSettings(settings);
            return { ok: true, settings };
        }
        default:
            return { ok: false, error: "Unknown setting" };
    }
}

function broadcastSettingsChanged(): void {
    const settings = loadSettings();
    for (const id of builtinGuests) {
        const view = guests.get(id);
        if (view && !view.webContents.isDestroyed()) {
            view.webContents.send("skybrowse:settings-changed", settings);
        }
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("skybrowse:settings-changed", settings);
    }
}

function builtinPagePath(page: string): string | null {
    if (!BUILTIN_PAGES.has(page)) return null;
    return isDev
        ? path.join(app.getAppPath(), "resources", "skybrowse", `${page}.html`)
        : path.join(process.resourcesPath, "skybrowse", `${page}.html`);
}

function registerSkybrowseProtocol(): void {
    protocol.handle("skybrowse", (request) => {
        let page = "newtab";
        try {
            const url = new URL(request.url);
            page = url.hostname.toLowerCase();
        } catch {
            page = "";
        }

        const filePath = builtinPagePath(page);
        if (filePath) {
            return net.fetch(pathToFileURL(filePath).href);
        }

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Not found — SkyBrowse</title><style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0b1026;color:#e8ecf8;font-family:'Segoe UI',sans-serif;gap:14px}h1{font-size:22px;font-weight:600}p{color:#8a93b8;font-size:14px}a{color:#8b7cf6;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><h1>skybrowse://${page || "?"} was not found</h1><p>This internal page does not exist (yet).</p><p><a href="skybrowse://newtab">Back to New Tab</a></p></body></html>`;
        return new Response(html, {
            status: 404,
            headers: { "Content-Type": "text/html; charset=utf-8" }
        });
    });
}

function isAllowedNavigation(url: string): boolean {
    if (url === "about:blank") return true;
    if (url.startsWith("skybrowse:")) return true;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
        return false;
    }
}

function isBuiltinUrl(url: string): boolean {
    return url.startsWith("skybrowse:");
}

function sendToHost(channel: string, payload: unknown): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

function contentBounds(): { x: number; y: number; width: number; height: number } {
    const win = mainWindow;
    if (!win) return { x: 0, y: CHROME_HEIGHT, width: 0, height: 0 };
    const [width, height] = win.getContentSize();

    if (htmlFullscreenId) {
        return { x: 0, y: 0, width, height };
    }

    const panel = sidePanelOpen ? SIDE_PANEL_WIDTH : 0;

    return {
        x: 0,
        y: CHROME_HEIGHT,
        width: Math.max(0, width - panel),
        height: Math.max(0, height - CHROME_HEIGHT)
    };
}

function layoutGuests(): void {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const bounds = contentBounds();
    for (const [id, view] of guests) {
        view.setBounds(bounds);
        view.setVisible(id === activeGuestId);
    }
}

function forwardGuestEvent(id: string, event: Record<string, unknown>): void {
    sendToHost("skybrowse:view-event", { id, ...event });
}

function createGuest(id: string, url: string): WebContentsView | null {
    const win = mainWindow;
    if (!win || guests.has(id)) return null;
    if (!isAllowedNavigation(url)) return null;

    const builtin = isBuiltinUrl(url);

    const view = new WebContentsView({
        webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            allowRunningInsecureContent: false,
            ...(builtin ? { preload: path.join(__dirname, "../preload/builtin.js") } : {})
        }
    });

    view.setBackgroundColor(builtin ? "#0b1026" : "#ffffff");
    win.contentView.addChildView(view);
    guests.set(id, view);
    if (builtin) builtinGuests.add(id);

    const wc = view.webContents;

    wc.setWindowOpenHandler(({ url: target }) => {
        if (isAllowedNavigation(target)) {
            sendToHost("skybrowse:open-tab", target);
        }
        return { action: "deny" };
    });

    wc.on("will-navigate", (event, target) => {
        if (!isAllowedNavigation(target)) {
            event.preventDefault();
            return;
        }
        if (builtinGuests.has(id) !== isBuiltinUrl(target)) {
            event.preventDefault();
            const wasActive = activeGuestId === id;
            migrateGuest(id, target, wasActive);
        }
    });

    wc.on("certificate-error", (event, url, error, _certificate, callback) => {
        const host = (() => {
            try {
                return new URL(url).host;
            } catch {
                return url;
            }
        })();
        console.error("SkyBrowse: certificate error", error, url);
        event.preventDefault();
        callback(false);
        sendToHost("skybrowse:certificate-error", { host, error });
    });

    wc.on("render-process-gone", (_event, details) => {
        console.error("SkyBrowse: render process gone, reason:", details.reason);
        forwardGuestEvent(id, { type: "crashed", reason: details.reason });
    });

    wc.on("did-start-loading", () => forwardGuestEvent(id, { type: "loading", value: true }));
    wc.on("did-stop-loading", () => {
        forwardGuestEvent(id, { type: "loading", value: false });
        forwardGuestEvent(id, {
            type: "nav-state",
            canGoBack: wc.navigationHistory.canGoBack(),
            canGoForward: wc.navigationHistory.canGoForward()
        });
    });
    wc.on("did-navigate", (_event, target) => {
        forwardGuestEvent(id, { type: "url", url: target });
        forwardGuestEvent(id, {
            type: "nav-state",
            canGoBack: wc.navigationHistory.canGoBack(),
            canGoForward: wc.navigationHistory.canGoForward()
        });
    });
    wc.on("did-navigate-in-page", (_event, target) => {
        forwardGuestEvent(id, { type: "url", url: target });
    });
    wc.on("page-title-updated", (_event, title) => {
        if (typeof title === "string" && title.trim()) {
            forwardGuestEvent(id, { type: "title", title });
        }
    });
    wc.on("page-favicon-updated", (_event, faviconUrls) => {
        const candidate = faviconUrls.find(candidate => /^https?:/.test(candidate)) ?? null;
        forwardGuestEvent(id, { type: "favicon", favicon: candidate });
    });

    wc.on("before-input-event", (_event, input) => {
        if (input.type !== "keyDown") return;

        const key = input.key.toLowerCase();
        const ctrlOrMeta = input.control || input.meta;
        const shift = input.shift;
        const alt = input.alt;

        const isShortcut =
            (ctrlOrMeta && ["t", "w", "l", "r", "tab"].includes(key)) ||
            (ctrlOrMeta && /^[1-9]$/.test(key)) ||
            (alt && (key === "arrowleft" || key === "arrowright")) ||
            key === "f5";

        if (isShortcut) {
            sendToHost("skybrowse:guest-shortcut", { key, ctrlOrMeta, shift, alt });
        }
    });

    wc.on("enter-html-full-screen", () => {
        htmlFullscreenId = id;
        preFullscreenActiveId = activeGuestId;
        activeGuestId = id;
        layoutGuests();
    });

    wc.on("leave-html-full-screen", () => {
        htmlFullscreenId = null;
        if (preFullscreenActiveId && guests.has(preFullscreenActiveId)) {
            activeGuestId = preFullscreenActiveId;
        }
        preFullscreenActiveId = null;
        layoutGuests();
    });

    const bounds = contentBounds();
    view.setBounds(bounds);
    view.setVisible(false);

    wc.loadURL(url).catch(error => {
        console.error("SkyBrowse: failed to load", url, error);
        forwardGuestEvent(id, { type: "load-error", message: String(error) });
    });

    return view;
}

function destroyGuest(id: string): void {
    const view = guests.get(id);
    if (!view) return;
    guests.delete(id);
    builtinGuests.delete(id);
    if (activeGuestId === id) activeGuestId = null;
    if (htmlFullscreenId === id) {
        htmlFullscreenId = null;
        preFullscreenActiveId = null;
    }
    try {
        mainWindow?.contentView.removeChildView(view);
    } catch {
        /* view already detached */
    }
    try {
        view.webContents.close();
    } catch {
        /* already closed */
    }
}

function activateGuest(id: string): void {
    activeGuestId = id;
    layoutGuests();
    const view = guests.get(id);
    if (view) {
        view.webContents.focus();
    }
}

function migrateGuest(id: string, url: string, wasActive: boolean): boolean {
    destroyGuest(id);
    const created = createGuest(id, url);
    if (!created) return false;
    if (wasActive) activateGuest(id);
    return true;
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 880,
        minHeight: 560,
        frame: false,
        show: false,
        backgroundColor: "#0b1026",
        title: "SkyBrowse",
        icon: path.join(app.getAppPath(), "resources", "icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "../preload/index.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            allowRunningInsecureContent: false
        }
    });

    mainWindow.once("ready-to-show", () => {
        mainWindow?.show();
        layoutGuests();
    });

    mainWindow.on("resize", layoutGuests);
    mainWindow.on("maximize", layoutGuests);
    mainWindow.on("unmaximize", layoutGuests);
    mainWindow.on("enter-full-screen", layoutGuests);
    mainWindow.on("leave-full-screen", layoutGuests);

    mainWindow.on("closed", () => {
        for (const id of [...guests.keys()]) destroyGuest(id);
        mainWindow = null;
    });

    if (process.env.ELECTRON_RENDERER_URL) {
        mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    }
}

function isHostSender(sender: Electron.WebContents): boolean {
    return Boolean(mainWindow && !mainWindow.isDestroyed() && sender === mainWindow.webContents);
}

function isBuiltinSender(sender: Electron.WebContents): boolean {
    for (const id of builtinGuests) {
        const view = guests.get(id);
        if (view && view.webContents === sender) return true;
    }
    return false;
}

function validGuestId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length < 100;
}

ipcMain.handle("skybrowse:sidepanel-toggle", (event, open: unknown) => {
    if (!isHostSender(event.sender)) return;
    sidePanelOpen = Boolean(open);
    layoutGuests();
});

ipcMain.handle("skybrowse:window", (event, action: unknown) => {
    if (!isHostSender(event.sender)) return;
    if (typeof action !== "string") return;

    const win = mainWindow;
    if (!win) return;

    switch (action) {
        case "minimize":
            win.minimize();
            break;
        case "toggle-maximize":
            if (win.isMaximized()) win.unmaximize();
            else win.maximize();
            break;
        case "close":
            win.close();
            break;
        default:
            break;
    }
});

ipcMain.handle("skybrowse:app-info", (event) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return null;

    return {
        version: app.getVersion(),
        platform: process.platform,
        startPageUrl: NEWTAB_URL,
        settings: loadSettings()
    };
});

ipcMain.handle("skybrowse:settings-get", (event) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) {
        return { searchEngine: "google", homepage: NEWTAB_URL, startupPage: "newtab" };
    }
    return loadSettings();
});

ipcMain.handle("skybrowse:settings-update", (event, payload: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) {
        return { ok: false as const, error: "Not allowed" };
    }
    if (typeof payload !== "object" || payload === null) {
        return { ok: false as const, error: "Invalid request" };
    }
    const { key, value } = payload as { key?: unknown; value?: unknown };
    return sanitizeSettingsUpdate(key, value);
});

ipcMain.handle("skybrowse:builtin-open-tab", (event, url: unknown) => {
    if (!isBuiltinSender(event.sender)) return false;
    if (typeof url !== "string") return false;
    if (!isAllowedNavigation(url)) return false;
    sendToHost("skybrowse:open-tab", url);
    return true;
});

ipcMain.handle("skybrowse:tab-create", (event, payload: unknown) => {
    if (!isHostSender(event.sender)) return false;
    if (typeof payload !== "object" || payload === null) return false;
    const { id, url } = payload as { id?: unknown; url?: unknown };
    if (!validGuestId(id) || typeof url !== "string") return false;
    return Boolean(createGuest(id, url));
});

ipcMain.handle("skybrowse:tab-destroy", (event, id: unknown) => {
    if (!isHostSender(event.sender)) return;
    if (!validGuestId(id)) return;
    destroyGuest(id);
    layoutGuests();
});

ipcMain.handle("skybrowse:tab-activate", (event, id: unknown) => {
    if (!isHostSender(event.sender)) return;
    if (!validGuestId(id)) return;
    if (!guests.has(id)) return;
    activateGuest(id);
});

ipcMain.handle("skybrowse:tab-navigate", (event, payload: unknown) => {
    if (!isHostSender(event.sender)) return;
    if (typeof payload !== "object" || payload === null) return;
    const { id, url } = payload as { id?: unknown; url?: unknown };
    if (!validGuestId(id) || typeof url !== "string") return;
    if (!isAllowedNavigation(url)) return;
    const wasActive = activeGuestId === id;
    if (builtinGuests.has(id) !== isBuiltinUrl(url)) {
        migrateGuest(id, url, wasActive);
        return;
    }
    const view = guests.get(id);
    if (!view) return;
    view.webContents.loadURL(url).catch(error => {
        console.error("SkyBrowse: failed to navigate", url, error);
    });
});

ipcMain.handle("skybrowse:tab-back", (event, id: unknown) => {
    if (!isHostSender(event.sender) || !validGuestId(id)) return;
    const view = guests.get(id);
    if (view && view.webContents.navigationHistory.canGoBack()) {
        view.webContents.navigationHistory.goBack();
    }
});

ipcMain.handle("skybrowse:tab-forward", (event, id: unknown) => {
    if (!isHostSender(event.sender) || !validGuestId(id)) return;
    const view = guests.get(id);
    if (view && view.webContents.navigationHistory.canGoForward()) {
        view.webContents.navigationHistory.goForward();
    }
});

ipcMain.handle("skybrowse:tab-reload", (event, id: unknown) => {
    if (!isHostSender(event.sender) || !validGuestId(id)) return;
    guests.get(id)?.webContents.reload();
});

ipcMain.handle("skybrowse:tab-hard-reload", (event, id: unknown) => {
    if (!isHostSender(event.sender) || !validGuestId(id)) return;
    guests.get(id)?.webContents.reloadIgnoringCache();
});

ipcMain.handle("skybrowse:tab-stop", (event, id: unknown) => {
    if (!isHostSender(event.sender) || !validGuestId(id)) return;
    guests.get(id)?.webContents.stop();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        app.setName("SkyBrowse");

        const ses = session.defaultSession;
        ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
            callback(false);
        });
        ses.setPermissionCheckHandler(() => false);

        registerSkybrowseProtocol();
        createWindow();

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on("window-all-closed", () => {
        app.quit();
    });
}
