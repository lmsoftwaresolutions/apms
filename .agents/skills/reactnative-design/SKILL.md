---
name: reactnative-design
description: Design-grade React Native / Expo UI skill — makes the agent build screens and components that look and feel like native, production apps (iOS + Android), not generic AI mush. Covers visual design judgment, layout systems (flexbox, safe areas, responsive), design tokens & theming, dark mode, typography & color scales, spacing rhythm, reusable component craft (buttons, cards, lists, inputs, bottom sheets, tab bars), motion & gestures (Reanimated 3, Gesture Handler), platform conventions (iOS vs Android native feel, haptics), accessibility, and pixel-level polish. Use for ANY task that designs or styles a React Native screen, component, or design system. Triggers — react native design, expo ui, style a screen/component, make it look native, design system, theming, dark mode, spacing, typography, bottom sheet, tab bar, reanimated animation, gesture, haptics, polish this UI, make it beautiful, iOS/Android look.
category: design
risk: low
source: rn-platform + design-craft
date_added: '2026-06-02'
---

# React Native Design

Build React Native / Expo UI at the standard of a senior product designer who also ships code. The goal is screens that feel **native, intentional, and polished** — not default-styled, not "AI-generated-looking". This skill is about *design judgment* expressed in RN code, on top of whatever styling layer the project uses (StyleSheet, NativeWind, Tamagui, Unistyles).

## Operating mode (read first, every time)

**For any non-trivial UI work, read `references/principles.md` before writing JSX.** It defines the design judgment — visual hierarchy, spacing rhythm, restraint, what makes UI read as "native" vs "AI slop", and a pre-ship polish checklist. The other reference files are the *toolbox*; `principles.md` is *taste*.

Routing — read the file that matches the task:

| Task | Read |
|------|------|
| Any screen/component (taste, hierarchy, polish) | `references/principles.md` |
| Flexbox, safe areas, responsive, lists | `references/layout.md` |
| Design tokens, theming, dark mode, color, type | `references/theming.md` |
| Reusable component patterns (button, card, sheet, input, tab bar) | `references/components.md` |
| Animation, gestures, transitions, haptics | `references/motion.md` |
| iOS vs Android native conventions | `references/platform.md` |
| Accessibility (a11y) | `references/accessibility.md` |

If the repo uses NativeWind, defer styling mechanics to the `nativewind-ui` skill and use THIS skill for the design decisions (what to build, hierarchy, spacing, motion).

## Core principles (the short version)

1. **Hierarchy first.** One primary action per screen. Size, weight, color, and spacing encode importance — not decoration. If everything is bold, nothing is.
2. **Spacing on a scale.** Use a token scale (4/8/12/16/24/32...). Never random `margin: 13`. Whitespace is the cheapest way to look premium.
3. **Type scale, not random sizes.** 4–6 sizes max, defined once. Match platform: iOS leans SF, Android leans Roboto/system. Respect Dynamic Type.
4. **Restraint with color.** Neutral foundation + 1 accent. Semantic tokens (`bg`, `surface`, `text`, `muted`, `accent`, `danger`) — never raw hex in components.
5. **Native feel beats custom.** Use platform conventions: iOS large titles, Android ripple, real safe-area insets, momentum scroll, 44pt/48dp touch targets. Custom only where it earns its place.
6. **Motion is feedback, not flair.** 150–300ms, spring for gestures, ease for state. Animate on the UI thread (Reanimated worklets). Add haptics to consequential taps. Respect reduce-motion.
7. **Both platforms, both themes, real devices.** Design for iOS + Android, light + dark, notch + no-notch, small + large text. A screen isn't done until it survives all four corners.
8. **Tokens > inline.** Every color, space, radius, and font comes from a theme object. Components consume tokens so dark mode and rebrands are free.

## Default workflow

1. Identify the **one** primary goal of the screen → make that action unmistakable.
2. Block out **layout** (safe areas, scroll container, sections) before any styling.
3. Pull **tokens** (spacing, color, type, radius) — define them if missing.
4. Build with **reusable components**, not one-off styles.
5. Add **motion + haptics** only where they give feedback.
6. Run the **polish checklist** in `principles.md`: dark mode, large text, Android ripple, empty/loading/error states, touch targets, alignment.

Default question before shipping any screen: *"Does this look like Apple/Linear/Things shipped it, or like a tutorial?"*
