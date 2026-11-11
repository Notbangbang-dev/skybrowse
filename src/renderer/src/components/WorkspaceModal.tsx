import { FormEvent, useEffect, useRef, useState } from "react";

export type ModalMode = "create" | "delete" | "rename";

interface WorkspaceModalProps {
    mode: ModalMode;
    workspaceName?: string;
    onCancel: () => void;
    onConfirm: (payload: { name?: string }) => void;
}

export default function WorkspaceModal({ mode, workspaceName, onCancel, onConfirm }: WorkspaceModalProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [name, setName] = useState(workspaceName ?? "");

    useEffect(() => {
        if (mode === "create" || mode === "rename") {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [mode]);

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (mode === "create") {
            onConfirm({ name: name.trim() || undefined });
            return;
        }
        if (mode === "rename") {
            onConfirm({ name: name.trim() || undefined });
            return;
        }
        onConfirm({});
    };

    const title =
        mode === "create" ? "New workspace" : mode === "rename" ? "Rename workspace" : "Delete workspace";

    return (
        <div className="modal-backdrop" onClick={onCancel} role="presentation">
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="workspace-modal-title"
                onClick={event => event.stopPropagation()}
            >
                <h2 className="modal-title" id="workspace-modal-title">{title}</h2>

                <form onSubmit={submit}>
                    {(mode === "create" || mode === "rename") && (
                        <label className="panel-field">
                            <span className="panel-label">Name</span>
                            <input
                                ref={inputRef}
                                className="panel-input"
                                type="text"
                                placeholder="e.g. School"
                                value={name}
                                onChange={event => setName(event.target.value)}
                                required
                                aria-label="Workspace name"
                            />
                        </label>
                    )}

                    {mode === "delete" && (
                        <p className="modal-copy">
                            Delete workspace <strong>{workspaceName}</strong>? Its tabs will close too.
                        </p>
                    )}

                    <div className="modal-actions">
                        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
                        <button type="submit" className={`btn ${mode === "delete" ? "btn-danger" : "btn-primary"}`}>
                            {mode === "create" ? "Create" : mode === "rename" ? "Save" : "Delete"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
