# Phase 6 Safari / iPad verification

Use a clean production build when verifying CSS assets:

1. Stop `npm run dev`.
2. Remove `.next`.
3. Run `npm run build`, then `npm start`.
4. Open Safari Private Browsing to isolate old CSS cache.
5. When testing from a Mac, use Web Inspector and reload with caches disabled.

Check these viewport sizes:

- 768 × 1024
- 810 × 1080
- 820 × 1180
- 834 × 1194
- 1024 × 768
- Split View at approximately 600–700px
- 1280px desktop
- 1440px desktop

Verify:

- Page gutters remain visible on both sides.
- Header uses two intentional rows from 768–1199px.
- PageHeader actions move below content below the 1200px desktop breakpoint.
- Dashboard stats use two columns on tablet and one column in narrow Split View.
- Blue, green, violet, amber, and orange stat accents remain visible.
- PageHeader, sidebar active item, cards, borders, and focus states retain color.
- Mobile/tablet navigation uses the drawer below 1200px.
