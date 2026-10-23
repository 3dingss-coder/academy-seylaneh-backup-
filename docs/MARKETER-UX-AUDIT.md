# Marketer Panel UX Audit & Product Needs

**Date:** 2026-10-23

**Scope:** presentation and information hierarchy across the marketer experience. Existing routes, API-backed data, permissions, learning rules, and interaction capabilities remain authoritative. No new product capability is included in this audit.

## Product principles

1. A marketer should understand the next useful learning action without searching through the catalog.
2. Progress, counts, points, deadlines, unread state, badge status, and quiz results must come from the existing API; reference-screen sample numbers are never copied into the UI.
3. The interface should distinguish *new*, *in progress*, *completed*, *locked*, *unread*, and *overdue* states using the shared semantic tokens, not color alone.
4. Screens without a local visual reference are inferred from their existing route, endpoint, tests, and Stage 4 handoff requirements. This is a layout clarification, not approval to add functionality.
5. Preserve RTL, existing marketer capabilities, and the immersive learning roadmap. Keep marketer visual changes role-scoped; do not change the marketer profile or Admin/Manager product behavior.

## Reference coverage

| Area | Available reference/evidence | How it informs the audit |
| --- | --- | --- |
| Home | `docs/design-handoff-v2/screenshots/02-marketer-home-mobile.png`, `docs/design-refresh/after/m-home-d.png`, and the marketer experience handoff | One dominant next action, with progress, live counts, points, overdue status, and assigned learning still easy to find. |
| Learning list | `docs/design-handoff-v2/screenshots/03-marketer-learn-mobile.png` and `docs/design-refresh/after/m-learn-d.png` | Status filters and real assigned courses remain scannable; product/brand imagery supports recognition. |
| Cards/rewards | `docs/design-refresh/after/m-cards-d.png`, plus the existing points/badges API and tests | Total points receive a deep-green hero; badge and ledger details remain below it. Amber is paired with dark text. |
| Profile | `docs/design-handoff-v2/screenshots/04-marketer-profile-mobile.png` and `docs/design-refresh/after/m-profile-d.png` | Reference retained for context only. The profile page was explicitly left unchanged. |
| Learning path | Existing route, package ordering, tests, and the Drive screenshot metadata for `مسیر یادگیری من.png` | A focused, immersive roadmap should show order and live state, with a route back to the complete course list. The Drive image itself was not locally available for pixel-level review. |
| Package, section, quiz, messages, mentor | Existing page behavior, API types, tests, and `docs/design-handoff-v2/STAGE-4-MARKETER.md`; no local screenshot for these routes | Needs below are inferred from the shipped capabilities and are intentionally conservative. No new interactions are proposed. |

## Page-by-page user needs

| Page | Inferred user need | Current design treatment / behavior to preserve |
| --- | --- | --- |
| **Home** (`/`) | “What should I do next?” plus a trustworthy snapshot of learning activity. | Keep the real start/resume/quiz action and mentor nudge. Surface API-backed overall progress, in-progress/new/completed counts, points, deadlines, assigned-course progress, and overdue notice. Show a completion celebration only when the API confirms every assigned package is complete; otherwise use neutral copy. |
| **Learning list** (`/learn/all`) | Find an assigned course and understand its status, brand/product, progress, and deadline. | Retain all / in-progress / completed and brand filters, existing package links, and product imagery. Use shared warm surfaces and semantic state colors. |
| **Learning path** (`/learn`) | Understand the sequence of assigned training and identify completed, active, and not-yet-started steps. | Keep the immersive roadmap and all-courses link; render status from each package, retain ordering, mascot artwork, and existing navigation. |
| **Package detail** (`/packages/:id`) | Understand what the course covers, how far along it is, what to do next, and which parts are locked. | Preserve package/brand/product identity, progress and deadline, section order and lock reasons, quiz access, manager notes, and the existing mentor launcher. |
| **Section player** (`/sections/:id`) | Play or resume audio/video, understand progress and completion threshold, and reach the course quiz. | Preserve file and YouTube playback, retry, speed controls, playback tracking, resume position, quiz action, and package/mentor context. Keep media-error messaging clear and semantic. |
| **Quiz** (`/quiz/:sectionId`) | Know the rules and remaining attempts, answer confidently, review the result, and understand the next available action. | Preserve local draft recovery, server-only grading, pass/fail review, attempt limits, rewatch/retake states, and next-section/package navigation. No answer key is exposed to the client. |
| **Messages** (`/messages`) | Distinguish system notifications from manager messages, spot unread items, and open linked context. | Keep both tabs, unread counts, read-all/read-one behavior, action references, manager-message package links, and clear empty states. |
| **Mentor** (`/mentor`) | Ask a question and understand the answer’s supporting context without losing access to the current learning task. | Keep the chat-focused layout and all existing text, microphone, voice-call, image, text-file, link/reference, source, and feedback paths. No feature is added or removed. |
| **Points & badges** (`/cards`) | See the current server-awarded balance, which badges are earned or locked, and why points changed. | Use the deep-green points hero from the desktop reference; retain API data, earned dates, locked states, and the ledger’s reason/date/amount. |
| **Profile** (`/profile`) | Existing profile needs remain unchanged. | No profile-page edits are part of this audit. |

## Design-system application

- Use the role-scoped marketer canvas, surfaces, border, ink, muted text, and brand tokens added to `apps/web/src/styles/index.css`; the corresponding dark-theme mappings are present.
- Keep shared semantic success, danger, warning, and accent tokens for statuses. The accent is not used with white text.
- Keep touch targets, focus visibility, RTL layout, and existing desktop horizontal navigation/mobile Home–Learning–Messages–Cards tabs.
- Use the supplied mascot/brand assets only where they support an empty, completion, or mentor state; utility screens should prioritize their task content.
- Keep the 3D icon set role-scoped: six completed batches cover navigation, deadlines, notifications and manager notes, achievement symbols, quiz outcomes/review/retake states, the generic profile fallback, and the mentor-chat plus/microphone/send controls. The Home header still prefers the account's real `avatarUrl`; only its fallback uses the neutral 3D profile icon, and `ProfilePage` remains unchanged. Home shortcuts and mentor prompts reuse existing learning, assignment, quiz, medal, and mentor art. Keep compact status/action glyphs crisp and functional where appropriate: PackageCard duration/completion, badge locks, quiz answer correctness, and MentorChat inner attachment types, voice-call, link, remove, and feedback controls remain Lucide. 3D images are decorative (`alt=""`); links and controls keep their accessible names. The generic `BottomNav` retains its legacy Lucide fallback, while `MarketerLayout` opts in to its 3D navigation icons explicitly.

## Scope and approval boundary

This audit changes presentation and surfaces existing API data and existing routes only. No new feature requiring product approval was found or implemented. If a later iteration proposes one, document its behavior, user problem, and value first and wait for explicit approval. No missing asset or reference currently blocks this implementation; the profile remains untouched as directed.
