import { CSSProperties } from "react";

export interface Workspace {
    id: string;
    name: string;
    color: string;
}

interface SidebarProps {
    workspaces: Workspace[];
    activeWorkspaceId: string;
    onSwitch: (id: string) => void;
    onCreate: () => void;
    onRename: (id: string) => void;
    onClose: (id: string) => void;
}

export default function Sidebar({ workspaces, activeWorkspaceId, onSwitch, onCreate, onRename, onClose }: SidebarProps) {
    return (
        <aside className="sidebar" aria-label="Workspaces sidebar">
            <div className="sidebar-items" role="tablist" aria-orientation="vertical">
                {workspaces.map(workspace => (
                    <button
                        key={workspace.id}
                        className={`sidebar-item${activeWorkspaceId === workspace.id ? " active" : ""}`}
                        style={{ "--workspace-color": workspace.color } as CSSProperties}
                        role="tab"
                        aria-selected={activeWorkspaceId === workspace.id}
                        aria-label={workspace.name}
                        title={`${workspace.name} — double-click to rename · right-click to delete`}
                        onClick={() => onSwitch(workspace.id)}
                        onDoubleClick={() => onRename(workspace.id)}
                        onContextMenu={event => {
                            event.preventDefault();
                            onClose(workspace.id);
                        }}
                    >
                        <span className="sidebar-letter" aria-hidden="true">
                            {workspace.name.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                    </button>
                ))}
            </div>
            <button className="sidebar-add" onClick={onCreate} aria-label="Add workspace" title="Add workspace">
                +
            </button>
        </aside>
    );
}
