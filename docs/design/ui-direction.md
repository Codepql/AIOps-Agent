# OneCall AI UI Direction

## Design Read

OneCall should feel like a live market terminal for production systems: dense,
fast to scan, numeric, and operational. The recognizable idea is that services
behave like watched instruments, while alerts and health changes read like
market movement.

## Visual Language

- Canvas: cool light gray with white data panels; dark mode is not the default.
- Surfaces: white and soft-gray panels separated by clear one-pixel rules.
- Primary accent: market yellow for selection, focus, and primary actions.
- Positive: exchange green, always paired with text or a positive sign.
- Negative: exchange red, always paired with text or a negative sign.
- Typography: system sans for Chinese; tabular monospace for values and status.
  Body text is at least 14px, operational data and navigation at least 13px,
  supporting labels at least 12px, and decorative indices at least 11px.
- Density: 4/8/12/16/24 spacing; square corners; no floating card stack.
- Signature: a persistent system ticker plus an intraday-style service-health
  line chart and watchlist.
- Motion: only live-point pulse and short interaction transitions; disable with
  `prefers-reduced-motion`.

## Page Structure

1. Compact left navigation for Chat, Diagnosis, and Knowledge.
2. Header with product context and session state.
3. Horizontal ticker presenting API, PostgreSQL, MCP, and vector health.
4. Chat empty state split into a service trend chart and a service watchlist.
5. Command shortcuts and a fixed command composer.
6. Diagnosis and knowledge views reuse the same dense terminal framing.

## Responsive Rules

- 1440px: navigation, chart, watchlist, and command area visible together.
- 1024px: narrower navigation; chart and watchlist remain side by side.
- 768px: navigation becomes a horizontal header; chart stacks over watchlist.
- 320px: compact ticker scrolls horizontally; secondary chart labels collapse.

## Accessibility Contract

- Every status color includes status text and/or a signed value.
- Keyboard order follows navigation, ticker context, workspace, then composer.
- Focus uses a two-pixel market-yellow outline.
- Live diagnosis and upload feedback retain `aria-live` announcements.
- Controls maintain at least a 40px mobile touch target.

## Implementation Handoff

- Change `app/page.tsx` and `app/globals.css` only.
- Keep all existing API calls, SSE behavior, and feature states.
- Add no visual dependency or icon package.
- Acceptance: no dark full-page canvas, no green-tinted canvas, no purple/blue
  gradient, no glow-heavy AI motif, no unreadable microtype, and no centered
  marketing hero with three generic cards.
