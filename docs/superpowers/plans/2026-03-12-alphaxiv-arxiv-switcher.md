# AlphaXiv / arXiv Switcher Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tampermonkey userscript that adds direct switching links between AlphaXiv, arXiv abstract, and arXiv HTML pages for the same paper.

**Architecture:** Keep the runtime simple: one source module owns URL parsing, target generation, page adapters, rendering, and installation flow. Use a tiny Node build script to wrap that module as a distributable userscript file. Test pure logic and DOM behavior with `node:test` and `jsdom`.

**Tech Stack:** JavaScript, Tampermonkey metadata header, Node.js, `node:test`, `jsdom`

---

## File Structure

- Create: `.gitignore` — ignore `node_modules/` and other local-only artifacts, but keep generated userscript output tracked.
- Create: `package.json` — declare project metadata, `test` and `build` scripts, and `jsdom` as a dev dependency.
- Create: `src/switcher.mjs` — single source module containing:
  - URL parsing helpers
  - target link builder
  - page adapter discovery helpers
  - switcher rendering helpers
  - installation flow with duplicate guard and delayed-mount observer logic
- Create: `scripts/build-userscript.mjs` — generate `dist/alphaxiv-arxiv-switcher.user.js` from `src/switcher.mjs` by prepending the userscript metadata header and wrapping the runtime bootstrap.
- Create: `dist/alphaxiv-arxiv-switcher.user.js` — distributable userscript output.
- Create: `tests/switcher.test.mjs` — logic and DOM tests covering URL parsing, target generation, adapter mount discovery, rendering rules, duplicate guard, fallback mount behavior, and delayed mount behavior.
- Create: `README.md` — installation, development, build, test, and manual verification instructions.

## Chunk 1: Scaffold and URL logic

### Task 1: Create the testable project scaffold

**Files:**

- Create: `.gitignore`
- Create: `package.json`

- [ ] **Step 1: Create `.gitignore`**

Add entries for local dependency and test output noise:

```gitignore
node_modules/
```

- [ ] **Step 2: Create `package.json`**

Include scripts and dev dependency:

```json
{
  "name": "alphaxiv-arxiv-switcher",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "build": "node scripts/build-userscript.mjs"
  },
  "devDependencies": {
    "jsdom": "^26.0.0"
  }
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `jsdom` installs successfully and `package-lock.json` is created.

- [ ] **Step 4: Commit scaffold**

Run: `git add .gitignore package.json package-lock.json && git commit -m "chore: add test scaffold"`
Expected: commit succeeds.

### Task 2: Write failing URL and target-generation tests

**Files:**

- Create: `tests/switcher.test.mjs`
- Create: `src/switcher.mjs`

- [ ] **Step 1: Create `tests/switcher.test.mjs` with URL parsing tests**

Start with failing tests like:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePaperLocation, buildTargets } from '../src/switcher.mjs';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL because `src/switcher.mjs` does not yet export the required functions.

- [ ] **Step 3: Create `src/switcher.mjs` skeleton**

Export placeholders only:

```javascript
export function parsePaperLocation(url) {
  throw new Error('Not implemented');
}

export function buildTargets(state) {
  throw new Error('Not implemented');
}
```

- [ ] **Step 4: Run tests to verify they still fail for the right reason**

Run: `npm test`
Expected: FAIL with `Not implemented` errors.

### Task 3: Implement minimal URL logic until tests pass

**Files:**

- Modify: `src/switcher.mjs`
- Test: `tests/switcher.test.mjs`

- [ ] **Step 1: Implement `parsePaperLocation` for new-style and old-style IDs**

Cover these cases:

- `arxiv.org` and `www.arxiv.org`
- `/abs/...` and `/html/...`
- new-style IDs with optional `vN`
- old-style IDs with category path and optional `vN`
- `alphaxiv` URLs

- [ ] **Step 2: Implement `buildTargets`**

Rules:

- AlphaXiv always uses base ID
- arXiv targets preserve version when present
- current page target becomes `null`
- old-style IDs set `arxivHtml` to `null`

- [ ] **Step 3: Expand tests to cover domain normalization and AlphaXiv inputs**

Add tests for:

- `https://www.arxiv.org/abs/1706.03762`
- `https://www.alphaxiv.org/abs/1706.03762`
- `https://www.alphaxiv.org/abs/cs/0112017`

- [ ] **Step 4: Run tests until they pass**

Run: `npm test`
Expected: PASS for all URL and target-generation tests.

- [ ] **Step 5: Commit the URL logic**

Run: `git add src/switcher.mjs tests/switcher.test.mjs && git commit -m "feat: add paper url mapping logic"`
Expected: commit succeeds.

## Chunk 2: DOM adapters, rendering, and duplicate guard

