// --- DRM CONFIGS ---
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

// --- GLOBAL STORAGE ---
// KID → { height, bitrate }
let discoveredTracks = new Map();

let drmTypeSelect, drmMethodSelect, urlInput, clearKeysText, licenseUrlInput, playButton;

// HEX converter
function bufferToHex(buf) {
    return Array.prototype.map.call(
        new Uint8Array(buf),
        x => ('00' + x.toString(16)).slice(-2)
    ).join('');
}

// --- DRM support detection ---
async function detectDRMSupport() {
    const widevineOption = drmMethodSelect.querySelector('option[value="widevine"]');
    const playreadyOption = drmMethodSelect.querySelector('option[value="playready"]');

    let widevineText = "Widevine";
    let playreadyText = "PlayReady";

    try {
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', widevineConfigs);
    } catch {
        widevineText += " (Unsupported)";
        widevineOption.disabled = true;
    }

    try {
        await navigator.requestMediaKeySystemAccess('com.microsoft.playready', playreadyConfigs);
    } catch {
        playreadyText += " (Unsupported)";
        playreadyOption.disabled = true;
    }

    widevineOption.textContent = widevineText;
    playreadyOption.textContent = playreadyText;
}

// --- Validation ---
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

// --- DRM Type change ---
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

// --- ClearKey parser ---
function parseClearKeys(str) {
    const obj = {};
    const pairs = str.trim().replace(/\n/g, ",").split(",");
    pairs.forEach(p => {
        const [kid, key] = p.split(":");
        if (kid && key) obj[kid.trim()] = key.trim();
    });
    return obj;
}

// --- Force HQ ---
function forceHighestQuality(player) {
    const tracks = player.getVariantTracks();
    if (!tracks?.length) return;

    const best = tracks.sort((a, b) => b.bandwidth - a.bandwidth)[0];

    player.configure({ abr: { enabled: false } });
    player.selectVariantTrack(best, true);
}

// --- Overlay updater ---
function showMissingKeysOverlay() {
    const overlay = document.getElementById("missingKeysOverlay");
    const list = document.getElementById("missingKeysList");
    const checkbox = document.getElementById("showMissingKeysCheckbox");

    if (!checkbox.checked) {
        overlay.style.display = "none";
        return;
    }

    overlay.style.display = "block";
    list.innerHTML = "";

    const enteredKeys = parseClearKeys(clearKeysText.value);

    // sort by bitrate DESC
    const sorted = [...discoveredTracks.entries()]
        .sort((a, b) => b[1].bitrate - a[1].bitrate);

    sorted.forEach(([kid, info]) => {
        const haveKey = enteredKeys[kid] !== undefined;

        const line = document.createElement("div");
        line.innerHTML =
            `${haveKey ? "✔️" : "❌"} | <code>${kid}</code> | ${info.height}p | ${info.bitrate} kbps`;

        line.style.color = haveKey ? "#aaffaa" : "#ff9999";
        list.appendChild(line);
    });
}

// --- Player init ---
async function initPlayer() {
    const video = document.getElementById("video");
    const ui = video['ui'];
    const controls = ui.getControls();
    const player = controls.getPlayer();

    window.player = player;
    window.ui = ui;

    // detect KIDs live from init data
    video.addEventListener("encrypted", (e) => {
        if (e.keyId) {
            const kidHex = bufferToHex(e.keyId);
            // attach approximate resolution/bitrate later when tracks are loaded
            discoveredTracks.set(kidHex, discoveredTracks.get(kidHex) || { height: 0, bitrate: 0 });
        }
        showMissingKeysOverlay();
    });

    const drmType = drmTypeSelect.value;
    const url = urlInput.value;

    if (drmType === "clearkey") {
        const clearKeys = parseClearKeys(clearKeysText.value);
        player.configure({ drm: { clearKeys } });

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

    // map resolutions + bitrates to discovered KIDs
    const tracks = player.getVariantTracks();
    tracks.forEach(track => {
        const kidList = [];

        if (track.drmInfos?.length > 0) {
            for (let info of track.drmInfos) {
                if (info.keyIds) {
                    kidList.push(...info.keyIds);
                }
            }
        }

        kidList.forEach(kid => {
            const hex = kid;
            discoveredTracks.set(hex, {
                height: track.height || 0,
                bitrate: Math.round((track.bandwidth || 0) / 1000)
            });
        });
    });

    if (document.getElementById('forceQualityCheckbox').checked) {
        forceHighestQuality(player);
    }

    showMissingKeysOverlay();
    player.play();
}

// --- Form submit ---
function handleFormSubmit(e) {
    e.preventDefault();
    if (playButton.disabled) return;

    discoveredTracks.clear();
    showMissingKeysOverlay();

    initPlayer();
}

// --- init() ---
async function init() {
    drmTypeSelect = document.getElementById("drmType");
    drmMethodSelect = document.getElementById("drmMethod");
    urlInput = document.getElementById("url");
    clearKeysText = document.getElementById("clearKeys");
    licenseUrlInput = document.getElementById("licenseUrl");
    playButton = document.getElementById("playButton");

    await detectDRMSupport();

    document.getElementById("player-form").addEventListener("submit", handleFormSubmit);

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
