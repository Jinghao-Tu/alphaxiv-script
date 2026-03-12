import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTargets, parsePaperLocation } from '../src/switcher.mjs';

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
