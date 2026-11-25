/**
 * Line item included in a PayOS payment link creation request.
 */
export interface PayosPaymentItem {
  readonly name: string;
  readonly quantity: number;
  readonly priceVnd: number;
}

/**
 * Input passed to `PaymentDriver.createPaymentLink`.
 */
export interface CreatePaymentLinkInput {
  readonly orderCode: number;
  readonly amountVnd: number;
  readonly description: string;
  readonly returnUrl: string;
  readonly cancelUrl: string;
  readonly expiredAt?: number;
  readonly items?: readonly PayosPaymentItem[];
  readonly buyerName?: string;
  readonly buyerEmail?: string;
  readonly buyerPhone?: string;
  readonly buyerAddress?: string;
}

/**
 * Payment link metadata returned by `PaymentDriver.createPaymentLink`.
 */
export interface CreatePaymentLinkResult {
  readonly checkoutUrl: string;
  readonly paymentLinkId: string;
  readonly orderCode: number;
  readonly qrCode: string;
  readonly status: string;
}

/**
 * Raw webhook envelope received from PayOS before HMAC-SHA256 verification.
 */
export interface PayosWebhookPayload {
  readonly code: string;
  readonly desc: string;
  readonly success?: boolean;
  readonly data: Record<string, unknown>;
  readonly signature: string;
}

/**
 * Verified payment transaction data extracted from a PayOS webhook payload.
 */
export interface VerifiedPaymentWebhookData {
  readonly orderCode: number;
  readonly amountVnd: number;
  readonly description: string;
  readonly accountNumber: string;
  readonly reference: string;
  readonly transactionDateTime: string;
  readonly currency: string;
  readonly paymentLinkId: string;
  readonly code: string;
  readonly desc: string;
  readonly counterAccountBankId?: string | null;
  readonly counterAccountBankName?: string | null;
  readonly counterAccountName?: string | null;
  readonly counterAccountNumber?: string | null;
  readonly virtualAccountName?: string | null;
  readonly virtualAccountNumber?: string | null;
}

/**
 * Result returned by `PaymentDriver.cancelPaymentLink`.
 */
export interface CancelPaymentLinkResult {
  readonly paymentLinkId: string;
  readonly orderCode: number;
  readonly status: string;
  readonly canceledAt?: string | null;
  readonly cancellationReason?: string | null;
}

/**
 * Contract for payment gateway drivers (PayOS or mock).
 */
export interface PaymentDriver {
  createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult>;
  verifyWebhook(
    payload: PayosWebhookPayload,
  ): Promise<VerifiedPaymentWebhookData>;
  cancelPaymentLink(
    orderCode: number,
    reason?: string,
  ): Promise<CancelPaymentLinkResult>;
}
