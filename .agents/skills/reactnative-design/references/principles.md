# Design principles & taste

How to make RN UI read as *native and intentional*, not generic. Read before designing any screen.

## What makes UI look "AI-generated" (avoid)

- Everything centered, evenly spaced, no clear hierarchy.
- Purple/indigo gradient on a card for no reason. Random drop shadows everywhere.
- Same font size for label, value, and caption. No type scale.
- Buttons that are full-width pills regardless of importance.
- Equal visual weight on every element → eye has nowhere to land.
- `borderRadius: 20` + `shadow` + `border` + `gradient` stacked = busy.
- Emoji as icons. Lorem-ipsum spacing. No empty/loading states.

## What makes UI look native & premium

- **Clear primary action.** One button stands out; everything else recedes.
- **Generous, consistent whitespace** on an 8pt rhythm.
- **Restrained palette:** neutral grays + one accent. Color means something.
- **Crisp type hierarchy:** big/bold title → medium body → small muted caption.
- **Platform chrome:** large titles (iOS), ripple (Android), real insets, hairline separators (`StyleSheet.hairlineWidth`).
- **Subtle depth:** one soft shadow OR a border, not both. Elevation used sparingly.
- **Alignment:** content lines up to a grid. Left edges agree.

## Visual hierarchy toolkit

Encode importance with, in order of strength: **size → weight → color/contrast → spacing → position**. Use the minimum that works. A title doesn't need to be bold AND huge AND colored — pick.

## Spacing rhythm

Base unit 4. Scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Screen padding usually 16–20. Section gaps 24–32. Related items 8–12 apart, unrelated 24+. Tighter = more related. Vertical rhythm should feel even — scan the screen, gaps should read as a system.

## Color discipline

- Neutral foundation: a ramp of grays (bg, surface, border, text, muted-text).
- **One** brand accent for primary actions/active states.
- Semantic only: `success`, `warning`, `danger`, `info`.
- Contrast: body text ≥ 4.5:1, large text ≥ 3:1 (WCAG AA).
- Never raw hex in a component — pull from theme. See `theming.md`.

## Typography

- 4–6 sizes total. Example scale: `12, 14, 16, 20, 28, 34`.
- Weights: regular/medium/semibold/bold — not 9 weights.
- Line height ≈ 1.3–1.5× size for body. Letter-spacing near 0 except small caps labels.
- Use system font by default (SF on iOS, Roboto on Android) — it instantly looks native. Custom font only with intent + both platforms tested.

## Depth & elevation

- Cards: either a soft shadow (iOS) / low elevation (Android) **or** a 1px border — rarely both.
- Shadow tokens, not ad-hoc. Soft + low-opacity (`shadowOpacity ~0.08–0.12`, large radius, small offset).
- More elevation = more important / more "floating" (sheets, FABs). Flat = grounded content.

## States — a screen isn't done without them

Every data-driven screen needs: **loading** (skeleton > spinner), **empty** (illustration + 1 line + CTA), **error** (message + retry), **success/content**. Design all four. Pressed/disabled states on every interactive element.

## Pre-ship polish checklist

- [ ] One clear primary action; hierarchy reads at a glance.
- [ ] Spacing all on the scale (no magic numbers).
- [ ] Dark mode: every color from theme, tested in both.
- [ ] Large text / Dynamic Type doesn't break layout.
- [ ] Safe-area insets respected (top notch + bottom home indicator).
- [ ] Touch targets ≥ 44pt (iOS) / 48dp (Android).
- [ ] Android shows ripple; iOS shows opacity/scale feedback.
- [ ] Empty + loading + error states exist.
- [ ] Pressed + disabled states on buttons/rows.
- [ ] Alignment to a grid; left edges agree.
- [ ] Icons are a real icon set, consistent weight/size.
- [ ] Reduce-motion + screen reader labels (`accessibility.md`).
