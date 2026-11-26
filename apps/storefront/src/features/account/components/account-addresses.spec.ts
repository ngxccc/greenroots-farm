import { describe, expect, it, mock } from "bun:test";
import { createRequire } from "node:module";
import path from "node:path";
import { Window } from "happy-dom";
import { createElement, useLayoutEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { API_ERROR_CODES } from "@greenroots/shared";
import { AddressDialogPanel } from "@/components/common/address-dialog";
import { useAuthStore } from "@/stores/auth.store";
import { useDeliveryAddressStore } from "@/stores/delivery-address.store";
import type { CustomerAddress } from "@/features/account/types/address.types";
import type { StorefrontSessionUser } from "@/features/auth/types/auth.types";
import {
  AccountAddressesListCard,
  buildDeleteAddressConfirmDescription,
} from "./account-addresses-view";
import { AccountSidebarView } from "./account-sidebar";
import { AddressCard } from "./address-card";
import { AddressFormDialogView } from "./address-form-dialog";

const uiRequire = createRequire(import.meta.url);
const baseUiReactDir = path.dirname(
  uiRequire.resolve("@base-ui/react", {
    paths: [path.resolve(import.meta.dir, "../../../../../../packages/ui")],
  }),
);
const baseUiIsoLayoutCjsPath = uiRequire.resolve(
  "@base-ui/utils/useIsoLayoutEffect",
  { paths: [baseUiReactDir] },
);
const baseUiIsoLayoutEsmPath = baseUiIsoLayoutCjsPath.replace(/\.js$/, ".mjs");

void mock.module(baseUiIsoLayoutEsmPath, () => ({
  useIsoLayoutEffect: useLayoutEffect,
}));
void mock.module(baseUiIsoLayoutCjsPath, () => ({
  useIsoLayoutEffect: useLayoutEffect,
}));

const sampleUser: StorefrontSessionUser = {
  id: "0195a8f0-0001-7000-8000-000000000099",
  email: "minhanh@greenroots.vn",
  fullName: "Nguyễn Minh Anh",
  phone: "0908412679",
  role: "customer",
  status: "active",
  rewardPoints: 2450,
  emailVerified: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

const defaultAddress: CustomerAddress = {
  id: "0195a8f0-0001-7000-8000-000000000001",
  receiverName: "Nguyễn Minh Anh",
  phoneNumber: "0908412679",
  streetAddress: "142 Lê Đức Thọ, Phường 15",
  placeId: "mock_place_go_vap",
  district: "Quận Gò Vấp",
  city: "TP. Hồ Chí Minh",
  isDefault: true,
  createdAt: "2026-11-22T00:00:00.000Z",
  updatedAt: "2026-11-22T00:00:00.000Z",
};

const secondaryAddress: CustomerAddress = {
  ...defaultAddress,
  id: "0195a8f0-0001-7000-8000-000000000002",
  receiverName: "Trần Hoàng Nam",
  phoneNumber: "0912345678",
  streetAddress: "72 Nguyễn Thị Minh Khai, Phường Bến Nghé",
  placeId: "mock_place_quan_1",
  district: "Quận 1",
  isDefault: false,
};

const DOM_GLOBAL_KEYS = [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "MutationObserver",
  "ResizeObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const;

async function withHappyDom(fn: (win: Window) => Promise<void>): Promise<void> {
  const win = new Window({ url: "http://localhost:3001/account/addresses" });
  const prev = new Map<string, PropertyDescriptor | undefined>();
  const target = globalThis as Record<string, unknown>;

  for (const key of DOM_GLOBAL_KEYS) {
    prev.set(key, Object.getOwnPropertyDescriptor(target, key));
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }

  try {
    await fn(win);
  } finally {
    win.close();
    for (const key of DOM_GLOBAL_KEYS) {
      const descriptor = prev.get(key);
      if (descriptor) {
        Object.defineProperty(target, key, descriptor);
      } else {
        delete target[key];
      }
    }
  }
}

describe("Storefront Account Addresses Components", () => {
  describe("AccountSidebarView", () => {
    it("highlights addresses route and keeps verified links only when activeSection is addresses", () => {
      const html = renderToStaticMarkup(
        createElement(AccountSidebarView, {
          user: sampleUser,
          activeSection: "addresses",
        }),
      );

      expect(html).toContain('href="/account/addresses"');
      expect(html).toContain('href="/account/orders"');
      expect(html).toContain('href="/account/profile"');
      expect(html).toContain('href="/subscriptions"');
      expect(html).toContain('aria-current="page"');
      expect(html).toContain("Sổ địa chỉ");
      expect(html).not.toContain('href="/orders"');
    });
  });

  describe("AddressCard", () => {
    it("opens Base UI DropdownMenu exposing Set Default only for non-default cards", async () => {
      let setDefaultCalls = 0;
      let editCalls = 0;
      let deleteCalls = 0;

      await withHappyDom(async (win) => {
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const container = win.document.createElement("div");
        win.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);

        await act(async () => {
          root.render(
            createElement(AddressCard, {
              address: defaultAddress,
              onRequestSetDefault: () => {
                setDefaultCalls++;
              },
              onRequestEdit: () => {
                editCalls++;
              },
              onRequestDelete: () => {
                deleteCalls++;
              },
            }),
          );
          await Promise.resolve();
        });

        expect(win.document.body.innerHTML).toContain("Mặc định");
        expect(win.document.body.innerHTML).toContain(
          "Đăng nhập để xem phí giao hàng dự kiến.",
        );

        const trigger = win.document.querySelector(
          'button[aria-haspopup="menu"]',
        ) as unknown as HTMLElement | null;
        expect(trigger).not.toBeNull();

        await act(async () => {
          trigger?.click();
          await Promise.resolve();
        });

        const defaultItems = Array.from(
          win.document.querySelectorAll('[role="menuitem"]'),
        );
        expect(defaultItems).toHaveLength(2);
        expect(win.document.body.innerHTML).not.toContain("Đặt làm mặc định");

        await act(async () => {
          trigger?.click();
          await Promise.resolve();
        });

        await act(async () => {
          root.render(
            createElement(AddressCard, {
              key: secondaryAddress.id,
              address: secondaryAddress,
              onRequestSetDefault: () => {
                setDefaultCalls++;
              },
              onRequestEdit: () => {
                editCalls++;
              },
              onRequestDelete: () => {
                deleteCalls++;
              },
            }),
          );
          await Promise.resolve();
        });

        const secondaryTrigger = win.document.querySelector(
          'button[aria-haspopup="menu"]',
        ) as unknown as HTMLElement | null;
        await act(async () => {
          secondaryTrigger?.click();
          await Promise.resolve();
        });

        const menuItems = Array.from(
          win.document.querySelectorAll('[role="menuitem"]'),
        ) as unknown as HTMLElement[];
        expect(menuItems).toHaveLength(3);

        await act(async () => {
          menuItems[0]?.click();
          await Promise.resolve();
        });
        expect(setDefaultCalls).toBe(1);
        expect(editCalls).toBe(0);
        expect(deleteCalls).toBe(0);

        await act(async () => {
          root.unmount();
          await Promise.resolve();
        });
      });
    });
  });

  describe("AccountAddressesListCard", () => {
    // Invariant: INV-SF-ADDR-7
    it("disables adding new addresses and shows limit notice at maximum capacity", () => {
      const tenAddresses: CustomerAddress[] = Array.from(
        { length: 10 },
        (_, index) => ({
          ...defaultAddress,
          id: `0195a8f0-0001-7000-8000-0000000000${String(index).padStart(2, "0")}`,
          isDefault: index === 0,
        }),
      );

      const html = renderToStaticMarkup(
        createElement(AccountAddressesListCard, {
          addresses: tenAddresses,
          onOpenCreate: () => undefined,
          onRequestSetDefault: () => undefined,
          onRequestEdit: () => undefined,
          onRequestDelete: () => undefined,
        }),
      );

      expect(html).toContain("10 / 10 địa chỉ");
      expect(html).toContain("Bạn đã lưu tối đa 10 địa chỉ");
      expect(html).toContain("disabled");
    });
  });

  describe("AddressDialogPanel", () => {
    // Invariant: INV-SF-ADDR-1
    it("renders guest delivery policy without invoking protected address actions", async () => {
      let protectedCalls = 0;

      await withHappyDom(async (win) => {
        useAuthStore.getState().clearSession();
        useDeliveryAddressStore.getState().clearDeliveryState();
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const container = win.document.createElement("div");
        win.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);

        await act(async () => {
          root.render(
            createElement(AddressDialogPanel, {
              open: true,
              onOpenChange: () => undefined,
              listAddressesFn: () => {
                protectedCalls += 1;
                return Promise.resolve({ ok: true as const, addresses: [] });
              },
            }),
          );
          await Promise.resolve();
        });

        const bodyHtml = win.document.body.innerHTML;
        expect(protectedCalls).toBe(0);
        expect(bodyHtml).toContain("Phạm vi giao hàng TP.HCM");
        expect(bodyHtml).toContain("Chính sách giao hàng TP. Hồ Chí Minh");
        expect(bodyHtml).toContain('href="/login"');

        await act(async () => {
          root.unmount();
          await Promise.resolve();
        });
      });
    });

    // Invariant: INV-SF-ADDR-3
    // Invariant: INV-SF-ADDR-8
    it("renders inline retry alert on load failure and closes cleanly after quick-create submission", async () => {
      let fetchCalls = 0;
      const openEvents: boolean[] = [];

      await withHappyDom(async (win) => {
        useAuthStore.getState().setUser(sampleUser);
        useDeliveryAddressStore.getState().clearDeliveryState();

        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const container = win.document.createElement("div");
        win.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);

        try {
          await act(async () => {
            root.render(
              createElement(AddressDialogPanel, {
                open: true,
                onOpenChange: (nextOpen) => openEvents.push(nextOpen),
                listAddressesFn: () => {
                  fetchCalls += 1;
                  if (fetchCalls === 1) {
                    return Promise.resolve({
                      ok: false as const,
                      code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
                      message: "Máy chủ tạm gián đoạn.",
                      sessionInvalidated: false,
                    });
                  }
                  return Promise.resolve({
                    ok: true as const,
                    addresses: [defaultAddress],
                  });
                },
                createAddressFn: (input) =>
                  Promise.resolve({
                    ok: true as const,
                    address: {
                      ...defaultAddress,
                      id: secondaryAddress.id,
                      streetAddress: input.streetAddress,
                      isDefault: false,
                    },
                  }),
              }),
            );
            await Promise.resolve();
            await Promise.resolve();
          });

          expect(win.document.body.innerHTML).toContain('role="alert"');
          expect(win.document.body.innerHTML).toContain(
            "Máy chủ tạm gián đoạn.",
          );
          expect(win.document.body.innerHTML).not.toContain(
            "Bạn chưa có địa chỉ giao hàng nào trong sổ",
          );

          const retryBtn = Array.from(
            win.document.querySelectorAll("button"),
          ).find((btn) =>
            btn.textContent.includes("Thử tải lại"),
          ) as unknown as HTMLElement | undefined;
          expect(retryBtn).toBeDefined();

          await act(async () => {
            retryBtn?.click();
            await Promise.resolve();
            await Promise.resolve();
          });

          const addNewBtn = Array.from(
            win.document.querySelectorAll("button"),
          ).find((btn) => btn.textContent.includes("Thêm mới")) as unknown as
            | HTMLElement
            | undefined;
          expect(addNewBtn).toBeDefined();

          await act(async () => {
            addNewBtn?.click();
            await Promise.resolve();
          });

          const originalFetch = globalThis.fetch;
          globalThis.fetch = ((url: string | URL | Request) => {
            const href =
              typeof url === "string"
                ? url
                : url instanceof URL
                  ? url.href
                  : url.url;
            if (href.includes("/api/geocoding/autocomplete")) {
              return Promise.resolve(
                new Response(
                  JSON.stringify({
                    success: true,
                    data: [
                      {
                        placeId: "mock_place_quan_1",
                        description:
                          "99 Nguyễn Văn Cừ, Quận 1, TP. Hồ Chí Minh",
                        district: "Quận 1",
                      },
                    ],
                  }),
                  { status: 200 },
                ),
              );
            }
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  success: true,
                  data: {
                    straightLineKm: 4.5,
                    roadDistanceKm: 5.85,
                    feeVnd: 30000,
                    isDeliverable: true,
                    isFreeShipping: false,
                    maxRadiusKm: 25,
                    subscriptionFreeRadiusKm: 20,
                  },
                }),
                { status: 200 },
              ),
            );
          }) as typeof fetch;

          try {
            const placeInput = win.document.querySelector(
              "#header-dialog-address-place-search",
            ) as unknown as HTMLInputElement | null;
            expect(placeInput).not.toBeNull();
            if (placeInput) {
              const valueSetter = Object.getOwnPropertyDescriptor(
                win.HTMLInputElement.prototype,
                "value",
              )?.set;
              await act(async () => {
                valueSetter?.call(placeInput, "Nguyen Van Cu");
                placeInput.dispatchEvent(
                  new win.Event("input", { bubbles: true }) as unknown as Event,
                );
                await new Promise((r) => setTimeout(r, 350));
              });
            }

            const optionBtn = win.document.querySelector(
              '[role="option"]',
            ) as unknown as HTMLElement | null;
            expect(optionBtn).not.toBeNull();
            await act(async () => {
              optionBtn?.click();
              await Promise.resolve();
            });

            const streetInput = win.document.querySelector(
              "#header-dialog-address-street-address",
            ) as unknown as HTMLInputElement | null;
            expect(streetInput).not.toBeNull();
            if (streetInput) {
              const valueSetter = Object.getOwnPropertyDescriptor(
                win.HTMLInputElement.prototype,
                "value",
              )?.set;
              await act(async () => {
                valueSetter?.call(streetInput, "99 Nguyễn Văn Cừ");
                streetInput.dispatchEvent(
                  new win.Event("input", { bubbles: true }) as unknown as Event,
                );
                await Promise.resolve();
              });
            }

            const form = win.document.querySelector(
              "form",
            ) as unknown as HTMLFormElement | null;
            expect(form).not.toBeNull();
            await act(async () => {
              form?.dispatchEvent(
                new win.Event("submit", {
                  bubbles: true,
                  cancelable: true,
                }) as unknown as Event,
              );
              await Promise.resolve();
              await Promise.resolve();
            });
          } finally {
            globalThis.fetch = originalFetch;
          }

          expect(openEvents).toContain(false);
          expect(useDeliveryAddressStore.getState().selectedAddressId).toBe(
            secondaryAddress.id,
          );
        } finally {
          await act(async () => {
            root.unmount();
            await Promise.resolve();
          });
          useAuthStore.getState().clearSession();
          useDeliveryAddressStore.getState().clearDeliveryState();
        }
      });
    });
  });

  describe("AddressFormDialogView", () => {
    // Invariant: INV-SF-ADDR-5
    it("separates Create isDefault checkbox from Edit mode and disables clean Edit submits", async () => {
      await withHappyDom(async (win) => {
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const container = win.document.createElement("div");
        win.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);

        await act(async () => {
          root.render(
            createElement(AddressFormDialogView, {
              open: true,
              mode: "create",
              receiverName: "Nguyễn Minh Anh",
              phoneNumber: "0908412679",
              placeId: "mock_place_go_vap",
              selectedPlaceLabel: "142 Lê Đức Thọ, Quận Gò Vấp",
              streetAddress: "142 Lê Đức Thọ",
              isDefault: true,
              lockDefaultChecked: true,
              canSubmit: true,
              isPending: false,
              errorMessage: null,
              onReceiverNameChange: () => undefined,
              onPhoneNumberChange: () => undefined,
              onPlaceSelect: () => undefined,
              onStreetAddressChange: () => undefined,
              onIsDefaultChange: () => undefined,
              onSubmit: (event) => event.preventDefault(),
            }),
          );
          await Promise.resolve();
        });

        const createHtml = win.document.body.innerHTML;
        expect(createHtml).toContain("Thêm địa chỉ giao hàng mới");
        expect(createHtml).toContain("Đặt làm địa chỉ giao hàng mặc định");
        expect(createHtml).toContain("Địa chỉ đầu tiên tự động");

        await act(async () => {
          root.render(
            createElement(AddressFormDialogView, {
              open: true,
              mode: "edit",
              receiverName: "Nguyễn Minh Anh",
              phoneNumber: "0908412679",
              placeId: "mock_place_go_vap",
              selectedPlaceLabel: "142 Lê Đức Thọ, Quận Gò Vấp",
              streetAddress: "142 Lê Đức Thọ",
              isDefault: true,
              isEditingDefault: true,
              canSubmit: false,
              isPending: false,
              errorMessage: null,
              onReceiverNameChange: () => undefined,
              onPhoneNumberChange: () => undefined,
              onPlaceSelect: () => undefined,
              onStreetAddressChange: () => undefined,
              onIsDefaultChange: () => undefined,
              onSubmit: (event) => event.preventDefault(),
            }),
          );
          await Promise.resolve();
        });

        const editHtml = win.document.body.innerHTML;
        expect(editHtml).toContain("Cập nhật địa chỉ giao hàng");
        expect(editHtml).not.toContain('role="checkbox"');
        const submitBtn = win.document.querySelector(
          'button[type="submit"]',
        ) as unknown as HTMLButtonElement | null;
        expect(submitBtn?.disabled).toBe(true);

        await act(async () => {
          root.unmount();
          await Promise.resolve();
        });
      });
    });
  });

  describe("buildDeleteAddressConfirmDescription", () => {
    // Invariant: INV-ADDR-5
    it("warns about automatic default promotion when deleting active default with remaining rows", () => {
      const msgWithRemaining = buildDeleteAddressConfirmDescription(
        defaultAddress,
        2,
      );
      expect(msgWithRemaining).toContain("mặc định");
      expect(msgWithRemaining).toContain("tự động đặt địa chỉ mới nhất");

      const msgSoleOrNonDefault = buildDeleteAddressConfirmDescription(
        defaultAddress,
        1,
      );
      expect(msgSoleOrNonDefault).not.toContain("tự động đặt");
    });
  });
});
