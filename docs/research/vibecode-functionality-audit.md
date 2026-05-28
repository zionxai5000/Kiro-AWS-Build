# VibeCode + Rork Functionality Audit

> Source-cited audit of how the two leading "describe-your-app, get-an-app"
> products actually behave. This document is the **input** to
> `docs/zionx-studio-spec.md` — every rule the spec runner enforces traces
> back to a behavior observed and cited here.

**Audited products**:
- Vibecode — https://www.vibecodeapp.com/ — Mobile app + web app, Claude Code agent
- Rork (Pro and Max) — https://rork.com/ — Browser-based, React Native + Expo (Pro) or SwiftUI + Xcode (Max)

**Last updated**: 2026-05-28
**Compiled by**: King + Kiro
**Compliance**: All citations use direct URLs. Verbatim quotation kept under 30 words per source per [licensing rules]. Content was rephrased for compliance with licensing restrictions.

---

## 1. Top-level navigation and shell

### Vibecode
- Available as a mobile app on iOS and as a web app at vibecodeapp.com. Targeted at first-time builders and experienced developers alike. ([source](https://www.vibecodeapp.com/docs/index))
- The home page exposes a **New Project** button ([source](https://www.vibecodeapp.com/docs/getting-started/creating-first-app)).
- Built-in preview is the primary surface during development — users iterate by chatting with the AI and watching changes appear ([source](https://www.vibecodeapp.com/docs/getting-started/creating-first-app)).
- Mobile app has a **Pinch to Build** gesture: long-press anywhere on the running app for ~1 second to open a customization menu ([source](https://www.vibecodeapp.com/docs/getting-started/pinch-to-build)).
- Web app has no Pinch to Build gesture — same customizations done through chat ([source](https://www.vibecodeapp.com/docs/getting-started/pinch-to-build)).
- Mobile share button is gated by Apple App Store rules: viewers must download a separate "Appsmith - Vibecode Apps" app to scan the share QR code ([source](https://www.vibecodeapp.com/docs/getting-started/sharing-app)).

### Rork
- Two SKUs: **Rork Pro** (React Native + Expo, $25-$100/mo) and **Rork Max** (SwiftUI + Xcode, $200+/mo) ([source](https://rork.com/faq)).
- Rork Max runs real Macs in the cloud loaded with Xcode — the preview is a streamed iOS Simulator running over a low-latency protocol ([source](https://rork.com/faq)).
- Onboarding asks users to sign in with Google or Apple, then completes a short survey before returning to the home page ([source](https://docs.rork.com/introduction/build-your-first-app)).
- The home page has an **Explore** screen for browsing existing apps; users are encouraged to **remix** existing projects ([source](https://docs.rork.com/introduction/build-your-first-app)).
- Has a **Restore** feature: revert to any previous version. Each version can be previewed before restoring ([source](https://rork.com/faq)).

---

## 2. The prompt entry → app generation lifecycle

### Vibecode
1. User taps **New Project** → arrives at a chat-style prompt input.
2. User types a description in plain English. Documented examples:
   - "Create a to-do list app where I can add tasks, mark them done, and swipe to delete"
   - "Build a recipe tracker where I can save recipes with photos and search by ingredient"
   - "Make a habit tracker with streaks and daily reminders"
3. User presses **Generate** — Claude Code builds the app in real time.
4. The result is testable in the built-in preview, or via QR code on the user's phone.
5. To iterate, the user replies in chat: "Make the header blue", "Add a settings page".
6. The recommended pattern is one feature at a time, not megaprompts.
([source](https://www.vibecodeapp.com/docs/getting-started/creating-first-app))

Vibecode runs **Claude Code** as the default AI coding agent ([source](https://www.vibecodeapp.com/docs/index)).

### Rork
- User picks an idea (or remixes an existing app from Explore).
- Submit prompt → user is sent to the Rork **editor**.
- The agent begins working. "In a few minutes" the user has a fully functional app.
- Test on the website's simulator, or scan a QR code to test on phone via Expo Go (Pro) / via plug-in to a Mac with the Companion app (Max).
- Send more chat messages to iterate. Users can **clone** their project to start a new thread, or start a fresh project from the home page.
([source](https://docs.rork.com/introduction/build-your-first-app))

#### Rork prompting strategy
Rork explicitly advises that the framing of the prompt determines build quality. The doc breaks this into 6 patterns ([source](https://docs.rork.com/introduction/introduction/prompting-strategy)):

| Pattern | What changes |
|---------|--------------|
| Define the experience, not just the features | Describe how the app should *feel*, not only what it does |
| Tell Rork when polish matters | Use phrases like "high-production", "alive and responsive" |
| Ask for transitions and motion | Subtle screen transitions, button feedback |
| Describe the mood and target user | "calm, minimal", "Gen-Z bold and energetic" |
| State the primary goal clearly | "best UX", "reduce friction" |
| Combine intent with constraints | Vision + scope boundaries together |

These patterns are advisory, not enforced — but the doc explicitly says: if you do not ask for polish, Rork prioritizes functionality.

---

## 3. The chat interface (assistant narration)

### Vibecode
- The agent **builds in real time** during generation — the user can watch progress ([source](https://www.vibecodeapp.com/docs/getting-started/creating-first-app)).
- Pinch to Build menu gives instant feedback: the user describes a change, the AI implements, the result is seen "immediately" ([source](https://www.vibecodeapp.com/docs/getting-started/pinch-to-build)).
- The AI is described as making changes **and then showing them**. The pattern is implement → reveal, not propose-then-confirm.
- A separate **`/appstore-preflight`** skill is exposed in chat. Users can run it directly or trigger it from a Preflight button. It scans for App Store-rejection-class issues (missing icons, metadata problems) ([source](https://www.vibecodeapp.com/docs/getting-started/deploy-app-store)).
- **+ button** in the chat starts a new conversation if the user wants a fresh context ([source](https://www.vibecodeapp.com/docs/troubleshooting)).

### Rork
- Daily AI updates. The product team explicitly does not charge credits for AI errors — they update the model daily to reduce mistakes ([source](https://rork.com/faq)).
- Stuck-in-error-loop guidance: ask Rork to search the web for the error, switch AI models, or revert via Restore ([source](https://rork.com/faq)).
- Rork advertises a **"search the web"** capability available from the chat, used as an escape hatch for stuck states ([source](https://rork.com/faq)).

---

## 4. The preview pane

### Vibecode
- Built-in preview lives in the same surface as the chat. Users iterate without switching context ([source](https://www.vibecodeapp.com/docs/getting-started/creating-first-app)).
- For mobile testing, scan QR code on phone. Users sharing apps need their viewers to install "Appsmith - Vibecode Apps" ([source](https://www.vibecodeapp.com/docs/getting-started/sharing-app)).
- Documented preview failures and remedies ([source](https://www.vibecodeapp.com/docs/troubleshooting)):
  - "Wait a moment — complex apps may take a few seconds to load"
  - "Refresh the preview" — there is a refresh button
  - "Check the deploy status"
  - "Try a different device" (web app vs. phone QR)

### Rork
- Pro: simulator runs in the website. QR code → Expo Go → phone test.
- Max: streamed real iOS Simulator; rendered on an actual Mac in the cloud running Xcode. Animations and gestures behave exactly as on a physical iPhone ([source](https://rork.com/faq)).
- Both modes claim instant testing on the user's phone ([source](https://rork.com/faq)).

---

## 5. Tabs / panels seen in the editor

The shell from Vibecode surfaces these distinct panels (collated from multiple docs):

| Panel | Purpose | Source |
|-------|---------|--------|
| **Chat** | Where the user talks to the AI | [creating-first-app](https://www.vibecodeapp.com/docs/getting-started/creating-first-app) |
| **Preview** | Live app rendering | [creating-first-app](https://www.vibecodeapp.com/docs/getting-started/creating-first-app), [troubleshooting](https://www.vibecodeapp.com/docs/troubleshooting) |
| **ENV tab (Frontend / Backend)** | Environment variable management split by frontend vs backend | [troubleshooting](https://www.vibecodeapp.com/docs/troubleshooting) |
| **Logs tab** | Build / deployment logs | [troubleshooting](https://www.vibecodeapp.com/docs/troubleshooting) |
| **Deploy dropdown** | Deploy to App Store, Preflight skill | [deploy-app-store](https://www.vibecodeapp.com/docs/getting-started/deploy-app-store) |
| **Plus (+) button** | Start a new chat | [troubleshooting](https://www.vibecodeapp.com/docs/troubleshooting) |

Rork docs surface these:

| Panel | Purpose | Source |
|-------|---------|--------|
| **Editor** | Single surface where prompt + chat + simulator coexist | [build-your-first-app](https://docs.rork.com/introduction/build-your-first-app) |
| **Explore** | Browse / remix existing apps | [build-your-first-app](https://docs.rork.com/introduction/build-your-first-app) |
| **Publish flow** | Two-click App Store (Max) or App Bundle / AAB (Pro) | [rork.com/faq](https://rork.com/faq) |
| **Restore** | Roll back to previous version with preview | [rork.com/faq](https://rork.com/faq) |
| **GitHub sync** | Two-way sync, paid plans only | [rork.com/faq](https://rork.com/faq) |
| **Collaboration** | Email / link invite, editor / viewer roles, teams | [rork.com/faq](https://rork.com/faq) |

---

## 6. Buttons and observed actions

| Source | Button / action | Observed behavior |
|--------|-----------------|-------------------|
| Vibecode | New Project | Opens prompt input ([src](https://www.vibecodeapp.com/docs/getting-started/creating-first-app)) |
| Vibecode | Generate | Triggers Claude Code real-time build ([src](https://www.vibecodeapp.com/docs/getting-started/creating-first-app)) |
| Vibecode | On Mobile | Top-right corner of preview; opens QR code popup for share ([src](https://www.vibecodeapp.com/docs/getting-started/sharing-app)) |
| Vibecode | Deploy / Deploy to App Store | Top-right; opens deploy dropdown with "Submit to App Store" + Preflight ([src](https://www.vibecodeapp.com/docs/getting-started/deploy-app-store)) |
| Vibecode | Preflight | Runs `/appstore-preflight` skill in chat, returns checklist of issues ([src](https://www.vibecodeapp.com/docs/getting-started/deploy-app-store)) |
| Vibecode | Refresh preview | Reloads the preview iframe ([src](https://www.vibecodeapp.com/docs/troubleshooting)) |
| Vibecode | + (in chat) | Starts a new conversation context ([src](https://www.vibecodeapp.com/docs/troubleshooting)) |
| Vibecode | Long-press in preview (mobile) | Opens Pinch to Build menu after ~1 second ([src](https://www.vibecodeapp.com/docs/getting-started/pinch-to-build)) |
| Rork | Submit prompt (home) | Creates project, navigates to editor, agent begins ([src](https://docs.rork.com/introduction/build-your-first-app)) |
| Rork | Scan QR | Opens app on phone via Expo Go ([src](https://docs.rork.com/rork-expo)) |
| Rork | Restore | Lists previous versions, lets user preview before restoring ([src](https://rork.com/faq)) |
| Rork | Publish (Pro) | App Store flow; needs Apple Developer + Expo accounts ([src](https://rork.com/faq)) |
| Rork | Publish (Max) | Two clicks — compiled and submitted directly from cloud ([src](https://rork.com/faq)) |
| Rork | Upload (Android) | Generates Android App Bundle (.aab) ([src](https://rork.com/faq)) |
| Rork | Clone project | Forks current state into a new thread ([src](https://docs.rork.com/introduction/build-your-first-app)) |

---

## 7. State transitions and lifecycle events to verify

This is the input that becomes spec runner rules. Each row maps a user-visible action to an expected backend response and a follow-up state.

| User action | Within | Backend must | Then | Source |
|-------------|--------|--------------|------|--------|
| Type prompt + Generate | 5 s | Create project (if none) and start a streaming generation | Stream tokens visible in chat | [creating-first-app](https://www.vibecodeapp.com/docs/getting-started/creating-first-app) |
| Generation stream starts | ≤ 10 min | Either complete with a "done" event or fail with an "error" event | Preview build (or visible error) | [creating-first-app](https://www.vibecodeapp.com/docs/getting-started/creating-first-app), [troubleshooting](https://www.vibecodeapp.com/docs/troubleshooting) |
| Generation done | 60 s | Preview should rebuild | Preview iframe ready | [creating-first-app](https://www.vibecodeapp.com/docs/getting-started/creating-first-app) |
| Click Build / Build iOS | 5 s | Backend returns build queued (with build ID) or error | Build ID visible in Logs tab | [deploy-app-store](https://www.vibecodeapp.com/docs/getting-started/deploy-app-store) (uses Expo Launch) |
| Click Deploy / Submit | 5 s | Deploy started or error; in Vibecode this opens Expo Launch in a new tab | Status appears in chat or dialog | [deploy-app-store](https://www.vibecodeapp.com/docs/getting-started/deploy-app-store) |
| Click a file in file list | 2 s | File contents loaded | File contents visible in code panel | (inferred — implicit in Code panel concept) |
| Save edits to a file | 5 s | File saved or error | Save indicator visible | (inferred — implicit in editor) |
| Refresh page | 3 s | Project list rehydrates from server (with workspaces persisted) | Last-selected project still selected, files visible | [troubleshooting "preview isn't loading"](https://www.vibecodeapp.com/docs/troubleshooting) |
| Click Restore (Rork) | 5 s | Version list returned | User picks a version, sees a preview before committing | [rork.com/faq](https://rork.com/faq) |
| Run Preflight | 60 s | `/appstore-preflight` skill runs, returns a checklist | Issues listed in chat | [deploy-app-store](https://www.vibecodeapp.com/docs/getting-started/deploy-app-store) |
| Long-press (mobile preview) | 1 s | Pinch to Build menu opens | User selects customization category | [pinch-to-build](https://www.vibecodeapp.com/docs/getting-started/pinch-to-build) |

---

## 8. Empty states / first-launch UX

Documented or inferred from the docs:

| State | What's shown |
|-------|--------------|
| Logged in but no projects | "New Project" button + Explore screen for inspiration ([Rork src](https://docs.rork.com/introduction/build-your-first-app)) |
| Project created but generation pending | Real-time agent narration (Vibecode "real time" claim, [src](https://www.vibecodeapp.com/docs/getting-started/creating-first-app)) |
| Generation failed | Friendly suggestions: simplify prompt, start new chat, check internet, check credits ([src](https://www.vibecodeapp.com/docs/troubleshooting)) |
| Preview blank | Refresh button, suggestion to wait, suggestion to try another device ([src](https://www.vibecodeapp.com/docs/troubleshooting)) |
| Out of credits | Bottom-left credit indicator (web) shows red; refer to referral / pay-as-you-go / upgrade ([src](https://www.vibecodeapp.com/docs/troubleshooting)) |
| Preview shows differently than device | Prompt suggestion to use Native iOS UI Components ([src](https://www.vibecodeapp.com/docs/troubleshooting)) |
| Auth/login broken in deployed app | Diagnostic prompt for AI: "verify auth configuration, especially cookie settings and trusted origins" ([src](https://www.vibecodeapp.com/docs/troubleshooting)) |

---

## 9. Persistence behavior

This is the symptom King reported: ZionX projects vanish on refresh.

### Vibecode
- Projects persist across the user's account on the web app and the iOS app.
- "Vibecode does not store or own your app data or code" — but projects themselves remain available across sessions ([src](https://www.vibecodeapp.com/docs/faqs)).

### Rork
- Two-way GitHub sync on paid plans implies projects are durable enough to round-trip to git ([src](https://rork.com/faq)).
- Restore feature lists previous versions — implies version history is durable across sessions ([src](https://rork.com/faq)).

### Implication for ZionX
**Persistence is non-negotiable.** Both reference products treat projects as long-lived records the user can return to days later. The S3 mirror layer (Stream A in the task plan) addresses this. After deploy, ZionX projects must remain visible across Fargate restarts.

---

## 10. Native UI primitives the user is told to ask for

Vibecode's "Native iOS UI Components" page lists a copy-paste prompt vocabulary ([source](https://www.vibecodeapp.com/docs/getting-started/native-ui-components)):

| Component | Library / pattern |
|-----------|-------------------|
| Large Header Titles | React Navigation Native Stack — `headerLargeTitle: true`, `headerTransparent: true`, `contentInsetAdjustmentBehavior="automatic"` |
| Context Menu | Zeego ContextMenu — long-press, native item/submenu rendering |
| Liquid Glass Bottom Tabs | `react-native-bottom-tabs` + `@bottom-tabs/react-navigation` |
| Modals / Bottom Sheets | `@gorhom/bottom-sheet`, multiple snap points incl. fullscreen |
| iOS-Style Switch | React Native built-in |
| Date / Time Pickers | `@react-native-community/datetimepicker` |
| Haptics | Vibecode built-in haptics feature |
| Segmented Control | `@react-native-segmented-control/segmented-control` |
| Swipe to Delete | RNGH Swipeable + Reanimated, `renderRightActions` |

This vocabulary informs the **design system** of any spec-compliant Studio output. ZionX's existing design tokens already align (Phase 8.5 design spec).

---

## 11. Available integrations and data services

Vibecode's published integrations ([source](https://www.vibecodeapp.com/docs/llms.txt)):

- **AI models**: GPT-5 family (Nano, Mini, regular, 5.1, 5.1-streaming, 5.2), Claude Code, Grok 4 Fast (reasoning + non-reasoning), Gemini 3 Pro
- **Image**: GPT Image 1, GPT Image 1.5, Nano Banana, Ideogram 3
- **Video**: Sora 2, Sora 2 Pro
- **Voice / audio**: ElevenLabs (Music, Sound Effects, Flash 2.5 TTS, Voice Changer), GPT-4o audio transcription
- **Data**: Stock Market Data (Alpha Vantage), Crypto Market Data (Alpha Vantage), TMDB, OpenWeather
- **Ops**: Resend Email, Apple Maps, Expo Push Notifications

Rork's stated integrations (FAQ):
- Supabase / Firebase (database + auth) — "just ask Rork to integrate"
- RevenueCat for subscriptions / in-app purchases
- OpenAI for AI chat / voice / image generation (hosted on paid plans, no API keys needed)
- Custom APIs by pasting documentation URL

These shape the realistic surface area of a Studio: integrations are *choices the user makes during generation*, not menu options.

---

## 12. App Store submission flow (for spec runner Phase 8 rules)

Vibecode's flow ([source](https://www.vibecodeapp.com/docs/getting-started/deploy-app-store)) is the cleanest reference. Steps:

1. User clicks **Deploy → Deploy to App Store**.
2. Pre-flight gate: confirm 4 boxes (Apple Developer paid, ASC agreements signed, Expo account exists, 2FA device ready).
3. **Add Expo access token** — user pastes it.
4. **Confirm app details** — name, version, iPad support.
5. **Confirm app icon**.
6. **Create bundle ID** (first build only) — typically `com.company.appname`. Treat as permanent after first submit.
7. **Start Expo Launch** — opens in a new tab; ~20 minutes typical build time.
8. **Monitor build**: dashboard link visible; user can close the dialog.
9. **Build complete** — uploaded to App Store Connect, available in TestFlight.
10. Subsequent builds skip step 6.

Documented troubleshooting:
- Build failed → check Expo token validity, ASC agreement state, Apple authentication in Expo Launch tab.
- Version Number → must be higher than previous.
- Bundle ID → unique, matching `com.company.appname` format, lowercase + numbers + hyphens + periods only.

Rork's two-click Max flow ([source](https://rork.com/faq)) compresses this into one button when an Apple Developer Account is already connected. Pro flow still requires an Expo account and produces an Android App Bundle (.aab) for Google Play.

---

## 13. Failure modes documented by the products themselves

Vibecode's published failure list ([source](https://www.vibecodeapp.com/docs/troubleshooting)):
- Out of credits (display location specified: bottom-left web, Profile mobile)
- Generation hung
- Preview blank
- Auth not working in deployed app
- App looks different on device vs preview
- Deployment failure
- App Store submission failure
- Stuck in error loop

Each maps to documented user-facing remediations. Each one **must** be expressible as a spec rule with a known violation breadcrumb.

---

## 14. What this audit lets us conclude for ZionX

1. **Persistence is mandatory.** Streaming projects must survive page refresh, container restart, day-over-day usage. Stream A addresses this.
2. **The chat narrates progress.** Real-time, not buffered. User sees the agent working.
3. **The preview pane is the primary interaction surface.** Refresh button is required. A failure state with a "try another device" suggestion is required. Long-press on mobile is the customization escape hatch.
4. **Lifecycle events are observable.** Generate / build / deploy each have an explicit "started" event and a "done | error" event. The runner enforces that "started" always pairs with "done | error" within a documented time budget.
5. **There are exactly 2 fail modes for any user click**: success state, or an error message with a specific remediation. There is no "click sat there with nothing happening" — that is a spec violation.
6. **App Store submission is gated.** Before the cloud build kicks off, the user must satisfy 4 prerequisites. Skipping any of them produces a known, documented failure.
7. **The agent has named skills** (e.g. `/appstore-preflight`). ZionX should expose its hooks the same way — with discoverable skill names the agent invokes by user request.
8. **Restore / version history is expected.** Users assume they can roll back without losing other work.

These conclusions are the contract that will be encoded as additional spec runner rules in `docs/zionx-studio-spec.md`. Each conclusion = one or more rules. Each rule cites the line in this audit it came from.

---

## 15. Direct sources index (for compliance audit)

All citations above resolve to one of:

- https://www.vibecodeapp.com/docs/index
- https://www.vibecodeapp.com/docs/getting-started/creating-first-app
- https://www.vibecodeapp.com/docs/getting-started/pinch-to-build
- https://www.vibecodeapp.com/docs/getting-started/native-ui-components
- https://www.vibecodeapp.com/docs/getting-started/sharing-app
- https://www.vibecodeapp.com/docs/getting-started/deploy-app-store
- https://www.vibecodeapp.com/docs/troubleshooting
- https://www.vibecodeapp.com/docs/faqs
- https://www.vibecodeapp.com/docs/llms.txt
- https://rork.com/faq
- https://docs.rork.com/introduction/build-your-first-app
- https://docs.rork.com/introduction/introduction/prompting-strategy
- https://docs.rork.com/rork-expo
- https://docs.rork.com/llms.txt

Last fetched: 2026-05-28.
