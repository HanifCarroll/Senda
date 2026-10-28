/** Read-only browser export of a public example, used by build-marketing-previews.js. */
export function capturePreview({ cropSelector } = {}) {
  function ruleText(rule) {
    if (rule.type === CSSRule.MEDIA_RULE) {
      return matchMedia(rule.conditionText).matches
        ? [...rule.cssRules].map(ruleText).join("\n") : "";
    }
    if (rule.cssRules) {
      const heading = rule.cssText.slice(0, rule.cssText.indexOf("{"));
      return heading + "{" + (rule.style?.cssText || "") +
        [...rule.cssRules].map(ruleText).join("\n") + "}";
    }
    return rule.cssText;
  }
  const style = getComputedStyle(document.body);
  const crop = cropSelector ? document.querySelector(cropSelector)?.getBoundingClientRect() : null;
  if (cropSelector && !crop) throw new Error("Preview crop is missing: " + cropSelector);
  return {
    sourceUrl: location.href,
    width: innerWidth, height: innerHeight,
    ...(crop ? { crop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height } } : {}),
    bodyStyle: {
      fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight,
      color: style.color, background: style.backgroundColor,
    },
    css: [...document.styleSheets]
      .filter(sheet => sheet.href?.startsWith(location.origin + "/assets/styles-"))
      .map(sheet => [...sheet.cssRules].map(ruleText).join("\n")).join("\n"),
    html: [...document.body.children].filter(node => node.tagName === "DIV")
      .map(node => node.outerHTML).join(""),
  };
}
