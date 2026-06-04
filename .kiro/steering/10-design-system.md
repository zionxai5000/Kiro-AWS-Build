---
inclusion: always
---

# Design system (the only styling source)

Build every screen from these tokens. Do not invent ad-hoc colors, spacings, or
font sizes inline. The goal is the calm, premium, spacious feel of a top wellness
app (Calm is the reference) — translated into a reusable token set, not copied
assets. If a value you need is not here, add it to the token file and reuse it;
never hardcode a one-off.

## Principles

- **Calm over busy.** Generous whitespace, one focal action per screen, soft
  contrast. When in doubt, remove an element.
- **Soft, not flat-corporate.** Rounded corners, gentle layering, low-saturation
  color, slow motion. No harsh shadows, no neon, no dense dashboards.
- **Depth through softness.** Use large soft surfaces and subtle elevation, not
  hard borders.
- **Motion is slow and intentional.** Nothing snaps. Everything eases.

## Color tokens

Provide both modes; default to a tranquil dark theme, support light.

| Token                 | Dark        | Light       | Use                          |
| --------------------- | ----------- | ----------- | ---------------------------- |
| `--bg-base`           | `#0E1424`   | `#F7F6FB`   | App background               |
| `--bg-elevated`       | `#161E33`   | `#FFFFFF`   | Cards, sheets                |
| `--bg-elevated-2`     | `#1E2740`   | `#F0EEF8`   | Nested surfaces              |
| `--text-primary`      | `#EDF0FA`   | `#1B2138`   | Headlines, body              |
| `--text-secondary`    | `#A7AECB`   | `#5A6080`   | Supporting text              |
| `--text-tertiary`     | `#6C7494`   | `#8A90AC`   | Hints, captions              |
| `--accent`            | `#7C83FF`   | `#5A62E8`   | Primary action, periwinkle   |
| `--accent-soft`       | `#2A2F5C`   | `#E6E7FB`   | Accent backgrounds           |
| `--calm-teal`         | `#5FB6A6`   | `#3E9E8E`   | Secondary accent             |
| `--warm`              | `#E8B58A`   | `#D79A66`   | Highlights, dawn tone        |
| `--border-subtle`     | `#26304D`   | `#E4E2F0`   | Hairlines only when needed   |
| `--success`           | `#5FB682`   | `#3E9E63`   | Positive states              |
| `--danger`            | `#E2807C`   | `#C9554F`   | Errors, destructive          |

Backgrounds may use a soft vertical gradient between `--bg-base` and a slightly
lighter twilight tone for hero/header areas — keep it subtle (two stops, low
contrast). Never a busy mesh or multi-stop rainbow.

## Typography

- **Display / headings:** a soft humanist serif or rounded sans (e.g. a serif like
  "Newsreader" / "Source Serif", or rounded sans like "Nunito"). One family,
  weights 400 and 600 only.
- **Body / UI:** the platform default sans (San Francisco / Roboto) or "Inter".
- **Scale (pt):** 13 caption, 15 body, 17 emphasized body, 22 title, 28 large
  title, 40 display. Line-height 1.4–1.6. Letter-spacing slightly tight on display.
- **Casing:** sentence case everywhere. Never ALL CAPS, never Title Case buttons.

## Spacing & layout

- 8-point scale: 4, 8, 12, 16, 24, 32, 48, 64. Use these only.
- Screen padding: 24 horizontal minimum. Generous top breathing room on every
  screen (no content jammed under the status bar).
- One primary action per screen, placed predictably (bottom or a clear CTA).

## Shape, elevation, motion

- **Radius:** 16 for cards, 24 for sheets/modals, pill (`999`) for primary buttons.
- **Elevation:** soft, large-radius, low-opacity shadow (e.g. y8, blur24, 12%
  opacity) — never a hard 1px drop shadow.
- **Motion:** durations 280–480ms; easing `cubic-bezier(0.32, 0.72, 0, 1)` for
  enters, standard ease-in-out for the rest. Page transitions fade+rise, not slide-
  snap. ALWAYS honor reduced-motion: disable non-essential animation when the OS
  setting is on.

## Component rules

- Buttons: pill, full-width primary on key screens, 56pt tall, 17pt label.
- Cards: `--bg-elevated`, radius 16, internal padding 16–24, soft elevation.
- Inputs: 52pt tall, radius 12, clear focus state using `--accent`.
- Empty states are designed, not blank: a soft illustration or icon, one calm
  sentence, and the primary action. Never ship a bare empty list.
- Loading: skeletons or a gentle pulse, never a raw spinner on a white screen.

## Token file requirement

The scaffold MUST expose these as a single typed token module
(e.g. `src/theme/tokens.ts`) consumed everywhere. The no-static-data scanner
treats this file (and `src/theme/**`) as an allowlisted config — it is the one
place literals live.
