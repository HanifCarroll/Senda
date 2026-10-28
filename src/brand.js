import { markBounds, wordmarkBounds, markPaths, wordmarkPath } from "../branding/artwork.js";

/** Ink + Teal: brand color is separate from validation and process-state color. */
export const brandColors = Object.freeze({
  ink: "#143D4D",
  teal: "#2A7F83",
  text: "#20282B",
  background: "#F5F8F9",
  tint: "#DDEFF0",
  muted: "#52636C",
  border: "#D8E2E6",
  lightInk: "#C2E4E8",
  lightTeal: "#70C2C6",
});
export const brandCssVariables = Object.entries(brandColors).map(([key, value]) =>
  `--brand-${key.replace(/[A-Z]/g, char => "-" + char.toLowerCase())}:${value}`).join(";");

// Restored outlines preserve the selected mark and lettering, rather than redrawing them.
export const brandLogoHeight = 72;
export const brandAssetVersion = "selected-18-2";
const markHeight = 56, markWidth = markHeight * markBounds.width / markBounds.height;
const wordHeight = 44, wordWidth = wordHeight * wordmarkBounds.width / wordmarkBounds.height;
export const brandLogoWidth = Math.ceil(markWidth + 16 + wordWidth);

function markBody(inverse = false) {
  const fills = inverse ? [brandColors.lightTeal, brandColors.lightInk] : [brandColors.teal, brandColors.ink];
  return markPaths.map((d, i) => `<path d="${d}" fill="${fills[i]}"/>`).join("");
}
export function brandLogoSvg({ inverse = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${brandLogoWidth} ${brandLogoHeight}"><g transform="translate(0 ${(brandLogoHeight - markHeight) / 2}) scale(${markHeight / markBounds.height})">${markBody(inverse)}</g><g transform="translate(${markWidth + 16} ${(brandLogoHeight - wordHeight) / 2}) scale(${wordHeight / wordmarkBounds.height})"><path d="${wordmarkPath}" fill="${inverse ? "#F5F8F9" : brandColors.text}"/></g></svg>`;
}
export function brandMarkSvg({ inverse = false, tile = false } = {}) {
  if (!tile) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${markBounds.width} ${markBounds.height}">${markBody(inverse)}</svg>`;
  const scale = 160 / markBounds.width, top = (192 - markBounds.height * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><g transform="translate(16 ${top}) scale(${scale})">${markBody(inverse)}</g></svg>`;
}
