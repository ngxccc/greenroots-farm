import { beforeEach, describe, expect, test } from "bun:test";
import { useCartStore } from "./cart.store";
import type { StorefrontProduct } from "@/types/storefront.types";

const sampleTomato: StorefrontProduct = {
  id: "prod-tomato",
  slug: "ca-chua-bi-huu-co",
  name: "Cà chua bi hữu cơ",
  unit: "hộp",
  unitLabel: "500g",
  basePriceVnd: 56000,
  salePriceVnd: 28000,
  availableQuantity: 3,
  categoryKey: "fruit",
  badgeText: "Cắt 4h sáng",
  hoursRemaining: 26,
  isRescueDeal: true,
  isSubscriptionEligible: true,
};

describe("useCartStore", () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [],
      selectedAddressId: null,
      selectedDistrictCode: "760",
      streetAddress: "",
      receiverName: undefined,
      phoneNumber: undefined,
    });
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

  test("removes item when decremented to zero", () => {
    useCartStore.getState().addItem(sampleTomato, 1);
    useCartStore.getState().decrementItem(sampleTomato.id);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  test("updates delivery address and retains saved addressId", () => {
    useCartStore.getState().setDeliveryAddress({
      addressId: "addr-01",
      districtCode: "769",
      streetAddress: "123 Nguyễn Huệ, P. Bến Nghé",
      receiverName: "Nguyễn Văn A",
      phoneNumber: "0901234567",
    });

    const state = useCartStore.getState();
    expect(state.selectedAddressId).toBe("addr-01");
    expect(state.selectedDistrictCode).toBe("769");
    expect(state.streetAddress).toBe("123 Nguyễn Huệ, P. Bến Nghé");
    expect(state.receiverName).toBe("Nguyễn Văn A");
    expect(state.phoneNumber).toBe("0901234567");
  });

  test("resets selectedAddressId to null when setting manual district", () => {
    useCartStore.getState().setDeliveryAddress({
      addressId: "addr-01",
      districtCode: "769",
      streetAddress: "123 Nguyễn Huệ",
    });

    useCartStore.getState().setDeliveryDistrict("760", "456 Lê Lợi");
    const state = useCartStore.getState();
    expect(state.selectedAddressId).toBeNull();
    expect(state.selectedDistrictCode).toBe("760");
    expect(state.streetAddress).toBe("456 Lê Lợi");
  });
});
