import { FormEvent, useEffect, useRef } from "react";

export type ModalMode = "create" | "delete";

interface WorkspaceModalProps {
    mode: ModalMode;
    workspaceName?: string;
    onCancel: () => void;
    onConfirm: (payload: { name?: string }) => void;
}

export default function WorkspaceModal({ mode, workspaceName, onCancel, onConfirm }: WorkspaceModalProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (mode === "create") inputRef.current?.focus();
    }, [mode]);

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (mode === "create") {
            onConfirm({ name: inputRef.current?.value });
            return;
        }
        onConfirm({});
    };

    return (
        <div className="modal-backdrop" onClick={onCancel} role="presentation">
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="workspace-modal-title"
                onClick={event => event.stopPropagation()}
            >
                <h2 className="modal-title" id="workspace-modal-title">
                    {mode === "create" ? "New workspace" : "Delete workspace"}
                </h2>

                <form onSubmit={submit}>
                    {mode === "create" && (
                        <label className="panel-field">
                            <span className="panel-label">Name</span>
                            <input
                                ref={inputRef}
                                className="panel-input"
                                type="text"
                                placeholder="e.g. Personal"
                                autoFocus
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
                            {mode === "create" ? "Create" : "Delete"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
