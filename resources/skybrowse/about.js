if (window.skybrowse && window.skybrowse.getAppInfo) {
    window.skybrowse.getAppInfo().then(function (info) {
        if (info) {
            document.getElementById("version").textContent =
                "Version " + info.version + " · " + info.platform;
        }
    }).catch(function () {});
}
