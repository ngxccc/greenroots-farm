"use server";

import type {
  CreateSubscriptionCheckoutInput,
  MockConfirmSubscriptionPayosInput,
} from "../schemas/subscription.schema";
import {
  type CancelSubscriptionActionResult,
  type ConfirmMockSubscriptionPayosActionResult,
  type CreateSubscriptionCheckoutActionResult,
  type GetSubscriptionActionResult,
  executeCancelSubscriptionAction,
  executeConfirmMockSubscriptionPayosAction,
  executeCreateSubscriptionCheckoutAction,
  executeGetSubscriptionAction,
} from "./subscription-actions.impl";

/**
 * Next.js Server Action initiating a PayOS subscription checkout with `Idempotency-Key` protection.
 */
export async function createSubscriptionCheckoutAction(
  input: CreateSubscriptionCheckoutInput,
): Promise<CreateSubscriptionCheckoutActionResult> {
  return executeCreateSubscriptionCheckoutAction(input);
}

/**
 * Next.js Server Action polling the latest subscription snapshot for `/subscriptions/[id]`.
 */
export async function getSubscriptionAction(
  subscriptionId: string,
): Promise<GetSubscriptionActionResult> {
  return executeGetSubscriptionAction(subscriptionId);
}

/**
 * Next.js Server Action cancelling a pending customer subscription.
 */
export async function cancelSubscriptionAction(
  subscriptionId: string,
): Promise<CancelSubscriptionActionResult> {
  return executeCancelSubscriptionAction(subscriptionId);
}

/**
 * Next.js Server Action triggering mock PayOS webhook settlement in non-production environments.
 */
export async function confirmMockSubscriptionPayosAction(
  input: MockConfirmSubscriptionPayosInput,
): Promise<ConfirmMockSubscriptionPayosActionResult> {
  return executeConfirmMockSubscriptionPayosAction(input);
}
