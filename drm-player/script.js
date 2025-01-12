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

        let widevineText = 'Widevine';
        let playreadyText = 'PlayReady';

        try {
            await navigator.requestMediaKeySystemAccess('com.widevine.alpha', widevineConfigs);
        } catch (err) {
            widevineText += ' (Your browser does not support that)';
            widevineOption.disabled = true;
        }

        try {
            await navigator.requestMediaKeySystemAccess('com.microsoft.playready', playreadyConfigs);
        } catch (err) {
            playreadyText += ' (Your browser does not support that)';
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
        const testStreamContainer = document.getElementById('testStreamContainer');

        if (drmType === 'clearkey') {
            keysContainer.style.display = 'block';
            methodContainer.style.display = 'none';
            licenseUrlContainer.style.display = 'none';
            testStreamContainer.style.display = 'none';

            drmMethodSelect.value = '';
            licenseUrlInput.value = '';

        } else {
            keysContainer.style.display = 'none';
            methodContainer.style.display = 'block';
            licenseUrlContainer.style.display = 'block';
            testStreamContainer.style.display = 'block';
        }
        validateInputs();
    }

    function handleTestStream() {
        const drmMethod = drmMethodSelect.value;
        let manifestUrl = '';
        let licenseUrl = '';

        if (drmMethod === 'widevine') {
            manifestUrl = 'https://storage.googleapis.com/wvmedia/cenc/h264/tears/tears_uhd.mpd';
            licenseUrl = 'https://proxy.staging.widevine.com/proxy';
        } else if (drmMethod === 'playready') {
            manifestUrl = 'https://test.playready.microsoft.com/media/profficialsite/tearsofsteel_4k.ism/manifest.mpd';
            licenseUrl = 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:false,sl:150)';
        }
        urlInput.value = manifestUrl;
        licenseUrlInput.value = licenseUrl;

        validateInputs();
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

        if (drmType === 'clearkey') {
            const clearKeys = parseClearKeys(clearKeysText.value);
            player.configure({
                drm: {
                    clearKeys: clearKeys
                }
            });
        } else {
            const drmMethod = drmMethodSelect.value;
            const licenseUrl = licenseUrlInput.value;

            if (drmMethod === 'widevine') {
                player.configure({
                    drm: {
                        servers: {
                            'com.widevine.alpha': licenseUrl
                        }
                    }
                });
            } else if (drmMethod === 'playready') {
                player.configure({
                    drm: {
                        servers: {
                            'com.microsoft.playready': licenseUrl
                        }
                    }
                });
            }
        }

        await player.load(url);
        player.play();
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

        const testStreamButton = document.getElementById('testStreamButton');
        testStreamButton.addEventListener('click', handleTestStream);

        document.addEventListener('shaka-ui-loaded', initPlayer);

        validateInputs();
    }

    document.addEventListener('DOMContentLoaded', init);
