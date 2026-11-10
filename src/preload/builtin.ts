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
