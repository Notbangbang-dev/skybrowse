import { app, BrowserWindow, WebContentsView, ipcMain, net, protocol, session, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const isDev = !app.isPackaged;

const CHROME_HEIGHT = 124;
const NEWTAB_URL = "skybrowse://newtab";

const BUILTIN_PAGES = new Set(["newtab", "about", "settings", "bookmarks", "history", "downloads"]);

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
const lastFaviconByGuest = new Map<string, string | null>();
const downloadItems = new Map<string, Electron.DownloadItem>();
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

// ---------------- M2: bookmarks, history, downloads ----------------

const MAX_HISTORY = 2000;
const MAX_DOWNLOADS_COMPLETED = 50;
const MAX_BOOKMARKS = 5000;
const MAX_FOLDERS = 100;

let cachedBookmarks: BookmarkStore | null = null;
let cachedHistory: HistoryStore | null = null;
let cachedCompletedDownloads: CompletedDownload[] | null = null;
const activeDownloads = new Map<string, ActiveDownload>();
let historySaveTimer: ReturnType<typeof setTimeout> | null = null;

interface BookmarkFolder {
    id: string;
    name: string;
}

interface BookmarkEntry {
    id: string;
    title: string;
    url: string;
    favicon: string | null;
    parentId: string | null;
    addedAt: number;
}

interface BookmarkStore {
    folders: BookmarkFolder[];
    bookmarks: BookmarkEntry[];
}

interface HistoryVisit {
    id: string;
    url: string;
    title: string;
    favicon: string | null;
    at: number;
}

interface HistoryStore {
    visits: HistoryVisit[];
}

interface CompletedDownload {
    id: string;
    fileName: string;
    savePath: string;
    url: string;
    totalBytes: number;
    state: "completed" | "interrupted";
    completedAt: number;
}

interface ActiveDownload {
    id: string;
    fileName: string;
    savePath: string;
    url: string;
    totalBytes: number;
    receivedBytes: number;
    canResume: boolean;
    state: string;
    completedAt: number;
    done: boolean;
}

function isSafeUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "skybrowse:";
    } catch {
        return false;
    }
}

function safeTitle(title: unknown, url: string): string {
    if (typeof title === "string" && title.trim()) return title.trim().slice(0, 300);
    try {
        return new URL(url).hostname;
    } catch {
        return "Untitled";
    }
}

function safeFavicon(favicon: unknown): string | null {
    if (typeof favicon !== "string") return null;
    const trimmed = favicon.trim();
    if (/^(https?|data):/.test(trimmed)) return trimmed.slice(0, 2000);
    return null;
}

function stringField(value: unknown, max: number): string | null {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function idField(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 && value.length < 100 ? value : null;
}

function sanitizeBookmarkStore(input: unknown): BookmarkStore {
    const source = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

    const folders: BookmarkFolder[] = Array.isArray(source.folders)
        ? (source.folders as unknown[])
              .map(entry => {
                  const item = entry as Record<string, unknown>;
                  const id = idField(item.id);
                  const name = stringField(item.name, 100);
                  return id && name ? { id, name } : null;
              })
              .filter((f): f is BookmarkFolder => f !== null)
              .slice(0, MAX_FOLDERS)
        : [];

    const folderIds = new Set(folders.map(f => f.id));

    const bookmarks: BookmarkEntry[] = Array.isArray(source.bookmarks)
        ? (source.bookmarks as unknown[])
              .map(entry => {
                  const item = entry as Record<string, unknown>;
                  const id = idField(item.id);
                  const url = typeof item.url === "string" && isSafeUrl(item.url) ? item.url.slice(0, 2000) : null;
                  if (!id || !url) return null;
                  const parentId = typeof item.parentId === "string" && folderIds.has(item.parentId) ? item.parentId : null;
                  return {
                      id,
                      title: safeTitle(item.title, url),
                      url,
                      favicon: safeFavicon(item.favicon),
                      parentId,
                      addedAt: typeof item.addedAt === "number" && Number.isFinite(item.addedAt) ? item.addedAt : Date.now()
                  };
              })
              .filter((b): b is BookmarkEntry => b !== null)
              .slice(-MAX_BOOKMARKS)
        : [];

    return { folders, bookmarks };
}

function loadBookmarks(): BookmarkStore {
    if (cachedBookmarks) return cachedBookmarks;
    try {
        cachedBookmarks = sanitizeBookmarkStore(JSON.parse(fs.readFileSync(userDataPath("bookmarks.json"), "utf8")));
    } catch {
        cachedBookmarks = { folders: [], bookmarks: [] };
    }
    return cachedBookmarks;
}

function userDataPath(name: string): string {
    return path.join(app.getPath("userData"), name);
}

function atomicWrite(filePath: string, contents: string): void {
    const tmp = `${filePath}.tmp`;
    try {
        fs.writeFileSync(tmp, contents, "utf8");
        fs.renameSync(tmp, filePath);
    } catch (error) {
        console.error(`SkyBrowse: failed to write ${filePath}`, error);
        try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ }
    }
}

