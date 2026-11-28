# Changelog

Generated at release time from merged pull requests, by `bun run release`.
Do not edit by hand; the sections come from the same generator as the GitHub release.

## 0.2.0 - 2026-11-28

<!-- Release notes generated using configuration in .github/release.yml at e1d24d025642de1187a44839d4c09ff2420b1497 -->

## What's Changed
### Breaking Changes
* feat(api)!: enforce surface role separation on customer and staff auth by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/239
* feat(api,storefront)!: replace districtCode with Goong Place Autocomplete geocoding by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/266
### Features
* feat(storefront): wire customer profile, loyalty balance, and global logout UI by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/186
* feat(storefront): wire customer address book page and quick address dialog by @VandesDang in https://github.com/ngxccc/greenroots-farm/pull/114
* feat(storefront): wire SF-01 home showcase with live categories and products by @VandesDang in https://github.com/ngxccc/greenroots-farm/pull/189
* feat(storefront): wire SF-02 product detail page and live stock status by @VandesDang in https://github.com/ngxccc/greenroots-farm/pull/188
* feat(storefront): flatten policy, about, and error recovery pages by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/201
* feat(storefront): wire SF-02 product catalog listing and filtering by @VandesDang in https://github.com/ngxccc/greenroots-farm/pull/202
* feat(storefront): wire live SF-03 QR traceability and 5-col home grid by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/207
* feat(storefront): wire dynamic shipping quote BFF and UI by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/208
* feat(storefront): wire HeaderCartPopover, /cart validation, and SF-05 COD checkout by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/212
* feat(storefront): wire customer order history and SF-05 detail view by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/224
* feat(storefront,api): forward sanitized client User-Agent and shared-secret BFF IP metadata by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/226
* feat(api): add 24h post-delivery complaint submission API by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/240
* feat(api): implement subscription plans CRUD and public/admin endpoints by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/259
* feat(api): add PaymentsModule driver seam, MockPaymentDriver, and PayOSAdapter by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/260
* feat(api): implement prepaid subscription checkout and snapshot contract by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/262
* feat(api): wire 15-min PayOS reservation TTL and link cancellation into expiry sweep by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/263
* feat(api): implement staff payment ledger and COD confirmation by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/264
* feat(api): implement Goong and Vietmap ShippingDriver adapters by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/267
* feat(api): implement staff complaints list and triage endpoints by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/269
* feat(api): implement Admin complaint refund and zero-VND replacement resolution by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/270
* feat(api): expose active FEFO batch trace and rescue summary on product detail by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/271
* feat(api): implement operational analytics endpoint for Admin and SuperAdmin by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/272
* feat(api): add SuperAdmin financial cashflow analytics endpoint by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/273
* feat(api): implement periodic batch expiry and near-expiry transition worker by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/274
* feat(api): implement near-expiry inventory query, batch flash-sale toggle, and FEFO price splitting by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/275
* feat(api): expose active customer sessions endpoint by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/276
* feat(orders,ui): add active PayOS reconciliation, cancel handling, and UI polish by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/278
* feat(storefront): wire SF-05 complaint form with 24h lock and media cleanup by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/280
* feat(subscriptions): implement SF-04 plan catalog, inline checkout, and PayOS return status by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/285
* feat(storefront): display customer active sessions on profile security card by @VandesDang in https://github.com/ngxccc/greenroots-farm/pull/279
* feat(backoffice): implement farm plots and seasons lifecycle (#129) by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/287
* feat(backoffice): implement BO-10 staff RBAC and farm settings by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/288
* feat(backoffice): implement BO-11 catalog & product CRUD by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/289
* feat(backoffice): refine sidebar shell, tabs, and dedicated farm settings route by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/290
* feat(backoffice): implement 2-step waste review and approval UI by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/291
* feat(backoffice): harvest batch intake, thermal QR print, and waste proposal by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/292
* feat(api): add staff order queue endpoint and activeSubscriberCount for Wave 3 by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/297
* feat(backoffice): wire near-expiry batches and rescue flash sale UI by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/298
* feat(backoffice): implement seasonal subscription plans catalog UI by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/299
* feat(backoffice): wire fulfillment orders queue, FEFO confirmation, FSM, and pick list by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/300
* feat(backoffice): implement operational analytics dashboard on /analytics by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/302
* feat(backoffice): implement payment ledger, COD reconciliation, and SuperAdmin cashflow view by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/303
* feat(backoffice): implement customer complaints management, triage, and resolution by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/304
### Bug Fixes
* fix(storefront): redirect authenticated users from forgot-password and tokenless verify-email by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/225
* fix(backoffice): sanitize blob preview URL for CodeQL js/xss-through-dom by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/295
* fix(backoffice): prevent horizontal overflow and render SelectValue labels on farming logs by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/296
* fix(backoffice): clarify freeKmThreshold label as surcharge-free km threshold by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/305
### Refactors
* refactor(shared): decouple Lâm Đồng farm origin and TP.HCM fulfillment hub by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/200
* refactor(storefront): flatten account pages and restrain semantic surfaces by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/203
* refactor(storefront): split storefront.service.ts by domain by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/206
* refactor(storefront): colocate auth modules under features/auth by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/218
* refactor(storefront): colocate address actions and schemas under features/account by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/219
* refactor(storefront): colocate shipping quote handler and hooks under features/shipping by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/220
* refactor(storefront): colocate catalog services and mappers under features/catalog by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/221
* refactor(storefront): colocate traceability service and cleanup orders barrel by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/222
* core(orders): reserve FEFO stock at checkout, add COD expiry sweep, and customer self-cancel by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/237
* core(backoffice): wire staff cookie auth, password recovery, and 401/403 session handling by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/286
### Maintenance
* ci(infra): add Next.js build cache for storefront CI job by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/223
* chore(api): add MEDIA_DRIVER, lint API tests, and refine standards by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/241
* chore(api): verify and harden rate limits on auth and payment endpoints by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/268
### Tests
* test(api): add FEFO FOR UPDATE checkout concurrency and deadlock race suites by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/230
* test(api): add concurrent and fail-closed Idempotency-Key suites by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/236
* test(api): add cascade and multi-row immutability tests for farming_logs by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/238
### Other Changes
* feat(storefront): build farm about and policy hub pages by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/191
* feat(api): PayOS two-phase checkout and HMAC webhook reconciliation by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/261
* docs(standards): require useReactTable with @greenroots/ui Table in backoffice by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/294
* feat(backoffice): implement farming logs timeline, media upload, and correction modal by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/293
* chore(backoffice): add recharts, /analytics route, and sales/admin access to /finance/payments by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/301
* fix(api): wait for tunnel propagation and retry PayOS confirm-webhook by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/306

## New Contributors
* @VandesDang made their first contribution in https://github.com/ngxccc/greenroots-farm/pull/114

**Full Changelog**: https://github.com/ngxccc/greenroots-farm/compare/v0.1.0...v0.2.0
## 0.1.0 - 2026-11-23

<!-- Release notes generated using configuration in .github/release.yml at d9c352b0332f05306ade587bd67a65fc1f44ba41 -->

## What's Changed
### Breaking Changes
* refactor(api)!: drop deprecated batches.qrCodeUrl column and DTO field by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/105
* feat(api)!: implement ShippingDriver with HaversineShippingDriver and quote API by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/108
* fix(api)!: validate shippingConfig radius invariants and seed radii by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/115
### Features
* feat(backend): add Step 1 API, database schema, migrations, and seeding by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/2
* feat(storefront): initialize @greenroots/ui, Storefront Next.js 16, and CI by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/4
* feat(backoffice): initialize Vite + React 19 + TanStack Suite and align ports by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/6
* feat(api): core api infra, openapi contracts, and error architecture by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/63
* feat(api): complete auth lifecycle, session rotation, and redis revocation by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/72
* feat(api): implement self-service profile endpoints by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/90
* feat(api): implement customer address book endpoints by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/91
* feat(api): implement staff RBAC management, audit log, and session revocation by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/92
* feat(api): implement farm settings and plot endpoints by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/93
* feat(api): implement season lifecycle endpoints by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/94
* feat(api): implement append-only farming logs and correction linkage by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/95
* feat(api): implement public QR traceability endpoint and epoch cache by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/96
* feat(api): implement category and product CRUD with public and admin boundaries by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/97
* feat(api): implement batch intake and shelf-life tracking by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/98
* feat(api): expose live product stock aggregation by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/101
* feat(api): implement batch QR label generation and public origin guard by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/103
* feat(api): implement 2-step waste proposal and approval workflow by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/104
* feat(api): implement cart validation and COD checkout transaction by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/109
* feat(api): implement customer order history endpoints by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/111
* feat(api): implement FEFO confirmation and 8-state OrderStatus FSM by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/112
* feat(api): implement order pick list endpoint by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/113
* feat(storefront): wire auth session, single-flight refresh, and storefront layout by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/146
* feat(storefront): add 404, incident boundaries, and /trace lookup by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/148
* feat(storefront): add customer login and registration screens by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/151
* feat(storefront): build email verification and password recovery screens by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/153
### Bug Fixes
* fix(ci): consolidate weekly dependabot updates into single pull request by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/69
* fix(infra): always run CodeQL SARIF configurations in Security Scan by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/164
* fix(infra): cap pre-1.0 breaking release suggestions to minor by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/179
* fix(infra): pass --no-error-on-unmatched-pattern when formatting changelog by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/180
### Performance
* perf(infra): optimize check-tailwind-canonical test and CLI runtime by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/165
* perf(infra): parallelize root check-types and test scripts by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/167
* perf(api): cache auth test password hashes, optimize table truncation, and fix E2E discovery by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/171
* perf(api): parallelize API E2E files with Redis DB and schema worker isolation by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/172
* perf(ci): decouple API static checks and unit tests from E2E containers by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/173
* perf(api): allocate 2 CPUs to dev Postgres and set E2E concurrency to 4 by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/175
### Refactors
* refactor(api): separate runtime module constants from pure interfaces by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/116
* refactor(storefront): migrate raw HTML labels to shared Label primitive by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/162
* refactor(backoffice): adopt Shadcn Table, Textarea, and Button primitives by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/176
* refactor(storefront): migrate header auth menu and chrome buttons to Shadcn primitives by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/177
* refactor(storefront): adopt InputGroup, Progress, Alert, Badge, Skeleton by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/178
### Maintenance
* chore(infra): adopt engineering standards and repo automation by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/1
* chore(docs): use plain bullets for issue acceptance criteria by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/100
* chore(infra): require UI screenshot evidence in PR template by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/152
* chore(ci): enforce Tailwind v4 canonical classes across UI workspaces by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/154
* chore(ci): structure pull request template without redundant type section by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/155
* chore(ci): add job-level path filtering to CI and Security Scan by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/157
### Documentation
* docs(adr): split ADRs and add backlog split register by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/89
### Tests
* test(api): align describe and test titles with the testing standard by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/118
* test(ci): enforce test naming rules via AST compliance suite by @ngxccc in https://github.com/ngxccc/greenroots-farm/pull/119

## New Contributors
* @ngxccc made their first contribution in https://github.com/ngxccc/greenroots-farm/pull/1
* @dependabot[bot] made their first contribution in https://github.com/ngxccc/greenroots-farm/pull/71

**Full Changelog**: https://github.com/ngxccc/greenroots-farm/commits/v0.1.0
