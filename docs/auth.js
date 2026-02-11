(function () {
    const now = new Date();
    const nowTs = Date.now();
    const ttlMs = 24 * 60 * 60 * 1000;
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const expectedToken = day + month;
    const authKey = "authenticated";
    const authExpiryKey = "authenticated_expires_at";
    const isAuthenticated = localStorage.getItem(authKey) === "true";
    const expiresAt = Number(localStorage.getItem(authExpiryKey) || "0");

    if (!(isAuthenticated && Number.isFinite(expiresAt) && nowTs < expiresAt)) {
        localStorage.removeItem(authKey);
        localStorage.removeItem(authExpiryKey);
        const userEntry = prompt("WEBSITE CLOSED:");

        if (userEntry === expectedToken) {
            localStorage.setItem(authKey, "true");
            localStorage.setItem(authExpiryKey, String(nowTs + ttlMs));
            if (typeof gtag === "function") {
                gtag("event", "auth_success", { method: "daily_token" });
            }
        } else {
            if (typeof gtag === "function") {
                gtag("event", "auth_failure", { method: "daily_token" });
            }
            alert("Access Denied.");
            window.location.href = "index.html";
        }
    }
})();