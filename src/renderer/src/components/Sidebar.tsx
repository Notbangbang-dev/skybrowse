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
    onClose: (id: string) => void;
}

export default function Sidebar({ workspaces, activeWorkspaceId, onSwitch, onCreate, onClose }: SidebarProps) {
    return (
        <aside className="sidebar" aria-label="Workspaces sidebar">
            <div className="sidebar-items">
                {workspaces.map(workspace => (
                    <button
                        key={workspace.id}
                        className={`sidebar-item${activeWorkspaceId === workspace.id ? " active" : ""}`}
                        style={{ "--workspace-color": workspace.color } as CSSProperties}
                        onClick={() => onSwitch(workspace.id)}
                        onContextMenu={event => {
                            event.preventDefault();
                            onClose(workspace.id);
                        }}
                        title={workspace.name}
                        aria-label={`Switch to workspace ${workspace.name}`}
                        aria-pressed={activeWorkspaceId === workspace.id}
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
