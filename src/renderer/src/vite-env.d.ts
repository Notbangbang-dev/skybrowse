/// <reference types="vite/client" />

declare global {
    interface SkybrowseSettings {
        searchEngine: string;
        homepage: string;
        startupPage: string;
    }

    interface SkybrowseSettingsUpdateResult {
        ok: boolean;
        settings?: SkybrowseSettings;
        error?: string;
    }

    interface SkybrowseBookmarkFolder {
        id: string;
        name: string;
    }

    interface SkybrowseBookmark {
        id: string;
        title: string;
        url: string;
        favicon: string | null;
        parentId: string | null;
        addedAt: number;
    }

    interface SkybrowseBookmarkStore {
        folders: SkybrowseBookmarkFolder[];
        bookmarks: SkybrowseBookmark[];
    }

    interface SkybrowseHistoryVisit {
        id: string;
        url: string;
        title: string;
        favicon: string | null;
        at: number;
    }

    interface SkybrowseHistoryStore {
        visits: SkybrowseHistoryVisit[];
    }

    interface SkybrowseViewEvent {
        id: string;
        type: string;
        [key: string]: unknown;
    }

    interface SkybrowseGuestShortcut {
        key: string;
        ctrlOrMeta: boolean;
        shift: boolean;
        alt: boolean;
    }

    interface SkybrowseApi {
        window: {
            minimize: () => Promise<void>;
            toggleMaximize: () => Promise<void>;
            close: () => Promise<void>;
        };
        getAppInfo: () => Promise<{
            version: string;
            platform: string;
            startPageUrl: string;
            settings: SkybrowseSettings;
        } | null>;
        getSettings: () => Promise<SkybrowseSettings>;
        onSettingsChanged: (callback: (settings: SkybrowseSettings) => void) => () => void;
        updateSetting: (key: unknown, value: unknown) => Promise<SkybrowseSettingsUpdateResult>;
        sidePanel: {
            setOpen: (open: boolean) => Promise<void>;
        };
        tabs: {
            create: (id: string, url: string) => Promise<boolean>;
            destroy: (id: string) => Promise<void>;
            activate: (id: string) => Promise<void>;
            navigate: (id: string, url: string) => Promise<void>;
            back: (id: string) => Promise<void>;
            forward: (id: string) => Promise<void>;
            reload: (id: string) => Promise<void>;
            hardReload: (id: string) => Promise<void>;
            stop: (id: string) => Promise<void>;
        };
        bookmarks: {
            get: () => Promise<SkybrowseBookmarkStore>;
            add: (url: string, title: string, favicon: string | null) => Promise<
                | { ok: true; store: SkybrowseBookmarkStore; already?: true }
                | { ok: false; error: string }
            >;
            remove: (id: string) => Promise<SkybrowseBookmarkStore>;
            rename: (id: string, title: string) => Promise<SkybrowseBookmarkStore>;
            move: (id: string, parentId: string | null) => Promise<SkybrowseBookmarkStore>;
            createFolder: (name: string) => Promise<
                | { ok: true; folder: SkybrowseBookmarkFolder; store: SkybrowseBookmarkStore }
                | { ok: false; error: string }
            >;
            removeFolder: (id: string) => Promise<SkybrowseBookmarkStore>;
        };
        history: {
            get: () => Promise<SkybrowseHistoryStore>;
            clear: () => Promise<SkybrowseHistoryStore>;
            remove: (id: string) => Promise<SkybrowseHistoryStore>;
        };
        onBookmarksChanged: (callback: (store: SkybrowseBookmarkStore) => void) => () => void;
        onHistoryChanged: (callback: (store: SkybrowseHistoryStore) => void) => () => void;
        onViewEvent: (callback: (event: SkybrowseViewEvent) => void) => () => void;
        onOpenTab: (callback: (url: string) => void) => () => void;
        onGuestShortcut: (callback: (shortcut: SkybrowseGuestShortcut) => void) => () => void;
        onCertificateError: (callback: (info: { host: string; error: string }) => void) => () => void;
    }

    interface Window {
        skybrowse: SkybrowseApi;
    }
}

export {};
