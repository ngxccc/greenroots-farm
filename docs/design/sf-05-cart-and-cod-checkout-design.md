---
title: "SF-05 Cart Validation, Header Cart Popover & COD Checkout Design"
docType: "feature-workflow"
status: "approved"
date: "2026-11-24"
author: "ngxccc"
version: "1.0.0"
---

# SF-05 Cart Validation, Header Cart Popover & COD Checkout Design

## Overview & Context

This document specifies the Storefront architecture, BFF Server Actions, feature-colocated layout, and UI behavior for `#141` (split from `#50`, parent epic `#10`), consuming the backend contracts implemented in `#84` (`POST /api/v1/orders/validate-cart`, `POST /api/v1/orders/checkout`, `docs/design/cod-checkout-and-cart-validation-formal-spec.md`, `ADR-0031`, `ADR-0036`).

During design review against the Stitch HTML mockups (`gi_h_ng_thanh_to_n.html`, `x_c_nh_n_t_h_ng_cod.html`) and the live repository, the following contract drifts and product decisions were resolved:

1. **SSOT Minimum Order Value (`50_000` VND)**: `BUSINESS_RULES.MIN_ORDER_VALUE_VND` in `packages/shared/src/business.constants.ts` is `50_000` (enforced by `OrdersService` and existing unit tests). `packages/shared/GLOSSARY.md` has been aligned to `50,000 VND`. Storefront must reference `BUSINESS_RULES.MIN_ORDER_VALUE_VND` directly.
2. **Mockup Constraints**: The HTML mockups serve strictly as visual, typography, and Organic Minimalism token references (`#15803d`, `#faf8f5`, hairline dividers). Unsupported or contradictory mockup elements are excluded:
   - `Chuyển khoản nhanh VietQR` radio (`#52`, explicit non-goal).
   - Hardcoded `150.000₫` free shipping & `Tiết kiệm ưu đãi trong ngày (-50%)` math errors (shipping is distance-based via `ShippingService`).
   - Per-item `HSD còn Xh` badges and `Dự kiến giao hàng` ETA slots (not present in `ValidateCartResponseDto` or `OrderDto`).
   - Active link to `OrderDetail.html` (`#85` / `#50` sibling non-goal; kept as a disabled placeholder button).
3. **Cart Drawer Replaced by Header Popover + `/cart` Page**: `CartDrawer` (`apps/storefront/src/components/common/cart-drawer.tsx`, currently mounted only in `header.tsx`) is removed in favor of:
   - Desktop hover **Header Cart Popover** (`@greenroots/ui` Base UI `Popover`) for instant local cart preview.
   - Dedicated **`/cart` page** (`apps/storefront/app/(main)/cart/page.tsx`) for cart editing, server validation, and MOV progress.
   - Dedicated **`/checkout` page** (`apps/storefront/app/(main)/checkout/page.tsx`) for `SF-05` COD checkout and inline confirmation.

### Goals

- Add Base UI `Popover` primitive to `packages/ui/src/components/ui/popover.tsx` and export it from `@greenroots/ui`.
- Replace `CartDrawer` in `apps/storefront/src/components/common/header.tsx` with `HeaderCartPopover` (desktop hover preview, click navigates to `/cart`).
- Implement `apps/storefront/app/(main)/cart/page.tsx` with `POST /api/v1/orders/validate-cart` reconciliation (stock shortages, price drift, `BUSINESS_RULES.MIN_ORDER_VALUE_VND` progress bar).
- Implement `apps/storefront/app/(main)/checkout/page.tsx` (`SF-05`) with `POST /api/v1/orders/checkout`, `Idempotency-Key` protection, saved address selection + `AddressDialog`, `DeliveryQuoteSummary`, optional loyalty point redemption (`1 pt = 1 VND`), and inline COD confirmation state.
- Colocate new order/cart/checkout logic under `apps/storefront/src/features/orders/`.

### Non-Goals

- Refactoring legacy `src/lib/auth/*` or `src/lib/address/*` into `src/features/*`.
- PayOS VietQR checkout (`#52`), dynamic shipping quote changes (`#49`), or customer order history/detail (`/orders`, `#85`).
- Persisting `OrderDto` PII (`receiverName`, `receiverPhone`, `shippingAddress`) into `localStorage` or `sessionStorage` (`INV-SF-ADDR-1`).

---

## Architecture & Module Layout

```text
packages/ui/src/components/ui/
└── popover.tsx                     # Base UI (@base-ui/react) Popover primitive

apps/storefront/app/(main)/
├── cart/page.tsx                   # Dedicated /cart page
└── checkout/page.tsx               # SF-05 COD checkout + inline confirmation

apps/storefront/src/features/orders/
├── index.ts
├── actions/
│   └── order-actions.ts            # "use server": validateCartAction, checkoutCodAction
├── schemas/
│   └── order.schema.ts             # Zod schemas mirroring ValidateCartRequestDto & CheckoutRequestDto
├── utils/
│   ├── order-checkout.utils.ts     # Payload signature, idempotency key lifecycle, loyalty clamping
│   └── order-checkout.utils.spec.ts
└── components/
    ├── header-cart-popover.tsx     # Desktop hover Popover (0 API calls, reads useCartStore)
    ├── cart-page-view.tsx          # /cart interactive list, MOV bar, validate-cart reconciliation
    ├── checkout-view.tsx           # /checkout form (address, quote, loyalty, COD submit)
    └── cod-confirmation-view.tsx   # Inline receipt state after 201 Created
```

### BFF Transport (`ADR-0036`)

Both `validateCartAction` and `checkoutCodAction` are Next.js Server Actions in `apps/storefront/src/features/orders/actions/order-actions.ts`:

