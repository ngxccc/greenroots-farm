import { beforeEach, describe, expect, test } from "bun:test";
import { useCartStore } from "./cart.store";
import type { StorefrontProduct } from "@/features/catalog/types/catalog.types";

const sampleTomato: StorefrontProduct = {
  id: "prod-tomato",
  slug: "ca-chua-bi-huu-co",
  name: "Cà chua bi hữu cơ",
  unit: "hộp",
  unitLabel: "500g",
  basePriceVnd: 56000,
  salePriceVnd: 28000,
  availableQuantity: 3,
  badgeText: "VietGAP",
  hoursRemaining: 26,
  isRescueDeal: true,
  isSubscriptionEligible: true,
};

describe("useCartStore", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
  });

  test("adds item using sale price when rescue deal is active", () => {
    useCartStore.getState().addItem(sampleTomato, 2);
    const items = useCartStore.getState().items;

    expect(items).toHaveLength(1);
    expect(items[0]?.unitPriceVnd).toBe(28000);
    expect(items[0]?.originalPriceVnd).toBe(56000);
    expect(items[0]?.quantity).toBe(2);
  });

  test("clamps quantity to available batch quantity", () => {
    useCartStore.getState().addItem(sampleTomato, 10);
    expect(useCartStore.getState().items[0]?.quantity).toBe(3);

    useCartStore.getState().incrementItem(sampleTomato.id);
    expect(useCartStore.getState().items[0]?.quantity).toBe(3);
  });

  test("clamps quantity to fractional stock when availableQuantity is below one unit", () => {
    const halfKgProduct: StorefrontProduct = {
      ...sampleTomato,
      id: "prod-half-kg",
      unit: "kg",
      unitLabel: "1 kg",
      availableQuantity: 0.5,
    };

    useCartStore.getState().addItem(halfKgProduct, 1);
    expect(useCartStore.getState().items[0]?.quantity).toBe(0.5);

    useCartStore.getState().addItem(halfKgProduct, 0.25);
    expect(useCartStore.getState().items[0]?.quantity).toBe(0.5);

    useCartStore.getState().setQuantity(halfKgProduct.id, 0.3);
    expect(useCartStore.getState().items[0]?.quantity).toBe(0.3);

    useCartStore.getState().incrementItem(halfKgProduct.id);
    expect(useCartStore.getState().items[0]?.quantity).toBe(0.5);
  });

  test("syncs persisted cart item with increased, decreased, and exhausted live catalog stock", () => {
    useCartStore.getState().addItem(sampleTomato, 3);
    expect(useCartStore.getState().items[0]?.availableQuantity).toBe(3);

    // Live stock increased from 3 -> 10: increment must allow stepping past stale ceiling 3.
    const restockedTomato: StorefrontProduct = {
      ...sampleTomato,
      availableQuantity: 10,
      salePriceVnd: 25000,
    };
    useCartStore.getState().syncProductSnapshot(restockedTomato);
    expect(useCartStore.getState().items[0]?.availableQuantity).toBe(10);
    expect(useCartStore.getState().items[0]?.unitPriceVnd).toBe(25000);
    useCartStore.getState().incrementItem(sampleTomato.id);
    expect(useCartStore.getState().items[0]?.quantity).toBe(4);

    // Live stock decreased from 10 -> 2: cached quantity 4 clamps down to 2.
    useCartStore.getState().syncProductSnapshot({
      ...restockedTomato,
      availableQuantity: 2,
    });
    expect(useCartStore.getState().items[0]?.availableQuantity).toBe(2);
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);

    // Live stock exhausted: item is removed.
    useCartStore.getState().syncProductSnapshot({
      ...restockedTomato,
      availableQuantity: 0,
    });
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  test("removes item when decremented to zero", () => {
    useCartStore.getState().addItem(sampleTomato, 1);
    useCartStore.getState().decrementItem(sampleTomato.id);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  // Invariant: INV-SF-ADDR-1
  test("excludes streetAddress PII from persisted storage snapshot", () => {
    useCartStore.setState({ streetAddress: "142 Lê Đức Thọ" });
    const state = useCartStore.getState();
    const persisted = useCartStore.persist
      .getOptions()
      .partialize?.(state) as Record<string, unknown>;

    expect(persisted).toEqual({
      items: [],
    });
    expect(persisted).not.toHaveProperty("streetAddress");
    expect(persisted).not.toHaveProperty("selectedDistrictCode");
    expect(persisted).not.toHaveProperty("receiverName");
    expect(persisted).not.toHaveProperty("phoneNumber");
  });
});