function broadcastAll(channel: string, payload: unknown): void {
    for (const id of builtinGuests) {
        const view = guests.get(id);
        if (view && !view.webContents.isDestroyed()) {
            view.webContents.send(channel, payload);
        }
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

function saveBookmarks(store: BookmarkStore): void {
    cachedBookmarks = store;
    atomicWrite(userDataPath("bookmarks.json"), JSON.stringify(store, null, 2));
    broadcastAll("skybrowse:bookmarks-changed", store);
}

function sanitizeHistory(input: unknown): HistoryStore {
    const source = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

    const visits: HistoryVisit[] = Array.isArray(source.visits)
        ? (source.visits as unknown[])
              .map(entry => {
                  const item = entry as Record<string, unknown>;
                  const id = idField(item.id);
                  const url = typeof item.url === "string" && isSafeUrl(item.url) ? item.url.slice(0, 2000) : null;
                  if (!id || !url) return null;
                  return {
                      id,
                      url,
                      title: safeTitle(item.title, url),
                      favicon: safeFavicon(item.favicon),
                      at: typeof item.at === "number" && Number.isFinite(item.at) ? item.at : Date.now()
                  };
              })
              .filter((v): v is HistoryVisit => v !== null)
              .slice(-MAX_HISTORY)
        : [];

    return { visits };
}

function loadHistory(): HistoryStore {
    if (cachedHistory) return cachedHistory;
    try {
        cachedHistory = sanitizeHistory(JSON.parse(fs.readFileSync(userDataPath("history.json"), "utf8")));
    } catch {
        cachedHistory = { visits: [] };
    }
    return cachedHistory;
}

function scheduleHistorySave(): void {
    if (historySaveTimer) clearTimeout(historySaveTimer);
    historySaveTimer = setTimeout(() => {
        historySaveTimer = null;
        const store = loadHistory();
        atomicWrite(userDataPath("history.json"), JSON.stringify(store, null, 2));
        broadcastAll("skybrowse:history-changed", store);
    }, 400);
}

function recordVisit(url: string, title: string, favicon: string | null): void {
    if (!isSafeUrl(url) || url.startsWith("skybrowse:")) return;
    const store = loadHistory();
    store.visits.push({
        id: crypto.randomUUID(),
        url,
        title,
        favicon,
        at: Date.now()
    });
    if (store.visits.length > MAX_HISTORY) {
        store.visits = store.visits.slice(-MAX_HISTORY);
    }
    scheduleHistorySave();
}

function loadCompletedDownloads(): CompletedDownload[] {
    if (cachedCompletedDownloads) return cachedCompletedDownloads;
    try {
        const raw = JSON.parse(fs.readFileSync(userDataPath("downloads.json"), "utf8"));
        cachedCompletedDownloads = Array.isArray(raw)
            ? (raw as CompletedDownload[]).slice(-MAX_DOWNLOADS_COMPLETED)
            : [];
    } catch {
        cachedCompletedDownloads = [];
    }
    return cachedCompletedDownloads;
}

function saveCompletedDownloads(): void {
    cachedCompletedDownloads = loadCompletedDownloads().slice(-MAX_DOWNLOADS_COMPLETED);
    atomicWrite(userDataPath("downloads.json"), JSON.stringify(cachedCompletedDownloads, null, 2));
    broadcastAll("skybrowse:downloads-changed", { completed: cachedCompletedDownloads });
}

function serializeActiveDownloads(): ActiveDownload[] {
    return [...activeDownloads.values()].map(d => ({ ...d }));
}

function handleWillDownload(
    _event: Electron.Event,
    item: Electron.DownloadItem,
    _webContents: Electron.WebContents
): void {
    const downloadsDir = app.getPath("downloads");
    const original = item.getFilename() || "download";

    let savePath = path.join(downloadsDir, original);
    if (fs.existsSync(savePath)) {
        const ext = path.extname(original);
        const base = original.slice(0, original.length - ext.length);
        let counter = 1;
        while (fs.existsSync(path.join(downloadsDir, `${base} (${counter})${ext}`))) counter += 1;
        savePath = path.join(downloadsDir, `${base} (${counter})${ext}`);
    }

    item.setSavePath(savePath);

    const id = crypto.randomUUID();

    const active: ActiveDownload = {
        id,
        fileName: path.basename(savePath),
        savePath,
        url: item.getURL(),
        totalBytes: item.getTotalBytes(),
        receivedBytes: 0,
        canResume: false,
        state: "progressing",
        completedAt: Date.now(),
        done: false
    };
    activeDownloads.set(id, active);
    downloadItems.set(id, item);
    broadcastAll("skybrowse:download-event", { type: "start", download: active });

    item.on("updated", (_event, state) => {
        const existing = activeDownloads.get(id);
        if (!existing) return;
        existing.receivedBytes = item.getReceivedBytes();
        existing.totalBytes = item.getTotalBytes();
        existing.canResume = item.canResume();
        existing.state = state;
        broadcastAll("skybrowse:download-event", { type: "progress", download: { ...existing } });
    });

    item.once("done", (_event, state) => {
        const existing = activeDownloads.get(id);
        activeDownloads.delete(id);
        downloadItems.delete(id);

        if (state === "completed") {
            const completed = loadCompletedDownloads();
            completed.push({
                id,
                fileName: existing?.fileName ?? path.basename(savePath),
                savePath,
                url: item.getURL(),
                totalBytes: item.getTotalBytes(),
                state: "completed",
                completedAt: Date.now()
            });
            cachedCompletedDownloads = completed.slice(-MAX_DOWNLOADS_COMPLETED);
            saveCompletedDownloads();
        } else {
            broadcastAll("skybrowse:downloads-changed", { completed: loadCompletedDownloads() });
        }

        broadcastAll("skybrowse:download-event", {
            type: "done",
            download: existing
                ? { ...existing, receivedBytes: item.getReceivedBytes(), state, done: true }
                : {
                      id,
                      fileName: path.basename(savePath),
                      savePath,
                      url: item.getURL(),
                      totalBytes: item.getTotalBytes(),
                      receivedBytes: item.getReceivedBytes(),
                      canResume: false,
                      state,
                      completedAt: Date.now(),
                      done: true
                  }
        });
    });
}


function builtinPagePath(page: string): string | null {
    if (!BUILTIN_PAGES.has(page)) return null;
    return isDev
        ? path.join(app.getAppPath(), "resources", "skybrowse", `${page}.html`)
        : path.join(process.resourcesPath, "skybrowse", `${page}.html`);
}

function builtinDir(): string {
    return isDev
        ? path.join(app.getAppPath(), "resources", "skybrowse")
        : path.join(process.resourcesPath, "skybrowse");
}

const SAFE_ASSET = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(js|css|png|jpe?g|svg|webp)$/;

function builtinAssetPath(asset: string): string | null {
    if (!SAFE_ASSET.test(asset) || asset !== path.basename(asset)) return null;

    const dir = builtinDir();
    const resolved = path.resolve(dir, asset);

    if (!resolved.startsWith(dir + path.sep)) return null;
    if (!fs.existsSync(resolved)) return null;
    return resolved;
}

function registerSkybrowseProtocol(): void {
    protocol.handle("skybrowse", (request) => {
        let page = "";
        let asset: string | null = null;
        try {
            const url = new URL(request.url);
            page = url.hostname.toLowerCase();

            if (BUILTIN_PAGES.has(page)) {
                const pathname = url.pathname.replace(/^\/+/, "");
                if (pathname) {
                    asset = decodeURIComponent(pathname);
                }
            }
        } catch {
            page = "";
        }

        const pageFile = asset ? builtinAssetPath(asset) : builtinPagePath(page);
        if (pageFile) {
            return net.fetch(pathToFileURL(pageFile).href);
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

function enterHtmlFullscreen(id: string): void {
    if (htmlFullscreenId === id) return;

    htmlFullscreenId = id;
    preFullscreenActiveId = activeGuestId;
    activeGuestId = id;

    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(true);
    }
    layoutGuests();
}

function exitHtmlFullscreen(): void {
    if (htmlFullscreenId === null) return;

    htmlFullscreenId = null;
    if (preFullscreenActiveId && guests.has(preFullscreenActiveId)) {
        activeGuestId = preFullscreenActiveId;
    }
    preFullscreenActiveId = null;

    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
    }
    layoutGuests();
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
        const url = wc.getURL();
        if (url && url.startsWith("http")) {
            recordVisit(url, wc.getTitle(), lastFaviconByGuest.get(id) ?? null);
        }
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
        lastFaviconByGuest.set(id, candidate);
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

    wc.on("enter-html-full-screen", () => enterHtmlFullscreen(id));
    wc.on("leave-html-full-screen", () => exitHtmlFullscreen());

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
    lastFaviconByGuest.delete(id);
    downloadItems.delete(id);
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

ipcMain.handle("skybrowse:bookmarks-get", (event) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return { folders: [], bookmarks: [] };
    return loadBookmarks();
});

ipcMain.handle("skybrowse:bookmarks-add", (event, payload: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) {
        return { ok: false as const, error: "Not allowed" };
    }
    if (typeof payload !== "object" || payload === null) return { ok: false as const, error: "Invalid request" };
    const { url, title, favicon, parentId } = payload as { url?: unknown; title?: unknown; favicon?: unknown; parentId?: unknown };
    if (typeof url !== "string" || !isSafeUrl(url)) return { ok: false as const, error: "Invalid URL" };

    const store = loadBookmarks();
    const existing = store.bookmarks.find(b => b.url === url);
    if (existing) return { ok: true as const, already: true as const, store };

    const folderIds = new Set(store.folders.map(f => f.id));
    store.bookmarks.push({
        id: crypto.randomUUID(),
        title: safeTitle(title, url),
        url,
        favicon: safeFavicon(favicon),
        parentId: typeof parentId === "string" && folderIds.has(parentId) ? parentId : null,
        addedAt: Date.now()
    });
    if (store.bookmarks.length > MAX_BOOKMARKS) store.bookmarks = store.bookmarks.slice(-MAX_BOOKMARKS);
    saveBookmarks(store);
    return { ok: true as const, store };
});

ipcMain.handle("skybrowse:bookmarks-remove", (event, id: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return loadBookmarks();
    if (!idField(id)) return loadBookmarks();
    const store = loadBookmarks();
    store.bookmarks = store.bookmarks.filter(b => b.id !== id);
    saveBookmarks(store);
    return store;
});

ipcMain.handle("skybrowse:bookmarks-rename", (event, payload: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return loadBookmarks();
    if (typeof payload !== "object" || payload === null) return loadBookmarks();
    const { id, title } = payload as { id?: unknown; title?: unknown };
    if (!idField(id) || typeof title !== "string") return loadBookmarks();
    const store = loadBookmarks();
    const entry = store.bookmarks.find(b => b.id === id);
    if (entry) entry.title = title.trim().slice(0, 300) || entry.title;
    saveBookmarks(store);
    return store;
});

ipcMain.handle("skybrowse:bookmarks-create-folder", (event, name: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return { ok: false as const, error: "Not allowed" };
    const folderName = stringField(name, 100);
    if (!folderName) return { ok: false as const, error: "Give the folder a name" };
    const store = loadBookmarks();
    if (store.folders.length >= MAX_FOLDERS) return { ok: false as const, error: "Too many folders" };
    const folder = { id: crypto.randomUUID(), name: folderName };
    store.folders.push(folder);
    saveBookmarks(store);
    return { ok: true as const, folder, store };
});

ipcMain.handle("skybrowse:bookmarks-remove-folder", (event, id: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return loadBookmarks();
    if (!idField(id)) return loadBookmarks();
    const store = loadBookmarks();
    store.folders = store.folders.filter(f => f.id !== id);
    for (const bookmark of store.bookmarks) {
        if (bookmark.parentId === id) bookmark.parentId = null;
    }
    saveBookmarks(store);
    return store;
});

ipcMain.handle("skybrowse:bookmarks-move", (event, payload: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return loadBookmarks();
    if (typeof payload !== "object" || payload === null) return loadBookmarks();
    const { id, parentId } = payload as { id?: unknown; parentId?: unknown };
    if (!idField(id)) return loadBookmarks();
    const store = loadBookmarks();
    const folderIds = new Set(store.folders.map(f => f.id));
    const entry = store.bookmarks.find(b => b.id === id);
    if (entry) {
        entry.parentId = typeof parentId === "string" && folderIds.has(parentId) ? parentId : null;
    }
    saveBookmarks(store);
    return store;
});

ipcMain.handle("skybrowse:history-get", (event) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return { visits: [] };
    return loadHistory();
});

function clearHistory(): HistoryStore {
    const store = { visits: [] };
    cachedHistory = store;
    if (historySaveTimer) {
        clearTimeout(historySaveTimer);
        historySaveTimer = null;
    }
    atomicWrite(userDataPath("history.json"), JSON.stringify(store, null, 2));
    broadcastAll("skybrowse:history-changed", store);
    return store;
}

ipcMain.handle("skybrowse:history-clear", (event) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return { visits: [] };
    return clearHistory();
});

ipcMain.handle("skybrowse:history-remove", (event, id: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return loadHistory();
    if (!idField(id)) return loadHistory();
    const store = loadHistory();
    store.visits = store.visits.filter(v => v.id !== id);
    if (historySaveTimer) {
        clearTimeout(historySaveTimer);
        historySaveTimer = null;
    }
    atomicWrite(userDataPath("history.json"), JSON.stringify(store, null, 2));
    broadcastAll("skybrowse:history-changed", store);
    return store;
});

ipcMain.handle("skybrowse:downloads-get", (event) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) {
        return { active: [], completed: [] };
    }
    return { active: serializeActiveDownloads(), completed: loadCompletedDownloads() };
});

