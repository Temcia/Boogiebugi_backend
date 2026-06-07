import { Router, Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import { sendSuccess, sendError } from "../utils/response";
import { auth, AuthenticatedRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createPaymentSchema, verifyPaymentSchema } from "../schemas/payment";

const router = Router();

// ---------------------------------------------------------------------------
// Razorpay client — lazy-initialised so the server starts even if keys are
// not yet set (dev / CI environments). Routes guard against missing keys.
// ---------------------------------------------------------------------------

function getRazorpay(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in environment."
    );
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// ---------------------------------------------------------------------------
// POST /api/payments/create-order
// Body: { amount: number (paise), currency?: string, receipt?: string }
// Returns: { orderId, amount, currency }
// ---------------------------------------------------------------------------

router.post(
  "/create-order",
  auth,
  validate(createPaymentSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { amount, currency = "INR", receipt } = req.body as {
      amount: number;
      currency?: string;
      receipt?: string;
    };

    try {
      const razorpay = getRazorpay();

      const order = await razorpay.orders.create({
        amount,          // already in paise — Razorpay expects paise
        currency,
        receipt: receipt ?? `rcpt_${Date.now()}`,
      });

      sendSuccess(res, {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      });
    } catch (err) {
      // Log full error object for debugging — Razorpay errors are non-standard objects
      console.error("[Razorpay] create-order failed:", JSON.stringify(err, null, 2));
      console.error("[Razorpay] error message:", err instanceof Error ? err.message : String(err));

      const message =
        err instanceof Error
          ? err.message
          : (err as { description?: string; error?: { description?: string } })?.error?.description
            ?? (err as { description?: string })?.description
            ?? "Failed to create payment order";

      // Surface config errors clearly in dev
      if (message.includes("must be set")) {
        sendError(res, "CONFIG_ERROR", message, 503);
      } else {
        sendError(res, "RAZORPAY_ERROR", message, 502);
      }
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/payments/verify
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Returns: { verified: true, paymentId, orderId }
//
// CRITICAL: Only this route (or the webhook) may mark an order CONFIRMED.
// Never trust the frontend to confirm orders.
// ---------------------------------------------------------------------------

router.post(
  "/verify",
  auth,
  validate(verifyPaymentSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body as {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    };

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      return sendError(res, "CONFIG_ERROR", "RAZORPAY_KEY_SECRET is not set.", 503);
    }

    // HMAC-SHA256(orderId + "|" + paymentId, secret) must match signature
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return sendError(
        res,
        "SIGNATURE_MISMATCH",
        "Payment signature verification failed.",
        400
      );
    }

    // Signature valid — the actual Order record is created via POST /api/orders
    // (called by the frontend immediately after this succeeds).
    // Webhooks at /api/webhooks/razorpay handle async payment status updates.
    sendSuccess(res, {
      verified: true,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });
  }
);

export default router;
