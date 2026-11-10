import {
    FormEvent,
    useCallback,
    useEffect,
    useRef,
    useState
} from "react";
import Logo from "./components/Logo";
import SidePanel from "./components/SidePanel";
import { getSearchEngine } from "./lib/search";
import { normalizeInput } from "./lib/url";

interface TabState {
    id: string;
    url: string;
    title: string;
    loading: boolean;
    favicon: string | null;
    canGoBack: boolean;
    canGoForward: boolean;
}

function createTab(id: string, url: string, title: string): TabState {
    return {
        id,
        url,
        title,
        loading: true,
        favicon: null,
        canGoBack: false,
        canGoForward: false
    };
}

export default function App() {
    const [appInfo, setAppInfo] = useState<{ version: string; platform: string; startPageUrl: string; settings: SkybrowseSettings } | null>(null);
    const [settings, setSettings] = useState<SkybrowseSettings>({ searchEngine: "google", homepage: "", startupPage: "newtab" });
    const [tabs, setTabs] = useState<TabState[]>([]);
    const [activeId, setActiveId] = useState<string>("");
    const [addressText, setAddressText] = useState<string>("");
    const [panelOpen, setPanelOpen] = useState<boolean>(false);
    const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]);
    const toastIdRef = useRef(0);

    const addToast = useCallback((message: string) => {
        const id = ++toastIdRef.current;
        setToasts(previous => [...previous.slice(-2), { id, message }]);
        window.setTimeout(() => {
            setToasts(previous => previous.filter(toast => toast.id !== id));
        }, 9000);
    }, []);

    const initializedRef = useRef(false);
    const addressRef = useRef<HTMLInputElement | null>(null);
    const tabsRef = useRef(tabs);
    const activeIdRef = useRef(activeId);
    const startPageUrlRef = useRef<string>("");
    const dragIndexRef = useRef<number | null>(null);

    tabsRef.current = tabs;
    activeIdRef.current = activeId;
    startPageUrlRef.current = appInfo?.startPageUrl ?? "";

    const patchTab = useCallback((id: string, patch: Partial<TabState>) => {
        setTabs(previous => previous.map(tab => (tab.id === id ? { ...tab, ...patch } : tab)));
    }, []);

    const newTab = useCallback(
        (url?: string, title = "SkyBrowse") => {
            const startPageUrl = startPageUrlRef.current;
            if (!startPageUrl) return;
            const target = url ?? startPageUrl;
            const id = crypto.randomUUID();

            window.skybrowse.tabs.create(id, target);

            setTabs(previous => [...previous, createTab(id, target, title)]);
            setActiveId(id);
        },
        []
    );


    useEffect(() => {
        window.skybrowse.getAppInfo().then(info => {
            if (info) {
                setAppInfo(info);
                if (info.settings) setSettings(info.settings);
            }
        });
    }, []);

    useEffect(() => {
        if (!appInfo || initializedRef.current) return;
        initializedRef.current = true;
        const startup =
            appInfo.settings?.startupPage === "homepage" && appInfo.settings.homepage
                ? appInfo.settings.homepage
                : undefined;
        newTab(startup);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appInfo]);

    useEffect(() => {
        return window.skybrowse.onSettingsChanged(next => {
            setSettings(next);
        });
    }, []);

    const openTabRef = useRef(newTab);
    openTabRef.current = newTab;

    useEffect(() => {
        return window.skybrowse.onOpenTab(url => {
            openTabRef.current(url, "New Tab");
        });
    }, []);

    useEffect(() => {
        return window.skybrowse.onViewEvent(event => {
            const { id, type } = event;

            switch (type) {
                case "loading":
                    patchTab(id, { loading: Boolean(event.value) });
                    break;
                case "url": {
                    const url = typeof event.url === "string" ? event.url : "";
                    patchTab(id, { url });
                    break;
                }
                case "title":
                    if (typeof event.title === "string") patchTab(id, { title: event.title });
                    break;
                case "favicon": {
                    const current = tabsRef.current.find(t => t.id === id);
                    if (current && current.url.startsWith("skybrowse:")) break;
                    patchTab(id, { favicon: typeof event.favicon === "string" ? event.favicon : null });
                    break;
                }
                case "nav-state":
                    patchTab(id, {
                        canGoBack: Boolean(event.canGoBack),
                        canGoForward: Boolean(event.canGoForward)
                    });
                    break;
                case "load-error":
                    patchTab(id, { loading: false, title: "Failed to load" });
                    addToast("That page failed to load.");
                    break;
                case "crashed":
                    patchTab(id, { loading: false, title: "Crashed" });
                    addToast("This page crashed. Press Ctrl+R to reload it.");
                    break;
                default:
                    break;
            }
        });
    }, [patchTab, addToast]);

    const activeTab = tabs.find(tab => tab.id === activeId) ?? null;
    const visibleTabs = tabs;

    useEffect(() => {
        if (activeId) window.skybrowse.tabs.activate(activeId);
    }, [activeId]);

    useEffect(() => {
        setAddressText(activeTab && activeTab.url !== startPageUrlRef.current ? activeTab.url : "");
    }, [activeTab?.id, activeTab?.url]);

    const closeTab = useCallback(
        (id: string) => {
            const current = tabsRef.current;
            const index = current.findIndex(tab => tab.id === id);
            const wasActive = activeIdRef.current === id;
            const isLast = current.length === 1;

            window.skybrowse.tabs.destroy(id);
            setTabs(previous => previous.filter(tab => tab.id !== id));

            if (isLast) {
                newTab();
                return;
            }

            if (wasActive) {
                const remaining = current.filter(tab => tab.id !== id);
                const neighbor = remaining[Math.min(index, remaining.length - 1)];
                setActiveId(neighbor.id);
            }
        },
        [newTab]
    );

    const handleShortcut = useCallback(
        (shortcut: { key: string; ctrlOrMeta: boolean; shift: boolean; alt: boolean }) => {
            const { key, ctrlOrMeta, shift, alt } = shortcut;

            if (ctrlOrMeta && key === "t") {
                newTab();
                return;
            }
            if (ctrlOrMeta && key === "w") {
                if (activeIdRef.current) closeTab(activeIdRef.current);
                return;
            }
            if (ctrlOrMeta && key === "l") {
                addressRef.current?.focus();
                addressRef.current?.select();
                return;
            }
            if (ctrlOrMeta && key === "r") {
                const id = activeIdRef.current;
                if (!id) return;
                if (shift) window.skybrowse.tabs.hardReload(id);
                else window.skybrowse.tabs.reload(id);
                return;
            }
            if (key === "f5") {
                const id = activeIdRef.current;
                if (id) window.skybrowse.tabs.reload(id);
                return;
            }
            if (ctrlOrMeta && key === "tab") {
                const current = tabsRef.current;
                if (current.length < 2) return;
                const index = current.findIndex(tab => tab.id === activeIdRef.current);
                const delta = shift ? -1 : 1;
                const next = current[(index + delta + current.length) % current.length];
                setActiveId(next.id);
                return;
            }
            if (ctrlOrMeta && /^[1-9]$/.test(key)) {
                const current = tabsRef.current;
                const index = key === "9" ? current.length - 1 : Number(key) - 1;
                const target = current[index];
                if (target) setActiveId(target.id);
                return;
            }
            if (alt && key === "arrowleft") {
                if (activeIdRef.current) window.skybrowse.tabs.back(activeIdRef.current);
                return;
            }
            if (alt && key === "arrowright") {
                if (activeIdRef.current) window.skybrowse.tabs.forward(activeIdRef.current);
                return;
            }
        },
        [newTab, closeTab]
    );

    useEffect(() => {
        return window.skybrowse.onGuestShortcut(handleShortcut);
    }, [handleShortcut]);

    useEffect(() => {
        return window.skybrowse.onCertificateError(({ host, error }) => {
            addToast(`Certificate problem on ${host} (${error}) — page blocked.`);
        });
    }, [addToast]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const ctrlOrMeta = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();

            if (key === "escape" && panelOpen) {
                event.preventDefault();
                setPanelOpen(false);
                window.skybrowse.sidePanel.setOpen(false);
                return;
            }

            const isShortcut =
                (ctrlOrMeta && ["t", "w", "l", "r", "tab"].includes(key)) ||
                (ctrlOrMeta && /^[1-9]$/.test(key)) ||
                (event.altKey && (key === "arrowleft" || key === "arrowright")) ||
                key === "f5";

            if (!isShortcut) return;
            event.preventDefault();
            handleShortcut({ key, ctrlOrMeta, shift: event.shiftKey, alt: event.altKey });
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [handleShortcut, panelOpen]);

    const navigateActive = useCallback((url: string) => {
        if (activeIdRef.current) window.skybrowse.tabs.navigate(activeIdRef.current, url);
    }, []);

    const submitAddress = useCallback(
        (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const url = normalizeInput(addressText, settings.searchEngine);
            if (!url) return;
            navigateActive(url);
            addressRef.current?.blur();
        },
        [addressText, navigateActive, settings.searchEngine]
    );

    const goBack = useCallback(() => {
        if (activeIdRef.current) window.skybrowse.tabs.back(activeIdRef.current);
    }, []);

    const goForward = useCallback(() => {
        if (activeIdRef.current) window.skybrowse.tabs.forward(activeIdRef.current);
    }, []);

    const reloadOrStop = useCallback(() => {
        const id = activeIdRef.current;
        if (!id) return;
        const tab = tabsRef.current.find(t => t.id === id);
        if (tab?.loading) window.skybrowse.tabs.stop(id);
        else window.skybrowse.tabs.reload(id);
    }, []);

    const goHome = useCallback(() => {
        const target = settings.homepage || startPageUrlRef.current;
        if (target) navigateActive(target);
    }, [navigateActive, settings.homepage]);

    if (!appInfo) {
        return (
            <div className="app app-loading">
                <Logo size={64} />
            </div>
        );
    }

    const engine = getSearchEngine(settings.searchEngine);
    const tab = activeTab;

    return (
        <div className="app">
            <header className="titlebar" onDoubleClick={() => window.skybrowse.window.toggleMaximize()}>
                <div className="brand">
                    <Logo size={21} />
                    <span className="wordmark">SkyBrowse</span>
                </div>

                <div className="tabstrip" role="tablist" aria-label="Open tabs">
                    {visibleTabs.map((t, index) => {
                        const selected = t.id === activeId;
                        return (
                            <div
                                key={t.id}
                                role="tab"
                                aria-selected={selected}
                                tabIndex={selected ? 0 : -1}
                                className={`tab${selected ? " selected" : ""}`}
                                title={t.title}
                                draggable
                                onClick={() => setActiveId(t.id)}
                                onKeyDown={event => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        setActiveId(t.id);
                                    }
                                }}
                                onMouseDown={event => {
                                    if (event.button === 1) {
                                        event.preventDefault();
                                        closeTab(t.id);
                                    }
                                }}
                                onDragStart={event => {
                                    dragIndexRef.current = index;
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", t.id);
                                }}
                                onDragOver={event => {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                }}
                                onDrop={event => {
                                    event.preventDefault();
                                    const from = dragIndexRef.current;
                                    if (from !== null && from !== index) {
                                        setTabs(previous => reorderTabs(previous, from, index));
                                    }
                                    dragIndexRef.current = null;
                                }}
                            >
                                <span className="tab-icon">
                                    {t.loading ? (
                                        <span className="tab-spinner" aria-hidden="true" />
                                    ) : t.url.startsWith("skybrowse:") ? (
                                        <img src="/favicon.svg" alt="" width={14} height={14} />
                                    ) : t.favicon ? (
                                        <img src={t.favicon} alt="" width={14} height={14} />
                                    ) : (
                                        <GlobeIcon />
                                    )}
                                </span>
                                <span className="tab-title">{t.title}</span>
                                <button
                                    className="tab-close"
                                    aria-label="Close tab"
                                    onClick={event => {
                                        event.stopPropagation();
                                        closeTab(t.id);
                                    }}
                                >
                                    <CloseIcon size={12} />
                                </button>
                            </div>
                        );
                    })}
                </div>

                <button className="new-tab-button" onClick={() => newTab()} aria-label="New tab (Ctrl+T)" title="New tab (Ctrl+T)">
                    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                        <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                </button>

                <div className="window-controls">
                    <button className="window-control" onClick={() => window.skybrowse.window.minimize()} aria-label="Minimize" title="Minimize">
                        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M1.5 6h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                    </button>
                    <button className="window-control" onClick={() => window.skybrowse.window.toggleMaximize()} aria-label="Maximize or restore" title="Maximize / restore">
                        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
                    </button>
                    <button className="window-control window-control-close" onClick={() => window.skybrowse.window.close()} aria-label="Close" title="Close">
                        <CloseIcon size={12} />
                    </button>
                </div>
            </header>

            <div className="toolbar">
                <div className="nav-buttons">
                    <button className="nav-button" onClick={goBack} disabled={!tab?.canGoBack} aria-label="Back" title="Back (Alt+Left)">
                        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M10.5 3L5.5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button className="nav-button" onClick={goForward} disabled={!tab?.canGoForward} aria-label="Forward" title="Forward (Alt+Right)">
                        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M5.5 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button className="nav-button" onClick={reloadOrStop} aria-label={tab?.loading ? "Stop loading" : "Reload"} title={tab?.loading ? "Stop" : "Reload (Ctrl+R)"}>
                        {tab?.loading ? (
                            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
                        ) : (
                            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                    </button>
                    <button className="nav-button" onClick={goHome} aria-label="Home" title="SkyBrowse home">
                        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.5 8.5L8 3.5l5.5 5M4.5 7v6h7V7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                </div>

                <form className="address-bar" onSubmit={submitAddress} role="search">
                    <span className="address-scheme" aria-hidden="true">
                        {tab?.url.startsWith("skybrowse:") ? <PlaneIcon /> : tab?.url.startsWith("https:") ? <LockIcon /> : <GlobeIcon />}
                    </span>
                    <input
                        ref={addressRef}
                        className="address-input"
                        value={addressText}
                        spellCheck={false}
                        autoComplete="off"
                        autoCapitalize="off"
                        aria-label="Address or search"
                        placeholder={`Search ${engine.name} or enter address`}
                        onChange={event => setAddressText(event.target.value)}
                        onFocus={event => event.target.select()}
                        onBlur={() => setAddressText(tab && tab.url !== startPageUrlRef.current ? tab.url : "")}
                    />
                    <kbd className="address-hint">Ctrl L</kbd>
                </form>

                <div className="toolbar-right">
                    <button
                        className={`nav-button sidepanel-toggle${panelOpen ? " active" : ""}`}
                        onClick={() => {
                            const next = !panelOpen;
                            setPanelOpen(next);
                            window.skybrowse.sidePanel.setOpen(next);
                        }}
                        aria-label={panelOpen ? "Close side panel" : "Open side panel"}
                        aria-pressed={panelOpen}
                        title={panelOpen ? "Close panel (Esc)" : "Open side panel"}
                    >
                        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                            <rect x="1.5" y="2.5" width="13" height="11" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M10.2 2.5v11" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className={`load-indicator${tab?.loading ? " active" : ""}`} aria-hidden="true">
                <div className="load-indicator-bar" />
            </div>

            <main className="views" aria-label="Page content" />

            <div className="toasts" aria-live="polite">
                {toasts.map(toast => (
                    <div className="toast" key={toast.id} role="status">
                        <span className="toast-message">{toast.message}</span>
                        <button
                            className="toast-close"
                            aria-label="Dismiss"
                            onClick={() => setToasts(previous => previous.filter(t => t.id !== toast.id))}
                        >
                            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>

            <SidePanel
                open={panelOpen}
                onClose={() => {
                    setPanelOpen(false);
                    window.skybrowse.sidePanel.setOpen(false);
                }}
                onOpenUrl={url => navigateActive(url)}
                settings={settings}
                version={appInfo.version}
            />
        </div>
    );
}

function reorderTabs(tabs: TabState[], from: number, to: number): TabState[] {
    const next = [...tabs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

function PlaneIcon() {
    return (
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M1.5 8.6L14.5 1.6 9.3 14.6 6.9 9.4 1.5 8.6Z" fill="#c9cdf2" />
        </svg>
    );
}

function GlobeIcon() {
    return (
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <circle cx="8" cy="8" r="5.6" fill="none" stroke="#8a93b8" strokeWidth="1.3" />
            <path d="M2.6 8h10.8M8 2.4c-2 1.9-2 9.3 0 11.2M8 2.4c2 1.9 2 9.3 0 11.2" fill="none" stroke="#8a93b8" strokeWidth="1.1" />
        </svg>
    );
}

function LockIcon() {
    return (
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <rect x="3.4" y="7" width="9.2" height="6.4" rx="1.6" fill="none" stroke="#7ee0c0" strokeWidth="1.3" />
            <path d="M5.6 7V5.4a2.4 2.4 0 0 1 4.8 0V7" fill="none" stroke="#7ee0c0" strokeWidth="1.3" />
        </svg>
    );
}

function CloseIcon({ size = 12 }: { size?: number }) {
    return (
        <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}
