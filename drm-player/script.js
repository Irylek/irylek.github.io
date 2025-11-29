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
let discoveredTracks = new Map();   // kid → {height, bitrate}
let drmTypeSelect, drmMethodSelect, urlInput, clearKeysText, licenseUrlInput, playButton;

// Convert ArrayBuffer → hex
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

    let t1 = "Widevine";
    let t2 = "PlayReady";

    try { await navigator.requestMediaKeySystemAccess('com.widevine.alpha', widevineConfigs); }
    catch { t1 += " (Unsupported)"; widevineOption.disabled = true; }

    try { await navigator.requestMediaKeySystemAccess('com.microsoft.playready', playreadyConfigs); }
    catch { t2 += " (Unsupported)"; playreadyOption.disabled = true; }

    widevineOption.textContent = t1;
    playreadyOption.textContent = t2;
}

// --- Validation ---
function validateInputs() {
    const drmType = drmTypeSelect.value.trim();
    const urlVal = urlInput.value.trim();
    const clearKeysVal = clearKeysText.value.trim();
    const drmMethodVal = drmMethodSelect.value.trim();
    const licenseUrlVal = licenseUrlInput.value.trim();

    let valid = false;

    if (drmType === "clearkey") valid = (urlVal !== "" && clearKeysVal !== "");
    else {
        const sel = drmMethodSelect.querySelector("option:checked");
        valid = (drmMethodVal !== "" && !sel.disabled && urlVal !== "" && licenseUrlVal !== "");
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

// --- HUD: FPS / Quality / Current Kid Status ---
function updateHUD() {
    const hud = document.getElementById("qualityHud");
    if (!hud) return;

    const player = window.player;
    if (!player) return;

    const stats = player.getStats();
    const tracks = player.getVariantTracks();
    const active = tracks.find(t => t.active);

    if (!active) return;

    const fps = stats.decodedFrames ? Math.round(stats.decodedFrames / (stats.playTime || 1)) : 0;

    // find kid
    let kid = "unknown";
    if (active.drmInfos?.length > 0) {
        const info = active.drmInfos[0];
        if (info.keyIds && info.keyIds.size > 0) kid = [...info.keyIds][0];
    }

    const entered = parseClearKeys(clearKeysText.value);
    const haveKey = entered[kid] !== undefined;

    hud.innerHTML = `
        <b>Quality:</b> ${active.height}p<br>
        <b>Bitrate:</b> ${Math.round(active.bandwidth / 1000)} kbps<br>
        <b>FPS:</b> ${fps}<br>
        <b>KID:</b> <code>${kid}</code> ${haveKey ? "✔️" : "❌"}
    `;
}

// --- Overlay Missing / Available keys ---
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

    const entered = parseClearKeys(clearKeysText.value);

    const sorted = [...discoveredTracks.entries()]
        .sort((a, b) => b[1].bitrate - a[1].bitrate); // highest first

    sorted.forEach(([kid, info]) => {
        const have = entered[kid] !== undefined;

        const line = document.createElement("div");
        line.innerHTML =
            `${have ? "✔️" : "❌"} | <code>${kid}</code> | ${info.height}p | ${info.bitrate} kbps`;
        line.style.color = have ? "#aaffaa" : "#ff9999";

        list.appendChild(line);
    });
}

// --- Player init ---
async function initPlayer() {
    discoveredTracks.clear();

    const video = document.getElementById("video");
    const ui = video['ui'];
    const controls = ui.getControls();
    const player = controls.getPlayer();
    window.player = player;

    // Real-time KID capture
    video.addEventListener("encrypted", (e) => {
        if (e.keyId) {
            const hex = bufferToHex(e.keyId);
            if (!discoveredTracks.has(hex)) {
                discoveredTracks.set(hex, { height: 0, bitrate: 0 });
            }
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

        const drmConfig = { servers: {} };
        drmConfig.servers[
            drmMethod === "widevine" ? "com.widevine.alpha" : "com.microsoft.playready"
        ] = licenseUrl;

        player.configure({ drm: drmConfig });
    }

    await player.load(url);

    // load track metadata
    const tracks = player.getVariantTracks();
    tracks.forEach(t => {
        const kidList = [];

        if (t.drmInfos?.length > 0) {
            for (let info of t.drmInfos) {
                if (info.keyIds) kidList.push(...info.keyIds);
            }
        }

        kidList.forEach(kid => {
            discoveredTracks.set(kid, {
                height: t.height || 0,
                bitrate: Math.round(t.bandwidth / 1000)
            });
        });
    });

    if (document.getElementById('forceQualityCheckbox').checked) {
        forceHighestQuality(player);
    }

    showMissingKeysOverlay();
    setInterval(updateHUD, 500);

    player.play();
}

// --- Form submit ---
function handleFormSubmit(e) {
    e.preventDefault();
    if (playButton.disabled) return;

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
