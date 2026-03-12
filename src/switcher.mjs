const ALPHAXIV_ORIGIN = 'https://www.alphaxiv.org';
const ARXIV_ORIGIN = 'https://arxiv.org';
const SWITCHER_SELECTOR = '[data-alphaxiv-switcher]';
const INSTALL_TIMEOUT_MS = 5000;

export function parsePaperLocation(url) {
    const parsedUrl = new URL(url);
    const pageType = resolvePageType(parsedUrl);

    if (!pageType) {
        return null;
    }

    const rawId = parsedUrl.pathname.split('/').slice(2).join('/');
    const idStyle = rawId.includes('/') ? 'old' : 'new';
    const { baseId, version } = splitPaperId(rawId, idStyle);

    return {
        pageType,
        baseId,
        version,
        idStyle
    };
}

export function buildTargets(state) {
    if (!state) {
        return null;
    }

    const versionedId = state.version ? `${state.baseId}${state.version}` : state.baseId;
    const arxivAbs = `${ARXIV_ORIGIN}/abs/${versionedId}`;
    const arxivHtml = state.idStyle === 'old' ? null : `${ARXIV_ORIGIN}/html/${versionedId}`;
    const alphaxiv = `${ALPHAXIV_ORIGIN}/abs/${state.baseId}`;

    return {
        alphaxiv: state.pageType === 'alphaxiv' ? null : alphaxiv,
        arxivAbs: state.pageType === 'arxiv-abs' ? null : arxivAbs,
        arxivHtml: state.pageType === 'arxiv-html' ? null : arxivHtml
    };
}

export function findMountPoint(document, pageType) {
    if (!document) {
        return null;
    }

    if (pageType === 'alphaxiv') {
        return findAlphaXivMount(document);
    }

    if (pageType === 'arxiv-abs') {
        return findArxivAbsMount(document);
    }

    if (pageType === 'arxiv-html') {
        return findArxivHtmlMount(document);
    }

    return null;
}

export function renderSwitcher(document, state, targets) {
    if (!document || !state || !targets) {
        return null;
    }

    const items = buildRenderItems(state, targets);

    if (items.length === 0) {
        return null;
    }

    const root = document.createElement(state.pageType === 'arxiv-abs' ? 'div' : 'span');
    root.setAttribute('data-alphaxiv-switcher', '');

    if (state.pageType === 'alphaxiv' || state.pageType === 'arxiv-html') {
        root.style.marginInlineStart = '0.75rem';
    }

    if (state.pageType === 'arxiv-abs') {
        const label = document.createElement('span');
        label.textContent = 'View on:';
        root.append(label, document.createTextNode(' '));
        appendItems(document, root, items, ' | ');
        return root;
    }

    appendItems(document, root, items, ' · ');
    return root;
}

export function installSwitcher({
    document,
    url,
    MutationObserver: MutationObserverImplementation = globalThis.MutationObserver,
    setTimeout: setTimeoutImplementation = globalThis.setTimeout?.bind(globalThis),
    clearTimeout: clearTimeoutImplementation = globalThis.clearTimeout?.bind(globalThis)
}) {
    if (!document) {
        return null;
    }

    const resolvedUrl = url ?? document.URL;
    const state = parsePaperLocation(resolvedUrl);

    if (!state) {
        return null;
    }

    const targets = buildTargets(state);

    if (!targets || document.querySelector(SWITCHER_SELECTOR)) {
        return null;
    }

    const switcher = tryInstallSwitcher(document, state, targets);

    if (switcher) {
        return switcher;
    }

    if (
        typeof MutationObserverImplementation !== 'function'
        || typeof setTimeoutImplementation !== 'function'
    ) {
        return null;
    }

    let observer = null;
    let timeoutId = null;

    const disconnectObserver = () => {
        if (!observer) {
            return;
        }

        observer.disconnect();
        observer = null;
    };

    const clearPendingTimeout = () => {
        if (timeoutId === null || typeof clearTimeoutImplementation !== 'function') {
            return;
        }

        clearTimeoutImplementation(timeoutId);
        timeoutId = null;
    };

    observer = new MutationObserverImplementation(() => {
        const delayedSwitcher = tryInstallSwitcher(document, state, targets);

        if (!delayedSwitcher && !document.querySelector(SWITCHER_SELECTOR)) {
            return;
        }

        disconnectObserver();
        clearPendingTimeout();
    });

    observer.observe(document.documentElement ?? document.body ?? document, {
        childList: true,
        subtree: true
    });

    timeoutId = setTimeoutImplementation(() => {
        disconnectObserver();
        timeoutId = null;
    }, INSTALL_TIMEOUT_MS);

    return null;
}

function tryInstallSwitcher(document, state, targets) {
    if (document.querySelector(SWITCHER_SELECTOR)) {
        return null;
    }

    const mountPoint = findMountPoint(document, state.pageType);

    if (!mountPoint) {
        return null;
    }

    const switcher = renderSwitcher(document, state, targets);

    if (!switcher) {
        return null;
    }

    if (mountPoint.insertBefore) {
        mountPoint.container.insertBefore(switcher, mountPoint.insertBefore);
        return switcher;
    }

    mountPoint.container.appendChild(switcher);
    return switcher;
}

function resolvePageType(parsedUrl) {
    const host = parsedUrl.hostname;
    const [section] = parsedUrl.pathname.split('/').filter(Boolean);

    if (host === 'www.alphaxiv.org' && section === 'abs') {
        return 'alphaxiv';
    }

    if ((host === 'arxiv.org' || host === 'www.arxiv.org') && section === 'abs') {
        return 'arxiv-abs';
    }

    if ((host === 'arxiv.org' || host === 'www.arxiv.org') && section === 'html') {
        return 'arxiv-html';
    }

    return null;
}

