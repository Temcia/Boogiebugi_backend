import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendSuccess, sendError } from "../utils/response";
import { auth, requireAdmin, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard
// ---------------------------------------------------------------------------

router.get("/dashboard", auth, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [
      totalOrdersResult,
      totalRevenueResult,
      totalCustomers,
      pendingOrders,
      recentOrders,
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.aggregate({ _sum: { total: true } }),
      prisma.user.count(),
      prisma.order.count({ where: { status: { in: ["PENDING", "CONFIRMED", "PROCESSING"] } } }),
      prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          address: { select: { name: true } },
          items: {
            include: {
              variant: {
                include: { product: { select: { name: true } } },
              },
            },
          },
        },
      }),
    ]);

    const formattedOrders = recentOrders.map((o) => ({
      id: o.id,
      customer: o.address?.name ?? "—",
      items: o.items.length,
      total: o.total,
      status: o.status,
      date: o.createdAt.toISOString(),
    }));

    sendSuccess(res, {
      totalRevenue: totalRevenueResult._sum.total ?? 0,
      totalOrders: totalOrdersResult,
      totalCustomers,
      pendingOrders,
      recentOrders: formattedOrders,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    sendError(res, "INTERNAL", "Failed to load dashboard", 500);
  }
});

// ---------------------------------------------------------------------------
// Shared formatter — converts Prisma order to AdminOrder API shape
// ---------------------------------------------------------------------------

type PrismaOrderWithRelations = {
  id: string;
  status: string;
  total: number;
  discount: number;
  paymentId: string | null;
  awbNumber: string | null;
  createdAt: Date;
  address: {
    name: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
  } | null;
  items: Array<{
    id: string;
    quantity: number;
    priceAtOrder: number;
    variant: {
      size: string;
      color: string | null;
      product: { id: string; name: string; images: string[] };
    };
  }>;
};

function formatAdminOrder(o: PrismaOrderWithRelations) {
  return {
    id: o.id,
    status: o.status,
    total: o.total,
    discount: o.discount,
    paymentId: o.paymentId,
    awbNumber: o.awbNumber,
    createdAt: o.createdAt.toISOString(),
    customer: {
      name: o.address?.name ?? "—",
      phone: o.address?.phone ?? "—",
    },
    address: o.address
      ? `${o.address.line1}${o.address.line2 ? ", " + o.address.line2 : ""}, ${o.address.city}, ${o.address.state} — ${o.address.pincode}`
      : "—",
    items: o.items.map((item) => ({
      id: item.id,
      name: item.variant.product.name,
      size: item.variant.size,
      color: item.variant.color ?? "",
      price: item.priceAtOrder,
      quantity: item.quantity,
      image: item.variant.product.images[0] ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// GET /api/admin/orders  — list all orders (admin)
// ---------------------------------------------------------------------------

router.get("/orders", auth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, search } = req.query as { status?: string; search?: string };

    const where: Record<string, unknown> = {};
    if (status && status !== "ALL") where.status = status.toUpperCase();
    if (search) {
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { address: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        address: true,
        items: {
          include: {
            variant: {
              include: { product: { select: { id: true, name: true, images: true } } },
            },
          },
        },
      },
    });

    const formatted = orders.map(formatAdminOrder);
    sendSuccess(res, { orders: formatted, total: formatted.length });
  } catch (err) {
    console.error("Admin orders error:", err);
    sendError(res, "INTERNAL", "Failed to load orders", 500);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/:id  — update status / AWB
// ---------------------------------------------------------------------------

router.patch("/orders/:id", auth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, awbNumber } = req.body as { status?: string; awbNumber?: string };

    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (awbNumber !== undefined) data.awbNumber = awbNumber || null;

    const order = await prisma.order.update({
      where: { id },
      data,
      include: {
        address: true,
        items: {
          include: {
            variant: {
              include: { product: { select: { id: true, name: true, images: true } } },
            },
          },
        },
      },
    });

    sendSuccess(res, { order: formatAdminOrder(order) });
  } catch (err) {
    console.error("Update order error:", err);
    sendError(res, "INTERNAL", "Failed to update order", 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/coupons
// ---------------------------------------------------------------------------

router.get("/coupons", auth, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { id: "desc" } });
    sendSuccess(res, { coupons });
  } catch (err) {
    console.error("Coupons error:", err);
    sendError(res, "INTERNAL", "Failed to load coupons", 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/coupons
// ---------------------------------------------------------------------------

router.post("/coupons", auth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, type, value, minOrderValue, maxUses, expiresAt, isActive } = req.body as {
      code: string;
      type: string;
      value: number;
      minOrderValue?: number;
      maxUses?: number | null;
      expiresAt?: string | null;
      isActive?: boolean;
    };

    if (!code || !type) {
      return sendError(res, "VALIDATION", "code and type are required", 400);
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase().trim(),
        type: type as "PERCENTAGE" | "FLAT" | "FREE_SHIPPING",
        value: value ?? 0,
        minOrderValue: minOrderValue ?? 0,
        maxUses: maxUses ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: isActive ?? true,
      },
    });

    sendSuccess(res, { coupon }, 201);
  } catch (err: unknown) {
    const prismaErr = err as { code?: string };
    if (prismaErr.code === "P2002") {
      return sendError(res, "CONFLICT", "Coupon code already exists", 409);
    }
    console.error("Create coupon error:", err);
    sendError(res, "INTERNAL", "Failed to create coupon", 500);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/coupons/:id
// ---------------------------------------------------------------------------

router.patch("/coupons/:id", auth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, code, type, value, minOrderValue, maxUses, expiresAt } = req.body as {
      isActive?: boolean;
      code?: string;
      type?: string;
      value?: number;
      minOrderValue?: number;
      maxUses?: number | null;
      expiresAt?: string | null;
    };

    const data: Record<string, unknown> = {};
    if (isActive !== undefined) data.isActive = isActive;
    if (code) data.code = code.toUpperCase().trim();
    if (type) data.type = type;
    if (value !== undefined) data.value = value;
    if (minOrderValue !== undefined) data.minOrderValue = minOrderValue;
    if (maxUses !== undefined) data.maxUses = maxUses;
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const coupon = await prisma.coupon.update({ where: { id }, data });
    sendSuccess(res, { coupon });
  } catch (err) {
    console.error("Update coupon error:", err);
    sendError(res, "INTERNAL", "Failed to update coupon", 500);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/coupons/:id
// ---------------------------------------------------------------------------

router.delete("/coupons/:id", auth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.coupon.delete({ where: { id } });
    sendSuccess(res, { message: "Coupon deleted" });
  } catch (err) {
    console.error("Delete coupon error:", err);
    sendError(res, "INTERNAL", "Failed to delete coupon", 500);
  }
});

export default router;
