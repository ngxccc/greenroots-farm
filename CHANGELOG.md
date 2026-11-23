# Changelog

Generated at release time from merged pull requests, by `bun run release`.
Do not edit by hand; the sections come from the same generator as the GitHub release.

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
