// ==UserScript==
// @name         AlphaXiv / arXiv Switcher
// @namespace    https://github.com/jht213/alphaxiv-script
// @version      0.1.0
// @description  Switch between AlphaXiv, arXiv abstract, and arXiv HTML pages
// @match        https://www.alphaxiv.org/abs/*
// @match        https://arxiv.org/abs/*
// @match        https://www.arxiv.org/abs/*
// @match        https://arxiv.org/html/*
// @match        https://www.arxiv.org/html/*
// @grant        none
// ==/UserScript==

(() => {
'use strict';

const ALPHAXIV_ORIGIN = 'https://www.alphaxiv.org';
const ARXIV_ORIGIN = 'https://arxiv.org';
const SWITCHER_SELECTOR = '[data-alphaxiv-switcher]';
const INSTALL_TIMEOUT_MS = 5000;

function parsePaperLocation(url) {
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

function buildTargets(state) {
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

function findMountPoint(document, pageType) {
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

function renderSwitcher(document, state, targets) {
    if (!document || !state || !targets) {
        return null;
    }

    const items = buildRenderItems(state, targets);

    if (items.length === 0) {
        return null;
    }

    if (state.pageType === 'arxiv-html' && items.length === 1) {
        const singleLink = createItemElement(document, items[0]);
        singleLink.setAttribute('data-alphaxiv-switcher', '');
        return singleLink;
    }

    const root = document.createElement(state.pageType === 'arxiv-abs' ? 'div' : 'span');
    root.setAttribute('data-alphaxiv-switcher', '');

    if (state.pageType === 'alphaxiv') {
        root.style.marginInlineStart = '0.5rem';
        root.style.display = 'inline-flex';
        root.style.alignItems = 'center';
        root.style.gap = '0.5rem';
        appendItems(document, root, items, '');
        return root;
    }

    if (state.pageType === 'arxiv-abs') {
        appendItems(document, root, items, '');
        return root;
    }

    appendItems(document, root, items, ' · ');
    return root;
}

function installSwitcher({
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
        if (state.pageType === 'alphaxiv') {
            startAlphaXivPersistenceObserver({
                document,
                state,
                targets,
                MutationObserverImplementation,
                setTimeoutImplementation
            });
        }

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

    const mountReadySwitcher = normalizeSwitcherForMount(document, switcher, state.pageType, mountPoint);

    if (!mountReadySwitcher) {
        return null;
    }

    applyMountPresentation(mountReadySwitcher, mountPoint, state.pageType);

    if (state.pageType === 'arxiv-html') {
        trimArxivHtmlWhitespaceAroundMount(mountPoint);
    }

    if (mountPoint.insertBefore) {
        mountPoint.container.insertBefore(mountReadySwitcher, mountPoint.insertBefore);
        return mountReadySwitcher;
    }

    mountPoint.container.appendChild(mountReadySwitcher);
    return mountReadySwitcher;
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
    const hideToolsControls = findHideToolsControls(document);

    for (const hideToolsControl of hideToolsControls) {
        const leftToolbarMount = findAlphaXivLeftToolbarMount(hideToolsControl);

        if (leftToolbarMount) {
            return leftToolbarMount;
        }
    }

    const navGroup = findSmallestMatchingElement(
        document,
        'div, section, nav, header, main',
        (element) => hasRequiredTexts(element, ['Paper', 'Blog', 'Resources'])
    );

    if (navGroup) {
        const primaryRow = navGroup.parentElement ?? navGroup;
        const actionsContainer = Array.from(primaryRow.children).find((child) => (
            child !== navGroup
            && !hasRequiredTexts(child, ['Paper', 'Blog', 'Resources'])
            && isAlphaXivActionsContainer(child)
        ));

        if (actionsContainer) {
            return {
                container: actionsContainer,
                strategy: 'alphaxiv-primary'
            };
        }
    }

    if (hideToolsControls.length === 0) {
        return null;
    }

    const fallbackControl = hideToolsControls.find((element) => (
        /Ctrl\s*\+\s*\//i.test(normalizeText(element.textContent))
    )) ?? hideToolsControls[0];

    return {
        container: fallbackControl.closest('div, section, aside, header, nav')
            ?? fallbackControl.parentElement
            ?? fallbackControl,
        strategy: 'alphaxiv-fallback'
    };
}

function findAlphaXivLeftToolbarMount(hideToolsControl) {
    if (!hideToolsControl) {
        return null;
    }

    let current = hideToolsControl;

    while (current) {
        const parent = current.parentElement;

        if (!parent) {
            break;
        }

        const siblings = Array.from(parent.children);
        const currentIndex = siblings.indexOf(current);
        const leftToolbarContainer = siblings
            .slice(0, currentIndex)
            .reverse()
            .find((sibling) => (
                isAlphaXivLeftToolbarContainer(sibling)
                && isAlphaXivToolbarRow(parent, current, sibling)
            ));

        if (leftToolbarContainer) {
            return {
                container: leftToolbarContainer,
                strategy: 'alphaxiv-left-toolbar'
            };
        }

        current = parent;
    }

    return null;
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
        (element) => hasRequiredTexts(element, ['View PDF'])
    );

    if (!linkList) {
        return null;
    }

    if (linkList.tagName === 'UL' || linkList.tagName === 'OL') {
        return {
            container: linkList,
            strategy: 'in-access-paper-list',
            insertBefore: null
        };
    }

    const licenseLink = Array.from(container.querySelectorAll('a')).find((element) => (
        normalizeText(element.textContent).toLowerCase() === 'view license'
    ));
    const insertBefore = linkList.nextElementSibling ?? findDirectChild(container, licenseLink);

    return {
        container,
        strategy: 'after-access-paper-list',
        insertBefore: insertBefore ?? null,
        linkListTag: linkList.tagName
    };
}

function findArxivHtmlMount(document) {
    const backLink = Array.from(document.querySelectorAll('a')).find((element) => (
        isBackToAbstractLabel(normalizeText(element.textContent))
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
        insertBefore: downloadLink ?? backLink.nextSibling ?? null,
        afterLink: backLink,
        beforeLink: downloadLink ?? null
    };
}

function buildRenderItems(state, targets) {
    if (state.pageType === 'alphaxiv') {
        return [
            targets.arxivAbs && {
                href: targets.arxivAbs,
                label: 'A',
                title: 'arXiv Abstract',
                ariaLabel: 'Open arXiv abstract',
                target: 'arxiv-abs',
                type: 'icon-link'
            },
            targets.arxivHtml && {
                href: targets.arxivHtml,
                label: 'H',
                title: 'arXiv HTML',
                ariaLabel: 'Open arXiv HTML',
                target: 'arxiv-html',
                type: 'icon-link'
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
        if (index > 0 && separator) {
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

    if (item.type === 'icon-link') {
        element.setAttribute('aria-label', item.ariaLabel);
        element.setAttribute('title', item.title);
        element.style.display = 'inline-flex';
        element.style.alignItems = 'center';
        element.style.justifyContent = 'center';
        element.style.boxSizing = 'border-box';
        element.style.minInlineSize = '1.5rem';
        element.style.blockSize = '1.35rem';
        element.style.paddingInline = '0.34rem';
        element.style.borderRadius = '0.45rem';
        element.style.border = '1px solid #cbd5e1';
        element.style.backgroundColor = '#f8fafc';
        element.style.color = '#334155';
        element.style.fontSize = '0.72rem';
        element.style.fontWeight = '600';
        element.style.letterSpacing = '0.01em';
        element.style.lineHeight = '1';
        element.style.textDecoration = 'none';
    }

    return element;
}

function findSmallestMatchingElement(root, selector, predicate) {
    const candidates = Array.from(root.querySelectorAll(selector)).filter(predicate);

    return candidates.find((element) => !Array.from(element.children).some((child) => (
        child.matches(selector) && predicate(child)
    ))) ?? null;
}

function hasRequiredTexts(element, requiredTexts) {
    const text = normalizeText(element.textContent);
    return requiredTexts.every((requiredText) => text.includes(requiredText));
}

function normalizeText(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function isAlphaXivActionsContainer(element) {
    return (
        element.querySelectorAll('button').length > 0
        || /Hide Tools/i.test(normalizeText(element.textContent))
    );
}

function isAlphaXivLeftToolbarContainer(element) {
    if (!element) {
        return false;
    }

    const text = normalizeText(element.textContent);

    if (/Hide Tools/i.test(text) || hasRequiredTexts(element, ['Paper', 'Blog', 'Resources'])) {
        return false;
    }

    const buttonCount = element.querySelectorAll('button').length;
    const interactiveCount = element.querySelectorAll('button, a').length;
    const iconSignalCount = element.querySelectorAll('img, svg, [aria-label]').length;

    return buttonCount >= 1 && interactiveCount >= 2 && iconSignalCount >= 2;
}

function isAlphaXivToolbarRow(parent, hideToolsGroup, leftToolbarContainer) {
    const siblings = Array.from(parent.children);

    if (siblings.length < 3) {
        return false;
    }

    return siblings.some((sibling) => (
        sibling !== hideToolsGroup
        && sibling !== leftToolbarContainer
        && isAlphaXivCenterControlsContainer(sibling)
    ));
}

function isAlphaXivCenterControlsContainer(element) {
    const text = normalizeText(element.textContent);
    const hasPageProgressPattern = /\d+\s*\/\s*(?:\d+|-)|\/\s*-/.test(text);
    const hasInputControl = element.querySelectorAll('input, textarea').length > 0;

    return hasPageProgressPattern || hasInputControl;
}

function findHideToolsControls(document) {
    return Array.from(document.querySelectorAll('button, a, span')).filter((element) => (
        normalizeText(element.textContent).includes('Hide Tools')
    ));
}

function applyMountPresentation(switcher, mountPoint, pageType) {
    if (pageType === 'arxiv-abs') {
        if (mountPoint.strategy === 'in-access-paper-list') {
            return;
        }

        switcher.style.display = 'block';
        switcher.style.marginBlockStart = '0.2rem';

        if (mountPoint.linkListTag === 'UL' || mountPoint.linkListTag === 'OL') {
            switcher.style.marginInlineStart = '1.25rem';
        }
    }

    if (pageType === 'arxiv-html') {
        const neighborClassName = mountPoint.afterLink?.getAttribute?.('class') ?? '';

        if (neighborClassName && !switcher.getAttribute('class')) {
            switcher.setAttribute('class', neighborClassName);
        }

        switcher.style.whiteSpace = 'nowrap';
    }
}

function normalizeSwitcherForMount(document, switcher, pageType, mountPoint) {
    if (pageType !== 'arxiv-abs' || mountPoint.strategy !== 'in-access-paper-list') {
        return switcher;
    }

    const listItem = document.createElement('li');
    listItem.setAttribute('data-alphaxiv-switcher', '');

    while (switcher.firstChild) {
        listItem.appendChild(switcher.firstChild);
    }

    return listItem;
}

function startAlphaXivPersistenceObserver({
    document,
    state,
    targets,
    MutationObserverImplementation,
    setTimeoutImplementation
}) {
    if (
        state.pageType !== 'alphaxiv'
        || typeof MutationObserverImplementation !== 'function'
        || typeof setTimeoutImplementation !== 'function'
    ) {
        return;
    }

    const observer = new MutationObserverImplementation(() => {
        if (document.querySelector(SWITCHER_SELECTOR)) {
            return;
        }

        tryInstallSwitcher(document, state, targets);
    });

    observer.observe(document.documentElement ?? document.body ?? document, {
        childList: true,
        subtree: true
    });

    setTimeoutImplementation(() => {
        observer.disconnect();
    }, INSTALL_TIMEOUT_MS);
}

function trimArxivHtmlWhitespaceAroundMount(mountPoint) {
    if (mountPoint.strategy !== 'after-back-to-abstract-link') {
        return;
    }

    const afterWhitespaceNode = mountPoint.afterLink?.nextSibling;

    if (isWhitespaceTextNode(afterWhitespaceNode)) {
        if (mountPoint.insertBefore === afterWhitespaceNode) {
            mountPoint.insertBefore = afterWhitespaceNode.nextSibling ?? null;
        }

        afterWhitespaceNode.remove();
    }

    const beforeWhitespaceNode = mountPoint.insertBefore?.previousSibling;

    if (isWhitespaceTextNode(beforeWhitespaceNode)) {
        beforeWhitespaceNode.remove();
    }
}

function isWhitespaceTextNode(node) {
    return node?.nodeType === 3 && normalizeText(node.textContent ?? '') === '';
}

function isBackToAbstractLabel(text) {
    return /^Back to abstract(?: page)?$/i.test(text);
}

function findDirectChild(container, node) {
    if (!container || !node) {
        return null;
    }

    let current = node;

    while (current && current.parentElement !== container) {
        current = current.parentElement;
    }

    return current?.parentElement === container ? current : null;
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

installSwitcher({
    document: globalThis.document,
    url: globalThis.location?.href,
    MutationObserver: globalThis.MutationObserver,
    setTimeout: globalThis.setTimeout?.bind(globalThis),
    clearTimeout: globalThis.clearTimeout?.bind(globalThis)
});
})();