### Task 4: Write failing DOM adapter tests

**Files:**

- Modify: `tests/switcher.test.mjs`
- Modify: `src/switcher.mjs`

- [ ] **Step 1: Add jsdom-based fixture helpers to `tests/switcher.test.mjs`**

Create minimal HTML fixtures for:

- AlphaXiv primary mount
- AlphaXiv fallback mount
- arXiv abstract `Access Paper` block
- arXiv HTML top banner navigation

- [ ] **Step 2: Add failing mount-discovery tests**

Example shape:

```javascript
import { JSDOM } from 'jsdom';
import { findMountPoint } from '../src/switcher.mjs';

test('finds arxiv abs mount after Access Paper list', () => {
  const dom = new JSDOM(`...fixture html...`);
  const mount = findMountPoint(dom.window.document, 'arxiv-abs');
  assert.equal(mount.strategy, 'after-access-paper-list');
});
```

- [ ] **Step 3: Add failing rendering tests**

Verify:

- AlphaXiv new-style renders two links
- AlphaXiv old-style renders one link
- arXiv abs renders `View on:` row with `Abstract` as plain text and `aria-current="page"`
- arXiv abs inserts the new row after the existing link list and before `view license`
- arXiv HTML renders `AlphaXiv` after `Back to abstract page` and before `Download PDF`

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL because mount discovery and rendering helpers do not exist yet.

### Task 5: Implement mount discovery and rendering helpers

**Files:**

- Modify: `src/switcher.mjs`
- Test: `tests/switcher.test.mjs`

- [ ] **Step 1: Implement adapter helpers**

Create helpers such as:

```javascript
export function findMountPoint(document, pageType) { /* ... */ }
export function renderSwitcher(document, state, targets) { /* ... */ }
```

`findMountPoint` should return a stable description, for example:

```javascript
{
  container,
  strategy: 'alphaxiv-primary'
}
```

- [ ] **Step 2: Implement AlphaXiv anchor strategy**

Honor this priority order:

1. top row containing `Paper`, `Blog`, and `Resources`
2. within that row, the actions container next to count/download controls
3. fallback container containing `Hide Tools`

- [ ] **Step 3: Implement arXiv abstract and arXiv HTML anchor strategies**

Honor this priority order:

- arXiv abs: `Access Paper:` block → list with `View PDF`/`HTML (experimental)`/`TeX Source` → insert after list
- arXiv HTML: top banner → `Back to abstract page` link → insert immediately after it

- [ ] **Step 4: Implement switcher markup generation**

Use lightweight DOM creation, not raw HTML strings. Ensure current-state and omitted-target rules match the spec. Add stable attributes for testing and maintenance, for example:

- root marker: `data-alphaxiv-switcher`
- per-link marker: `data-switch-target="alphaxiv|arxiv-abs|arxiv-html"`
- English labels that match the design doc exactly

- [ ] **Step 5: Run tests until adapter and rendering assertions pass**

Run: `npm test`
Expected: PASS for mount discovery and rendering cases.

### Task 6: Write and implement duplicate-guard tests

**Files:**

- Modify: `tests/switcher.test.mjs`
- Modify: `src/switcher.mjs`

- [ ] **Step 1: Add failing tests for duplicate prevention**

Cover:

- running install twice on the same document
- fallback mount exists first, then install runs again
- only one switcher instance remains in the document

- [ ] **Step 2: Add failing tests for stable marker usage**

Assert the rendered switcher root has a dedicated marker, for example:

```javascript
assert.equal(document.querySelectorAll('[data-alphaxiv-switcher]').length, 1);
```

- [ ] **Step 3: Implement duplicate guard in `src/switcher.mjs`**

Behavior:

- scan document for existing switcher marker
- if found, return early
- do not migrate a previously inserted fallback instance during the same page lifecycle

- [ ] **Step 4: Run tests until duplicate-guard cases pass**

Run: `npm test`
Expected: PASS for duplicate-prevention assertions.

- [ ] **Step 5: Commit DOM adapter work**

Run: `git add src/switcher.mjs tests/switcher.test.mjs && git commit -m "feat: add switcher dom adapters"`
Expected: commit succeeds.

## Chunk 3: Delayed mount flow, build output, and docs

### Task 7: Write failing delayed-mount tests

**Files:**

- Modify: `tests/switcher.test.mjs`
- Modify: `src/switcher.mjs`

- [ ] **Step 1: Add a failing test for delayed mount success**

Structure the install flow to accept injected platform APIs:

```javascript
installSwitcher({
  document,
  url,
  MutationObserver,
  setTimeout,
  clearTimeout
});
```

Test a case where:

