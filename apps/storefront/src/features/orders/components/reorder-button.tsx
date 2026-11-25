"use client";

import { useRouter } from "next/navigation";
import { Button } from "@greenroots/ui";
import { RotateCcw } from "lucide-react";
import { useCartStore } from "@/stores/cart.store";
import type { OrderDto } from "../schemas/order.schema";
import { mapOrderItemsToCartEntries } from "../utils/order-history.utils";

interface ReorderButtonProps {
  readonly order: OrderDto;
  readonly variant?: "default" | "outline" | "secondary";
  readonly size?: "default" | "sm";
  readonly className?: string;
}

/**
 * Adds a previous retail order's items back into `useCartStore` and redirects
 * to `/cart`, where `useValidatedCart` reconciles live stock and catalog prices.
 */
export function ReorderButton({
  order,
  variant = "secondary",
  size = "sm",
  className,
}: ReorderButtonProps) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);

  function handleReorder() {
    const entries = mapOrderItemsToCartEntries(order.items);
    for (const entry of entries) {
      addItem(entry.product, entry.quantity);
    }
    router.push("/cart");
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleReorder}
      className={className}
    >
      <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
      <span>Mua lại đơn này</span>
    </Button>
  );
}
