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

function createAlphaXivFallbackFixture() {
    return `
    <main>
      <div id="alpha-fallback-tools" class="tools-shell">
        <button type="button">Hide Tools</button>
      </div>
    </main>
  `;
}

function createArxivAbsFixture() {
    return `
    <main>
      <section id="access-paper-block">
        <h2>Access Paper:</h2>
        <div id="access-paper-links">
          <a href="/pdf/1706.03762">View PDF</a>
          <a href="/html/1706.03762">HTML (experimental)</a>
          <a href="/e-print/1706.03762">TeX Source</a>
        </div>
        <a id="view-license" href="/license">view license</a>
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
        href: element.getAttribute('href')
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

test('findMountPoint finds arXiv abs insertion point after Access Paper links', () => {
    const dom = createDom(createArxivAbsFixture(), 'https://arxiv.org/abs/1706.03762');
    const mount = findMountPoint(dom.window.document, 'arxiv-abs');

    assert.equal(mount.strategy, 'after-access-paper-list');
    assert.equal(mount.container.id, 'access-paper-block');
    assert.equal(mount.insertBefore.id, 'view-license');
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
    assert.deepEqual(getSwitchTargets(root), [
        {
            target: 'arxiv-abs',
            text: 'arXiv Abs',
            href: 'https://arxiv.org/abs/1706.03762'
        },
        {
            target: 'arxiv-html',
            text: 'arXiv HTML',
            href: 'https://arxiv.org/html/1706.03762'
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
            text: 'arXiv Abs',
            href: 'https://arxiv.org/abs/cs/0112017'
        }
    ]);
});

test('renderSwitcher marks Abstract as the current page on arXiv abs', () => {
    const dom = createDom('<main></main>', 'https://arxiv.org/abs/1706.03762');
    const state = parsePaperLocation('https://arxiv.org/abs/1706.03762');
    const root = renderSwitcher(dom.window.document, state, buildTargets(state));
    const current = root.querySelector('[data-switch-target="arxiv-abs"]');

    assert.match(root.textContent, /View on:/);
    assert.equal(current.textContent.trim(), 'Abstract');
    assert.equal(current.getAttribute('aria-current'), 'page');
    assert.equal(current.hasAttribute('href'), false);
});

test('installSwitcher inserts arXiv abs row after Access Paper links and before view license', () => {
    const dom = createDom(createArxivAbsFixture(), 'https://arxiv.org/abs/1706.03762');
    const { document } = dom.window;
    const links = document.getElementById('access-paper-links');
    const license = document.getElementById('view-license');

    installSwitcher({ document, url: 'https://arxiv.org/abs/1706.03762' });

    const switcher = document.querySelector('[data-alphaxiv-switcher]');
    assert.equal(links.nextElementSibling, switcher);
    assert.equal(switcher.nextElementSibling, license);
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

    assert.equal(links.nextElementSibling, switcher);
    assert.equal(switcher.nextElementSibling, license);
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
