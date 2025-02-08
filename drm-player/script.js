let drmTypeSelect, drmMethodSelect, urlInput, clearKeysText, licenseUrlInput, playButton;

async function detectDRMSupport() {
    const widevineOption = drmMethodSelect.querySelector('option[value="widevine"]');
    const playreadyOption = drmMethodSelect.querySelector('option[value="playready"]');

    let widevineText = 'Widevine';
    let playreadyText = 'PlayReady';

    try {
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
            initDataTypes: ['cenc'],
            videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
            audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
        }]);
    } catch (err) {
        widevineText += ' (Not supported)';
        widevineOption.disabled = true;
    }

    try {
        await navigator.requestMediaKeySystemAccess('com.microsoft.playready', [{
            initDataTypes: ['cenc'],
            videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
            audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
        }]);
    } catch (err) {
        playreadyText += ' (Not supported)';
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

    let isValid = false;

    if (drmType === 'clearkey') {
        isValid = (urlVal !== '' && clearKeysVal !== '');
    } else {
        const selectedOption = drmMethodSelect.querySelector('option:checked');
        const isOptionDisabled = selectedOption ? selectedOption.disabled : false;

        isValid = (
            drmMethodVal !== '' &&
            !isOptionDisabled &&
            urlVal !== '' &&
            licenseUrlVal !== ''
        );
    }

    playButton.disabled = !isValid;
}

function handleDrmTypeChange() {
    const drmType = drmTypeSelect.value;
    const keysContainer = document.getElementById('keysContainer');
    const methodContainer = document.getElementById('methodContainer');
    const licenseUrlContainer = document.getElementById('licenseUrlContainer');
    const headersContainerKeys = document.getElementById('headersContainerKeys');
    const headersContainerLicense = document.getElementById('headersContainerLicense');

    // Reset UI state
    keysContainer.style.display = 'none';
    methodContainer.style.display = 'none';
    licenseUrlContainer.style.display = 'none';
    headersContainerKeys.style.display = 'none';
    headersContainerLicense.style.display = 'none';

    if (drmType === 'clearkey') {
        keysContainer.style.display = 'block';
        headersContainerKeys.style.display = 'block';
    } else {
        methodContainer.style.display = 'block';
        licenseUrlContainer.style.display = 'block';
        headersContainerLicense.style.display = 'block';
    }

    validateInputs();
}

function parseClearKeys(clearKeysStr) {
    const clearKeys = {};
    const keyPairs = clearKeysStr.trim().replace(/\n/g, ',').split(',');

    keyPairs.forEach(pair => {
        const [kid, key] = pair.split(':');
        if (kid && key) {
            clearKeys[kid.trim()] = key.trim();
        }
    });

    return clearKeys;
}

async function initPlayer() {
    const video = document.getElementById('video');
    const ui = video['ui'];
    const controls = ui.getControls();
    const player = controls.getPlayer();

    window.player = player;
    window.ui = ui;

    const drmType = drmTypeSelect.value;
    const url = urlInput.value;

    let headers = {};
    try {
        const headersInput = drmType === 'clearkey'
            ? document.getElementById('headersKeys').value.trim()
            : document.getElementById('headersLicense').value.trim();
        headers = JSON.parse(headersInput || "{}");
    } catch (error) {
        console.error("Invalid JSON in headers field:", error);
    }

    if (drmType === 'clearkey') {
        const clearKeys = parseClearKeys(clearKeysText.value);
        player.configure({
            drm: {
                clearKeys: clearKeys,
                advanced: {
                    'org.w3.clearkey': {
                        requestHeaders: headers
                    }
                }
            }
        });
    } else {
        const drmMethod = drmMethodSelect.value;
        const licenseUrl = licenseUrlInput.value;

        if (drmMethod === 'widevine' || drmMethod === 'playready') {
            const drmConfig = { servers: {} };
            drmConfig.servers[drmMethod === 'widevine' ? 'com.widevine.alpha' : 'com.microsoft.playready'] = licenseUrl;

            if (Object.keys(headers).length > 0) {
                drmConfig.advanced = {};
                drmConfig.advanced[drmMethod === 'widevine' ? 'com.widevine.alpha' : 'com.microsoft.playready'] = {
                    requestHeaders: headers
                };
            }

            player.configure({ drm: drmConfig });
        }
    }

    await player.load(url);
    player.play();
}

function handleFormSubmit(event) {
    event.preventDefault();
    if (playButton.disabled) {
        return;
    }

    const urlValue = urlInput.value;

    if (
        urlValue.includes("?decryption_key=") ||
        urlValue.includes("&decryption_key=") ||
        urlValue.includes("@")
    ) {
        const separator = urlValue.includes("?decryption_key=")
            ? "?decryption_key="
            : (urlValue.includes("&decryption_key=")
                ? "&decryption_key="
                : "@");
        const parts = urlValue.split(separator);
        const url = parts[0];
        const clearKeys = parts[1];

        urlInput.value = url;
        drmTypeSelect.value = 'clearkey';
        handleDrmTypeChange();
        clearKeysText.value = clearKeys;
    }

    initPlayer();
}

async function init() {
    drmTypeSelect = document.getElementById('drmType');
    drmMethodSelect = document.getElementById('drmMethod');
    urlInput = document.getElementById('url');
    clearKeysText = document.getElementById('clearKeys');
    licenseUrlInput = document.getElementById('licenseUrl');
    playButton = document.getElementById('playButton');

    await detectDRMSupport();

    const form = document.getElementById('player-form');
    form.addEventListener('submit', handleFormSubmit);

    drmTypeSelect.addEventListener('change', handleDrmTypeChange);
    drmMethodSelect.addEventListener('change', validateInputs);
    urlInput.addEventListener('input', validateInputs);
    clearKeysText.addEventListener('input', validateInputs);
    licenseUrlInput.addEventListener('input', validateInputs);

    document.addEventListener('shaka-ui-loaded', initPlayer);

    validateInputs();
}

document.addEventListener('DOMContentLoaded', init);
