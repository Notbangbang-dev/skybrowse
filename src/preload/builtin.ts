import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

type SettingsPayload = {
    searchEngine: string;
    homepage: string;
    startupPage: string;
};

type SettingsChangedCallback = (settings: SettingsPayload) => void;

const skybrowse = {
    getAppInfo: () =>
        ipcRenderer.invoke("skybrowse:app-info") as Promise<{
            version: string;
            platform: string;
            startPageUrl: string;
        } | null>,
    getSettings: () => ipcRenderer.invoke("skybrowse:settings-get") as Promise<SettingsPayload>,
    updateSetting: (key: unknown, value: unknown) =>
        ipcRenderer.invoke("skybrowse:settings-update", { key, value }) as Promise<
            | { ok: true; settings: SettingsPayload }
            | { ok: false; error: string }
        >,
    openTab: (url: unknown) => {
        if (typeof url !== "string") return Promise.resolve(false);
        return ipcRenderer.invoke("skybrowse:builtin-open-tab", url) as Promise<boolean>;
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
            ipcRenderer.invoke("skybrowse:bookmarks-add", { url, title, favicon }) as Promise<unknown>,
        remove: (id: string) => ipcRenderer.invoke("skybrowse:bookmarks-remove", id),
        rename: (id: string, title: string) => ipcRenderer.invoke("skybrowse:bookmarks-rename", { id, title }),
        move: (id: string, parentId: string | null) =>
            ipcRenderer.invoke("skybrowse:bookmarks-move", { id, parentId }),
        createFolder: (name: string) =>
            ipcRenderer.invoke("skybrowse:bookmarks-create-folder", name) as Promise<unknown>,
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
    downloads: {
        get: () =>
            ipcRenderer.invoke("skybrowse:downloads-get") as Promise<{
                active: Array<{
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
                }>;
                completed: Array<{
                    id: string;
                    fileName: string;
                    savePath: string;
                    url: string;
                    totalBytes: number;
                    state: string;
                    completedAt: number;
                }>;
            }>,
        pause: (id: string) => ipcRenderer.invoke("skybrowse:download-pause", id),
        resume: (id: string) => ipcRenderer.invoke("skybrowse:download-resume", id),
        cancel: (id: string) => ipcRenderer.invoke("skybrowse:download-cancel", id),
        open: (id: string) =>
            ipcRenderer.invoke("skybrowse:download-open", id) as Promise<
                { ok: true } | { ok: false; error: string }
            >,
        reveal: (id: string) => ipcRenderer.invoke("skybrowse:download-reveal", id),
        remove: (id: string) => ipcRenderer.invoke("skybrowse:download-remove", id),
        clearCompleted: () => ipcRenderer.invoke("skybrowse:downloads-clear-completed")
    },
    onDownloadsChanged: (callback: (data: { completed: unknown[] }) => void) => {
        const listener = (_event: IpcRendererEvent, payload: unknown) => {
            if (typeof payload === "object" && payload !== null) {
                callback(payload as { completed: unknown[] });
            }
        };
        ipcRenderer.on("skybrowse:downloads-changed", listener);
        return () => {
            ipcRenderer.removeListener("skybrowse:downloads-changed", listener);
        };
    },
    onDownloadEvent: (callback: (data: { type: string; download: unknown }) => void) => {
        const listener = (_event: IpcRendererEvent, payload: unknown) => {
            if (typeof payload === "object" && payload !== null) {
                callback(payload as { type: string; download: unknown });
            }
        };
        ipcRenderer.on("skybrowse:download-event", listener);
        return () => {
            ipcRenderer.removeListener("skybrowse:download-event", listener);
        };
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
        onSettingsChanged: (callback: SettingsChangedCallback) => {
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
    }
};

export type SkybrowseBuiltinApi = typeof skybrowse;

contextBridge.exposeInMainWorld("skybrowse", skybrowse);
