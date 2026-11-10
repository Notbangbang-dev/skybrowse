var ENGINES = {
    google: { name: "Google", action: "https://www.google.com/search", param: "q" },
    bing: { name: "Bing", action: "https://www.bing.com/search", param: "q" },
    duckduckgo: { name: "DuckDuckGo", action: "https://duckduckgo.com/", param: "q" }
};

var form = document.getElementById("searchForm");
var input = document.getElementById("searchInput");

function applyEngine(engineId) {
    var engine = ENGINES[engineId] || ENGINES.google;
    form.action = engine.action;
    input.placeholder = "Search " + engine.name + " or type a URL";
}

function tick() {
    var now = new Date();
    document.getElementById("clock").textContent = now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit"
    });
    document.getElementById("date").textContent = now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric"
    });
}

tick();
setInterval(tick, 10000);

if (window.skybrowse && window.skybrowse.getSettings) {
    window.skybrowse.getSettings().then(function (settings) {
        if (settings && settings.searchEngine) applyEngine(settings.searchEngine);
    }).catch(function () { applyEngine("google"); });

    if (window.skybrowse.onSettingsChanged) {
        window.skybrowse.onSettingsChanged(function (settings) {
            if (settings && settings.searchEngine) applyEngine(settings.searchEngine);
        });
    }
} else {
    applyEngine("google");
}
