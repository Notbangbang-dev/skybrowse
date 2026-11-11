var filterInput = document.getElementById("filter");
var groupsEl = document.getElementById("groups");
var emptyEl = document.getElementById("empty");
var newFolderBtn = document.getElementById("newFolder");

var store = { folders: [], bookmarks: [] };
var filter = "";

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function matches(entry) {
    if (!filter) return true;
    var hay = (entry.title + " " + entry.url).toLowerCase();
    return hay.indexOf(filter) !== -1;
}

function faviconHtml(entry) {
    if (entry.favicon) {
        return '<img class="row-favicon" src="' + escapeHtml(entry.favicon) + '" alt="" width="15" height="15">';
    }
    return '<svg class="row-favicon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="#8a93b8" stroke-width="1.3"/><path d="M2.8 8h10.4M8 2.4c-2 1.9-2 9.3 0 11.2M8 2.4c2 1.9 2 9.3 0 11.2" fill="none" stroke="#8a93b8" stroke-width="1.1"/></svg>';
}

function rowHtml(entry) {
    var folders = store.folders
        .map(function (f) { return '<option value="' + escapeHtml(f.id) + '"' + (entry.parentId === f.id ? " selected" : "") + '>' + escapeHtml(f.name) + '</option>'; })
        .join("");

    return (
        '<div class="row" data-id="' + escapeHtml(entry.id) + '">' +
            faviconHtml(entry) +
            '<div class="row-main">' +
                '<div class="row-title" title="' + escapeHtml(entry.title) + '">' + escapeHtml(entry.title) + '</div>' +
                '<div class="row-url">' + escapeHtml(entry.url) + '</div>' +
            '</div>' +
            '<div class="row-actions">' +
                '<select class="folder-select" aria-label="Move to folder">' +
                    '<option value=""' + (entry.parentId === null ? " selected" : "") + '>Root</option>' +
                    folders +
                '</select>' +
                '<button class="icon-btn rename" title="Rename" aria-label="Rename">' +
                    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.5 11.5l1-3.5L10 1.5l3 3-6.5 6.5-4 0.5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>' +
                '</button>' +
                '<button class="icon-btn danger delete" title="Delete" aria-label="Delete">' +
                    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4.5h10M6.5 2.5h3M4.5 4.5l.8 9a1.4 1.4 0 0 0 1.4 1.3h2.6a1.4 1.4 0 0 0 1.4-1.3l.8-9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>' +
                '</button>' +
            '</div>' +
        '</div>'
    );
}

function groupHtml(name, id, entries, deletable) {
    if (entries.length === 0 && deletable) {
        return (
            '<section class="group"><div class="group-head"><span class="group-name">' + escapeHtml(name) +
            '</span><button class="btn danger delete-folder" data-folder="' + escapeHtml(id) + '">Delete folder</button></div></section>'
        );
    }
    if (entries.length === 0) return "";
    var rows = entries.map(rowHtml).join("");
    var deleteBtn = deletable
        ? '<button class="btn danger delete-folder" data-folder="' + escapeHtml(id) + '">Delete folder</button>'
        : '';
    return (
        '<section class="group"><div class="group-head"><span class="group-name">' + escapeHtml(name) +
        '</span>' + deleteBtn + '</div>' + rows + '</section>'
    );
}

function render() {
    var visible = store.bookmarks.filter(matches);
    var html = groupHtml("Bookmarks bar / Root", null, visible.filter(function (b) { return b.parentId === null; }), false);

    store.folders.forEach(function (folder) {
        html += groupHtml(folder.name, folder.id, visible.filter(function (b) { return b.parentId === folder.id; }), true);
    });

    groupsEl.innerHTML = html;
    emptyEl.hidden = visible.length !== 0 || store.folders.length !== 0;
}

function refresh() {
    if (!window.skybrowse || !window.skybrowse.bookmarks) return;
    window.skybrowse.bookmarks.get().then(function (next) {
        store = sanitize(next);
        render();
    }).catch(function () {});
}

function sanitize(next) {
    if (!next || typeof next !== "object") return { folders: [], bookmarks: [] };
    return {
        folders: Array.isArray(next.folders) ? next.folders : [],
        bookmarks: Array.isArray(next.bookmarks) ? next.bookmarks : []
    };
}

groupsEl.addEventListener("click", function (event) {
    var target = event.target;
    var row = target.closest(".row");

    if (target.closest(".delete") && row) {
        var id = row.getAttribute("data-id");
        if (window.confirm("Remove this bookmark?")) {
            window.skybrowse.bookmarks.remove(id).then(refresh);
        }
        return;
    }

    if (target.closest(".rename") && row) {
        var rowId = row.getAttribute("data-id");
        var entry = store.bookmarks.find(function (b) { return b.id === rowId; });
        var title = window.prompt("Rename bookmark", entry ? entry.title : "");
        if (title && title.trim()) {
            window.skybrowse.bookmarks.rename(rowId, title.trim()).then(refresh);
        }
        return;
    }

    var folderBtn = target.closest(".delete-folder");
    if (folderBtn) {
        var folderId = folderBtn.getAttribute("data-folder");
        if (window.confirm("Delete this folder? Its bookmarks move to root.")) {
            window.skybrowse.bookmarks.removeFolder(folderId).then(refresh);
        }
    }
});

groupsEl.addEventListener("change", function (event) {
    var select = event.target.closest(".folder-select");
    var row = event.target.closest(".row");
    if (!select || !row) return;
    var id = row.getAttribute("data-id");
    var value = select.value || null;
    window.skybrowse.bookmarks.move(id, value).then(refresh);
});

filterInput.addEventListener("input", function () {
    filter = filterInput.value.trim().toLowerCase();
    render();
});

newFolderBtn.addEventListener("click", function () {
    var name = window.prompt("New folder name");
    if (name && name.trim()) {
        window.skybrowse.bookmarks.createFolder(name.trim()).then(refresh);
    }
});

if (window.skybrowse && window.skybrowse.onBookmarksChanged) {
    window.skybrowse.onBookmarksChanged(function (next) {
        store = sanitize(next);
        render();
    });
}

refresh();
