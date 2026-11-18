# reactnative-design — AI agent skill

Design-grade **React Native / Expo UI** skill for Claude Code and other agents. Makes your AI agent build mobile screens and components that look and feel like **native, production apps** (iOS + Android) — not generic, AI-generated mush.

Covers visual design judgment, layout (flexbox, safe areas, responsive, lists), design tokens & theming, dark mode, typography & color scales, spacing rhythm, reusable component craft (button, card, list row, input, bottom sheet, tab bar), motion & gestures (Reanimated 3, Gesture Handler, haptics), iOS vs Android platform conventions, accessibility, and pixel-level polish.

## Install

Clone into your Claude Code skills directory:

```bash
git clone https://github.com/ulugbekeshnazarov409/reactnative-design.git ~/.claude/skills/reactnative-design
```

Then it auto-loads — ask to design or style any React Native screen/component and the agent uses it.

## Layout

```
reactnative-design/
├── SKILL.md                  # entry point: operating mode, routing, core principles
└── references/
    ├── principles.md         # design taste: hierarchy, spacing, native vs AI-slop, polish checklist
    ├── layout.md             # flexbox, safe areas, responsive, lists, keyboard
    ├── theming.md            # design tokens, dark mode, color & type scales
    ├── components.md         # button, card, list row, input, bottom sheet, tab bar, icons
    ├── motion.md             # Reanimated 3, gestures, transitions, haptics, reduce-motion
    ├── platform.md           # iOS vs Android conventions & native feel
    └── accessibility.md      # labels, roles, targets, contrast, Dynamic Type, screen readers
```

## Pairs well with

- `nativewind-ui` — if the project styles with NativeWind (Tailwind for RN), use that for className mechanics and this skill for the design decisions.
- `building-native-ui` / Expo Router — navigation & app structure.

## License

MIT
