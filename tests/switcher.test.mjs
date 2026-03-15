import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
    buildTargets,
    findMountPoint,
    installSwitcher,
    parsePaperLocation,
    renderSwitcher
} from '../src/switcher.mjs';

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const TESTS_DIR = dirname(TEST_FILE_PATH);
const REPO_ROOT = resolve(TESTS_DIR, '..');
const DIST_FILE_PATH = resolve(REPO_ROOT, 'dist/alphaxiv-arxiv-switcher.user.js');

function createDom(html, url) {
    return new JSDOM(html, { url });
}

function normalizeInlineText(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function createAlphaXivPrimaryFixture() {
    return `
    <main>
      <section>
        <div id="alpha-primary-row" class="top-actions-row">
          <div class="nav-links">
            <a href="#paper">Paper</a>
            <a href="#blog">Blog</a>
            <a href="#resources">Resources</a>
          </div>
          <div id="alpha-primary-actions" class="action-controls">
            <button type="button">12</button>
            <button type="button">Download</button>
          </div>
        </div>
      </section>
    </main>
  `;
}

function createAlphaXivPrimaryLiveFixture() {
    return `
        <main>
            <section>
                <div id="alpha-live-row" class="top-actions-row">
                    <div class="nav-links">
                        <a href="#paper">Paper</a>
                        <a href="#blog">Blog</a>
                        <a href="#resources">Resources</a>
                    </div>
                    <div id="alpha-live-actions" class="action-controls">
                        <div id="alpha-live-left-toolbar" class="metrics-group">
                            <button type="button">993</button>
                            <button type="button" aria-label="Copy share link"></button>
                            <img alt="Download Paper's PDF" src="/download.svg">
                            <img alt="Bookmark" src="/bookmark.svg">
                        </div>
                        <div id="alpha-live-center-controls" class="pager-controls">
                            <input type="text" disabled value="-">
                            <span>/ -</span>
                        </div>
                        <div class="tool-toggle">
                            <button type="button">Hide Tools</button>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    `;
}

function createAlphaXivFallbackFixture() {
    return `
    <main>
      <div id="alpha-fallback-tools" class="tools-shell">
        <button type="button">Hide Tools</button>
      </div>
    </main>
  `;
}

function createAlphaXivLeftToolbarFixture() {
    return `
        <main>
            <section>
                <div id="alpha-tabs">
                    <a href="#paper">Paper</a>
                    <a href="#blog">Blog</a>
                    <a href="#resources">Resources</a>
                </div>
                <div id="alpha-toolbar-row">
                    <div id="alpha-left-toolbar">
                        <button type="button" aria-label="Like">61</button>
                        <button type="button" aria-label="Bookmark"></button>
                        <button type="button" aria-label="Download"></button>
                        <button type="button" aria-label="Info"></button>
                        <button type="button" aria-label="Share"></button>
                    </div>
                    <div id="alpha-center-controls">
                        <span>1 / 24</span>
                    </div>
                    <div id="alpha-right-tools">
                        <button type="button">Hide Tools</button>
                    </div>
                </div>
            </section>
        </main>
    `;
}

function createArxivAbsFixture() {
    return `
    <main>
      <section id="access-paper-block">
        <h2>Access Paper:</h2>
                <ul id="access-paper-links">
                    <li><a href="/pdf/1706.03762">View PDF</a></li>
                    <li><a href="/html/1706.03762">HTML (experimental)</a></li>
                    <li><a href="/e-print/1706.03762">TeX Source</a></li>
                </ul>
        <a id="view-license" href="/license">view license</a>
      </section>
    </main>
  `;
}

function createAlphaXivNoisyHideToolsFixture() {
    return `
        <main>
            <section>
                <div id="alpha-primary-row">
                    <div class="nav-links">
                        <a href="#paper">Paper</a>
                        <a href="#blog">Blog</a>
                        <a href="#resources">Resources</a>
                    </div>
                    <div id="alpha-primary-actions" class="action-controls">
                        <button type="button">12</button>
                        <button type="button">Download</button>
                    </div>
                </div>
                <div id="alpha-noise-row">
                    <div id="alpha-noise-left">
                        <button type="button" aria-label="Noise A"></button>
                        <button type="button" aria-label="Noise B"></button>
                        <button type="button" aria-label="Noise C"></button>
                        <img alt="noise icon" src="/noise.svg">
                    </div>
                    <div id="alpha-noise-right">
                        <button type="button">Hide Tools</button>
                    </div>
                </div>
            </section>
        </main>
    `;
}

function createAlphaXivMultipleHideToolsFixture() {
    return `
        <main>
            <section>
                <div id="alpha-unrelated-row">
                    <div id="alpha-unrelated-right">
                        <button type="button">Hide Tools</button>
                    </div>
                </div>
                <div id="alpha-target-toolbar-row">
                    <div id="alpha-target-left-toolbar">
                        <button type="button" aria-label="Like">993</button>
                        <button type="button" aria-label="Bookmark"></button>
                        <img alt="Download Paper's PDF" src="/download.svg">
                        <img alt="Share" src="/share.svg">
                    </div>
                    <div id="alpha-target-center-controls">
                        <span>1 / 15</span>
                    </div>
                    <div id="alpha-target-right-tools">
                        <button type="button">Hide Tools</button>
                    </div>
                </div>
            </section>
        </main>
    `;
}

function createArxivAbsNestedLicenseFixture() {
    return `
        <main>
            <section class="extra-services">
                <div class="full-text">
                    <span class="descriptor">Full-text links:</span>
                    <h2>Access Paper:</h2>
                    <ul id="access-paper-links">
                        <li><a href="/pdf/1706.03762">View PDF</a></li>
                        <li><a href="/html/1706.03762">HTML (experimental)</a></li>
                        <li><a href="/src/1706.03762">TeX Source</a></li>
                    </ul>
                    <div id="license-block" class="abs-license">
                        <a id="view-license" href="/license">view license</a>
                    </div>
                </div>
            </section>
        </main>
    `;
}

function createArxivHtmlFixture() {
    return `
    <main>
      <nav id="html-nav" class="top-banner-nav">
        <a id="back-to-abstract" href="/abs/1706.03762">Back to abstract page</a>
        <a id="download-pdf" href="/pdf/1706.03762">Download PDF</a>
      </nav>
    </main>
  `;
}

function createArxivAbsOldStyleFixture() {
    return `
        <main>
            <section class="extra-services">
                <div class="full-text">
                    <span class="descriptor">Full-text links:</span>
                    <h2>Access Paper:</h2>
                    <ul id="access-paper-links">
                        <li><a href="/pdf/cs/0112017v1">View PDF</a></li>
                    </ul>
                    <div id="license-block" class="abs-license">
                        <a id="view-license" href="/license">view license</a>
                    </div>
                </div>
            </section>
        </main>
    `;
}

function createArxivHtmlCurrentFixture() {
    return `
        <main>
            <header class="arxiv-html-header">
                <nav id="html-nav" class="html-header-nav">
                    <a id="back-to-abstract" href="/abs/1706.03762v7">Back to Abstract</a>
                    <a id="download-pdf" href="/pdf/1706.03762v7">Download PDF</a>
                </nav>
            </header>
        </main>
    `;
}

function createArxivHtmlWithoutDownloadFixture() {
    return `
        <main>
            <header class="arxiv-html-header">
                <nav id="html-nav" class="html-header-nav">
                    <a id="back-to-abstract" href="/abs/1706.03762v7">Back to abstract page</a>

                    <a id="toggle-reading" href="#">Toggle reading mode</a>
                </nav>
            </header>
        </main>
    `;
}

function createAsyncInstallHarness() {
    const observers = [];
    const timers = new Map();
    const clearedTimeouts = [];
    let nextTimeoutId = 1;

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.disconnectCalls = 0;
            this.observeCalls = [];
            observers.push(this);
        }

        observe(target, options) {
            this.observeCalls.push({ target, options });
        }

        disconnect() {
            this.disconnectCalls += 1;
        }

        trigger(records = [{ type: 'childList' }]) {
            this.callback(records, this);
        }
    }

    return {
        MutationObserver: FakeMutationObserver,
        setTimeout(callback, delay) {
            const id = nextTimeoutId;
            nextTimeoutId += 1;
            timers.set(id, { callback, delay });
            return id;
        },
        clearTimeout(id) {
            clearedTimeouts.push(id);
            timers.delete(id);
        },
        observers,
        timers,
        clearedTimeouts,
        runTimeout(id = Array.from(timers.keys())[0]) {
            const timer = timers.get(id);

            assert.ok(timer, `Expected timer ${id} to exist`);
            timers.delete(id);
            timer.callback();
        }
    };
}

