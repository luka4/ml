/*
 * Cookie consent + Google Analytics loader.
 * GA is only loaded after the visitor accepts. The choice is remembered in
 * localStorage, so the banner is shown only until a decision is made.
 * The choice can be changed at any time on cookies.html, which drives this
 * module through window.CookieConsent.
 */
(function () {
    const GA_ID = 'G-V448ND6YC6';
    const STORAGE_KEY = 'cookieConsent';

    // gtag() is available from the start so page code can queue events safely.
    // Nothing is sent anywhere until (and unless) analytics is actually loaded.
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
        window.dataLayer.push(arguments);
    };

    const readConsent = () => {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return null;
        }
    };

    const saveConsent = (value) => {
        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch (e) {
            // Private mode / storage disabled - the banner simply shows again.
        }
    };

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
    const clearAnalyticsCookies = () => {
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

    const buildBanner = () => {
        const banner = document.createElement('div');
        banner.className = 'cookie-banner';
        banner.id = 'cookieBanner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-live', 'polite');
        banner.setAttribute('aria-label', 'Súhlas so súbormi cookie');

        const text = document.createElement('p');
        text.className = 'cookie-banner__text';
        text.textContent = 'Používame cookies na meranie návštevnosti (Google Analytics).';

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

        declineBtn.addEventListener('click', () => setConsent('declined'));
        acceptBtn.addEventListener('click', () => setConsent('accepted'));

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

    const setConsent = (value) => {
        saveConsent(value);
        if (value === 'accepted') {
            loadAnalytics();
        } else {
            clearAnalyticsCookies();
        }
        document.getElementById('cookieBanner')?.remove();
    };

    // Used by cookies.html so the choice can be reviewed and changed later.
    window.CookieConsent = {
        get: readConsent,
        set: setConsent,
        showBanner: showBanner,
        isAnalyticsLoaded: () => analyticsLoaded
    };

    const consent = readConsent();

    if (consent === 'accepted') {
        loadAnalytics();
    } else if (consent !== 'declined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showBanner);
        } else {
            showBanner();
        }
    }
})();