ipcMain.handle("skybrowse:download-pause", (event, id: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return;
    const key = idField(id);
    if (!key) return;
    const item = downloadItems.get(key);
    if (item && !item.isPaused()) item.pause();
});

ipcMain.handle("skybrowse:download-resume", (event, id: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return;
    const key = idField(id);
    if (!key) return;
    const item = downloadItems.get(key);
    if (item && item.isPaused()) item.resume();
});

ipcMain.handle("skybrowse:download-cancel", (event, id: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return;
    const key = idField(id);
    if (!key) return;
    downloadItems.get(key)?.cancel();
});

ipcMain.handle("skybrowse:download-open", (event, id: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) {
        return { ok: false as const, error: "Not allowed" };
    }
    if (!idField(id)) return { ok: false as const, error: "Download not found" };
    const entry = loadCompletedDownloads().find(d => d.id === id);
    if (!entry) return { ok: false as const, error: "Download not found" };
    return shell.openPath(entry.savePath).then(error =>
        error ? { ok: false as const, error } : { ok: true as const }
    );
});

ipcMain.handle("skybrowse:download-reveal", (event, id: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return;
    if (!idField(id)) return;
    const entry = loadCompletedDownloads().find(d => d.id === id);
    if (entry) shell.showItemInFolder(entry.savePath);
});

