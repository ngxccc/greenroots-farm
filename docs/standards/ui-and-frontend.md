# UI & Frontend Standards

Governs `packages/ui`, `apps/storefront`, and `apps/backoffice`. Apply layers bottom-up (`UI-1` to `UI-5`).

## UI-1 — Design Tokens, Typography & Assets

- **Semantic Theme Tokens**: Import `@greenroots/ui/globals.css` (`packages/ui/src/styles/globals.css`) and style via semantic token classes (`bg-surface-warm`, `bg-surface-card`, `bg-brand-forest`, `text-brand-dark`, `text-status-spoiled`, `border-border-subtle`) instead of raw hex arbitrary utilities (`bg-[#...]`).
- **Icons**: Import all icons from `lucide-react` (version managed in root `package.json` `catalog:`). Replace `Material Symbols Outlined` spans and Google icon stylesheets from Stitch prototypes with `lucide-react` components.
- **Typography & Numbers**: Use `Be Vietnam Pro` (`--font-sans`) across UI copy, Vietnamese badges, reference IDs, and batch codes (avoid loading extra monospace Google Fonts or applying `font-mono` to Vietnamese text). Apply `tabular-nums` to prices, weights, counts, percentages, reference IDs, and timestamps; format money via `formatVnd()` (integer VND, `ADR-0004`).
- **Images & Media**: Load remote images strictly from approved `apps/storefront/next.config.ts` `images.remotePatterns` (`res.cloudinary.com`, `placehold.co`, `img.vietqr.io`) or use local SVG/icon visual slots. Strip temporary Stitch `lh3.googleusercontent.com` URLs before committing.

## UI-2 — Primitives & Layout Shell

- **Shared Primitives SSOT**: Compose controls, inputs, cards, badges, dialogs, drawers, tabs, and toasts from `packages/ui/src/index.ts` (`@greenroots/ui`) rather than hand-rolling raw `<button>`, `<input>`, card, or modal markup. Promote new generic primitives to `packages/ui` when reused across `>= 2` surfaces (`apps/storefront` and `apps/backoffice`).
- **Layout Shell Parity**: Storefront pages render inside `RootLayout` (`StorefrontHeader` + `<main>` + `StorefrontFooter` in `apps/storefront/app/layout.tsx`). Omit duplicate `<header>`/`<footer>` wrappers copied from standalone Stitch HTML files; only `app/global-error.tsx` renders a minimal self-contained shell.
- **Production Hygiene**: Strip Stitch QA controls (state-switcher preview tabs, inline mock `<script>` handlers) from production components.

## UI-3 — Rendering, Data Fetching & Trust Boundaries

- **Storefront BFF & `Q28` (`ADR-0036`)**: Keep `apps/storefront/src/lib/api-client.ts` strictly server-side (Server Components, Server Actions, BFF Route Handlers). Client components trigger mutations via Server Actions or `/api/auth/*` BFF routes and read client state from `useAuthStore` / `useCartStore`.
- **Backoffice SPA**: Keep `apps/backoffice` browser API calls typed with generated OpenAPI contracts (`ADR-0007`) and store access tokens strictly in memory (`docs/standards/security-and-cryptography.md`, `ADR-0036`).
- **Contracts & Localization**: Import domain enums, constants, and shared labels from `@greenroots/shared`, generate API types via `bun run types:sync` (`ADR-0007`), and map RFC 9457 codes to Vietnamese UI copy via `resolveSharedApiErrorMessage()` (`ADR-0013`).
- **Next.js 16 `cacheComponents: true` & Hydration**: Wrap runtime request reads (`searchParams`, `cookies()`, `headers()`, `connection()`) in `<Suspense>` boundaries (`app/layout.tsx`, route pages). Compute client timestamps (`new Date()`) and client-only fallback tokens inside `useEffect` rather than during render.
- **Server Error Classification**: Call `notFound()` for missing entities (`404`) and `forbidden()` (`experimental.authInterrupts` -> `app/forbidden.tsx`) for `403` access denials in RSCs/Server Actions, because Next.js strips custom `Error` properties before passing errors to `app/error.tsx` in production.

## UI-4 — Error Recovery, Navigation & Accessibility

- **Sanitized Error Boundaries**: Render only safe Vietnamese fallback copy, `error.digest` (or a client-generated fallback reference), and `FARM_METADATA.hotline` (`apps/storefront/src/constants/farm-metadata.constant.ts`) in `error.tsx` / `global-error.tsx`. Keep `error.message`, `error.stack`, internal URLs, and PII out of the DOM.
- **Verified Links & Anchors**: Every `<Link href>` and `#anchor` MUST target an implemented route or DOM element ID in the app (reconcile Stitch targets such as `#deal-tuoi` -> `/#rescue` and `/trace` before committing).
- **Accessibility & Copy**: Write user-facing copy in Vietnamese and code/comments in English (`docs/standards/code-comment-taxonomy.md`). Mark decorative icons `aria-hidden="true"`, provide `aria-label` on icon-only controls, and preserve visible `focus-visible` focus rings.

## UI-5 — Verification & Tests

- **Logic, Proxy & Security Boundary Specs**: Write `*.spec.ts` unit tests for pure UI/navigation helpers, auth/proxy gates, state stores, and security/error-boundary invariants (for example suppressing `error.message`/`error.stack` or enforcing `notFound()`/`forbidden()` guards), following `docs/standards/testing-and-fixtures.md` naming (`// Invariant: INV-...`). Skip brittle component markup/copy snapshot tests; cover visual flows via `next build` and E2E suites.
- **Required Gates**: Run `bun run check` and `bun run test:storefront` / `bun run test:backoffice` cleanly before review.
