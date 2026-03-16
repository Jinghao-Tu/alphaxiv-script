import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_FILE_PATH = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = dirname(SCRIPT_FILE_PATH);
const REPO_ROOT = resolve(SCRIPTS_DIR, '..');
const SOURCE_FILE_PATH = resolve(REPO_ROOT, 'src/switcher.mjs');
const DIST_DIR_PATH = resolve(REPO_ROOT, 'dist');
const DIST_FILE_PATH = resolve(DIST_DIR_PATH, 'alphaxiv-arxiv-switcher.user.js');

const METADATA_HEADER = `// ==UserScript==
// @name         AlphaXiv / arXiv Switcher
// @namespace    https://github.com/jht213/alphaxiv-script
// @version      0.1.0
// @description  Switch between AlphaXiv, arXiv abstract, and arXiv HTML pages
// @match        https://www.alphaxiv.org/abs/*
// @match        https://arxiv.org/abs/*
// @match        https://www.arxiv.org/abs/*
// @match        https://arxiv.org/html/*
// @match        https://www.arxiv.org/html/*
// @match        https://ar5iv.org/abs/*
// @grant        none
// ==/UserScript==`;

const runtimeSource = readFileSync(SOURCE_FILE_PATH, 'utf8')
    .replace(/^export\s+/gm, '')
    .trim();

const output = `${METADATA_HEADER}

(() => {
'use strict';

${runtimeSource}

installSwitcher({
    document: globalThis.document,
    url: globalThis.location?.href,
    MutationObserver: globalThis.MutationObserver,
    setTimeout: globalThis.setTimeout?.bind(globalThis),
    clearTimeout: globalThis.clearTimeout?.bind(globalThis)
});
})();
`;

mkdirSync(DIST_DIR_PATH, { recursive: true });
writeFileSync(DIST_FILE_PATH, output);