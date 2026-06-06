import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendSuccess, sendError } from "../utils/response";
import { auth, AuthenticatedRequest } from "../middleware/auth";
import { validate, validateQuery } from "../middleware/validate";
import {
  createOrderSchema,
  listOrdersSchema,
  updateOrderSchema,
  CreateOrderInput,
  ListOrdersInput,
  UpdateOrderInput,
} from "../schemas/order";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shape the DB order row into a clean API response object. */
function formatOrder(order: {
  id: string;
  status: string;
  total: number;
  discount: number;
  couponCode: string | null;
  paymentId: string | null;
  awbNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  address: {
    id: string;
    name: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
  };
  items: Array<{
    id: string;
    quantity: number;
    priceAtOrder: number;
    variant: {
      id: string;
      size: string;
      color: string | null;
      product: { id: string; name: string; images: string[] };
    };
  }>;
}) {
  return {
    id: order.id,
    status: order.status,
    total: order.total,
    discount: order.discount,
    couponCode: order.couponCode,
    paymentId: order.paymentId,
    awbNumber: order.awbNumber,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    address: {
      fullName: order.address.name,
      phone: order.address.phone,
      line1: order.address.line1,
      line2: order.address.line2 ?? undefined,
      city: order.address.city,
      state: order.address.state,
      pincode: order.address.pincode,
    },
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.variant.product.id,
      productName: item.variant.product.name,
      size: item.variant.size,
      color: item.variant.color ?? "",
      quantity: item.quantity,
      price: item.priceAtOrder,
      image: item.variant.product.images[0] ?? null,
    })),
  };
}

// Prisma include fragment reused in GET routes
const ORDER_INCLUDE = {
  address: true,
  items: {
    include: {
      variant: {
        include: {
          product: { select: { id: true, name: true, images: true } },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// POST /api/orders
// Called by the frontend AFTER successful Razorpay payment verification.
// Creates Address (if new), Order, and OrderItems in a single transaction.
// ---------------------------------------------------------------------------

router.post(
  "/",
  auth,
  validate(createOrderSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const body = req.body as CreateOrderInput;

    // ── Resolve address ──────────────────────────────────────────────────────
    let resolvedAddressId: string;

    if (body.addressId && body.addressId !== "new-address") {
      // Verify the address belongs to this user
      const addr = await prisma.address.findFirst({
        where: { id: body.addressId, userId },
      });
      if (!addr) {
        return sendError(res, "NOT_FOUND", "Address not found", 404);
      }
      resolvedAddressId = addr.id;
    } else if (body.newAddress) {
      // Create a new address (optionally save for future)
      const created = await prisma.address.create({
        data: {
          userId,
          name: body.newAddress.name,
          phone: body.newAddress.phone,
          line1: body.newAddress.line1,
          line2: body.newAddress.line2,
          city: body.newAddress.city,
          state: body.newAddress.state,
          pincode: body.newAddress.pincode,
          isDefault: false,
        },
      });
      resolvedAddressId = created.id;
    } else {
      return sendError(
        res,
        "VALIDATION_ERROR",
        "Either addressId or newAddress must be provided.",
        400
      );
    }

    // ── Calculate total from items (don't trust frontend total) ──────────────
    const subtotal = body.items.reduce(
      (sum, item) => sum + item.priceAtOrder * item.quantity,
      0
    );
    const shipping = subtotal >= 299900 ? 0 : 9900; // ₹2,999 threshold / ₹99 shipping
    const total = subtotal + shipping - (body.discount ?? 0);

    // ── Create order + items in a transaction ────────────────────────────────
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId,
          addressId: resolvedAddressId,
          status: "CONFIRMED",
          total,
          discount: body.discount ?? 0,
          couponCode: body.couponCode ?? null,
          paymentId: body.paymentId,
          items: {
            create: body.items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              priceAtOrder: item.priceAtOrder,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });

      return newOrder;
    });

    sendSuccess(res, { orderId: order.id, order: formatOrder(order) }, 201);
  }
);

// ---------------------------------------------------------------------------
// GET /api/orders
// Returns the authenticated user's order history (paginated).
// ---------------------------------------------------------------------------

router.get(
  "/",
  auth,
  validateQuery(listOrdersSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const query = req.query as unknown as ListOrdersInput;

    const { status, page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      userId,
      ...(status ? { status } : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.order.count({ where }),
    ]);

    sendSuccess(res, {
      orders: orders.map(formatOrder),
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  }
);

// ---------------------------------------------------------------------------
// GET /api/orders/:id
// Returns a single order — must belong to the authenticated user.
// ---------------------------------------------------------------------------

router.get("/:id", auth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const id = req.params.id as string;

  const order = await prisma.order.findFirst({
    where: { id, userId },
    include: ORDER_INCLUDE,
  });

  if (!order) {
    return sendError(res, "NOT_FOUND", `Order ${id} not found`, 404);
  }

  sendSuccess(res, formatOrder(order));
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/:id — Admin only
// Update order status or AWB number.
// ---------------------------------------------------------------------------

router.patch(
  "/admin/:id",
  auth,
  validate(updateOrderSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== "ADMIN") {
      return sendError(res, "FORBIDDEN", "Admin access required", 403);
    }

    const { id } = req.params;
    const id_ = id as string;
    const body = req.body as UpdateOrderInput;

    const order = await prisma.order.findUnique({ where: { id: id_ } });
    if (!order) {
      return sendError(res, "NOT_FOUND", `Order ${id_} not found`, 404);
    }

    const updated = await prisma.order.update({
      where: { id: id_ },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.awbNumber ? { awbNumber: body.awbNumber } : {}),
      },
    });

    sendSuccess(res, { message: `Order ${id_} updated`, status: updated.status });
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/orders — Admin only
// Returns all orders with optional status filter (paginated).
// ---------------------------------------------------------------------------

router.get(
  "/admin",
  auth,
  validateQuery(listOrdersSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== "ADMIN") {
      return sendError(res, "FORBIDDEN", "Admin access required", 403);
    }

    const query = req.query as unknown as ListOrdersInput;
    const { status, page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = status ? { status } : {};

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          ...ORDER_INCLUDE,
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.order.count({ where }),
    ]);

    sendSuccess(res, {
      orders: orders.map(formatOrder),
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  }
);

export default router;
