/*
 * Cookie consent + Google Analytics loader.
 * GA is only loaded after the visitor accepts. The choice is remembered in
 * localStorage, so the banner is shown only until a decision is made.
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

        const decide = (value) => {
            saveConsent(value);
            if (value === 'accepted') loadAnalytics();
            banner.remove();
        };

        declineBtn.addEventListener('click', () => decide('declined'));
        acceptBtn.addEventListener('click', () => decide('accepted'));

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