function getSwitchTargets(root) {
    return Array.from(root.querySelectorAll('[data-switch-target]')).map((element) => ({
        target: element.getAttribute('data-switch-target'),
        text: element.textContent.trim(),
        href: element.getAttribute('href'),
        ariaLabel: element.getAttribute('aria-label'),
        title: element.getAttribute('title')
    }));
}

test('parse new-style abs URL without version', () => {
    assert.deepEqual(parsePaperLocation('https://arxiv.org/abs/1706.03762'), {
        pageType: 'arxiv-abs',
        baseId: '1706.03762',
        version: null,
        idStyle: 'new'
    });
});

test('parse new-style html URL with version', () => {
    assert.deepEqual(parsePaperLocation('https://arxiv.org/html/1706.03762v7'), {
        pageType: 'arxiv-html',
        baseId: '1706.03762',
        version: 'v7',
        idStyle: 'new'
    });
});

test('build targets for old-style abs hides html target', () => {
    const state = parsePaperLocation('https://arxiv.org/abs/cs/0112017v1');

    assert.deepEqual(buildTargets(state), {
        alphaxiv: 'https://www.alphaxiv.org/abs/cs/0112017',
        arxivAbs: null,
        arxivHtml: null
    });
});

test('preserves version when building html target from versioned abs input', () => {
    const state = parsePaperLocation('https://arxiv.org/abs/1706.03762v7');

    assert.deepEqual(buildTargets(state), {
        alphaxiv: 'https://www.alphaxiv.org/abs/1706.03762',
        arxivAbs: null,
        arxivHtml: 'https://arxiv.org/html/1706.03762v7'
    });
});

