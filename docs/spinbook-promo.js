/*
 * SpinBook promo.
 *
 * A small, dismissible card in the bottom corner that points at the other app
 * from the same author. It is deliberately quiet: it never covers the main
 * content, it waits until the page has finished loading (and until the cookie
 * banner is out of the way), and once it is closed it stays closed for a
 * month.
 *
 * Everything visitor-facing lives in PROMO below, so the wording, the link or
 * the logo can be changed in one place.
 */
(function () {
    const PROMO = {
        url: 'https://getspinbook.com/download.html',
        logo: 'media/spinbook-logo.svg',
        title: 'Vyskúšajte SpinBook',
        subtitle: 'Ďalšia appka od tvorcov tejto stránky'
    };

    const STORAGE_KEY = 'spinbookPromoDismissedAt';

    // How long a "close" is respected before the card may appear again.
    const DISMISS_DAYS = 30;

    // Pages that are not for visitors get nothing.
    const EXCLUDED_PAGE_IDS = ['page-admin'];

    const wasDismissed = () => {
        let raw = null;
        try {
            raw = localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return false; // Private mode / storage disabled - just show it.
        }
        if (!raw) return false;

        const dismissedAt = Number(raw);
        if (!Number.isFinite(dismissedAt)) return false;

        const age = Date.now() - dismissedAt;
        return age >= 0 && age < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    };

    const rememberDismissal = () => {
        try {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } catch (e) {
            // Nothing to do - the card simply shows again next time.
        }
    };

    const buildPromo = () => {
        const promo = new DOMParser().parseFromString(`
            <aside class="spinbook-promo" id="spinbookPromo" aria-label="${PROMO.title}">
                <a class="spinbook-promo__link" href="${PROMO.url}" target="_blank" rel="noopener">
                    <img class="spinbook-promo__logo" src="${PROMO.logo}" alt="" width="34" height="34">
                    <span class="spinbook-promo__copy">
                        <span class="spinbook-promo__title">${PROMO.title}</span>
                        <span class="spinbook-promo__subtitle">${PROMO.subtitle}</span>
                    </span>
                    <svg class="spinbook-promo__arrow" viewBox="0 0 24 24" width="16" height="16" fill="none"
                         stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                         aria-hidden="true">
                        <path d="M5 12h13"></path>
                        <path d="M12 5l7 7-7 7"></path>
                    </svg>
                </a>
                <button class="spinbook-promo__close" type="button" aria-label="Skryť odporúčanie">&times;</button>
            </aside>`, 'text/html').body.firstElementChild;

        promo.querySelector('.spinbook-promo__close').addEventListener('click', () => {
            rememberDismissal();
            promo.remove();
        });

        return promo;
    };

    // The cookie banner sits along the bottom edge, so the card waits for it.
    const cookieBannerVisible = () => !!document.getElementById('cookieBanner');

    const show = () => {
        if (document.getElementById('spinbookPromo')) return;
        if (wasDismissed()) return;

        const promo = buildPromo();
        document.body.appendChild(promo);

        // Let the element land before the entrance transition starts.
        requestAnimationFrame(() => promo.classList.add('is-visible'));
    };

    const showWhenBannerIsGone = () => {
        if (!cookieBannerVisible()) {
            show();
            return;
        }

        const observer = new MutationObserver(() => {
            if (cookieBannerVisible()) return;
            observer.disconnect();
            show();
        });
        observer.observe(document.body, { childList: true });
    };

    const init = () => {
        if (EXCLUDED_PAGE_IDS.includes(document.body.id)) return;
        if (wasDismissed()) return;
        showWhenBannerIsGone();
    };

    // The page loader covers the screen until everything is ready, so the card
    // is only offered once the visitor can actually see the page.
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
