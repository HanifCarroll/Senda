// Embedded in the offline review page with a content hash. Keep browser helpers
// inside this function; it has no imports, network requests, or write operations.
export function mountReview(data) {
  const host = document.getElementById('diagram-explorer');
  if (!host || !data.views.length) return;
  const find = id => document.getElementById(id);
  const views = new Map(data.views.map(v => [v.elementId, v]));
  const elements = new Map(data.elements.map(e => [e.id, e]));
  const stage = find('diagram-stage'), inspector = find('element-inspector');
  const options = find('view-choice'), search = find('element-search'), results = find('search-results');
  const status = find('diagram-status'), messageList = find('message-list');
  const viewportStates = new Map();
  let current, svg, originalBox, camera, fitted = true, selectedId, suppressClick = 0, pointer;
  const html = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const button = (text, action, className) => { const node = html('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node; };
  const link = (text, href) => { const node = html('a', text); node.href = href; return node; };
  const plural = (n, singular, multiple = `${singular}s`) => `${n} ${n === 1 ? singular : multiple}`;
  const viewFor = id => data.views.find(v => v.elementIds.includes(id) && !v.contextIds.includes(id));
  const announce = text => { status.textContent = text; };
  const label = id => elements.get(id)?.label || 'Model element';
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // SVGs come from the renderer, but model labels and imported attributes are
  // untrusted. Whitelist before inserting into the live DOM. No script, event
  // handlers, foreignObject, links, CSS, or external resource references survive.
  function safeSvg(source) {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('This diagram could not be read.');
    const tags = new Set(['svg', 'g', 'defs', 'marker', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text', 'tspan', 'clipPath', 'title', 'desc']);
    const attributes = new Set(['xmlns', 'id', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'dy', 'dx', 'opacity', 'clip-path', 'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits', 'preserveAspectRatio', 'data-id', 'data-context', 'data-label', 'data-message', 'data-faded']);
    for (const node of [doc.documentElement, ...doc.documentElement.querySelectorAll('*')]) {
      if (!tags.has(node.localName)) { node.remove(); continue; }
      for (const attribute of [...node.attributes]) {
        const value = attribute.value;
        if (!attributes.has(attribute.name) || (/url\s*\(/i.test(value) && !/^url\(#[A-Za-z0-9_.:-]+\)$/.test(value))) node.removeAttribute(attribute.name);
      }
    }
    return document.importNode(doc.documentElement, true);
  }
  function size() { return { width: Math.max(stage.clientWidth, 1), height: Math.max(stage.clientHeight, 1) }; }
  function drawCamera() {
    if (!svg || !camera) return;
    const s = size();
    svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${s.width / camera.scale} ${s.height / camera.scale}`);
    find('zoom-value').textContent = `${Math.round(camera.scale * 100)}%`;
    find('zoom-out').disabled = camera.scale <= .2;
    find('zoom-in').disabled = camera.scale >= 4;
    viewportStates.set(current.elementId, { ...camera, fitted });
  }
  function fit() {
    if (!originalBox) return;
    const s = size(), scale = Math.min(1.4, s.width / originalBox.width, s.height / originalBox.height);
    camera = { scale: Math.max(.05, scale), x: originalBox.x + originalBox.width / 2 - s.width / scale / 2, y: originalBox.y + originalBox.height / 2 - s.height / scale / 2 };
    fitted = true; drawCamera();
  }
  function zoom(scale, anchor) {
    const s = size(), point = anchor || { x: s.width / 2, y: s.height / 2 };
    scale = clamp(scale, .2, 4);
    camera.x += point.x / camera.scale - point.x / scale;
    camera.y += point.y / camera.scale - point.y / scale;
    camera.scale = scale; fitted = false; drawCamera();
  }
  function centerOn(node) {
    try {
      // Convert through the SVG's transforms (native drawings may translate the scene).
      const rect = node.getBoundingClientRect(), outer = stage.getBoundingClientRect();
      const cx = camera.x + (rect.left - outer.left + rect.width / 2) / camera.scale;
      const cy = camera.y + (rect.top - outer.top + rect.height / 2) / camera.scale;
      const s = size(), modelWidth = rect.width / camera.scale, modelHeight = rect.height / camera.scale;
      camera.scale = clamp(Math.min(1.5, s.width / (modelWidth + 120), s.height / (modelHeight + 120)), .2, 4);
      camera.x = cx - s.width / camera.scale / 2; camera.y = cy - s.height / camera.scale / 2;
      fitted = false; drawCamera();
    } catch { /* Selection and its evidence remain available if geometry is absent. */ }
  }
  const drawnNode = id => [...stage.querySelectorAll('g[data-id]')].find(node => node.dataset.id === id);
  function select(id, { reveal = false, focus = false } = {}) {
    if (!elements.has(id)) return;
    if (reveal && !current.elementIds.includes(id)) {
      const destination = viewFor(id);
      if (destination) showView(destination.elementId);
    }
    selectedId = id;
    stage.querySelectorAll('.is-selected').forEach(node => { node.classList.remove('is-selected'); node.setAttribute('aria-pressed', 'false'); });
    const node = drawnNode(id);
    if (node) { node.classList.add('is-selected'); node.setAttribute('aria-pressed', 'true'); if (focus) centerOn(node); }
    showInspector(id);
    announce(`${label(id)} selected. Its evidence is shown in Element details.`);
  }
  function goTo(id) {
    const destination = viewFor(id);
    if (destination) { showView(destination.elementId); select(id, { focus: true }); }
    else if (views.has(id)) { showView(id); showInspector(id); }
    else { showInspector(id); announce('This element has no drawing yet. Its evidence is shown in Element details.'); }
    host.scrollIntoView({ block: 'start', behavior: 'instant' });
    stage.focus({ preventScroll: true });
  }
  function sourceEvidence(evidence) {
    for (const entry of evidence || []) {
      const quote = html('blockquote'); quote.append(html('p', entry.quote));
      const footer = html('footer'); footer.append(link(entry.sourceTitle, `#source-${entry.sourceId}-${entry.segmentId}`));
      quote.append(footer); inspector.append(quote);
    }
  }
  function showInspector(id) {
    inspector.replaceChildren();
    if (!id) {
      inspector.append(html('h3', 'Element details'), html('p', 'Select a task, event, or connection to see its evidence. Open a subprocess to explore its steps.', 'muted'));
      return;
    }
    const element = elements.get(id);
    if (!element) return;
    inspector.append(html('p', element.typeLabel, 'eyebrow'), html('h3', element.label));
    if (views.has(id) && id !== current.elementId) inspector.append(button('Open subprocess', () => showView(id), 'primary-button'));
    if (element.type === 'SubProcess' && !views.has(id)) {
      inspector.append(html('p', element.abstraction ? `Details intentionally omitted: ${element.abstraction.reason}` : 'No internal steps are recorded for this subprocess yet.', 'notice'));
      if (element.abstraction) { inspector.append(html('p', `Inputs: ${element.abstraction.inputs.join('; ')}`), html('p', `Outcomes: ${element.abstraction.outcomes.join('; ')}`)); }
    }
    if (current.contextIds.includes(id)) inspector.append(html('p', 'This participant is shown for context. Their internal work is outside this detail view.', 'muted'));
    if (element.source && element.target) {
      for (const [text, target] of [['From', element.source], ['To', element.target]]) {
        const row = html('p'); row.append(html('strong', `${text}: `), button(label(target), () => goTo(target), 'text-button')); inspector.append(row);
      }
      if (element.type === 'MessageFlow') inspector.append(html('p', 'These are the original sender and recipient. Outside this view, a participant stands in for its internal steps.', 'muted'));
    }
    if (element.claims.length) {
      inspector.append(html('h4', 'Supporting evidence'));
      for (const claim of element.claims) { inspector.append(html('p', claim.statement), html('p', claim.status, 'evidence-status')); sourceEvidence(claim.evidence); }
    } else inspector.append(html('p', 'No linked claim is recorded for this element.', 'muted'));
    if (element.questions.length) {
      inspector.append(html('h4', 'Clarifications'));
      for (const q of element.questions) { const row = html('p'); row.append(link(q.question, `#question-${q.id}`), html('span', ` · ${q.status}`)); inspector.append(row); }
    }
    const exchanges = data.elements.filter(e => e.type === 'MessageFlow' && (e.source === id || e.target === id));
    if (exchanges.length) {
      inspector.append(html('h4', 'Messages'));
      for (const exchange of exchanges) inspector.append(button(exchange.label, () => goTo(exchange.id), 'message-button'));
    }
  }
  function messages() {
    messageList.replaceChildren();
    const ids = current.relatedMessageIds;
    find('message-summary').textContent = `Messages in this part (${ids.length})`;
    if (!ids.length) { messageList.append(html('p', 'No message exchanges are modeled in this part.', 'muted')); return; }
    for (const id of ids) {
      const destination = viewFor(id);
      const row = button('', () => goTo(id), 'message-button');
      row.dataset.messageId = id;
      row.append(html('span', label(id)), html('small', destination?.elementId === current.elementId ? 'Show in this diagram' : destination ? `Open ${destination.parentId ? 'subprocess' : 'diagram'}: ${destination.title}` : 'View evidence · diagram unavailable'));
      messageList.append(row);
    }
  }
  function activate(id) {
    if (views.has(id) && id !== current.elementId) { showView(id); showInspector(id); }
    else select(id);
  }
  function showView(id) {
    const view = views.get(id);
    if (!view) return;
    const focusWasInDrawing = stage.contains(document.activeElement) || find('child-views').contains(document.activeElement) || find('view-breadcrumbs').contains(document.activeElement);
    current = view; selectedId = undefined; pointer = undefined;
    svg = safeSvg(view.svg);
    const b = svg.viewBox.baseVal;
    originalBox = { x: b.x, y: b.y, width: b.width || view.width, height: b.height || view.height };
    svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    svg.setAttribute('aria-label', view.title); svg.setAttribute('role', 'group');
    stage.replaceChildren(svg); stage.setAttribute('aria-label', `${view.title}. Drag to pan; use the zoom buttons or Control plus mouse wheel to zoom.`);
    for (const group of stage.querySelectorAll('g[data-id]')) {
      const elementId = group.dataset.id;
      if (!elements.has(elementId)) continue;
      group.classList.add('selectable');
      group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button'); group.setAttribute('aria-pressed', 'false');
      group.setAttribute('aria-label', `${views.has(elementId) && elementId !== id ? 'Open subprocess' : 'Inspect'}: ${label(elementId)}`);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title'); title.textContent = group.getAttribute('aria-label'); group.prepend(title);
      // Wider invisible hit areas let thin connections be selected with a mouse or touch.
      if (elements.get(elementId).source) for (const line of [...group.children].filter(n => ['path', 'polyline'].includes(n.localName))) {
        const hit = line.cloneNode(false); hit.removeAttribute('id'); hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', '14'); hit.setAttribute('fill', 'none'); hit.classList.add('connection-hit'); group.prepend(hit);
      }
      group.addEventListener('click', event => { event.stopPropagation(); if (Date.now() >= suppressClick) activate(elementId); });
      group.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); activate(elementId); } });
    }
    for (const text of stage.querySelectorAll('[data-label], [data-message]')) {
      const elementId = text.getAttribute('data-label') || text.getAttribute('data-message');
      if (!elements.has(elementId)) continue;
      text.style.cursor = 'pointer';
      text.addEventListener('click', event => { event.stopPropagation(); if (Date.now() >= suppressClick) activate(elementId); });
    }
    options.value = id;
    find('current-view-title').textContent = view.title;
    find('view-caption').textContent = view.contextIds.length ? 'Outside participants are included so you can follow the messages in context.' : view.childIds.length ? 'Open a subprocess to follow its steps and message exchanges.' : 'Select an element to inspect its evidence and related questions.';
    const crumbs = find('view-breadcrumbs'); crumbs.replaceChildren();
    const ancestors = []; let at = view;
    while (at) { ancestors.unshift(at); at = views.get(at.parentId); }
    ancestors.forEach((v, i) => { if (i) crumbs.append(html('span', '›', 'breadcrumb-divider')); const crumb = button(v.title, () => showView(v.elementId), 'text-button'); if (v === view) crumb.setAttribute('aria-current', 'location'); crumbs.append(crumb); });
    const children = find('child-views'); children.replaceChildren();
    for (const childId of view.childIds) {
      const child = views.get(childId), control = button('', () => { showView(childId); showInspector(childId); }, 'child-view');
      control.append(html('span', child.title), html('small', child.relatedMessageIds.length ? plural(child.relatedMessageIds.length, 'message') : 'Open steps')); children.append(control);
    }
    children.hidden = !view.childIds.length;
    const enclosingEvents = find('enclosing-events'); enclosingEvents.replaceChildren();
    if (view.inheritedEventIds.length) {
      enclosingEvents.append(html('span', 'Also applies to this part: '));
      for (const eventId of view.inheritedEventIds) enclosingEvents.append(button(label(eventId), () => goTo(eventId), 'context-event'));
    }
    enclosingEvents.hidden = !view.inheritedEventIds.length;
    find('parent-view').disabled = !view.parentId;
    find('view-download').href = view.file;
    const saved = viewportStates.get(id);
    if (saved) { camera = { ...saved }; fitted = saved.fitted; if (fitted) fit(); else drawCamera(); }
    else {
      fit();
      // A whole-diagram fit can make labels microscopic on small screens.
      // Start at readable size; Fit remains an explicit overview control.
      if (camera.scale < .65) { camera = { x: originalBox.x, y: originalBox.y, scale: 1 }; fitted = false; drawCamera(); }
    }
    showInspector(); messages();
    if (focusWasInDrawing) stage.focus({ preventScroll: true });
    announce(`${view.title}. ${plural(view.messageIds.length, 'message')} drawn here${view.relatedMessageIds.length > view.messageIds.length ? `; ${view.relatedMessageIds.length - view.messageIds.length} more in subprocesses` : ''}.`);
  }
  function updateSearch() {
    results.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    if (!query) { results.hidden = true; return; }
    const rank = element => {
      const name = element.label.toLocaleLowerCase();
      return (name === query ? 0 : name.startsWith(query) ? 1 : 2) + (element.source ? .1 : 0);
    };
    const matches = data.elements.filter(e => e.viewIds.length && e.label.toLocaleLowerCase().includes(query)).sort((a, b) => rank(a) - rank(b));
    results.hidden = false;
    results.append(html('p', matches.length ? `${plural(matches.length, 'result')} — showing up to 12` : 'No matching elements.', 'muted'));
    for (const element of matches.slice(0, 12)) {
      const result = button('', () => { goTo(element.id); search.value = ''; updateSearch(); }, 'search-result');
      result.append(html('span', element.label), html('small', `${element.typeLabel} · ${viewFor(element.id)?.title || 'Context participant'}`)); results.append(result);
    }
  }

  try {
    for (const view of data.views) { const option = html('option', view.title); option.value = view.elementId; options.append(option); }
    host.hidden = false;
    showView(data.views[0].elementId);
    find('static-diagrams').open = false;
    options.addEventListener('change', () => showView(options.value));
    find('parent-view').addEventListener('click', () => { if (current.parentId) showView(current.parentId); });
    find('zoom-in').addEventListener('click', () => zoom(camera.scale * 1.25));
    find('zoom-out').addEventListener('click', () => zoom(camera.scale / 1.25));
    find('zoom-fit').addEventListener('click', fit);
    find('zoom-actual').addEventListener('click', () => zoom(1));
    search.addEventListener('input', updateSearch);
    search.addEventListener('keydown', event => {
      if (event.key === 'Escape') { search.value = ''; updateSearch(); }
      if (event.key === 'Enter') { event.preventDefault(); results.querySelector('button')?.click(); }
    });
    stage.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      suppressClick = 0; // A new intentional click is not the synthetic click ending a drag.
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, camera: { ...camera }, moved: false };
      // Capture on the originating target: a simple click must still activate its element.
      event.target.setPointerCapture?.(event.pointerId);
    });
    stage.addEventListener('pointermove', event => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (Math.hypot(dx, dy) > 5) pointer.moved = true;
      if (!pointer.moved) return;
      camera.x = pointer.camera.x - dx / camera.scale; camera.y = pointer.camera.y - dy / camera.scale;
      fitted = false; stage.classList.add('panning'); drawCamera();
    });
    const release = event => {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (pointer.moved) suppressClick = Date.now() + 300;
      pointer = undefined; stage.classList.remove('panning');
    };
    stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
    stage.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); const rect = stage.getBoundingClientRect();
      zoom(camera.scale * Math.exp(-event.deltaY * .003), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    }, { passive: false });
    stage.addEventListener('keydown', event => {
      const movement = { ArrowLeft: [-60, 0], ArrowRight: [60, 0], ArrowUp: [0, -60], ArrowDown: [0, 60] }[event.key];
      if (movement) { event.preventDefault(); camera.x += movement[0] / camera.scale; camera.y += movement[1] / camera.scale; fitted = false; drawCamera(); }
      else if (['+', '='].includes(event.key)) { event.preventDefault(); zoom(camera.scale * 1.25); }
      else if (event.key === '-') { event.preventDefault(); zoom(camera.scale / 1.25); }
      else if (event.key === 'Home') { event.preventDefault(); fit(); }
      else if (event.key === 'Escape') { stage.querySelectorAll('.is-selected').forEach(n => n.classList.remove('is-selected')); selectedId = undefined; showInspector(); }
    });
    new ResizeObserver(() => { if (fitted) fit(); else drawCamera(); }).observe(stage);
    document.querySelectorAll('[data-diagram-element]').forEach(control => {
      control.hidden = false;
      control.addEventListener('click', () => goTo(control.dataset.diagramElement));
    });
    // Source links work when their evidence is inside a collapsed details section.
    const revealAnchor = () => {
      let target;
      try { target = find(decodeURIComponent(location.hash.slice(1))); } catch { return; }
      if (!target) return;
      for (let node = target.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true;
    };
    window.addEventListener('hashchange', revealAnchor); revealAnchor();
  } catch (error) {
    host.hidden = true;
    find('static-diagrams').open = true;
    const notice = html('p', 'The interactive view could not open. The complete diagram downloads and source evidence are available below.', 'notice');
    host.before(notice);
    console.error('Review viewer failed:', error);
  }
}