test('preserves version when building abs target from versioned html input', () => {
    const state = parsePaperLocation('https://arxiv.org/html/1706.03762v7');

    assert.deepEqual(buildTargets(state), {
        alphaxiv: 'https://www.alphaxiv.org/abs/1706.03762',
        arxivAbs: 'https://arxiv.org/abs/1706.03762v7',
        arxivHtml: null
    });
});

test('normalizes www.arxiv.org abs URL parsing', () => {
    assert.deepEqual(parsePaperLocation('https://www.arxiv.org/abs/1706.03762'), {
        pageType: 'arxiv-abs',
        baseId: '1706.03762',
        version: null,
        idStyle: 'new'
    });
});

test('builds arxiv targets from AlphaXiv new-style input', () => {
    const state = parsePaperLocation('https://www.alphaxiv.org/abs/1706.03762');

    assert.deepEqual(buildTargets(state), {
        alphaxiv: null,
        arxivAbs: 'https://arxiv.org/abs/1706.03762',
        arxivHtml: 'https://arxiv.org/html/1706.03762'
    });
});

test('builds only abs target from AlphaXiv old-style input', () => {
    const state = parsePaperLocation('https://www.alphaxiv.org/abs/cs/0112017');

    assert.deepEqual(buildTargets(state), {
        alphaxiv: null,
        arxivAbs: 'https://arxiv.org/abs/cs/0112017',
        arxivHtml: null
    });
});

