---
"three-bells": minor
---

Redesign the dashboard and stop full-page reloads

- Every action (log, edit, delete, bundle, mark paid, unsubmit) now updates in place with htmx and keeps your scroll position
- Edit entries inline in the history list; Escape cancels
- Undo for deleted entries and payment status changes; a styled confirm replaces browser dialogs
- New phone-first layout: sticky top bar with the timer, bottom-sheet entry form, floating add button, no more cramped RMP cards
- History grouped by month with totals; bundled entries link to their RMP
- RMP cards expand to show their entries and can copy their notes
- "Bundle all" when more than one RMP is ready
- Clear "Time range / Manual hours" toggle with a live hours preview and inline validation messages
- Dark mode, refreshed visual design and icons
- Fix entry times shifting when the server isn't running in UTC; "today" now uses your local date
- Split the single 2,400-line server file into routes, views and lib modules; add unit tests
- Tighter Content Security Policy (no inline scripts)
- The app now lives at `/` (and the changelog at `/changelog`); old `/api` links redirect
