/*
 * SpinBook promo.
 *
 * Two quiet pointers at the other app from the same author:
 *
 *   1. a slim strip at the bottom of the header, on every page - permanent,
 *      part of the nav bar, so it never covers anything;
 *   2. a small card in the bottom corner that can be closed for good.
 *
 * Everything visitor-facing lives in PROMO below, so the wording, the link or
 * the logo can be changed in one place.
 */
(function () {
    const PROMO = {
        url: 'https://getspinbook.com/download.html',
        logo: 'media/spinbook-logo.svg',
        title: 'Vyskúšajte SpinBook',
        // Second line of the card, and the tail of the header strip. Hidden on
        // narrow screens, where only the title is shown.
        subtitle: 'Ďalšia appka od tvorcov tejto stránky'
    };

    const STORAGE_KEY = 'spinbookPromoDismissedAt';

    // How long a closed card stays closed. null = for good; a number of days
    // brings it back after that long.
    const DISMISS_DAYS = 7;

    // Pages that are not for visitors get nothing.
    const EXCLUDED_PAGE_IDS = ['page-admin'];

    const ARROW_SVG = `
        <svg class="spinbook-promo__arrow" viewBox="0 0 24 24" width="16" height="16" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
            <path d="M5 12h13"></path>
            <path d="M12 5l7 7-7 7"></path>
        </svg>`;

    const parseHtml = (html) =>
        new DOMParser().parseFromString(html, 'text/html').body.firstElementChild;

    // ------------------------------------------------------------------
    // Header strip
    // ------------------------------------------------------------------

    const buildNavPromo = () => parseHtml(`
        <a class="nav-promo" href="${PROMO.url}" target="_blank" rel="noopener">
            <img class="nav-promo__logo" src="${PROMO.logo}" alt="" width="18" height="18">
            <span class="nav-promo__title">${PROMO.title}</span>
            <span class="nav-promo__tail">- ${PROMO.subtitle.toLowerCase()}</span>
            ${ARROW_SVG}
        </a>`);

    // The nav is injected by script.js, so the strip is added once it shows up
    // and again if the nav is ever re-rendered.
    const mountNavPromo = () => {
        const container = document.getElementById('mainNavContainer');
        if (!container) return;

        const addStrip = () => {
            const nav = document.getElementById('mainNav');
            if (!nav || nav.querySelector('.nav-promo')) return;

            nav.appendChild(buildNavPromo());
            // The nav just got taller - let the page re-measure its offset.
            if (typeof updateLayout === 'function') updateLayout();
        };

        addStrip();
        new MutationObserver(addStrip).observe(container, { childList: true, subtree: true });
    };

    // ------------------------------------------------------------------
    // Corner card
    // ------------------------------------------------------------------

    const wasDismissed = () => {
        let raw = null;
        try {
            raw = localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return false; // Private mode / storage disabled - just show it.
        }
        if (!raw) return false;
        if (DISMISS_DAYS === null) return true;

        const dismissedAt = Number(raw);
        if (!Number.isFinite(dismissedAt)) return true;

        const age = Date.now() - dismissedAt;
        return age < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    };

    const rememberDismissal = () => {
        try {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } catch (e) {
            // Nothing to do - the card simply shows again next time.
        }
    };

    const buildCard = () => {
        const card = parseHtml(`
            <aside class="spinbook-promo" id="spinbookPromo" aria-label="${PROMO.title}">
                <a class="spinbook-promo__link" href="${PROMO.url}" target="_blank" rel="noopener">
                    <img class="spinbook-promo__logo" src="${PROMO.logo}" alt="" width="34" height="34">
                    <span class="spinbook-promo__copy">
                        <span class="spinbook-promo__title">${PROMO.title}</span>
                        <span class="spinbook-promo__subtitle">${PROMO.subtitle}</span>
                    </span>
                    ${ARROW_SVG}
                </a>
                <button class="spinbook-promo__close" type="button" aria-label="Skryť odporúčanie">&times;</button>
            </aside>`);

        card.querySelector('.spinbook-promo__close').addEventListener('click', () => {
            rememberDismissal();
            card.remove();
        });

        return card;
    };

    // The cookie banner sits along the bottom edge, so the card waits for it.
    const cookieBannerVisible = () => !!document.getElementById('cookieBanner');

    const showCard = () => {
        if (document.getElementById('spinbookPromo')) return;
        if (wasDismissed()) return;

        const card = buildCard();
        document.body.appendChild(card);

        // Let the element land before the entrance transition starts.
        requestAnimationFrame(() => card.classList.add('is-visible'));
    };

    const mountCard = () => {
        if (wasDismissed()) return;

        if (!cookieBannerVisible()) {
            showCard();
            return;
        }

        const observer = new MutationObserver(() => {
            if (cookieBannerVisible()) return;
            observer.disconnect();
            showCard();
        });
        observer.observe(document.body, { childList: true });
    };

    // ------------------------------------------------------------------

    const init = () => {
        if (EXCLUDED_PAGE_IDS.includes(document.body.id)) return;
        mountNavPromo();
        mountCard();
    };

    // The page loader covers the screen until everything is ready, so nothing
    // is offered before the visitor can actually see the page.
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