test('findMountPoint uses AlphaXiv primary actions container when available', () => {
    const dom = createDom(
        createAlphaXivPrimaryFixture(),
        'https://www.alphaxiv.org/abs/1706.03762'
    );
    const mount = findMountPoint(dom.window.document, 'alphaxiv');

    assert.equal(mount.strategy, 'alphaxiv-primary');
    assert.equal(mount.container.id, 'alpha-primary-actions');
});

test('findMountPoint falls back to Hide Tools container on AlphaXiv', () => {
    const dom = createDom(
        createAlphaXivFallbackFixture(),
        'https://www.alphaxiv.org/abs/1706.03762'
    );
    const mount = findMountPoint(dom.window.document, 'alphaxiv');

    assert.equal(mount.strategy, 'alphaxiv-fallback');
    assert.equal(mount.container.id, 'alpha-fallback-tools');
});

test('findMountPoint uses AlphaXiv left icon toolbar on the live toolbar structure', () => {
    const dom = createDom(
        createAlphaXivPrimaryLiveFixture(),
        'https://www.alphaxiv.org/abs/1706.03762'
    );
    const mount = findMountPoint(dom.window.document, 'alphaxiv');

    assert.equal(mount.strategy, 'alphaxiv-left-toolbar');
    assert.equal(mount.container.id, 'alpha-live-left-toolbar');
});

test('findMountPoint prefers AlphaXiv left icon toolbar when available', () => {
    const dom = createDom(
        createAlphaXivLeftToolbarFixture(),
        'https://www.alphaxiv.org/abs/1706.03762'
    );
    const mount = findMountPoint(dom.window.document, 'alphaxiv');

    assert.equal(mount.strategy, 'alphaxiv-left-toolbar');
    assert.equal(mount.container.id, 'alpha-left-toolbar');
});

test('findMountPoint does not mis-select noisy left controls as AlphaXiv icon toolbar', () => {
    const dom = createDom(
        createAlphaXivNoisyHideToolsFixture(),
        'https://www.alphaxiv.org/abs/1706.03762'
    );
    const mount = findMountPoint(dom.window.document, 'alphaxiv');

    assert.equal(mount.strategy, 'alphaxiv-primary');
    assert.equal(mount.container.id, 'alpha-primary-actions');
});

test('findMountPoint picks target icon toolbar when multiple Hide Tools controls exist', () => {
    const dom = createDom(
        createAlphaXivMultipleHideToolsFixture(),
        'https://www.alphaxiv.org/abs/2502.11374'
    );
    const mount = findMountPoint(dom.window.document, 'alphaxiv');

    assert.equal(mount.strategy, 'alphaxiv-left-toolbar');
    assert.equal(mount.container.id, 'alpha-target-left-toolbar');
});

test('findMountPoint finds arXiv abs insertion point after Access Paper links', () => {
    const dom = createDom(createArxivAbsFixture(), 'https://arxiv.org/abs/1706.03762');
    const mount = findMountPoint(dom.window.document, 'arxiv-abs');

    assert.equal(mount.strategy, 'in-access-paper-list');
    assert.equal(mount.container.id, 'access-paper-links');
    assert.equal(mount.insertBefore, null);
});

test('findMountPoint finds arXiv HTML insertion point after Back to abstract page', () => {
    const dom = createDom(createArxivHtmlFixture(), 'https://arxiv.org/html/1706.03762');
    const mount = findMountPoint(dom.window.document, 'arxiv-html');

    assert.equal(mount.strategy, 'after-back-to-abstract-link');
    assert.equal(mount.container.id, 'html-nav');
    assert.equal(mount.insertBefore.id, 'download-pdf');
});

