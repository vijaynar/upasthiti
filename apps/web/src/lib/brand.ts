// Single source of truth for brand copy shown under the ABHYAS logo — the
// app sidebar, admin sidebar, and public explore header each rendered their
// own copy of this string, so a wording change meant four edits instead of
// one. Visual case (small-caps here vs uppercase where the surrounding
// element has no `uppercase` class) is handled per call site with CSS, not
// by storing multiple casings of the same string.
export const TAGLINE = 'Learn. Practice. Achieve.';