- first synchronous mount lookup fails
- observer sees a later DOM mutation
- switcher is injected before timeout

- [ ] **Step 2: Add a failing test for 5-second timeout**

Assert:

- no visible error is thrown
- no switcher is inserted
- observer disconnects cleanly

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL because async install flow is incomplete.

### Task 8: Implement delayed-mount installation flow

**Files:**

- Modify: `src/switcher.mjs`
- Test: `tests/switcher.test.mjs`

- [ ] **Step 1: Implement `installSwitcher` orchestration**

Sequence:

1. parse URL
2. build targets
3. return early for unsupported pages
4. return early if a switcher already exists
5. try immediate mount
6. if missing, observe for up to 5000 ms
7. disconnect observer on success or timeout

- [ ] **Step 2: Keep the async path dependency-injectable**

Do not close directly over global timer or observer objects; pass them through defaults so tests can stub them.

- [ ] **Step 3: Run tests until delayed-mount cases pass**

Run: `npm test`
Expected: PASS for timeout and delayed mount cases.

### Task 9: Build the distributable userscript

**Files:**

- Create: `scripts/build-userscript.mjs`
- Create: `dist/alphaxiv-arxiv-switcher.user.js`
- Modify: `src/switcher.mjs`

- [ ] **Step 1: Add a failing build smoke test**

In `tests/switcher.test.mjs`, add a test that:

- runs `node scripts/build-userscript.mjs`
- asserts `dist/alphaxiv-arxiv-switcher.user.js` exists
- asserts the output contains the metadata header, the expected userscript name, and the required `@match` entries

Because the build script does not exist yet, this test should fail first.

- [ ] **Step 2: Run tests to verify the build smoke test fails**

Run: `npm test`
Expected: FAIL because `scripts/build-userscript.mjs` does not yet exist.

- [ ] **Step 3: Add a userscript metadata header in `scripts/build-userscript.mjs`**

Header should include at least:

```javascript
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
```

- [ ] **Step 4: Generate `dist/alphaxiv-arxiv-switcher.user.js` from `src/switcher.mjs`**

The build output should bootstrap the browser runtime by calling `installSwitcher(...)` with real browser globals.

- [ ] **Step 5: Run tests until the build smoke test passes**

Run: `npm test`
Expected: PASS for the build smoke test and all existing tests.

- [ ] **Step 6: Run the build explicitly**

Run: `npm run build`
Expected: `dist/alphaxiv-arxiv-switcher.user.js` is created or updated successfully.

- [ ] **Step 7: Run build and tests in release order**

Run: `npm run build && npm test`
Expected: both commands succeed, and the tested output matches the latest source.

### Task 10: Write README and finish verification

**Files:**

- Create: `README.md`
- Modify: `dist/alphaxiv-arxiv-switcher.user.js`
- Modify: `tests/switcher.test.mjs`

- [ ] **Step 1: Create `README.md`**

Include:

- what the script does
- supported page types
- install instructions for Tampermonkey
- how to run tests
- how to rebuild the distributable userscript
- manual verification URLs

- [ ] **Step 2: Perform manual verification on the sample URLs**

Check each URL explicitly:

- `https://www.alphaxiv.org/abs/1706.03762` shows `arXiv Abs` and `arXiv HTML`
- `https://www.arxiv.org/abs/1706.03762` shows `View on: AlphaXiv | Abstract | HTML`
- `https://www.arxiv.org/html/1706.03762` shows `AlphaXiv` after `Back to abstract page` and before `Download PDF`
- `https://www.arxiv.org/abs/1706.03762v7` preserves `v7` in generated arXiv targets
- `https://www.arxiv.org/html/1706.03762v7` preserves `v7` in the abstract target
- `https://www.alphaxiv.org/abs/cs/0112017` omits `HTML`
- `https://www.arxiv.org/abs/cs/0112017v1` omits `HTML`

- [ ] **Step 3: Run the full verification suite**

Run: `npm run build && npm test`
Expected: all automated checks pass.

- [ ] **Step 4: Commit the finished implementation**

Run: `git add README.md src/switcher.mjs scripts/build-userscript.mjs dist/alphaxiv-arxiv-switcher.user.js tests/switcher.test.mjs && git commit -m "feat: add alphaxiv arxiv switcher userscript"`
Expected: commit succeeds.

## Plan review checkpoints

### After Chunk 1

Dispatch a reviewer for the chunk and verify that URL parsing and target rules match the design doc exactly.

### After Chunk 2

Dispatch a reviewer for the chunk and verify that anchor strategies, current-state rendering, and duplicate guard match the design doc exactly.

### After Chunk 3

Dispatch a reviewer for the chunk and verify that delayed mount behavior, build output, README, and manual verification coverage match the design doc exactly.
