function convertAmazonManifest(url) {
    try {
        const urlObject = new URL(url);

        urlObject.search = '';

        const pathParts = urlObject.pathname.split('/');
        const dmIndex = pathParts.indexOf('dm');
        if (dmIndex !== -1) {
            const secondPart = pathParts[dmIndex + 2] || '';
            if (secondPart.includes('@')) {
                pathParts.splice(dmIndex, 3);
            } else {
                pathParts.splice(dmIndex, 2);
            }
        }
        urlObject.pathname = pathParts.join('/');

        return urlObject.toString();
    } catch (error) {
        console.error('Invalid URL:', error);
        return 'Invalid URL. Please check your input.';
    }
}

function handleConvert() {
    const inputUrl = document.getElementById('inputUrl').value;
    const outputDiv = document.getElementById('output');
    const outputText = document.getElementById('outputText');
    const copyButton = document.getElementById('copyButton');
    const result = convertAmazonManifest(inputUrl);
    outputText.textContent = result;
    if (result !== 'Invalid URL. Please check your input.') {
        copyButton.style.display = 'block';
        copyButton.classList.remove('copied');
        copyButton.textContent = 'Copy';
    } else {
        copyButton.style.display = 'none';
    }
}

function copyToClipboard() {
    const outputText = document.getElementById('outputText').textContent;
    navigator.clipboard.writeText(outputText).then(() => {
        const copyButton = document.getElementById('copyButton');
        copyButton.textContent = '✅';
        copyButton.classList.add('copied');
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}
