const ALPHAXIV_ORIGIN = 'https://www.alphaxiv.org';
const ARXIV_ORIGIN = 'https://arxiv.org';

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