ipcMain.handle("skybrowse:download-remove", (event, id: unknown) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return loadCompletedDownloads();
    if (!idField(id)) return loadCompletedDownloads();
    cachedCompletedDownloads = loadCompletedDownloads().filter(d => d.id !== id);
    atomicWrite(userDataPath("downloads.json"), JSON.stringify(cachedCompletedDownloads, null, 2));
    broadcastAll("skybrowse:downloads-changed", { completed: cachedCompletedDownloads });
    return cachedCompletedDownloads;
});

ipcMain.handle("skybrowse:downloads-clear-completed", (event) => {
    if (!isHostSender(event.sender) && !isBuiltinSender(event.sender)) return loadCompletedDownloads();
    cachedCompletedDownloads = [];
    atomicWrite(userDataPath("downloads.json"), JSON.stringify([], null, 2));
    broadcastAll("skybrowse:downloads-changed", { completed: [] });
    return [];
});

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
        const ALLOWED_PERMISSIONS = new Set(["fullscreen"]);
        ses.setPermissionRequestHandler((_webContents, permission, callback) => {
            callback(ALLOWED_PERMISSIONS.has(permission));
        });
        ses.setPermissionCheckHandler((_webContents, permission) => ALLOWED_PERMISSIONS.has(permission));
        ses.on("will-download", handleWillDownload);

        registerSkybrowseProtocol();
        createWindow();

        const FULLSCREEN_POLL_MS = 400;
        setInterval(() => {
            const id = activeGuestId;
            if (!id) {
                if (htmlFullscreenId !== null) exitHtmlFullscreen();
                return;
            }
            const view = guests.get(id);
            if (!view) return;
            view.webContents.executeJavaScript("document.fullscreenElement ? 1 : 0").then(result => {
                if (result === 1) enterHtmlFullscreen(id);
                else exitHtmlFullscreen();
            }).catch(() => {
                /* guest may be navigating */
            });
        }, FULLSCREEN_POLL_MS);

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on("window-all-closed", () => {
        app.quit();
    });
}
