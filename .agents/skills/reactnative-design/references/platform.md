# Platform conventions — iOS vs Android

Native feel comes from respecting each platform's conventions, then sharing what's safe. Don't ship an iOS clone on Android.

## Branching styles

```ts
import { Platform } from 'react-native';
const v = Platform.select({ ios: 17, android: 16, default: 16 });
Platform.OS === 'ios' // boolean
```
Use `Platform.select` for the handful of values that should differ (shadow vs elevation, font, header style). Most layout is shared.

## Navigation & headers

- **iOS:** large titles that collapse on scroll, back = chevron + label, slide-from-right transition, swipe-back gesture.
- **Android:** standard app bar, back = arrow (+ hardware/gesture back), fade-through transition.
- Let the native stack navigator (Expo Router / React Navigation native stack) do this — it gives platform-correct behavior for free. Don't rebuild headers unless needed.

## Touch feedback

- **Android:** ripple (`android_ripple` on `Pressable`, or `TouchableNativeFeedback`). Material expects ink ripple from touch point.
- **iOS:** opacity dim / subtle scale. No ripple.
- One `Pressable` with both `android_ripple` and a pressed-opacity style covers both.

## Depth

- **iOS:** soft shadows (`shadowColor/Opacity/Radius/Offset`).
- **Android:** `elevation` (shadows from `shadow*` props mostly don't render). Set both in your shadow token.

## Touch target sizes

- iOS HIG: **44×44 pt** minimum.
- Android Material: **48×48 dp** minimum.
- Use `hitSlop` / `minHeight`/`minWidth` to hit these without visual bloat.

## Type & system font

- iOS uses San Francisco, Android uses Roboto — `System` font resolves correctly per platform. Default to it for instant native feel.
- iOS text tends slightly larger/heavier in titles; Material has its own type scale. The token scale in `theming.md` is a reasonable shared baseline.

## Components that should feel native

- **Switch:** RN `Switch` already renders platform-correct (iOS pill, Android Material). Don't rebuild.
- **ActionSheet / menus:** iOS action sheet vs Android dropdown/menu. Use `@expo/react-native-action-sheet` or platform menus (`expo-menu` / context menus).
- **Date/time picker:** `@react-native-community/datetimepicker` renders native wheel (iOS) / dialog (Android).
- **Status bar:** `expo-status-bar` `style="auto"` flips content color with theme. Android: set translucency + background intentionally.
- **Pull-to-refresh:** `RefreshControl` — native spinner per platform.

## Edge-to-edge / system bars

- Modern Android (edge-to-edge) and iOS notch/Dynamic Island: always use safe-area insets (`layout.md`). Don't hardcode `paddingTop: 44`.
- Android navigation bar (gesture vs 3-button) varies — bottom inset handles it.

## What to share vs split

- **Share:** layout, spacing, tokens, most components, business logic.
- **Split:** shadow/elevation, touch feedback, header behavior, system pickers/sheets, font nuances, haptic intensity.
- Rule of thumb: share structure, branch the last 10% of platform chrome.