function findAlphaXivMount(document) {
    const primaryRow = findSmallestMatchingElement(
        document,
        'div, section, nav, header, main',
        (element) => (
            hasRequiredTexts(element, ['Paper', 'Blog', 'Resources'])
            && /Download/i.test(normalizeText(element.textContent))
        )
    );

    if (primaryRow) {
        const actionsContainer = Array.from(primaryRow.children).find((child) => (
            !hasRequiredTexts(child, ['Paper', 'Blog', 'Resources'])
            && /Download/i.test(normalizeText(child.textContent))
        ));

        if (actionsContainer) {
            return {
                container: actionsContainer,
                strategy: 'alphaxiv-primary'
            };
        }
    }

    const hideToolsControl = Array.from(document.querySelectorAll('button, a, span')).find((element) => (
        normalizeText(element.textContent).includes('Hide Tools')
    ));

    if (!hideToolsControl) {
        return null;
    }

    return {
        container: hideToolsControl.closest('div, section, aside, header, nav')
            ?? hideToolsControl.parentElement
            ?? hideToolsControl,
        strategy: 'alphaxiv-fallback'
    };
}

function findArxivAbsMount(document) {
    const accessHeading = Array.from(document.querySelectorAll('h1, h2, h3, h4, strong, dt, div, p, span'))
        .find((element) => normalizeText(element.textContent) === 'Access Paper:');

    if (!accessHeading) {
        return null;
    }

    const container = accessHeading.closest('section, div, article, main, dl')
        ?? accessHeading.parentElement;

    if (!container) {
        return null;
    }

    const linkList = findSmallestMatchingElement(
        container,
        'div, ul, ol, p',
        (element) => hasRequiredTexts(element, ['View PDF', 'TeX Source'])
    );

    if (!linkList) {
        return null;
    }

    const licenseLink = Array.from(container.querySelectorAll('a')).find((element) => (
        normalizeText(element.textContent).toLowerCase() === 'view license'
    ));

    return {
        container,
        strategy: 'after-access-paper-list',
        insertBefore: licenseLink ?? linkList.nextSibling ?? null
    };
}

function findArxivHtmlMount(document) {
    const backLink = Array.from(document.querySelectorAll('a')).find((element) => (
        normalizeText(element.textContent) === 'Back to abstract page'
    ));

    if (!backLink) {
        return null;
    }

    const container = backLink.closest('nav, header, div, section') ?? backLink.parentElement;

    if (!container) {
        return null;
    }

    const downloadLink = Array.from(container.querySelectorAll('a')).find((element) => (
        normalizeText(element.textContent) === 'Download PDF'
    ));

    return {
        container,
        strategy: 'after-back-to-abstract-link',
        insertBefore: downloadLink ?? backLink.nextSibling ?? null
    };
}

function buildRenderItems(state, targets) {
    if (state.pageType === 'alphaxiv') {
        return [
            targets.arxivAbs && {
                href: targets.arxivAbs,
                label: 'arXiv Abs',
                target: 'arxiv-abs',
                type: 'link'
            },
            targets.arxivHtml && {
                href: targets.arxivHtml,
                label: 'arXiv HTML',
                target: 'arxiv-html',
                type: 'link'
            }
        ].filter(Boolean);
    }

    if (state.pageType === 'arxiv-abs') {
        return [
            targets.alphaxiv && {
                href: targets.alphaxiv,
                label: 'AlphaXiv',
                target: 'alphaxiv',
                type: 'link'
            },
            {
                label: 'Abstract',
                target: 'arxiv-abs',
                type: 'current'
            },
            targets.arxivHtml && {
                href: targets.arxivHtml,
                label: 'HTML',
                target: 'arxiv-html',
                type: 'link'
            }
        ].filter(Boolean);
    }

    if (state.pageType === 'arxiv-html') {
        return [
            targets.alphaxiv && {
                href: targets.alphaxiv,
                label: 'AlphaXiv',
                target: 'alphaxiv',
                type: 'link'
            }
        ].filter(Boolean);
    }

    return [];
}

function appendItems(document, root, items, separator) {
    items.forEach((item, index) => {
        if (index > 0) {
            root.append(document.createTextNode(separator));
        }

        root.append(createItemElement(document, item));
    });
}

function createItemElement(document, item) {
    const element = document.createElement(item.type === 'current' ? 'span' : 'a');

    element.setAttribute('data-switch-target', item.target);
    element.textContent = item.label;

    if (item.type === 'current') {
        element.setAttribute('aria-current', 'page');
        return element;
    }

    element.href = item.href;
    return element;
}

function findSmallestMatchingElement(root, selector, predicate) {
    const candidates = Array.from(root.querySelectorAll(selector)).filter(predicate);

    return candidates.find((element) => !Array.from(element.children).some(predicate)) ?? null;
}

function hasRequiredTexts(element, requiredTexts) {
    const text = normalizeText(element.textContent);
    return requiredTexts.every((requiredText) => text.includes(requiredText));
}

function normalizeText(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function splitPaperId(rawId, idStyle) {
    if (idStyle === 'new') {
        const match = rawId.match(/^(\d{4}\.\d{4,5})(v\d+)?$/);

        return {
            baseId: match ? match[1] : rawId,
            version: match?.[2] ?? null
        };
    }

    const parts = rawId.split('/');
    const lastSegment = parts.pop();
    const match = lastSegment.match(/^(.+?)(v\d+)?$/);

    return {
        baseId: [...parts, match ? match[1] : lastSegment].join('/'),
        version: match?.[2] ?? null
    };
}
