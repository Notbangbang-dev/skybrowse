var activeList = document.getElementById("activeList");
var completedList = document.getElementById("completedList");
var completedSection = document.getElementById("completedSection");
var emptyEl = document.getElementById("empty");
var clearCompletedBtn = document.getElementById("clearCompleted");
var errorNote = document.getElementById("errorNote");

var active = [];
var completed = [];
var errorTimer = null;

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
    var units = ["B", "KB", "MB", "GB"];
    var value = bytes;
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return (unit === 0 ? value : value.toFixed(1)) + " " + units[unit];
}

function formatWhen(timestamp) {
    var date = new Date(timestamp);
    var now = new Date();
    var sameDay = date.toDateString() === now.toDateString();
    if (sameDay) {
        return "Today, " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " +
        date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function fileIcon() {
    return '<div class="file-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg></div>';
}

function activeHtml(item) {
    var indeterminate = !item.totalBytes;
    var percent = indeterminate ? 0 : Math.floor((item.receivedBytes / item.totalBytes) * 100);
    var paused = item.state === "interrupted";
    var meta = paused
        ? "Paused — " + formatBytes(item.receivedBytes) + " of " + formatBytes(item.totalBytes)
        : formatBytes(item.receivedBytes) + (indeterminate ? " downloaded" : " of " + formatBytes(item.totalBytes) + " (" + percent + "%)");

    return (
        '<div class="item" data-id="' + escapeHtml(item.id) + '">' +
            fileIcon() +
            '<div class="item-main">' +
                '<div class="item-name" title="' + escapeHtml(item.fileName) + '">' + escapeHtml(item.fileName) + '</div>' +
                '<div class="item-meta">' + escapeHtml(meta) + '</div>' +
                '<div class="progress"><div class="progress-fill' + (indeterminate ? " indeterminate" : "") + '" style="width:' + percent + '%"></div></div>' +
            '</div>' +
            '<div class="item-actions">' +
                '<button class="btn pause-btn">Pause</button>' +
                '<button class="btn resume-btn">Resume</button>' +
                '<button class="btn danger cancel">Cancel</button>' +
            '</div>' +
        '</div>'
    );
}

function completedHtml(item) {
    return (
        '<div class="item" data-id="' + escapeHtml(item.id) + '">' +
            fileIcon() +
            '<div class="item-main">' +
                '<div class="item-name" title="' + escapeHtml(item.fileName) + '">' + escapeHtml(item.fileName) + '</div>' +
                '<div class="item-meta">' + escapeHtml(formatBytes(item.totalBytes)) + ' · ' + escapeHtml(formatWhen(item.completedAt)) + '</div>' +
            '</div>' +
            '<div class="item-actions">' +
                '<button class="btn open">Open</button>' +
                '<button class="btn reveal">Show in folder</button>' +
                '<button class="btn danger remove">Remove</button>' +
            '</div>' +
        '</div>'
    );
}

function showError(message) {
    errorNote.textContent = message;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(function () {
        errorNote.textContent = "";
    }, 5000);
}

function render() {
    activeList.innerHTML = active.length
        ? '<div class="section-title">In progress</div>' + active.map(activeHtml).join("")
        : "";

    completedList.innerHTML = completed.map(completedHtml).join("");
    completedSection.hidden = completed.length === 0;

    emptyEl.hidden = active.length !== 0 || completed.length !== 0;
    clearCompletedBtn.hidden = completed.length === 0;
}

function refresh() {
    if (!window.skybrowse || !window.skybrowse.downloads) return;
    window.skybrowse.downloads.get().then(function (data) {
        active = (data && Array.isArray(data.active)) ? data.active : [];
        completed = (data && Array.isArray(data.completed)) ? data.completed : [];
        render();
    }).catch(function () {});
}

function removeActive(id) {
    active = active.filter(function (item) { return item.id !== id; });
    render();
}

function removeCompleted(id) {
    completed = completed.filter(function (item) { return item.id !== id; });
    render();
}

activeList.addEventListener("click", function (event) {
    var item = event.target.closest(".item");
    if (!item) return;
    var id = item.getAttribute("data-id");

    if (event.target.closest(".pause-btn")) {
        window.skybrowse.downloads.pause(id);
        return;
    }

    if (event.target.closest(".resume-btn")) {
        window.skybrowse.downloads.resume(id);
        return;
    }

    if (event.target.closest(".cancel")) {
        window.skybrowse.downloads.cancel(id);
        removeActive(id);
    }
});

completedList.addEventListener("click", function (event) {
    var item = event.target.closest(".item");
    if (!item) return;
    var id = item.getAttribute("data-id");

    if (event.target.closest(".open")) {
        window.skybrowse.downloads.open(id).then(function (result) {
            if (!result || !result.ok) {
                showError((result && result.error) || "Could not open that file — it may have moved.");
            }
        });
        return;
    }

    if (event.target.closest(".reveal")) {
        window.skybrowse.downloads.reveal(id);
        return;
    }

    if (event.target.closest(".remove")) {
        window.skybrowse.downloads.remove(id).then(function (next) {
            completed = Array.isArray(next) ? next : completed.filter(function (c) { return c.id !== id; });
            render();
        });
    }
});

clearCompletedBtn.addEventListener("click", function () {
    window.skybrowse.downloads.clearCompleted().then(function (next) {
        completed = Array.isArray(next) ? next : [];
        render();
    });
});

if (window.skybrowse && window.skybrowse.onDownloadEvent) {
    window.skybrowse.onDownloadEvent(function (payload) {
        var type = payload.type;
        var download = payload.download;

        if (type === "start") {
            active = active.filter(function (a) { return a.id !== download.id; });
            active.push(download);
            render();
            return;
        }

        if (type === "progress") {
            var index = active.findIndex(function (a) { return a.id === download.id; });
            if (index !== -1) active[index] = download;
            else active.push(download);
            render();
            return;
        }

        if (type === "done") {
            removeActive(download.id);
            refresh();
        }
    });
}

if (window.skybrowse && window.skybrowse.onDownloadsChanged) {
    window.skybrowse.onDownloadsChanged(function (data) {
        completed = (data && Array.isArray(data.completed)) ? data.completed : [];
        render();
    });
}

refresh();
