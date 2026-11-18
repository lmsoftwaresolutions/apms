# Theming — tokens, dark mode, color, type

Design tokens are the foundation. Components consume tokens; dark mode and rebrands become free.

## Token object

Define once, in a `theme.ts`. Semantic names, not raw values, in components.

```ts
export const palette = {
  // raw ramp — never used directly in components
  gray0: '#FFFFFF', gray50: '#F7F7F8', gray100: '#ECECEE',
  gray300: '#C9C9CE', gray500: '#8E8E93', gray700: '#48484A',
  gray900: '#1C1C1E', black: '#000000',
  brand500: '#0A84FF', brand600: '#0060DF',
  red: '#FF3B30', green: '#34C759', amber: '#FF9F0A',
};

export const light = {
  bg: palette.gray0,
  surface: palette.gray50,
  surfaceElevated: palette.gray0,
  border: palette.gray100,
  text: palette.gray900,
  textMuted: palette.gray500,
  accent: palette.brand500,
  accentText: palette.gray0,
  danger: palette.red, success: palette.green, warning: palette.amber,
};

export const dark = {
  bg: palette.black,
  surface: palette.gray900,
  surfaceElevated: '#2C2C2E',
  border: '#38383A',
  text: palette.gray0,
  textMuted: palette.gray500,
  accent: palette.brand500,
  accentText: palette.gray0,
  danger: palette.red, success: palette.green, warning: palette.amber,
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 } as const;
export const type = {
  caption: { fontSize: 12, lineHeight: 16 },
  footnote: { fontSize: 13, lineHeight: 18 },
  body:    { fontSize: 16, lineHeight: 22 },
  headline:{ fontSize: 20, lineHeight: 25, fontWeight: '600' as const },
  title:   { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  largeTitle:{ fontSize: 34, lineHeight: 41, fontWeight: '700' as const },
};
export const shadow = {
  card: {
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
};
```

## Providing the theme

Simplest: a context that picks `light`/`dark` from `useColorScheme()`.

```tsx
import { useColorScheme } from 'react-native';
const ThemeCtx = createContext(light);
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();           // 'light' | 'dark' | null
  const theme = scheme === 'dark' ? dark : light;
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);
```

Then in a component:
```tsx
const t = useTheme();
<View style={{ backgroundColor: t.surface, padding: space.lg, borderRadius: radius.md }}>
  <Text style={{ ...type.headline, color: t.text }}>Title</Text>
  <Text style={{ ...type.footnote, color: t.textMuted }}>Subtitle</Text>
</View>
```

If the project uses **NativeWind**, express the same tokens as CSS vars + `tailwind.config` colors and use `dark:` variants — defer to the `nativewind-ui` skill for mechanics. The token *design* here still applies.

## Dark mode rules

- Every color comes from the theme. Grep for `#` in components — there should be none.
- Dark surfaces aren't pure-black-on-everything: elevate with slightly lighter surfaces (`surfaceElevated`), not shadows (shadows barely show on dark).
- Don't invert accent — keep brand accent, adjust foreground for contrast.
- Test images/illustrations on both backgrounds; add a subtle border to white images on dark.
- `StatusBar` style must flip: light content on dark bg, dark content on light bg (`expo-status-bar` `style="auto"`).

## Color choosing

- Start neutral. Build the whole screen in grays, add the **one** accent last.
- Accent only on: primary button, active tab/segment, links, selected state, focus.
- Semantic colors (danger/success/warning) only for their meaning — not decoration.
- Check AA contrast (4.5:1 body, 3:1 large). Tools: any contrast checker.

## Type rules

- Use the `type` scale tokens. No inline `fontSize: 17`.
- System font default. To add a custom font: `expo-font` / `useFonts`, load both weights you use, test on Android (no faux-bold).
- Respect Dynamic Type: don't disable font scaling globally. If layout breaks at large sizes, fix the layout (wrap, scroll), don't cap the text.
