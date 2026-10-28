export function safeSvg(source: string) {
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
    return document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  }