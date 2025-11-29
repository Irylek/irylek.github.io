const widevineConfigs = [{
    initDataTypes: ['cenc'],
    videoCapabilities: [
        { contentType: 'video/mp4; codecs="avc1.42E01E"' }
    ],
    audioCapabilities: [
        { contentType: 'audio/mp4; codecs="mp4a.40.2"' }
    ]
}];

const playreadyConfigs = [{
    initDataTypes: ['cenc'],
    videoCapabilities: [
        { contentType: 'video/mp4; codecs="avc1.42E01E"' }
    ],
    audioCapabilities: [
        { contentType: 'audio/mp4; codecs="mp4a.40.2"' }
    ]
}];

let drmTypeSelect, drmMethodSelect, urlInput, clearKeysText, licenseUrlInput, playButton;

async function detectDRMSupport() {
    const widevineOption = drmMethodSelect.querySelector('option[value="widevine"]');
    const playreadyOption = drmMethodSelect.querySelector('option[value="playready"]');

    let widevineText = "Widevine";
    let playreadyText = "PlayReady";

    try {
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', widevineConfigs);
    } catch (err) {
        widevineText += " (Unsupported)";
        widevineOption.disabled = true;
    }

    try {
        await navigator.requestMediaKeySystemAccess('com.microsoft.playready', playreadyConfigs);
    } catch (err) {
        playreadyText += " (Unsupported)";
        playreadyOption.disabled = true;
    }

    widevineOption.textContent = widevineText;
    playreadyOption.textContent = playreadyText;
}

function validateInputs() {
    const drmType = drmTypeSelect.value.trim();
    const urlVal = urlInput.value.trim();
    const clearKeysVal = clearKeysText.value.trim();
    const drmMethodVal = drmMethodSelect.value.trim();
    const licenseUrlVal = licenseUrlInput.value.trim();

    let valid = false;

    if (drmType === "clearkey") {
        valid = (urlVal !== "" && clearKeysVal !== "");
    } else {
        const selectedOption = drmMethodSelect.querySelector("option:checked");
        const isOptionDisabled = selectedOption ? selectedOption.disabled : false;

        valid = (
            drmMethodVal !== "" &&
            !isOptionDisabled &&
            urlVal !== "" &&
            licenseUrlVal !== ""
        );
    }

    playButton.disabled = !valid;
}

function handleDrmTypeChange() {
    const drmType = drmTypeSelect.value;

    const keysContainer = document.getElementById('keysContainer');
    const methodContainer = document.getElementById('methodContainer');
    const licenseUrlContainer = document.getElementById('licenseUrlContainer');

    if (drmType === "clearkey") {
        keysContainer.style.display = "block";
        methodContainer.style.display = "none";
        licenseUrlContainer.style.display = "none";

        drmMethodSelect.value = "";
        licenseUrlInput.value = "";
    } else {
        keysContainer.style.display = "none";
        methodContainer.style.display = "block";
        licenseUrlContainer.style.display = "block";
    }

    validateInputs();
}

function parseClearKeys(str) {
    const obj = {};
    const pairs = str.trim().replace(/\n/g, ",").split(",");
    pairs.forEach(p => {
        const [kid, key] = p.split(":");
        if (kid && key) obj[kid.trim()] = key.trim();
    });
    return obj;
}

async function initPlayer() {
    const video = document.getElementById("video");
    const ui = video['ui'];
    const controls = ui.getControls();
    const player = controls.getPlayer();

    window.player = player;
    window.ui = ui;

    const drmType = drmTypeSelect.value;
    const url = urlInput.value;

    if (drmType === "clearkey") {
        const clearKeys = parseClearKeys(clearKeysText.value);

        player.configure({
            drm: { clearKeys }
        });
    } else {
        const drmMethod = drmMethodSelect.value;
        const licenseUrl = licenseUrlInput.value;

        const drmConfig = {
            servers: {}
        };

        drmConfig.servers[
            drmMethod === "widevine"
                ? "com.widevine.alpha"
                : "com.microsoft.playready"
        ] = licenseUrl;

        player.configure({ drm: drmConfig });
    }

    await player.load(url);

    if (document.getElementById('forceQualityCheckbox').checked) {
        forceHighestQuality(player);
    }

    if (document.getElementById('showMissingKeysCheckbox').checked) {
        showMissingKeysOverlay();
    }

    player.play();
}

function forceHighestQuality(player) {
    const tracks = player.getVariantTracks();
    if (!tracks?.length) return;

    const best = tracks.sort((a, b) => {
        if (a.height !== b.height) return b.height - a.height;
        return b.bandwidth - a.bandwidth;
    })[0];

    player.configure({
        abr: { enabled: false }
    });

    player.selectVariantTrack(best, true);
}

async function showMissingKeysOverlay() {
    const overlay = document.getElementById("missingKeysOverlay");
    const list = document.getElementById("missingKeysList");

    if (!document.getElementById("showMissingKeysCheckbox").checked) {
        overlay.style.display = "none";
        return;
    }

    if (!window.player) {
        overlay.style.display = "none";
        return;
    }

    const enteredKeys = parseClearKeys(document.getElementById("clearKeys").value);
    const tracks = window.player.getVariantTracks();

    if (!tracks.length) {
        overlay.style.display = "none";
        return;
    }

    overlay.style.display = "block";
    list.innerHTML = "";

    tracks.forEach(track => {
        const height = track.height || 0;
        const bitrate = Math.round((track.bandwidth || 0) / 1000);

        let kid = "unknown";

        if (track.drmInfos?.length > 0) {
            const info = track.drmInfos[0];
            if (info.keyIds && info.keyIds.size > 0) {
                kid = [...info.keyIds][0];
            }
        }

        const haveKey = enteredKeys[kid] !== undefined;

        const line = document.createElement("div");
        line.innerHTML = `${haveKey ? "✔️" : "❌"} | <code>${kid}</code> | ${height}p | ${bitrate} kbps`;
        line.style.color = haveKey ? "#aaffaa" : "#ff9999";

        list.appendChild(line);
    });
}

function handleFormSubmit(e) {
    e.preventDefault();
    if (playButton.disabled) return;

    initPlayer();
}

async function init() {
    drmTypeSelect = document.getElementById("drmType");
    drmMethodSelect = document.getElementById("drmMethod");
    urlInput = document.getElementById("url");
    clearKeysText = document.getElementById("clearKeys");
    licenseUrlInput = document.getElementById("licenseUrl");
    playButton = document.getElementById("playButton");

    await detectDRMSupport();

    const form = document.getElementById("player-form");
    form.addEventListener("submit", handleFormSubmit);

    drmTypeSelect.addEventListener("change", handleDrmTypeChange);
    drmMethodSelect.addEventListener("change", validateInputs);
    urlInput.addEventListener("input", validateInputs);
    clearKeysText.addEventListener("input", validateInputs);
    licenseUrlInput.addEventListener("input", validateInputs);

    document.getElementById("showMissingKeysCheckbox")
        .addEventListener("change", showMissingKeysOverlay);

    validateInputs();
}

document.addEventListener("DOMContentLoaded", init);
