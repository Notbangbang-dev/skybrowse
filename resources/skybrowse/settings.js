var ENGINES = ["google", "bing", "duckduckgo"];

var searchEngine = document.getElementById("searchEngine");
var startupPage = document.getElementById("startupPage");
var homepageInput = document.getElementById("homepage");
var homepageForm = document.getElementById("homepageForm");
var status = document.getElementById("status");

var statusTimer = null;
function showStatus(message, kind) {
    status.textContent = message;
    status.className = "status" + (kind ? " " + kind : "");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
        status.textContent = "";
        status.className = "status";
    }, 4000);
}

function applySettings(settings) {
    if (!settings) return;
    if (ENGINES.indexOf(settings.searchEngine) !== -1) searchEngine.value = settings.searchEngine;
    startupPage.value = settings.startupPage === "homepage" ? "homepage" : "newtab";
    if (typeof settings.homepage === "string") homepageInput.value = settings.homepage;
}

function send(key, value) {
    if (!window.skybrowse || !window.skybrowse.updateSetting) {
        showStatus("Settings API unavailable", "err");
        return Promise.resolve();
    }
    return window.skybrowse.updateSetting(key, value).then(function (result) {
        if (result && result.ok) {
            if (result.settings) applySettings(result.settings);
            showStatus("Saved", "ok");
        } else {
            showStatus((result && result.error) || "Could not save that", "err");
        }
    }).catch(function () {
        showStatus("Could not save that", "err");
    });
}

if (window.skybrowse) {
    if (window.skybrowse.getSettings) {
        window.skybrowse.getSettings().then(applySettings).catch(function () {});
    }
    if (window.skybrowse.onSettingsChanged) {
        window.skybrowse.onSettingsChanged(applySettings);
    }
    if (window.skybrowse.getAppInfo) {
        window.skybrowse.getAppInfo().then(function (info) {
            if (info) document.getElementById("version").textContent = "SkyBrowse " + info.version;
        }).catch(function () {});
    }
}

searchEngine.addEventListener("change", function () {
    send("searchEngine", searchEngine.value);
});

startupPage.addEventListener("change", function () {
    send("startupPage", startupPage.value);
});

homepageForm.addEventListener("submit", function (event) {
    event.preventDefault();
    send("homepage", homepageInput.value.trim());
});
