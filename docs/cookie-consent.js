/*
 * Cookie consent.
 *
 * Nothing optional is loaded before the visitor agrees to it. Two categories
 * are gated here:
 *   - analytics     -> Google Analytics (gtag.js)
 *   - notifications -> OneSignal push SDK + its service worker
 * Necessary storage (the consent record itself and the visitor's own
 * preferences, e.g. the chosen player/team) is always allowed.
 *
 * The choice is kept in localStorage and can be changed at any time on
 * cookies.html, which drives this module through window.CookieConsent.
 */
(function () {
    const GA_ID = 'G-V448ND6YC6';
    const STORAGE_KEY = 'cookieConsent';

    // Bumped whenever a new category is added, so everyone is asked again
    // instead of a new purpose riding along on an older agreement.
    const CONSENT_VERSION = 2;

    const CATEGORIES = ['analytics', 'notifications'];

    // gtag() is available from the start so page code can queue events safely.
    // Nothing is sent anywhere until (and unless) analytics is actually loaded.
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
        window.dataLayer.push(arguments);
    };

    // ------------------------------------------------------------------
    // Stored decision
    // ------------------------------------------------------------------

    const readRecord = () => {
        let raw = null;
        try {
            raw = localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return null;
        }
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.v === CONSENT_VERSION) return parsed;
        } catch (e) {
            // Version 1 stored the plain strings "accepted"/"declined". That
            // agreement predates the notifications category, so it no longer
            // counts - the banner asks again.
        }
        return null;
    };

    const writeRecord = (prefs) => {
        const record = {
            v: CONSENT_VERSION,
            analytics: prefs.analytics === true,
            notifications: prefs.notifications === true,
            savedAt: new Date().toISOString()
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
        } catch (e) {
            // Private mode / storage disabled - the banner simply shows again.
        }
        return record;
    };

    // Someone who already allowed notifications in the browser has an active
    // subscription. Keeping the SDK loaded for them is what lets them turn it
    // off again, so that stays on until they say otherwise here.
    const hasBrowserPushPermission = () => {
        try {
            return typeof Notification !== 'undefined' && Notification.permission === 'granted';
        } catch (e) {
            return false;
        }
    };

    const currentPrefs = () => {
        const record = readRecord();
        if (record) {
            return {
                analytics: record.analytics === true,
                notifications: record.notifications === true,
                decided: true,
                savedAt: record.savedAt || null
            };
        }
        return {
            analytics: false,
            notifications: hasBrowserPushPermission(),
            decided: false,
            savedAt: null
        };
    };

    // ------------------------------------------------------------------
    // Analytics (Google Analytics)
    // ------------------------------------------------------------------

    let analyticsLoaded = false;
    const loadAnalytics = () => {
        if (analyticsLoaded) return;
        analyticsLoaded = true;

        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
        document.head.appendChild(script);

        gtag('js', new Date());
        gtag('config', GA_ID);
    };

    // Withdrawing consent should also get rid of what GA already stored.
    const clearAnalyticsStorage = () => {
        const host = location.hostname;
        const domains = ['', host, '.' + host];
        const parts = host.split('.');
        if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));

        document.cookie.split(';').forEach((entry) => {
            const name = entry.split('=')[0].trim();
            if (!/^_ga/.test(name) && name !== '_gid') return;

            domains.forEach((domain) => {
                document.cookie = name + '=; max-age=0; path=/' +
                    (domain ? '; domain=' + domain : '');
            });
        });
    };

    // ------------------------------------------------------------------
    // Notifications (OneSignal)
    // ------------------------------------------------------------------

    let oneSignalLoaded = false;
    const loadOneSignal = () => {
        if (oneSignalLoaded) return;
        oneSignalLoaded = true;

        const sdk = document.createElement('script');
        sdk.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
        sdk.defer = true;
        document.head.appendChild(sdk);

        const init = document.createElement('script');
        init.src = 'onesignal-init.js';
        init.defer = true;
        document.head.appendChild(init);
    };

    // Turning notifications off means unsubscribing, dropping the service
    // worker that receives pushes and deleting the SDK's own storage.
    const clearNotificationStorage = () => {
        if (window.OneSignalDeferred) {
            window.OneSignalDeferred.push(async (OneSignal) => {
                try {
                    await OneSignal.User.PushSubscription.optOut();
                } catch (e) {
                    // Nothing subscribed - nothing to opt out of.
                }
            });
        }

        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                registrations.forEach((registration) => {
                    const worker = registration.active || registration.waiting || registration.installing;
                    if (worker && /onesignal/i.test(worker.scriptURL)) registration.unregister();
                });
            }).catch(() => {});
        }

        try {
            indexedDB.deleteDatabase('ONE_SIGNAL_SDK_DB');
        } catch (e) {
            // Not available - nothing stored either.
        }

        try {
            Object.keys(localStorage)
                .filter((key) => /^one[_-]?signal/i.test(key))
                .forEach((key) => localStorage.removeItem(key));
        } catch (e) {
            // Storage disabled.
        }
    };

    // ------------------------------------------------------------------
    // Applying a decision
    // ------------------------------------------------------------------

    const applyPrefs = (prefs) => {
        if (prefs.analytics) {
            loadAnalytics();
        } else {
            clearAnalyticsStorage();
        }

        if (prefs.notifications) {
            loadOneSignal();
        } else {
            clearNotificationStorage();
        }
    };

    const save = (prefs) => {
        const record = writeRecord(prefs);
        applyPrefs(record);
        document.getElementById('cookieBanner')?.remove();
        return record;
    };

    const acceptAll = () => save({analytics: true, notifications: true});
    const rejectAll = () => save({analytics: false, notifications: false});

    // ------------------------------------------------------------------
    // Banner
    // ------------------------------------------------------------------

    const buildBanner = () => {
        const banner = document.createElement('div');
        banner.className = 'cookie-banner';
        banner.id = 'cookieBanner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-live', 'polite');
        banner.setAttribute('aria-label', 'Súhlas so súbormi cookie');

        const text = document.createElement('p');
        text.className = 'cookie-banner__text';
        text.textContent = 'Používame cookies na meranie návštevnosti (Google Analytics) ' +
            'a na notifikácie (OneSignal). Bez vášho súhlasu ich nenačítame.';

        const settingsLink = document.createElement('a');
        settingsLink.className = 'cookie-banner__link';
        settingsLink.href = 'cookies.html';
        settingsLink.textContent = 'Nastavenia';

        const actions = document.createElement('div');
        actions.className = 'cookie-banner__actions';

        const declineBtn = document.createElement('button');
        declineBtn.type = 'button';
        declineBtn.className = 'cookie-banner__btn cookie-banner__btn--decline';
        declineBtn.textContent = 'Odmietnuť';

        const acceptBtn = document.createElement('button');
        acceptBtn.type = 'button';
        acceptBtn.className = 'cookie-banner__btn cookie-banner__btn--accept';
        acceptBtn.textContent = 'Súhlasím';

        declineBtn.addEventListener('click', rejectAll);
        acceptBtn.addEventListener('click', acceptAll);

        actions.appendChild(settingsLink);
        actions.appendChild(declineBtn);
        actions.appendChild(acceptBtn);
        banner.appendChild(text);
        banner.appendChild(actions);

        return banner;
    };

    const showBanner = () => {
        if (document.getElementById('cookieBanner')) return;
        document.body.appendChild(buildBanner());
    };

    // Used by cookies.html so the choice can be reviewed and changed later.
    window.CookieConsent = {
        CATEGORIES: CATEGORIES,
        get: currentPrefs,
        save: save,
        acceptAll: acceptAll,
        rejectAll: rejectAll,
        showBanner: showBanner
    };

    // ------------------------------------------------------------------
    // Start-up
    // ------------------------------------------------------------------

    const prefs = currentPrefs();

    if (prefs.analytics) loadAnalytics();
    if (prefs.notifications) loadOneSignal();

    if (!prefs.decided) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showBanner);
        } else {
            showBanner();
        }
    }
})();
