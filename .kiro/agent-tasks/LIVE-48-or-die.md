# 🎯 LIVE — 4.8/5 OR DIE

**Started**: 2026-06-04 21:30 UTC
**Bar**: overall score ≥ 4.8/5, all 4 hooks pass, screenshots show 2026 luxury polish
**Status**: 🔄 in progress — NOT done until King confirms

> Will not stop until: visual_polish ≥ 90, persistence = 100, domain_fitness = 100,
> onboarding ≥ 90, hardFail count = 0, screenshots show real polish.

---

## NEW PALETTE — "Midnight Aurora" (2026)

Replaces the bland tokens with a luxury palette:

| Token | Hex | Use |
|---|---|---|
| --bg-base | #0A0E1F | Deep midnight indigo (was bland #0E1424) |
| --bg-elevated | #14182E | Card surface, slightly warmer |
| --accent | #A78BFA | Electric violet (was washed periwinkle #7C83FF) |
| --accent-glow | #E0AAFF | Pink-violet for gradient stops |
| --gold | #F5C97B | Soft champagne gold (warm highlight) |
| --teal | #4FD1C5 | Aurora teal accent |
| --rose | #FF7B9C | Sunset coral for streak emphasis |
| --text-primary | #F0F2FF | Near-white with cool tint |
| --text-secondary | #8B92B2 | Muted lavender-gray |

Gradient pairings the agent MUST use (mandated):
- Background: #0A0E1F → #14182E → #1B1F3A (3-stop deep indigo)
- Hero card: #A78BFA → #E0AAFF (violet → pink)
- CTA: #F5C97B → #FF7B9C (champagne → rose)
- Streak chip: #4FD1C5 → #A78BFA (teal → violet)

---

## Phases

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | P1 | Replace tokens.ts in golden-starter with Midnight Aurora palette |
| ⬜ | P2 | Add Section 0.6 to prompts.ts: BANNED hex list (#FF8C00, #fff/#000, all grayscale) + REQUIRED palette names + literal hex values + gradient pairings |
| ⬜ | P3 | Hook 11 — add new hardFail: `body-gradient-as-first-child` requires `<LinearGradient style={StyleSheet.absoluteFill}>` (or as direct child of root container) — not just somewhere in the file |
| ⬜ | P4 | Hook 11 — add hardFail `gradient-stop-count-3plus` requires colors=[a, b, c] minimum 3 stops on body gradient |
| ⬜ | P5 | Hook 11 — add hardFail `cta-uses-token-color` requires the primary CTA gradient stops to be from the canonical palette (regex match against the new hex list) |
| ⬜ | P6 | Make all unit tests pass against the new requirements |
| ⬜ | P7 | Push, ECS rolls, trigger NEW generation |
| ⬜ | P8 | Hard verify scores: visual ≥ 90, persistence = 100, domain = 100, onboarding ≥ 90 |
| ⬜ | P9 | If any below threshold, repeat with stricter prompt — up to 3 generations |
| ⬜ | P10 | Capture screens with frame-diff |
| ⬜ | P11 | Visual grade ≥ 4.8/5 against `10-design-system.md` |
| ⬜ | P12 | Hand off — King sees populated state with violet/gold gradient hero, real polish |
