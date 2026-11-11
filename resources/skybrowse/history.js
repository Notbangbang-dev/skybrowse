var filterInput = document.getElementById("filter");
var clearAllBtn = document.getElementById("clearAll");
var visitsEl = document.getElementById("visits");
var emptyEl = document.getElementById("empty");
var countEl = document.getElementById("count");

var store = { visits: [] };
var filter = "";

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function dayLabel(timestamp) {
    var date = new Date(timestamp);
    var now = new Date();
    var startOf = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.round((startOfToday - startOf) / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function timeLabel(timestamp) {
    return new Date(timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function matches(visit) {
    if (!filter) return true;
    var hay = (visit.title + " " + visit.url).toLowerCase();
    return hay.indexOf(filter) !== -1;
}

function faviconHtml(visit) {
    if (visit.favicon) {
        return '<img class="row-favicon" src="' + escapeHtml(visit.favicon) + '" alt="" width="15" height="15">';
    }
    return '<svg class="row-favicon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="#8a93b8" stroke-width="1.3"/><path d="M2.8 8h10.4" stroke="#8a93b8" stroke-width="1.1"/></svg>';
}

function render() {
    var visible = store.visits.slice().reverse().filter(matches);

    countEl.textContent = store.visits.length + (store.visits.length === 1 ? " visit" : " visits");

    if (visible.length === 0) {
        visitsEl.innerHTML = "";
        emptyEl.hidden = false;
        return;
    }
    emptyEl.hidden = true;

    var html = "";
    var lastDay = null;

    visible.forEach(function (visit) {
        var day = dayLabel(visit.at);
        if (day !== lastDay) {
            html += '<div class="day">' + escapeHtml(day) + '</div>';
            lastDay = day;
        }
        html +=
            '<div class="row" data-id="' + escapeHtml(visit.id) + '">' +
                '<span class="row-time">' + escapeHtml(timeLabel(visit.at)) + '</span>' +
                faviconHtml(visit) +
                '<div class="row-main">' +
                    '<div class="row-title" title="' + escapeHtml(visit.title) + '">' + escapeHtml(visit.title) + '</div>' +
                    '<div class="row-url">' + escapeHtml(visit.url) + '</div>' +
                '</div>' +
                '<button class="icon-btn remove" title="Remove from history" aria-label="Remove from history">' +
                    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
                '</button>' +
            '</div>';
    });

    visitsEl.innerHTML = html;
}

function refresh() {
    if (!window.skybrowse || !window.skybrowse.history) return;
    window.skybrowse.history.get().then(function (next) {
        store = next && Array.isArray(next.visits) ? next : { visits: [] };
        render();
    }).catch(function () {});
}

visitsEl.addEventListener("click", function (event) {
    var btn = event.target.closest(".remove");
    var row = event.target.closest(".row");
    if (!btn || !row) return;
    var id = row.getAttribute("data-id");
    window.skybrowse.history.remove(id).then(refresh);
});

filterInput.addEventListener("input", function () {
    filter = filterInput.value.trim().toLowerCase();
    render();
});

clearAllBtn.addEventListener("click", function () {
    if (store.visits.length === 0) return;
    if (window.confirm("Clear entire browsing history? This cannot be undone.")) {
        window.skybrowse.history.clear().then(refresh);
    }
});

if (window.skybrowse && window.skybrowse.onHistoryChanged) {
    window.skybrowse.onHistoryChanged(function (next) {
        store = next && Array.isArray(next.visits) ? next : { visits: [] };
        render();
    });
}

refresh();
