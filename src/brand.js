import { markBounds, wordmarkBounds, wordmarkOffset, markPaths, wordmarkPath } from "../branding/artwork.js";

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

// One canonical vector source keeps the selected mark and clean typeset wordmark consistent.
export const brandLogoHeight = 72;
export const brandAssetVersion = "selected-18-4";
const logoScale = brandLogoHeight / markBounds.height;
export const brandLogoWidth = Math.ceil((wordmarkOffset.x + wordmarkBounds.width) * logoScale);

function markBody(inverse = false) {
  const fills = inverse ? [brandColors.lightTeal, brandColors.lightInk] : [brandColors.teal, brandColors.ink];
  return markPaths.map((d, i) => `<path d="${d}" fill="${fills[i]}"/>`).join("");
}
export function brandLogoSvg({ inverse = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${brandLogoWidth} ${brandLogoHeight}"><g transform="scale(${logoScale})">${markBody(inverse)}<g transform="translate(${wordmarkOffset.x} ${wordmarkOffset.y})"><path d="${wordmarkPath}" fill="${inverse ? "#F5F8F9" : brandColors.text}"/></g></g></svg>`;
}
export function brandMarkSvg({ inverse = false, tile = false } = {}) {
  if (!tile) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${markBounds.width} ${markBounds.height}">${markBody(inverse)}</svg>`;
  const scale = 160 / markBounds.width, top = (192 - markBounds.height * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><g transform="translate(16 ${top}) scale(${scale})">${markBody(inverse)}</g></svg>`;
}
