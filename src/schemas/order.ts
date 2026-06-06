import { z } from "zod";

// ---------------------------------------------------------------------------
// Cart item snapshot — sent by the frontend when placing an order.
// Backend uses this to create OrderItems and cannot read from Zustand.
// ---------------------------------------------------------------------------

const orderItemInputSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive(),
  priceAtOrder: z.number().int().positive(), // paise — validated against DB price in handler
  productName: z.string().min(1),            // display snapshot only
});

// ---------------------------------------------------------------------------
// POST /api/orders
// ---------------------------------------------------------------------------

export const createOrderSchema = z.object({
  // Address — either pick an existing saved address or create a new one inline
  addressId: z.string().optional(),
  newAddress: z
    .object({
      name: z.string().min(1),
      phone: z.string().length(10),
      line1: z.string().min(1),
      line2: z.string().optional(),
      city: z.string().min(1),
      state: z.string().min(1),
      pincode: z.string().length(6),
      save: z.boolean().default(false),
    })
    .optional(),

  // Payment — Razorpay payment ID from verified payment
  paymentId: z.string().min(1),

  // Cart snapshot — sent by frontend
  items: z.array(orderItemInputSchema).min(1),

  // Optional
  couponCode: z.string().optional(),
  discount: z.number().int().min(0).default(0), // paise
});

// ---------------------------------------------------------------------------
// GET /api/orders (query params)
// ---------------------------------------------------------------------------

export const listOrdersSchema = z.object({
  status: z
    .enum([
      "PENDING",
      "CONFIRMED",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
      "RETURNED",
      "REFUNDED",
    ])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/:id
// ---------------------------------------------------------------------------

export const updateOrderSchema = z.object({
  status: z
    .enum([
      "PENDING",
      "CONFIRMED",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
      "RETURNED",
      "REFUNDED",
    ])
    .optional(),
  awbNumber: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