test('renderSwitcher renders two links for AlphaXiv new-style pages', () => {
    const dom = createDom(
        '<main></main>',
        'https://www.alphaxiv.org/abs/1706.03762'
    );
    const state = parsePaperLocation('https://www.alphaxiv.org/abs/1706.03762');
    const root = renderSwitcher(dom.window.document, state, buildTargets(state));

    assert.equal(root.getAttribute('data-alphaxiv-switcher'), '');
    assert.equal(root.style.gap, '0.5rem');
    const iconLinks = root.querySelectorAll('a[data-switch-target]');
    assert.equal(iconLinks.length, 2);

    for (const iconLink of iconLinks) {
        assert.equal(iconLink.style.minInlineSize, '1.5rem');
        assert.equal(iconLink.style.blockSize, '1.35rem');
        assert.equal(iconLink.style.borderRadius, '0.45rem');
        assert.equal(iconLink.style.fontWeight, '600');
    }

    assert.deepEqual(getSwitchTargets(root), [
        {
            target: 'arxiv-abs',
            text: 'A',
            href: 'https://arxiv.org/abs/1706.03762',
            ariaLabel: 'Open arXiv abstract',
            title: 'arXiv Abstract'
        },
        {
            target: 'arxiv-html',
            text: 'H',
            href: 'https://arxiv.org/html/1706.03762',
            ariaLabel: 'Open arXiv HTML',
            title: 'arXiv HTML'
        }
    ]);
});

test('renderSwitcher omits HTML target for AlphaXiv old-style pages', () => {
    const dom = createDom(
        '<main></main>',
        'https://www.alphaxiv.org/abs/cs/0112017'
    );
    const state = parsePaperLocation('https://www.alphaxiv.org/abs/cs/0112017');
    const root = renderSwitcher(dom.window.document, state, buildTargets(state));

    assert.deepEqual(getSwitchTargets(root), [
        {
            target: 'arxiv-abs',
            text: 'A',
            href: 'https://arxiv.org/abs/cs/0112017',
            ariaLabel: 'Open arXiv abstract',
            title: 'arXiv Abstract'
        }
    ]);
});

test('renderSwitcher keeps arXiv abs panel minimal with only AlphaXiv link', () => {
    const dom = createDom('<main></main>', 'https://arxiv.org/abs/1706.03762');
    const state = parsePaperLocation('https://arxiv.org/abs/1706.03762');
    const root = renderSwitcher(dom.window.document, state, buildTargets(state));

    assert.equal(normalizeInlineText(root.textContent), 'AlphaXiv');
    assert.deepEqual(getSwitchTargets(root), [
        {
            target: 'alphaxiv',
            text: 'AlphaXiv',
            href: 'https://www.alphaxiv.org/abs/1706.03762',
            ariaLabel: null,
            title: null
        }
    ]);
});

test('renderSwitcher keeps arXiv HTML switcher clean without visual separators', () => {
    const dom = createDom('<main></main>', 'https://arxiv.org/html/1706.03762');
    const state = parsePaperLocation('https://arxiv.org/html/1706.03762');
    const root = renderSwitcher(dom.window.document, state, buildTargets(state));

    assert.equal(normalizeInlineText(root.textContent), 'AlphaXiv');
    assert.equal(root.textContent.includes('|'), false);
});

test('installSwitcher inserts arXiv abs row after Access Paper links and before view license', () => {
    const dom = createDom(createArxivAbsFixture(), 'https://arxiv.org/abs/1706.03762');
    const { document } = dom.window;
    const links = document.getElementById('access-paper-links');
    const license = document.getElementById('view-license');

    installSwitcher({ document, url: 'https://arxiv.org/abs/1706.03762' });

    const switcher = document.querySelector('[data-alphaxiv-switcher]');
    assert.equal(switcher.parentElement, links);
    assert.equal(links.lastElementChild, switcher);
    assert.equal(links.nextElementSibling, license);
});

test('installSwitcher inserts arXiv abs row before a nested license block on the real page structure', () => {
    const dom = createDom(
        createArxivAbsNestedLicenseFixture(),
        'https://arxiv.org/abs/1706.03762'
    );
    const { document } = dom.window;
    const links = document.getElementById('access-paper-links');
    const licenseBlock = document.getElementById('license-block');

    assert.doesNotThrow(() => {
        installSwitcher({ document, url: 'https://arxiv.org/abs/1706.03762' });
    });

    const switcher = document.querySelector('[data-alphaxiv-switcher]');
    assert.equal(switcher.parentElement, links);
    assert.equal(links.lastElementChild, switcher);
    assert.equal(links.nextElementSibling, licenseBlock);
    assert.equal(switcher.style.marginInlineStart, '');
});

