// ==UserScript==
// @name         alphaXiv My Library Sorter Plus
// @namespace    https://tampermonkey.net/
// @version      3.1.0
// @description  Stable sorting for alphaXiv My Library with exact arXiv published dates, compliant API pacing, and fixed Added sorting
// @match        https://www.alphaxiv.org/bookmarks*
// @match        https://alphaxiv.org/bookmarks*
// @grant        GM_xmlhttpRequest
// @connect      export.arxiv.org
// @connect      arxiv.org
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const DEBUG = false;

    const LS = {
        sortMode: 'alphaxiv-sort-mode',
        pubPrefix: 'alphaxiv-pubdate-v31:',
        showPublishedColumn: 'alphaxiv-show-published-column',
    };

    const ID = {
        style: 'alphaxiv-sort-style',
        wrapper: 'alphaxiv-sort-wrapper',
        trigger: 'alphaxiv-sort-trigger',
        menu: 'alphaxiv-sort-menu',
        status: 'alphaxiv-sort-status',
    };

    const CLASS = {
        showPublished: 'alphaxiv-show-published',
        pubHeader: 'alphaxiv-pub-header',
        pubCell: 'alphaxiv-pub-cell',
        addedHeader: 'alphaxiv-added-header',
        addedCell: 'alphaxiv-added-cell',
        authorsHeader: 'alphaxiv-authors-header',
        authorsCell: 'alphaxiv-authors-cell',
        menuIcon: 'alphaxiv-menu-icon',
        menuCheck: 'alphaxiv-menu-check',
    };

    const SORT_OPTIONS = [
        { value: 'added_desc', label: 'Added: Newest', icon: 'clock' },
        { value: 'added_asc', label: 'Added: Oldest', icon: 'clock' },
        { value: 'title_asc', label: 'Title: A-Z', icon: 'text' },
        { value: 'title_desc', label: 'Title: Z-A', icon: 'text' },
        { value: 'authors_asc', label: 'Authors: A-Z', icon: 'user' },
        { value: 'authors_desc', label: 'Authors: Z-A', icon: 'user' },
        { value: 'pub_desc', label: 'Published: Newest', icon: 'calendar' },
        { value: 'pub_asc', label: 'Published: Oldest', icon: 'calendar' },
    ];

    const EXACT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    const FALLBACK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const ARXIV_MIN_INTERVAL_MS = 3200;
    const ARXIV_BATCH_SIZE = 100;

    let bootTimer = null;
    let isSorting = false;
    let lastAutoApplySignature = '';
    let arxivQueue = Promise.resolve();
    let lastArxivRequestAt = 0;

    function log(...args) {
        if (DEBUG) console.log('[alphaXiv-sorter]', ...args);
    }

    function $(selector, root = document) {
        return root.querySelector(selector);
    }

    function $$(selector, root = document) {
        return Array.from(root.querySelectorAll(selector));
    }

    function cleanText(str) {
        return (str || '').replace(/\s+/g, ' ').trim();
    }

    function stripHelperClasses(className) {
        return cleanText(
            String(className || '')
                .replace(/\balphaxiv-added-header\b/g, '')
                .replace(/\balphaxiv-added-cell\b/g, '')
                .replace(/\balphaxiv-pub-header\b/g, '')
                .replace(/\balphaxiv-pub-cell\b/g, '')
                .replace(/\balphaxiv-authors-header\b/g, '')
                .replace(/\balphaxiv-authors-cell\b/g, '')
        );
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function uniq(arr) {
        return [...new Set(arr)];
    }

    function chunk(arr, size) {
        const out = [];
        for (let i = 0; i < arr.length; i += size) {
            out.push(arr.slice(i, i + size));
        }
        return out;
    }

    function normalizePaperId(raw) {
        let s = String(raw || '').trim();
        s = s.replace(/^.*\/abs\//, '');
        s = s.replace(/[?#].*$/, '');
        s = s.replace(/v\d+$/, '');
        return s;
    }

    function getSortMeta(value) {
        return SORT_OPTIONS.find(x => x.value === value) || null;
    }

    function getSortLabel(value) {
        return getSortMeta(value)?.label || 'Sort';
    }

    function getSortIconName(value) {
        return getSortMeta(value)?.icon || 'sort';
    }

    function getSavedMode() {
        return localStorage.getItem(LS.sortMode) || '';
    }

    function setSavedMode(mode) {
        if (!mode) localStorage.removeItem(LS.sortMode);
        else localStorage.setItem(LS.sortMode, mode);
    }

    function getShowPublishedColumn() {
        return localStorage.getItem(LS.showPublishedColumn) === '1';
    }

    function setShowPublishedColumn(show) {
        if (show) localStorage.setItem(LS.showPublishedColumn, '1');
        else localStorage.removeItem(LS.showPublishedColumn);
        document.body.classList.toggle(CLASS.showPublished, !!show);
    }

    function getPubCacheKey(paperId) {
        return `${LS.pubPrefix}${normalizePaperId(paperId)}`;
    }

    function loadPubCacheEntry(paperId) {
        if (!paperId) return null;
        const raw = localStorage.getItem(getPubCacheKey(paperId));
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.ts !== 'number') return null;
            return {
                ts: parsed.ts,
                precision: parsed.precision || (parsed.ts > 0 ? 'day' : 'month'),
                fetchedAt: Number(parsed.fetchedAt) || 0,
            };
        } catch {
            return null;
        }
    }

    function savePubCacheEntry(paperId, ts, precision) {
        if (!paperId) return;
        const payload = {
            ts: Number(ts) || 0,
            precision: precision || (ts > 0 ? 'day' : 'month'),
            fetchedAt: Date.now(),
        };
        localStorage.setItem(getPubCacheKey(paperId), JSON.stringify(payload));
    }

    function isPubCacheFresh(entry) {
        if (!entry) return false;
        const age = Date.now() - (entry.fetchedAt || 0);
        if (entry.precision === 'day' && entry.ts > 0) return age < EXACT_CACHE_TTL_MS;
        return age < FALLBACK_CACHE_TTL_MS;
    }

    function shouldUsePubCache(entry) {
        return !!(entry && isPubCacheFresh(entry));
    }

    function shouldRefetchExact(entry) {
        if (!entry) return true;
        if (!isPubCacheFresh(entry)) return true;
        return !(entry.precision === 'day' && entry.ts > 0);
    }

    function loadCachedPubDate(paperId) {
        return loadPubCacheEntry(paperId)?.ts || 0;
    }

    function parseCnDate(str) {
        const s = cleanText(str);
        const m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?/);
        if (!m) return 0;
        return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    }

    function parseIsoDayToUtcNoon(isoText) {
        const m = String(isoText || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return 0;
        return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    }

    function inferPubDateFromArxivId(paperId) {
        const m = normalizePaperId(paperId).match(/^(\d{2})(\d{2})\.\d+/);
        if (!m) return 0;
        const yy = Number(m[1]);
        const mm = Number(m[2]);
        const year = yy >= 90 ? 1900 + yy : 2000 + yy;
        if (mm < 1 || mm > 12) return 0;

        // negative = month precision only
        return -Date.UTC(year, mm - 1, 1, 12, 0, 0);
    }

    function getAbsolutePubTs(ts) {
        return Math.abs(Number(ts) || 0);
    }

    function formatExactCnDate(ts) {
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return '—';
        return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
    }

    function formatApproxCnMonth(ts) {
        const d = new Date(Math.abs(ts));
        if (Number.isNaN(d.getTime())) return '—';
        return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`;
    }

    function formatPubDateForDisplay(ts) {
        if (!ts) return '—';
        if (ts > 0) return formatExactCnDate(ts);
        return formatApproxCnMonth(ts);
    }

    function getPaperId(row) {
        const href = row?.getAttribute('href') || '';
        return normalizePaperId(href);
    }

    function getCurrentFolderName() {
        const candidates = $$('span.font-semibold.text-text, h1, h2, h3')
            .map(el => cleanText(el.textContent))
            .filter(Boolean);

        return candidates.find(text =>
            !['Title', 'Authors', 'Added', 'Published', 'Research Mode', 'Share'].includes(text)
        ) || '';
    }

    function getToolbar() {
        const searchInput = $('input[placeholder="Search all bookmarks..."]');
        if (!searchInput) return null;

        let el = searchInput;
        while (el && el !== document.body) {
            const text = cleanText(el.textContent || '');
            if (text.includes('Research Mode')) return el;
            el = el.parentElement;
        }

        return searchInput.closest('div.flex.h-16.w-full.flex-none.items-center.justify-between.border-b') ||
            searchInput.closest('div') ||
            null;
    }

    function getMainContentArea() {
        const toolbar = getToolbar();
        if (!toolbar) return null;

        let el = toolbar;
        while (el && el !== document.body) {
            if ($$('a[href^="/abs/"]', el).length > 0) return el;
            el = el.parentElement;
        }

        return $('div.relative.hidden.h-full.flex-1.flex-col.overflow-hidden.md\\:flex') || null;
    }

    function getListContainer() {
        const main = getMainContentArea() || document;
        const candidates = $$('div.flex.w-full.grow.basis-0.flex-col.overflow-y-auto', main);

        if (!candidates.length) return null;

        let best = null;
        let bestCount = 0;

        for (const node of candidates) {
            const count = $$(':scope > a[href^="/abs/"]', node).length;
            if (count > bestCount) {
                best = node;
                bestCount = count;
            }
        }

        return bestCount > 0 ? best : null;
    }

    function getRows() {
        const container = getListContainer();
        if (!container) return [];
        return $$(':scope > a[href^="/abs/"]', container);
    }

    function isListView() {
        return getRows().length > 0;
    }

    function getHeaderRow() {
        const container = getListContainer();
        if (!container) return null;

        let node = container.previousElementSibling;
        let steps = 0;

        while (node && steps < 6) {
            const text = cleanText(node.textContent || '');
            if (text.includes('Title') && text.includes('Authors') && text.includes('Added')) {
                return node;
            }
            node = node.previousElementSibling;
            steps += 1;
        }

        const main = getMainContentArea() || document;
        return $$('div', main).find(el => {
            const text = cleanText(el.textContent || '');
            return text.includes('Title') && text.includes('Authors') && text.includes('Added');
        }) || null;
    }

    function getHeaderAddedCell(header = getHeaderRow()) {
        if (!header) return null;
        return header.querySelector(`:scope > .${CLASS.addedHeader}`) ||
            Array.from(header.children).find(el => cleanText(el.textContent) === 'Added') ||
            null;
    }

    function getHeaderAuthorsCell(header = getHeaderRow()) {
        if (!header) return null;
        return header.querySelector(`:scope > .${CLASS.authorsHeader}`) ||
            Array.from(header.children).find(el => cleanText(el.textContent) === 'Authors') ||
            null;
    }

    function getRowAddedCell(row) {
        return row.querySelector(`:scope > .${CLASS.addedCell}`) ||
            (row.querySelector(`:scope > .${CLASS.pubCell}`) ? row.children[5] : row.children[4]) ||
            null;
    }

    function getRowAuthorsCell(row) {
        return row.querySelector(`:scope > .${CLASS.authorsCell}`) || row.children[3] || null;
    }

    function getRowTitleCell(row) {
        return row.children[2] || null;
    }

    function extractRowData(row) {
        const paperId = getPaperId(row);
        const title = cleanText(getRowTitleCell(row)?.textContent || '');
        const authors = cleanText(getRowAuthorsCell(row)?.textContent || '');
        const addedText = cleanText(getRowAddedCell(row)?.textContent || '');
        const addedTs = parseCnDate(addedText);
        const pubTs = loadCachedPubDate(paperId);

        return {
            el: row,
            paperId,
            title,
            authors,
            addedText,
            addedTs,
            pubTs,
        };
    }

    function compareFactory(mode) {
        switch (mode) {
            case 'added_desc':
                return (a, b) => b.addedTs - a.addedTs;
            case 'added_asc':
                return (a, b) => a.addedTs - b.addedTs;
            case 'title_asc':
                return (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
            case 'title_desc':
                return (a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: 'base' });
            case 'authors_asc':
                return (a, b) => a.authors.localeCompare(b.authors, undefined, { sensitivity: 'base' });
            case 'authors_desc':
                return (a, b) => b.authors.localeCompare(a.authors, undefined, { sensitivity: 'base' });
            case 'pub_desc':
                return (a, b) => getAbsolutePubTs(b.pubTs) - getAbsolutePubTs(a.pubTs);
            case 'pub_asc':
                return (a, b) => getAbsolutePubTs(a.pubTs) - getAbsolutePubTs(b.pubTs);
            default:
                return null;
        }
    }

    function setStatus(text) {
        const node = document.getElementById(ID.status);
        if (!node) return;
        node.textContent = text || '';
        node.style.display = text ? 'inline-flex' : 'none';
    }

    function iconSvg(name) {
        const map = {
            sort: `<svg viewBox="0 0 20 20" fill="none"><path d="M6 5h8M4 10h12M8 15h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
            clock: `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="M10 6.8v3.7l2.4 1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            text: `<svg viewBox="0 0 20 20" fill="none"><path d="M4.5 6h11M7.5 6v8M12.5 6v8M5.8 14h8.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
            user: `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="2.8" stroke="currentColor" stroke-width="1.7"/><path d="M4.8 15.3c1.2-2.2 3.1-3.3 5.2-3.3s4 .9 5.2 3.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
            calendar: `<svg viewBox="0 0 20 20" fill="none"><rect x="3.5" y="4.8" width="13" height="11" rx="2.2" stroke="currentColor" stroke-width="1.7"/><path d="M6.5 3.8v2.4M13.5 3.8v2.4M3.8 8h12.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
            check: `<svg viewBox="0 0 20 20" fill="none"><path d="M5 10.2l3.1 3.1L15 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        };
        return map[name] || map.sort;
    }

    function setTriggerVisual(mode, loadingText = '') {
        const trigger = document.getElementById(ID.trigger);
        if (!trigger) return;

        const label = trigger.querySelector('.label');
        const icon = trigger.querySelector('.trigger-icon');

        if (label) label.textContent = loadingText || getSortLabel(mode);
        if (icon) icon.innerHTML = iconSvg(loadingText ? 'calendar' : getSortIconName(mode));
    }

    function renderMenuActiveState(currentMode) {
        const menu = document.getElementById(ID.menu);
        if (menu) {
            Array.from(menu.querySelectorAll('button[data-value]')).forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === currentMode);
            });
        }
        setTriggerVisual(currentMode);
    }

    function closeMenu() {
        document.getElementById(ID.menu)?.classList.remove('show');
        document.getElementById(ID.trigger)?.classList.remove('open');
    }

    function openMenu() {
        document.getElementById(ID.menu)?.classList.add('show');
        document.getElementById(ID.trigger)?.classList.add('open');
    }

    function ensureCompactLayout() {
        const header = getHeaderRow();
        const headerAddedCell = getHeaderAddedCell(header);
        const headerAuthorsCell = getHeaderAuthorsCell(header);

        if (headerAddedCell) headerAddedCell.classList.add(CLASS.addedHeader);
        if (headerAuthorsCell) headerAuthorsCell.classList.add(CLASS.authorsHeader);

        for (const row of getRows()) {
            const addedCell = getRowAddedCell(row);
            const authorsCell = getRowAuthorsCell(row);
            if (addedCell) addedCell.classList.add(CLASS.addedCell);
            if (authorsCell) authorsCell.classList.add(CLASS.authorsCell);
        }
    }

    function ensurePublishedHeaderCell() {
        const header = getHeaderRow();
        if (!header) return null;

        let pubHeader = header.querySelector(`:scope > .${CLASS.pubHeader}`);
        if (pubHeader) return pubHeader;

        const addedCell = getHeaderAddedCell(header);
        pubHeader = document.createElement('div');
        pubHeader.textContent = 'Published';

        if (addedCell) {
            const baseClass = stripHelperClasses(addedCell.className)
                || 'ml-10 w-[95px] shrink-0 font-rubik text-sm leading-5 font-normal text-text';
            pubHeader.className = `${baseClass} ${CLASS.pubHeader}`;
            header.insertBefore(pubHeader, addedCell);
        } else {
            pubHeader.className = `ml-10 w-[95px] shrink-0 font-rubik text-sm leading-5 font-normal text-text ${CLASS.pubHeader}`;
            header.appendChild(pubHeader);
        }

        return pubHeader;
    }

    function getOrCreatePublishedCell(row) {
        let cell = row.querySelector(`:scope > .${CLASS.pubCell}`);
        if (cell) return cell;

        const addedCell = getRowAddedCell(row);
        cell = document.createElement('div');
        cell.textContent = '—';

        if (addedCell) {
            const baseClass = stripHelperClasses(addedCell.className);
            cell.className = `${baseClass} ${CLASS.pubCell}`;
            row.insertBefore(cell, addedCell);
        } else {
            cell.className = CLASS.pubCell;
            row.appendChild(cell);
        }

        return cell;
    }

    function renderPublishedCells() {
        ensureCompactLayout();
        ensurePublishedHeaderCell();

        const rows = getRows();
        for (const row of rows) {
            const cell = getOrCreatePublishedCell(row);
            const paperId = getPaperId(row);
            const pubTs = loadCachedPubDate(paperId);
            cell.textContent = formatPubDateForDisplay(pubTs);
            cell.title = pubTs > 0
                ? formatExactCnDate(pubTs)
                : pubTs < 0
                    ? formatApproxCnMonth(pubTs)
                    : 'Not loaded';
        }

        document.body.classList.toggle(CLASS.showPublished, getShowPublishedColumn());
    }

    function markRowsAsLoadingPublication(rows) {
        for (const row of rows) {
            const cell = getOrCreatePublishedCell(row);
            cell.textContent = '…';
            cell.title = 'Loading publication date';
        }
    }

    function rawRequestText(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    onload: (resp) => {
                        if (resp.status >= 200 && resp.status < 300) resolve(resp.responseText);
                        else reject(new Error(`HTTP ${resp.status}`));
                    },
                    onerror: () => reject(new Error('Network error')),
                    ontimeout: () => reject(new Error('Timeout')),
                });
                return;
            }

            fetch(url, { credentials: 'omit' })
                .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.text();
                })
                .then(resolve)
                .catch(reject);
        });
    }

    function queuedArxivRequest(url) {
        const task = async () => {
            const now = Date.now();
            const wait = Math.max(0, ARXIV_MIN_INTERVAL_MS - (now - lastArxivRequestAt));
            if (wait > 0) {
                await sleep(wait);
            }
            const text = await rawRequestText(url);
            lastArxivRequestAt = Date.now();
            return text;
        };

        const p = arxivQueue.then(task);
        arxivQueue = p.catch(() => { });
        return p;
    }

    function parseArxivApiXml(xmlText) {
        const out = new Map();
        const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
        if (doc.getElementsByTagName('parsererror')[0]) return out;

        const entries = Array.from(doc.getElementsByTagNameNS('*', 'entry'));
        for (const entry of entries) {
            const idNode = entry.getElementsByTagNameNS('*', 'id')[0];
            const publishedNode = entry.getElementsByTagNameNS('*', 'published')[0];
            if (!idNode || !publishedNode) continue;

            const idText = cleanText(idNode.textContent || '');
            const paperId = normalizePaperId(idText);
            const ts = parseIsoDayToUtcNoon(cleanText(publishedNode.textContent || ''));
            if (paperId && ts) out.set(paperId, ts);
        }
        return out;
    }

    async function readPublishedDatesFromArxivApi(ids) {
        const result = new Map();
        const normalized = uniq(ids.map(normalizePaperId).filter(Boolean));
        const groups = chunk(normalized, ARXIV_BATCH_SIZE);

        for (const group of groups) {
            const url =
                `https://export.arxiv.org/api/query?` +
                `start=0&max_results=${group.length}&id_list=${encodeURIComponent(group.join(','))}`;

            const xmlText = await queuedArxivRequest(url);
            const batch = parseArxivApiXml(xmlText);

            for (const [id, ts] of batch.entries()) {
                result.set(id, ts);
            }
        }

        return result;
    }

    async function ensurePublicationDates(data) {
        setShowPublishedColumn(true);
        renderPublishedCells();

        const needApiItems = data.filter(item => shouldRefetchExact(loadPubCacheEntry(item.paperId)));
        if (!needApiItems.length) {
            for (const item of data) {
                item.pubTs = loadCachedPubDate(item.paperId);
            }
            renderPublishedCells();
            return;
        }

        const ids = uniq(needApiItems.map(item => item.paperId).filter(Boolean));
        markRowsAsLoadingPublication(needApiItems.map(x => x.el));
        setStatus(`Loading publication dates (${ids.length})...`);

        try {
            const apiMap = await readPublishedDatesFromArxivApi(ids);
            let done = 0;

            for (const item of needApiItems) {
                const exactTs = apiMap.get(normalizePaperId(item.paperId));
                if (exactTs) {
                    savePubCacheEntry(item.paperId, exactTs, 'day');
                    item.pubTs = exactTs;
                } else {
                    const old = loadPubCacheEntry(item.paperId);
                    if (!shouldUsePubCache(old)) {
                        const fallback = inferPubDateFromArxivId(item.paperId);
                        savePubCacheEntry(item.paperId, fallback, 'month');
                        item.pubTs = fallback;
                    } else {
                        item.pubTs = old.ts;
                    }
                }
                done += 1;
                setStatus(`Loading publication dates (${done}/${needApiItems.length})...`);
            }
        } catch (err) {
            console.warn('[alphaXiv-sorter] arXiv API failed:', err);

            let done = 0;
            for (const item of needApiItems) {
                const old = loadPubCacheEntry(item.paperId);
                if (!shouldUsePubCache(old)) {
                    const fallback = inferPubDateFromArxivId(item.paperId);
                    savePubCacheEntry(item.paperId, fallback, 'month');
                    item.pubTs = fallback;
                } else {
                    item.pubTs = old.ts;
                }
                done += 1;
                setStatus(`Loading publication dates (${done}/${needApiItems.length})...`);
            }
        }

        for (const item of data) {
            item.pubTs = loadCachedPubDate(item.paperId);
        }

        setStatus('');
        renderPublishedCells();
    }

    async function sortRows(mode) {
        const container = getListContainer();
        const rows = getRows();
        if (!container || !rows.length) return;

        const cmp = compareFactory(mode);
        if (!cmp) return;

        isSorting = true;

        try {
            ensureCompactLayout();
            renderMenuActiveState(mode);

            let data = rows.map(extractRowData);

            if (mode === 'pub_desc' || mode === 'pub_asc') {
                setTriggerVisual(mode, 'Loading publication dates...');
                await ensurePublicationDates(data);
                setTriggerVisual(mode);
                data = getRows().map(extractRowData);
            }

            data.sort(cmp);

            const frag = document.createDocumentFragment();
            for (const item of data) {
                frag.appendChild(item.el);
            }
            container.appendChild(frag);

            setSavedMode(mode);
            renderMenuActiveState(mode);
            ensureCompactLayout();
            renderPublishedCells();

            const folder = getCurrentFolderName();
            const rowSig = data.map(x => x.paperId || x.title).join('|').slice(0, 1000);
            lastAutoApplySignature = `${folder}__${mode}__${data.length}__${rowSig}`;
        } finally {
            isSorting = false;
            setStatus('');
        }
    }

    function buildSignatureForCurrentState(mode) {
        const rows = getRows();
        const folder = getCurrentFolderName();
        const rowSig = rows.map(row => getPaperId(row) || cleanText(row.textContent)).join('|').slice(0, 1000);
        return `${folder}__${mode}__${rows.length}__${rowSig}`;
    }

    async function maybeApplySavedSort() {
        const mode = getSavedMode();
        if (!mode || !isListView() || isSorting) return;

        const sig = buildSignatureForCurrentState(mode);
        if (!sig || sig === lastAutoApplySignature) return;

        await sortRows(mode);
    }

    function injectStyle() {
        if (document.getElementById(ID.style)) return;

        const style = document.createElement('style');
        style.id = ID.style;
        style.textContent = `
      #${ID.wrapper} {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-right: 6px;
        font-family: inherit;
      }

      #${ID.trigger} {
        height: 36px;
        min-width: 192px;
        padding: 0 14px 0 12px;
        border: 1px solid rgba(0, 0, 0, 0.10);
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.96);
        color: inherit;
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        line-height: 1;
        cursor: pointer;
        box-shadow: 0 1px 2px rgba(0,0,0,.04);
        transition: all .18s ease;
        backdrop-filter: blur(6px);
      }

      #${ID.trigger}:hover {
        background: #fff;
        box-shadow: 0 6px 18px rgba(0,0,0,.08);
        transform: translateY(-1px);
      }

      #${ID.trigger}.open {
        border-color: rgba(190, 24, 93, .22);
        box-shadow: 0 0 0 4px rgba(190, 24, 93, .08);
      }

      #${ID.trigger} .trigger-left {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      #${ID.trigger} .trigger-icon {
        width: 16px;
        height: 16px;
        color: rgba(190, 24, 93, .92);
        flex: 0 0 auto;
      }

      #${ID.trigger} .trigger-icon svg,
      .${CLASS.menuIcon} svg,
      .${CLASS.menuCheck} svg {
        width: 100%;
        height: 100%;
        display: block;
      }

      #${ID.trigger} .label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${ID.trigger} .chevron {
        font-size: 12px;
        opacity: .7;
        transition: transform .18s ease;
      }

      #${ID.trigger}.open .chevron {
        transform: rotate(180deg);
      }

      #${ID.menu} {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        width: 252px;
        padding: 8px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 16px 40px rgba(0,0,0,.14);
        backdrop-filter: blur(10px);
        z-index: 999999;
        display: none;
      }

      #${ID.menu}.show {
        display: block;
      }

      #${ID.menu} button {
        width: 100%;
        min-height: 38px;
        padding: 0 10px;
        border: 0;
        background: transparent;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        text-align: left;
        font-size: 13px;
        color: inherit;
        cursor: pointer;
        transition: background .15s ease, color .15s ease, transform .15s ease;
      }

      #${ID.menu} button:hover {
        background: rgba(0, 0, 0, 0.045);
      }

      #${ID.menu} button.active {
        background: rgba(190, 24, 93, .08);
        color: rgb(190, 24, 93);
        font-weight: 600;
      }

      #${ID.menu} button .menu-left {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .${CLASS.menuIcon} {
        width: 16px;
        height: 16px;
        opacity: .9;
        flex: 0 0 auto;
      }

      .${CLASS.menuCheck} {
        width: 16px;
        height: 16px;
        opacity: 0;
        transform: scale(.85);
        transition: opacity .15s ease, transform .15s ease;
        color: rgb(190, 24, 93);
        flex: 0 0 auto;
      }

      #${ID.menu} button.active .${CLASS.menuCheck} {
        opacity: 1;
        transform: scale(1);
      }

      #${ID.status} {
        display: none;
        align-items: center;
        height: 28px;
        padding: 0 10px;
        border-radius: 9999px;
        background: rgba(190, 24, 93, .08);
        color: rgb(190, 24, 93);
        font-size: 12px;
        white-space: nowrap;
      }

      .${CLASS.pubHeader},
      .${CLASS.pubCell} {
        display: none;
      }

      body.${CLASS.showPublished} .${CLASS.pubHeader},
      body.${CLASS.showPublished} .${CLASS.pubCell} {
        display: block !important;
      }

      .${CLASS.authorsHeader},
      .${CLASS.authorsCell} {
        width: 220px !important;
        min-width: 220px !important;
        max-width: 220px !important;
        flex: 0 0 220px !important;
      }

      .${CLASS.addedHeader},
      .${CLASS.addedCell},
      .${CLASS.pubHeader},
      .${CLASS.pubCell} {
        width: 124px !important;
        min-width: 124px !important;
        max-width: 124px !important;
        flex: 0 0 124px !important;
        margin-left: 12px !important;
        padding-right: 6px !important;
        box-sizing: border-box;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${CLASS.pubCell} {
        color: rgba(0, 0, 0, 0.55);
      }
    `;
        document.head.appendChild(style);
    }

    function injectUI() {
        if (document.getElementById(ID.wrapper)) return;

        const toolbar = getToolbar();
        if (!toolbar) return;

        const directDivChildren = Array.from(toolbar.children).filter(node => node instanceof HTMLDivElement);
        const controls = directDivChildren.at(-1) || toolbar;

        const wrapper = document.createElement('div');
        wrapper.id = ID.wrapper;

        const trigger = document.createElement('button');
        trigger.id = ID.trigger;
        trigger.type = 'button';
        trigger.innerHTML = `
      <span class="trigger-left">
        <span class="trigger-icon">${iconSvg(getSortIconName(getSavedMode()))}</span>
        <span class="label">${getSortLabel(getSavedMode())}</span>
      </span>
      <span class="chevron">▾</span>
    `;

        const status = document.createElement('div');
        status.id = ID.status;

        const menu = document.createElement('div');
        menu.id = ID.menu;

        for (const opt of SORT_OPTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.value = opt.value;
            btn.innerHTML = `
        <span class="menu-left">
          <span class="${CLASS.menuIcon}">${iconSvg(opt.icon)}</span>
          <span>${opt.label}</span>
        </span>
        <span class="${CLASS.menuCheck}">${iconSvg('check')}</span>
      `;

            if (opt.value === getSavedMode()) btn.classList.add('active');

            btn.addEventListener('click', async () => {
                closeMenu();
                await sortRows(opt.value);
            });

            menu.appendChild(btn);
        }

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu.classList.contains('show')) closeMenu();
            else openMenu();
        });

        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) closeMenu();
        });

        wrapper.appendChild(trigger);
        wrapper.appendChild(menu);
        wrapper.appendChild(status);

        controls.prepend(wrapper);
        renderMenuActiveState(getSavedMode());
    }

    async function boot() {
        injectStyle();
        injectUI();
        ensureCompactLayout();

        if (getShowPublishedColumn()) {
            setShowPublishedColumn(true);
            renderPublishedCells();
        } else {
            document.body.classList.remove(CLASS.showPublished);
        }

        await maybeApplySavedSort();

        if (getShowPublishedColumn()) {
            renderPublishedCells();
        }

        ensureCompactLayout();
    }

    function scheduleBoot() {
        clearTimeout(bootTimer);
        bootTimer = setTimeout(() => {
            boot().catch(err => console.error('[alphaXiv-sorter] boot failed:', err));
        }, 120);
    }

    function initObserver() {
        const observer = new MutationObserver(() => {
            if (isSorting) return;
            scheduleBoot();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    function init() {
        setShowPublishedColumn(getShowPublishedColumn());
        scheduleBoot();
        initObserver();
        window.addEventListener('focus', scheduleBoot);
        window.addEventListener('popstate', scheduleBoot);
    }

    init();
})();