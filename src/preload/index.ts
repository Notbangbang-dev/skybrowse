import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

type ViewEventCallback = (event: Record<string, unknown> & { id: string }) => void;
type OpenTabCallback = (url: string) => void;
type GuestShortcutCallback = (shortcut: { key: string; ctrlOrMeta: boolean; shift: boolean; alt: boolean }) => void;

const skybrowse = {
    window: {
        minimize: () => ipcRenderer.invoke("skybrowse:window", "minimize"),
        toggleMaximize: () => ipcRenderer.invoke("skybrowse:window", "toggle-maximize"),
        close: () => ipcRenderer.invoke("skybrowse:window", "close")
    },
    getAppInfo: () =>
        ipcRenderer.invoke("skybrowse:app-info") as Promise<{
            version: string;
            platform: string;
            startPageUrl: string;
            settings: {
                searchEngine: string;
                homepage: string;
                startupPage: string;
            };
        } | null>,
    getSettings: () =>
        ipcRenderer.invoke("skybrowse:settings-get") as Promise<{
            searchEngine: string;
            homepage: string;
            startupPage: string;
        }>,
    onSettingsChanged: (callback: (settings: { searchEngine: string; homepage: string; startupPage: string }) => void) => {
        const listener = (_event: IpcRendererEvent, payload: unknown) => {
            if (typeof payload !== "object" || payload === null) return;
            const record = payload as Record<string, unknown>;
            if (
                typeof record.searchEngine !== "string" ||
                typeof record.homepage !== "string" ||
                typeof record.startupPage !== "string"
            ) {
                return;
            }
            callback({
                searchEngine: record.searchEngine,
                homepage: record.homepage,
                startupPage: record.startupPage
            });
        };
        ipcRenderer.on("skybrowse:settings-changed", listener);
        return () => {
            ipcRenderer.removeListener("skybrowse:settings-changed", listener);
        };
    },
    updateSetting: (key: unknown, value: unknown) =>
        ipcRenderer.invoke("skybrowse:settings-update", { key, value }) as Promise<
            | { ok: true; settings: { searchEngine: string; homepage: string; startupPage: string } }
            | { ok: false; error: string }
        >,
    onCertificateError: (callback: (info: { host: string; error: string }) => void) => {
        const listener = (_event: IpcRendererEvent, payload: unknown) => {
            if (typeof payload !== "object" || payload === null) return;
            const record = payload as Record<string, unknown>;
            if (typeof record.host !== "string" || typeof record.error !== "string") return;
            callback({ host: record.host, error: record.error });
        };
        ipcRenderer.on("skybrowse:certificate-error", listener);
        return () => {
            ipcRenderer.removeListener("skybrowse:certificate-error", listener);
        };
    },
    sidePanel: {
        setOpen: (open: boolean) => ipcRenderer.invoke("skybrowse:sidepanel-toggle", open)
    },
    bookmarks: {
        get: () =>
            ipcRenderer.invoke("skybrowse:bookmarks-get") as Promise<{
                folders: Array<{ id: string; name: string }>;
                bookmarks: Array<{
                    id: string;
                    title: string;
                    url: string;
                    favicon: string | null;
                    parentId: string | null;
                    addedAt: number;
                }>;
            }>,
        add: (url: string, title: string, favicon: string | null) =>
            ipcRenderer.invoke("skybrowse:bookmarks-add", { url, title, favicon }) as Promise<
                | { ok: true; store: unknown; already?: true }
                | { ok: false; error: string }
            >,
        remove: (id: string) => ipcRenderer.invoke("skybrowse:bookmarks-remove", id),
        rename: (id: string, title: string) => ipcRenderer.invoke("skybrowse:bookmarks-rename", { id, title }),
        move: (id: string, parentId: string | null) =>
            ipcRenderer.invoke("skybrowse:bookmarks-move", { id, parentId }),
        createFolder: (name: string) =>
            ipcRenderer.invoke("skybrowse:bookmarks-create-folder", name) as Promise<
                | { ok: true; folder: { id: string; name: string }; store: unknown }
                | { ok: false; error: string }
            >,
        removeFolder: (id: string) => ipcRenderer.invoke("skybrowse:bookmarks-remove-folder", id)
    },
    history: {
        get: () =>
            ipcRenderer.invoke("skybrowse:history-get") as Promise<{
                visits: Array<{
                    id: string;
                    url: string;
                    title: string;
                    favicon: string | null;
                    at: number;
                }>;
            }>,
        clear: () => ipcRenderer.invoke("skybrowse:history-clear"),
        remove: (id: string) => ipcRenderer.invoke("skybrowse:history-remove", id)
    },
    onBookmarksChanged: (callback: (store: unknown) => void) => {
        const listener = (_event: IpcRendererEvent, payload: unknown) => {
            if (typeof payload === "object" && payload !== null) callback(payload);
        };
        ipcRenderer.on("skybrowse:bookmarks-changed", listener);
        return () => {
            ipcRenderer.removeListener("skybrowse:bookmarks-changed", listener);
        };
    },
    onHistoryChanged: (callback: (store: unknown) => void) => {
        const listener = (_event: IpcRendererEvent, payload: unknown) => {
            if (typeof payload === "object" && payload !== null) callback(payload);
        };
        ipcRenderer.on("skybrowse:history-changed", listener);
        return () => {
            ipcRenderer.removeListener("skybrowse:history-changed", listener);
        };
    },
    tabs: {
        create: (id: string, url: string) => ipcRenderer.invoke("skybrowse:tab-create", { id, url }) as Promise<boolean>,
        destroy: (id: string) => ipcRenderer.invoke("skybrowse:tab-destroy", id),
        activate: (id: string) => ipcRenderer.invoke("skybrowse:tab-activate", id),
        navigate: (id: string, url: string) => ipcRenderer.invoke("skybrowse:tab-navigate", { id, url }),
        back: (id: string) => ipcRenderer.invoke("skybrowse:tab-back", id),
        forward: (id: string) => ipcRenderer.invoke("skybrowse:tab-forward", id),
        reload: (id: string) => ipcRenderer.invoke("skybrowse:tab-reload", id),
        hardReload: (id: string) => ipcRenderer.invoke("skybrowse:tab-hard-reload", id),
        stop: (id: string) => ipcRenderer.invoke("skybrowse:tab-stop", id)
    },
    onViewEvent: (callback: ViewEventCallback) => {
        const listener = (_event: IpcRendererEvent, payload: unknown) => {
            if (typeof payload !== "object" || payload === null) return;
            const record = payload as Record<string, unknown>;
            if (typeof record.id !== "string") return;
            callback(record as Record<string, unknown> & { id: string });
        };
        ipcRenderer.on("skybrowse:view-event", listener);
        return () => {
            ipcRenderer.removeListener("skybrowse:view-event", listener);
        };
    },
    onOpenTab: (callback: OpenTabCallback) => {
        const listener = (_event: IpcRendererEvent, url: unknown) => {
            if (typeof url !== "string") return;
            try {
                const parsed = new URL(url);
                if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
                callback(url);
            } catch {
                /* ignore malformed url */
            }
        };
        ipcRenderer.on("skybrowse:open-tab", listener);
        return () => {
            ipcRenderer.removeListener("skybrowse:open-tab", listener);
        };
    },
    onGuestShortcut: (callback: GuestShortcutCallback) => {
        const listener = (_event: IpcRendererEvent, payload: unknown) => {
            if (typeof payload !== "object" || payload === null) return;
            const record = payload as Record<string, unknown>;
            if (typeof record.key !== "string") return;
            callback({
                key: record.key,
                ctrlOrMeta: Boolean(record.ctrlOrMeta),
                shift: Boolean(record.shift),
                alt: Boolean(record.alt)
            });
        };
        ipcRenderer.on("skybrowse:guest-shortcut", listener);
        return () => {
            ipcRenderer.removeListener("skybrowse:guest-shortcut", listener);
        };
    }
};

export type SkybrowseApi = typeof skybrowse;

contextBridge.exposeInMainWorld("skybrowse", skybrowse);