test('installSwitcher inserts an old-style arXiv abs row when Access Paper only exposes View PDF', () => {
    const dom = createDom(
        createArxivAbsOldStyleFixture(),
        'https://arxiv.org/abs/cs/0112017v1'
    );
    const { document } = dom.window;
    const links = document.getElementById('access-paper-links');
    const licenseBlock = document.getElementById('license-block');

    installSwitcher({ document, url: 'https://arxiv.org/abs/cs/0112017v1' });

    const switcher = document.querySelector('[data-alphaxiv-switcher]');
    assert.ok(switcher);
    assert.equal(switcher.parentElement, links);
    assert.equal(links.lastElementChild, switcher);
    assert.equal(links.nextElementSibling, licenseBlock);
    assert.deepEqual(getSwitchTargets(switcher), [
        {
            target: 'alphaxiv',
            text: 'AlphaXiv',
            href: 'https://www.alphaxiv.org/abs/cs/0112017',
            ariaLabel: null,
            title: null
        }
    ]);
});

test('installSwitcher inserts arXiv HTML switcher after Back to abstract page and before Download PDF', () => {
    const dom = createDom(createArxivHtmlFixture(), 'https://arxiv.org/html/1706.03762');
    const { document } = dom.window;
    const backLink = document.getElementById('back-to-abstract');
    const downloadLink = document.getElementById('download-pdf');

    installSwitcher({ document, url: 'https://arxiv.org/html/1706.03762' });

    const switcher = document.querySelector('[data-alphaxiv-switcher]');
    assert.equal(backLink.nextElementSibling, switcher);
    assert.equal(switcher.nextElementSibling, downloadLink);
    assert.equal(switcher.previousSibling, backLink);
    assert.equal(switcher.nextSibling, downloadLink);
    assert.equal(switcher.tagName, 'A');

    const navText = normalizeInlineText(document.getElementById('html-nav').textContent);
    assert.equal(navText.includes('|'), false);
    assert.equal(normalizeInlineText(switcher.textContent), 'AlphaXiv');
    assert.equal(switcher.style.marginInline, '');
});

test('installSwitcher uses the correct AlphaXiv icon toolbar when the page has multiple Hide Tools controls', () => {
    const dom = createDom(
        createAlphaXivMultipleHideToolsFixture(),
        'https://www.alphaxiv.org/abs/2502.11374'
    );
    const { document } = dom.window;
    const targetLeftToolbar = document.getElementById('alpha-target-left-toolbar');

    installSwitcher({ document, url: 'https://www.alphaxiv.org/abs/2502.11374' });

    const switcher = document.querySelector('[data-alphaxiv-switcher]');
    assert.ok(switcher);
    assert.equal(switcher.parentElement, targetLeftToolbar);
});

test('installSwitcher inserts arXiv HTML switcher after Back to Abstract on the current page copy', () => {
    const dom = createDom(createArxivHtmlCurrentFixture(), 'https://arxiv.org/html/1706.03762');
    const { document } = dom.window;
    const backLink = document.getElementById('back-to-abstract');
    const downloadLink = document.getElementById('download-pdf');

    installSwitcher({ document, url: 'https://arxiv.org/html/1706.03762' });

    const switcher = document.querySelector('[data-alphaxiv-switcher]');
    assert.ok(switcher);
    assert.equal(backLink.nextElementSibling, switcher);
    assert.equal(switcher.nextElementSibling, downloadLink);
});

test('installSwitcher inserts arXiv HTML switcher without throwing when Download PDF link is missing', () => {
    const dom = createDom(
        createArxivHtmlWithoutDownloadFixture(),
        'https://arxiv.org/html/1706.03762v7'
    );
    const { document } = dom.window;
    const backLink = document.getElementById('back-to-abstract');
    const toggleReading = document.getElementById('toggle-reading');

    assert.doesNotThrow(() => {
        installSwitcher({ document, url: 'https://arxiv.org/html/1706.03762v7' });
    });

    const switcher = document.querySelector('[data-alphaxiv-switcher]');
    assert.ok(switcher);
    assert.equal(backLink.nextSibling, switcher);
    assert.equal(switcher.nextSibling, toggleReading);
    assert.equal(switcher.tagName, 'A');
});

