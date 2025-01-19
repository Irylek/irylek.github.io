        async function sendPSSH() {
            const pssh = document.getElementById("inputPSSH").value;
            if (!pssh) {
                alert("Please enter the PSSH.");
                return;
            }

            const payload = { "PSSH": pssh };

            try {
                const response = await fetch("https://cdrm-project.com/cache", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                });

                const result = await response.json();
                document.getElementById("outputText").textContent = JSON.stringify(result, null, 2);
                document.getElementById("copyButton").style.display = "inline-block";
            } catch (error) {
                console.error("Error sending PSSH:", error);
                alert("An error occurred. Check the console for details.");
            }
        }

        function copyToClipboard() {
            const outputText = document.getElementById("outputText").textContent;
            navigator.clipboard.writeText(outputText).then(() => {
                alert("Response copied to clipboard!");
            }).catch(err => {
                console.error("Failed to copy:", err);
                alert("Failed to copy to clipboard.");
            });
        }
