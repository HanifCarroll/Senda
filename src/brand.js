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

// Two open pages divided by a winding path. This is the canonical vector mark.
export const brandMarkPaths = Object.freeze([
  "M4 5C27 3 55 9 73 17C83 21 81 26 69 31C50 38 34 43 39 51C43 58 60 63 73 69C83 74 81 79 69 84L5 113C2 115 0 113 0 109V10C0 7 1 6 4 5Z",
  "M156 4C133 3 111 8 94 17C83 22 84 27 96 33C111 40 125 46 122 54C119 62 102 68 91 76C82 82 84 88 96 94C89 104 79 113 72 120C101 109 129 111 156 115C159 116 160 114 160 111V8C160 5 159 4 156 4Z",
]);

export function brandMarkSvg({ inverse = false, tile = false } = {}) {
  const fills = inverse
    ? [brandColors.lightTeal, brandColors.lightInk]
    : [brandColors.teal, brandColors.ink];
  const paths = brandMarkPaths.map((d, i) => `<path d="${d}" fill="${fills[i]}"/>`).join("");
  return tile
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="${brandColors.background}"/><g transform="translate(18 38) scale(.975)">${paths}</g></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">${paths}</svg>`;
}