test('installSwitcher re-injects AlphaXiv icon buttons if a transient rerender removes them', () => {
    const dom = createDom(
        createAlphaXivLeftToolbarFixture(),
        'https://www.alphaxiv.org/abs/1706.03762'
    );
    const { document } = dom.window;
    const harness = createAsyncInstallHarness();

    installSwitcher({
        document,
        url: 'https://www.alphaxiv.org/abs/1706.03762',
        MutationObserver: harness.MutationObserver,
        setTimeout: harness.setTimeout,
        clearTimeout: harness.clearTimeout
    });

    const firstSwitcher = document.querySelector('[data-alphaxiv-switcher]');
    assert.ok(firstSwitcher);
    assert.equal(harness.observers.length >= 1, true);

    firstSwitcher.remove();
    harness.observers[0].trigger();

    const reinjectedSwitcher = document.querySelector('[data-alphaxiv-switcher]');
    assert.ok(reinjectedSwitcher);
});

test('installSwitcher keeps only one switcher when run twice on the same document', () => {
    const dom = createDom(
        createAlphaXivPrimaryFixture(),
        'https://www.alphaxiv.org/abs/1706.03762'
    );
    const { document } = dom.window;

    installSwitcher({ document, url: 'https://www.alphaxiv.org/abs/1706.03762' });
    installSwitcher({ document, url: 'https://www.alphaxiv.org/abs/1706.03762' });

    assert.equal(document.querySelectorAll('[data-alphaxiv-switcher]').length, 1);
});

test('installSwitcher injects AlphaXiv links into left icon toolbar when available', () => {
    const dom = createDom(
        createAlphaXivLeftToolbarFixture(),
        'https://www.alphaxiv.org/abs/1706.03762'
    );
    const { document } = dom.window;
    const leftToolbar = document.getElementById('alpha-left-toolbar');

    installSwitcher({ document, url: 'https://www.alphaxiv.org/abs/1706.03762' });

    const switcher = document.querySelector('[data-alphaxiv-switcher]');
    assert.ok(switcher);
    assert.equal(switcher.parentElement, leftToolbar);
    assert.deepEqual(getSwitchTargets(switcher), [
        {
            target: 'arxiv-abs',
            text: 'A',
            href: 'https://arxiv.org/abs/1706.03762',
            ariaLabel: 'Open arXiv abstract',
            title: 'arXiv Abstract'
        },
        {
            target: 'arxiv-html',
            text: 'H',
            href: 'https://arxiv.org/html/1706.03762',
            ariaLabel: 'Open arXiv HTML',
            title: 'arXiv HTML'
        }
    ]);
});

test('installSwitcher does not migrate a fallback switcher when primary mount appears later', () => {
    const dom = createDom(
        createAlphaXivFallbackFixture(),
        'https://www.alphaxiv.org/abs/1706.03762'
    );
    const { document } = dom.window;

    installSwitcher({ document, url: 'https://www.alphaxiv.org/abs/1706.03762' });

    const primaryHost = document.createElement('div');
    primaryHost.innerHTML = createAlphaXivPrimaryFixture();
    document.body.append(primaryHost);

    installSwitcher({ document, url: 'https://www.alphaxiv.org/abs/1706.03762' });

    const switchers = document.querySelectorAll('[data-alphaxiv-switcher]');
    assert.equal(switchers.length, 1);
    assert.equal(switchers[0].parentElement.id, 'alpha-fallback-tools');
});

