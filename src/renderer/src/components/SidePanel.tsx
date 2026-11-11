import { FormEvent, useEffect, useState } from "react";
import Logo from "./Logo";

interface SidePanelProps {
    open: boolean;
    onClose: () => void;
    onOpenUrl: (url: string) => void;
    settings: SkybrowseSettings;
    version: string;
}

const SHORTCUTS: Array<[string, string]> = [
    ["Ctrl+T", "New tab"],
    ["Ctrl+W", "Close tab"],
    ["Ctrl+L", "Focus address bar"],
    ["Ctrl+R / F5", "Reload"],
    ["Ctrl+Shift+R", "Hard reload"],
    ["Ctrl+Tab", "Next tab"],
    ["Ctrl+Shift+Tab", "Previous tab"],
    ["Ctrl+1–9", "Switch to tab"],
    ["Alt+Left / Alt+Right", "Back / Forward"],
    ["Esc", "Close this panel"]
];

export default function SidePanel({ open, onClose, onOpenUrl, settings, version }: SidePanelProps) {
    const [homepageText, setHomepageText] = useState<string>(settings.homepage);
    const [status, setStatus] = useState<string>("");
    const [statusKind, setStatusKind] = useState<"ok" | "err" | "">("");

    useEffect(() => {
        setHomepageText(settings.homepage);
    }, [settings.homepage]);

    const save = (key: string, value: string) => {
        window.skybrowse.updateSetting(key, value).then(result => {
            if (result.ok) {
                setStatus("Saved");
                setStatusKind("ok");
            } else {
                setStatus(result.error ?? "Could not save");
                setStatusKind("err");
            }
            window.setTimeout(() => {
                setStatus("");
                setStatusKind("");
            }, 2500);
        });
    };

    const onHomepageSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        save("homepage", homepageText.trim());
    };

    return (
        <aside
            className={`side-panel${open ? " open" : ""}`}
            aria-label="SkyBrowse panel"
            aria-hidden={!open}
        >
            <div className="side-panel-header">
                <div className="side-panel-brand">
                    <Logo size={18} />
                    <span>SkyBrowse</span>
                </div>
                <button className="side-panel-close" onClick={onClose} aria-label="Close panel" title="Close panel (Esc)">
                    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                </button>
            </div>

            <div className="side-panel-scroll">
                <section className="panel-section" aria-label="Settings">
                    <h2 className="panel-heading">Settings</h2>

                    <label className="panel-field">
                        <span className="panel-label">Default search engine</span>
                        <select
                            className="panel-select"
                            value={settings.searchEngine}
                            onChange={event => save("searchEngine", event.target.value)}
                            aria-label="Default search engine"
                        >
                            <option value="google">Google</option>
                            <option value="bing">Bing</option>
                            <option value="duckduckgo">DuckDuckGo</option>
                        </select>
                    </label>

                    <label className="panel-field">
                        <span className="panel-label">Startup page</span>
                        <select
                            className="panel-select"
                            value={settings.startupPage}
                            onChange={event => save("startupPage", event.target.value)}
                            aria-label="Startup page"
                        >
                            <option value="newtab">New Tab page</option>
                            <option value="homepage">My homepage</option>
                        </select>
                    </label>

                    <form className="panel-field" onSubmit={onHomepageSubmit}>
                        <span className="panel-label">Homepage</span>
                        <div className="panel-homepage-row">
                            <input
                                className="panel-input"
                                value={homepageText}
                                onChange={event => setHomepageText(event.target.value)}
                                spellCheck={false}
                                autoComplete="off"
                                placeholder="skybrowse://newtab"
                                aria-label="Homepage URL"
                            />
                            <button className="panel-save" type="submit">Save</button>
                        </div>
                    </form>

                    <p className={`panel-status${statusKind ? " " + statusKind : ""}`} role="status" aria-live="polite">
                        {status}
                    </p>
                </section>

                <section className="panel-section" aria-label="Pages">
                    <h2 className="panel-heading">Pages</h2>
                    <div className="panel-links">
                        <button className="panel-link" onClick={() => onOpenUrl("skybrowse://history")}>History</button>
                        <button className="panel-link" onClick={() => onOpenUrl("skybrowse://downloads")}>Downloads</button>
                    </div>
                </section>

                <section className="panel-section" aria-label="Keyboard shortcuts">
                    <h2 className="panel-heading">Keyboard shortcuts</h2>
                    <dl className="panel-shortcuts">
                        {SHORTCUTS.map(([keys, description]) => (
                            <div className="panel-shortcut" key={keys}>
                                <kbd>{keys}</kbd>
                                <span>{description}</span>
                            </div>
                        ))}
                    </dl>
                </section>

                <section className="panel-section" aria-label="About SkyBrowse">
                    <h2 className="panel-heading">About</h2>
                    <div className="panel-about">
                        <Logo size={44} />
                        <div>
                            <p className="panel-about-name">SkyBrowse</p>
                            <p className="panel-about-version">v{version}</p>
                        </div>
                    </div>
                    <div className="panel-links">
                        <button className="panel-link" onClick={() => onOpenUrl("skybrowse://newtab")}>New Tab page</button>
                        <button className="panel-link" onClick={() => onOpenUrl("skybrowse://settings")}>Full settings</button>
                        <button className="panel-link" onClick={() => onOpenUrl("skybrowse://about")}>About SkyBrowse</button>
                    </div>
                </section>
            </div>
        </aside>
    );
}
