/* Shared inline-SVG glyphs used across the toolbar, the changelog, and the help guide,
 * so a feature's icon stays identical wherever it's named. Sized via `size` (px). */

// The rasm (ʿUthmānic spelling) glyph — a quill/pen, matching the toolbar button.
export function RasmGlyph({ size = 16, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="m12 19 7-7 3 3-7 7-3-3z" />
      <path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18z" />
      <path d="m2 2 7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}
