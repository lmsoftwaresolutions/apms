# Accessibility (a11y)

Accessible UI is better-designed UI. Cheap to add while building, expensive to retrofit.

## Labels & roles

Every interactive element needs a name a screen reader can announce.

```tsx
<Pressable
  accessibilityRole="button"
  accessibilityLabel="Add to cart"
  accessibilityHint="Adds this item to your shopping cart"
  accessibilityState={{ disabled, selected }}
/>
```

- `accessibilityRole`: `button`, `link`, `header`, `image`, `switch`, `adjustable`, `search`, etc.
- `accessibilityLabel`: what it is (icon-only buttons MUST have one — no visible text to read).
- `accessibilityHint`: what happens on activate (optional, don't over-narrate).
- `accessibilityState`: `{ disabled, selected, checked, expanded, busy }`.
- Decorative images: `accessibilityElementsHidden` / `importantForAccessibility="no"` so they're skipped.

## Touch targets & contrast

- ≥ 44pt (iOS) / 48dp (Android) — use `hitSlop` to reach it. (See `platform.md`.)
- Text contrast ≥ 4.5:1 (body), ≥ 3:1 (large). Don't rely on color alone to convey state — pair with icon/text/shape.

## Dynamic Type / font scaling

- Don't globally disable `allowFontScaling`. Let text grow.
- Test at the largest accessibility text size; fix layout that breaks (wrap, scroll, ellipsize intentionally) instead of capping text.
- For genuinely fixed UI (e.g. a numeric badge), cap with `maxFontSizeMultiplier`, not by disabling scaling.

## Screen reader flow

- Logical order: group related content with `accessible={true}` on a wrapper so it reads as one unit (e.g. a card row reads "Notifications, Push and email" together).
- Headers: mark section titles `accessibilityRole="header"` for rotor navigation.
- Live regions: `accessibilityLiveRegion="polite"` (Android) / `AccessibilityInfo.announceForAccessibility()` for async updates (toasts, errors).
- Modals/sheets: focus should move into them; `accessibilityViewIsModal` (iOS) traps focus.

## Motion & other

- Respect reduce-motion (see `motion.md`) — gate large animations behind `useReducedMotion()`.
- Respect reduce-transparency / bold-text where you use blur or thin fonts.
- Forms: associate labels, set correct `keyboardType`/`textContentType`, announce validation errors.

## Quick audit before shipping

- [ ] Every icon-only button has `accessibilityLabel`.
- [ ] Interactive elements have `accessibilityRole` + state.
- [ ] Targets ≥ 44/48.
- [ ] Contrast AA in light AND dark.
- [ ] Layout survives largest Dynamic Type.
- [ ] Reduce-motion honored.
- [ ] Test with VoiceOver (iOS) / TalkBack (Android) once — swipe through the screen.