test('installSwitcher injects after a delayed mount appears through observed DOM changes', () => {
    const dom = createDom('<main id="shell"></main>', 'https://arxiv.org/abs/1706.03762');
    const { document } = dom.window;
    const harness = createAsyncInstallHarness();

    installSwitcher({
        document,
        url: 'https://arxiv.org/abs/1706.03762',
        MutationObserver: harness.MutationObserver,
        setTimeout: harness.setTimeout,
        clearTimeout: harness.clearTimeout
    });

    assert.equal(document.querySelector('[data-alphaxiv-switcher]'), null);
    assert.equal(harness.observers.length, 1);
    assert.equal(Array.from(harness.timers.values())[0].delay, 5000);

    const delayedMountHost = document.createElement('div');
    delayedMountHost.innerHTML = createArxivAbsFixture();
    document.body.append(delayedMountHost);

    harness.observers[0].trigger();

    const switcher = document.querySelector('[data-alphaxiv-switcher]');
    const links = document.getElementById('access-paper-links');
    const license = document.getElementById('view-license');

    assert.equal(switcher.parentElement, links);
    assert.equal(links.lastElementChild, switcher);
    assert.equal(links.nextElementSibling, license);
});

test('installSwitcher disconnects the observer and clears the timeout after delayed injection succeeds', () => {
    const dom = createDom('<main id="shell"></main>', 'https://arxiv.org/abs/1706.03762');
    const { document } = dom.window;
    const harness = createAsyncInstallHarness();

    installSwitcher({
        document,
        url: 'https://arxiv.org/abs/1706.03762',
        MutationObserver: harness.MutationObserver,
        setTimeout: harness.setTimeout,
        clearTimeout: harness.clearTimeout
    });

    const delayedMountHost = document.createElement('div');
    delayedMountHost.innerHTML = createArxivAbsFixture();
    document.body.append(delayedMountHost);

    harness.observers[0].trigger();

    assert.equal(harness.observers[0].disconnectCalls, 1);
    assert.deepEqual(harness.clearedTimeouts, [1]);
    assert.equal(harness.timers.size, 0);
});

test('installSwitcher exits silently after waiting 5 seconds without a mount point', () => {
    const dom = createDom('<main id="shell"></main>', 'https://arxiv.org/abs/1706.03762');
    const { document } = dom.window;
    const harness = createAsyncInstallHarness();

    installSwitcher({
        document,
        url: 'https://arxiv.org/abs/1706.03762',
        MutationObserver: harness.MutationObserver,
        setTimeout: harness.setTimeout,
        clearTimeout: harness.clearTimeout
    });

    assert.doesNotThrow(() => {
        harness.runTimeout();
    });
    assert.equal(document.querySelector('[data-alphaxiv-switcher]'), null);
});

test('installSwitcher disconnects the observer after delayed mount times out', () => {
    const dom = createDom('<main id="shell"></main>', 'https://arxiv.org/abs/1706.03762');
    const { document } = dom.window;
    const harness = createAsyncInstallHarness();

    installSwitcher({
        document,
        url: 'https://arxiv.org/abs/1706.03762',
        MutationObserver: harness.MutationObserver,
        setTimeout: harness.setTimeout,
        clearTimeout: harness.clearTimeout
    });

    harness.runTimeout();

    assert.equal(harness.observers[0].disconnectCalls, 1);
});

test('build smoke test writes a distributable userscript with required metadata', () => {
    rmSync(DIST_FILE_PATH, { force: true });

    execFileSync('node', ['scripts/build-userscript.mjs'], {
        cwd: REPO_ROOT,
        stdio: 'pipe'
    });

    assert.equal(existsSync(DIST_FILE_PATH), true);

    const output = readFileSync(DIST_FILE_PATH, 'utf8');

    assert.match(output, /^\/\/ ==UserScript==/m);
    assert.match(output, /@name\s+AlphaXiv \/ arXiv Switcher/);

    for (const matchEntry of [
        '@match        https://www.alphaxiv.org/abs/*',
        '@match        https://arxiv.org/abs/*',
        '@match        https://www.arxiv.org/abs/*',
        '@match        https://arxiv.org/html/*',
        '@match        https://www.arxiv.org/html/*'
    ]) {
        assert.match(output, new RegExp(matchEntry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
});
