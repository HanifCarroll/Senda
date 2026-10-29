const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function savedModelSelection(projectId, model, revision) {
  if (typeof projectId !== 'string' || !projectIdPattern.test(projectId) || !['as-is', 'to-be'].includes(model)) return null;
  if (revision !== undefined && revision !== null && revision !== '' &&
      !(typeof revision === 'number' || (typeof revision === 'string' && /^[1-9]\d*$/.test(revision)))) return null;
  const value = revision === undefined || revision === null || revision === '' ? undefined : Number(revision);
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) return null;
  return { projectId, model, revision: value };
}

export function savedModelPath(projectId, model, revision, download = false) {
  const value = savedModelSelection(projectId, model, revision);
  if (!value || (download && !value.revision)) return null;
  const query = new URLSearchParams({ model: value.model });
  if (value.revision) query.set('revision', String(value.revision));
  return `/app/${download ? 'download' : 'projects'}/${value.projectId}?${query}`;
}

export function savedModelSignIn(projectId, model, revision, download = false) {
  const value = savedModelSelection(projectId, model, revision);
  if (!value || (download && !value.revision)) return '/sign-in';
  const query = new URLSearchParams({ project: value.projectId, model: value.model, intent: download ? 'download' : 'review' });
  if (value.revision) query.set('revision', String(value.revision));
  return `/sign-in?${query}`;
}

// Reconstruct a bounded internal destination. Never accept a caller's return URL.
export function signInDestination(search) {
  const query = new URLSearchParams(search);
  if (query.has('sig') && query.has('client_id')) return `/consent${search.startsWith('?') ? search : '?' + search}`;
  if (query.get('plan') === 'pro') return '/app/billing';
  if (!['download', 'review'].includes(query.get('intent'))) return '/app';
  return savedModelPath(query.get('project'), query.get('model'), query.get('revision'), query.get('intent') === 'download') || '/app';
}

export function signInRetry(search) {
  const query = new URLSearchParams(search);
  const destination = signInDestination(search);
  if (destination.startsWith('/consent')) {
    query.delete('error');
    return `/sign-in?${query}`;
  }
  if (destination === '/app/billing') return '/sign-in?plan=pro';
  if (destination === '/app') return '/sign-in';
  return savedModelSignIn(query.get('project'), query.get('model'), query.get('revision'), query.get('intent') === 'download');
}

export function signInRetryForCallback(callback, origin) {
  try {
    const url = new URL(callback, origin);
    if (url.origin !== origin || url.username || url.password) return '/sign-in';
    if (url.pathname === '/app/billing') return '/sign-in?plan=pro';
    if (url.pathname === '/consent') return signInRetry(url.search);
    const match = /^\/app\/(download|projects)\/([^/]+)$/.exec(url.pathname);
    return match ? savedModelSignIn(match[2], url.searchParams.get('model'), url.searchParams.get('revision'), match[1] === 'download') : '/sign-in';
  } catch { return '/sign-in'; }
}
