// Finds diagram text that overlaps other text or crosses a pool or lane border.
// Runs in the page against a rendered diagram <svg>, so it must not close over anything.
export const diagramTextProblems = (svg) => {
  const slack = 0.75;
  const box = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  const meet = (a, b) => a.left < b.right - slack && b.left < a.right - slack && a.top < b.bottom - slack && b.top < a.bottom - slack;
  const inside = (a, b) => a.left >= b.left - slack && a.right <= b.right + slack && a.top >= b.top - slack && a.bottom <= b.bottom + slack;
  const texts = [...svg.querySelectorAll("text")].filter((text) => text.textContent.trim())
    .map((text) => ({ name: (text.children.length ? [...text.children].map((line) => line.textContent.trim()).join(" ") : text.textContent.trim()), lines: text.children.length ? [...text.children].map(box) : [box(text)] }));
  const problems = [];
  texts.forEach((a, i) => texts.slice(i + 1).forEach((b) => {
    if (a.lines.some((x) => b.lines.some((y) => meet(x, y)))) problems.push(`"${a.name}" overlaps "${b.name}"`);
  }));
  // Pools and lanes are the groups that carry a frame label. A pool also draws the line that closes its title strip.
  for (const label of svg.querySelectorAll("text[data-frame-label]")) {
    const borders = [...label.parentElement.querySelectorAll(":scope > rect, :scope > path")].map(box);
    for (const text of texts) for (const line of text.lines) for (const border of borders)
      if (meet(line, border) && !inside(line, border)) problems.push(`"${text.name}" crosses the border of ${label.dataset.frameLabel}`);
  }
  return [...new Set(problems)];
};
