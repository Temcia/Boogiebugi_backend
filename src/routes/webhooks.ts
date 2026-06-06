import { Router, Request, Response } from "express";
import crypto from "crypto";
import { OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { sendSuccess } from "../utils/response";
import { createShipment } from "../services/shiprocket";

const router = Router();

// Required type extension to access rawBody
interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

// ---------------------------------------------------------------------------
// Razorpay Webhooks
// ---------------------------------------------------------------------------

router.post("/razorpay", async (req: WebhookRequest, res: Response) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"] as string;

  if (!secret || !signature || !req.rawBody) {
    res.status(400).send("Bad Request: Missing secret, signature, or body");
    return;
  }

  // 1. Verify signature
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    res.status(400).send("Bad Request: Invalid signature");
    return;
  }

  // 2. Return 200 OK immediately
  sendSuccess(res, { received: true });

  // 3. Process asynchronously
  (async () => {
    try {
      const payload = req.body;
      const eventName = payload.event;

      if (!eventName) return;

      // Extract orderId from notes
      const orderId = payload.payload?.payment?.entity?.notes?.orderId;
      const paymentId = payload.payload?.payment?.entity?.id;

      // Find order by ID from notes, or fallback to paymentId
      let order = null;
      if (orderId) {
        order = await prisma.order.findUnique({ where: { id: orderId } });
      }
      
      if (!order && paymentId) {
        order = await prisma.order.findFirst({ where: { paymentId } });
      }

      if (!order) {
        // Order not found. Depending on timing, the frontend might not have
        // called POST /api/orders yet. This might require a retry queue in
        // production, but for now we log and ignore.
        console.warn(`Razorpay Webhook: Order not found for payment ${paymentId}`);
        return;
      }

      if (eventName === "payment.captured") {
        const updated = await prisma.order.update({
          where: { id: order.id },
          data: { status: "CONFIRMED" },
        });

        // Trigger Shiprocket shipment creation
        await createShipment(updated.id);
      } else if (eventName === "payment.failed") {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" },
        });
      }
    } catch (err) {
      console.error("Error processing Razorpay webhook:", err);
    }
  })();
});

// ---------------------------------------------------------------------------
// Shiprocket Webhooks
// ---------------------------------------------------------------------------

router.post("/shiprocket", async (req: Request, res: Response) => {
  const secret = process.env.SHIPROCKET_WEBHOOK_SECRET;
  const signature = req.headers["x-shiprocket-signature"] as string;

  // Note: Shiprocket typically passes the token in a header or we check
  // our custom configured header. We use a simple token check here.
  if (!secret || signature !== secret) {
    res.status(401).send("Unauthorized");
    return;
  }

  // 1. Return 200 OK immediately
  sendSuccess(res, { received: true });

  // 2. Process asynchronously
  (async () => {
    try {
      const payload = req.body;
      // Shiprocket payload structure
      const awb = payload.awb;
      const currentStatus = payload.current_status;

      if (!awb || !currentStatus) return;

      const order = await prisma.order.findFirst({
        where: { awbNumber: awb },
      });

      if (!order) {
        console.warn(`Shiprocket Webhook: Order not found for AWB ${awb}`);
        return;
      }

      let newStatus = undefined;

      switch (currentStatus) {
        case "PICKUP SCHEDULED":
          newStatus = "PROCESSING";
          break;
        case "SHIPPED":
        case "OUT FOR DELIVERY":
          newStatus = "SHIPPED";
          break;
        case "DELIVERED":
          newStatus = "DELIVERED";
          break;
        case "CANCELLED":
          newStatus = "CANCELLED";
          break;
      }

      if (newStatus && order.status !== newStatus) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: newStatus as OrderStatus },
        });
      }
    } catch (err) {
      console.error("Error processing Shiprocket webhook:", err);
    }
  })();
});

export default router;