- Wrapped in `runWithServerActionRefresh()` for transparent `401` single-flight token rotation (`httpOnly` cookies).
- Errors classified via `buildActionFailure()` (`apps/storefront/src/lib/auth/bff-error.ts`), preserving RFC 9457 `code`, `detail`, and `invalidParams` (e.g., `OUT_OF_DELIVERY_RADIUS`, `ORDER_BELOW_MINIMUM_VALUE`, `INSUFFICIENT_STOCK`, `ORDER_COD_DISABLED`).
- Because Server Actions do not support `AbortController`, client components (`CartPageView`, `CheckoutView`) use **debouncing + `requestSeqRef`** on `validateCartAction` to discard out-of-order responses during rapid quantity/address/loyalty changes.

---

## Operational Flows & Invariants

### 1. Header Cart Popover (`HeaderCartPopover`)

- **Desktop**: Hovering the header `ShoppingCart` icon (`onMouseEnter` / `onMouseLeave` with `150ms` close delay) opens Base UI `PopoverContent` reading solely from `useCartStore` (**zero API calls** on hover to avoid rate-limit exhaustion). Displays up to 5 items, subtotal, `"Xem giỏ hàng"` (`/cart`), and `"Thanh toán"` (`/checkout`).
- **Click / Mobile**: Clicking the cart icon navigates directly to `/cart`.

### 2. `/cart` Page (`CartPageView`)

- **Guest vs Authenticated**:
  - Guest (`user === null`): operates locally on `useCartStore`, displaying `BUSINESS_RULES.MIN_ORDER_VALUE_VND` (`50_000`) progress bar without calling `validateCartAction` (avoiding `401`).
  - Authenticated (`user.role === "customer"`): calls `validateCartAction` on mount and debounced on item/quantity changes (guarded by `requestSeqRef`).
- **Drift Reconciliation**:
  - **Price drift**: If server `unitPriceVnd !== item.unitPriceVnd`, sync the new price into `useCartStore` and display an inline `"Giá vừa được cập nhật theo nông trại"` notice on the affected item.
  - **Stock / Availability (`INSUFFICIENT_STOCK` / `PRODUCT_UNAVAILABLE`)**: Never silently delete items or clamp user quantities. Render a destructive inline badge (`Hết hàng` or `Chỉ còn X <đơn vị>`) with a 1-click `"Điều chỉnh về X"` or `"Xóa"` button.
- **Checkout Navigation Gate**: Disable `"Tiến hành thanh toán"` when cart is empty, `subtotalVnd < BUSINESS_RULES.MIN_ORDER_VALUE_VND`, or any item has `PRODUCT_UNAVAILABLE` / `INSUFFICIENT_STOCK`. Do **not** block navigation when `shipping === null` (no saved address yet) or `!shipping.isDeliverable`, so customers can select or add a valid address on `/checkout`.

### 3. `/checkout` Page (`CheckoutView` & `CodConfirmationView`)

- **Auth & Role Gate**: Redirect unauthenticated visitors to `/login?redirect=/checkout`. If `user.role !== "customer"`, block checkout with a localized role error.
- **Address & Shipping Quote**:
  - Hydrate saved addresses via `useDeliveryAddressStore` (`listAddressesAction`). If the customer has zero addresses, render an inline prompt to open `AddressDialog` (`apps/storefront/src/components/common/address-dialog.tsx`) without losing cart state.
  - Display `DeliveryQuoteSummary` (`apps/storefront/src/components/common/delivery-quote-summary.tsx`) fed by reactive `validateCartAction` (`shipping`, `subtotalVnd`, `discountAmountVnd`, `totalAmountVnd`).
- **Loyalty Redemption (`1 pt = 1 VND`)**:
  - Display `availableLoyaltyPoints` from `validateCartAction`.
  - Provide a quick toggle (`"Dùng tối đa X điểm"`) plus an optional numeric input clamped to `0..min(availableLoyaltyPoints, subtotalVnd)`. Loyalty discount applies only to `subtotalVnd`, never `shippingFeeVnd`.
- **`Idempotency-Key` Lifecycle**:
  - Maintain `{ signature, key }` in a `useRef`.
  - Compute `signature` from normalized `(items, addressId, loyaltyPoints)`.
  - Reuse the same `crypto.randomUUID()` when retrying an identical payload (double-click, network error, `503 SERVICE_UNAVAILABLE`).
  - Generate a fresh `crypto.randomUUID()` whenever `signature` changes or after a successful `201 Created`.
- **Inline COD Confirmation (`CodConfirmationView`)**:
  - On `201 Created`, call `useCartStore.getState().clearCart()` and transition `/checkout` state to render `CodConfirmationView` with `OrderDto` (`orderCode`, `paymentMethod`, `totalAmountVnd`, `discountAmountVnd`/`loyaltyPointsUsed` if `> 0`, `receiverName`, `receiverPhone`, `shippingAddress`, `items`).
  - Keep `"Xem chi tiết đơn hàng"` as a disabled placeholder button until `#85` is implemented, paired with an active `"Tiếp tục mua sắm"` link (`/`).

---

## Verification Plan

1. **Unit tests**:
   - `apps/storefront/src/features/orders/utils/order-checkout.utils.spec.ts`: payload signature determinism, `Idempotency-Key` reuse vs regeneration, loyalty clamping (`min(requested, available, subtotal)`), MOV threshold helper.
   - `apps/storefront/src/features/orders/actions/order-actions.spec.ts`: `validateCartAction` and `checkoutCodAction` (Zod validation, `Idempotency-Key` header forwarding, `401` refresh retry, `422`/`409`/`503` error mapping).
2. **Type-check, Lint & Storefront Suite**:
   - `bun run check`
   - `bun run test:storefront`
