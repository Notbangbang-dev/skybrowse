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
