import { Router, Response } from "express";
import { sendSuccess } from "../utils/response";
import { auth, requireAdmin, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/dashboard", auth, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, {
    totalRevenue: 0,
    totalOrders: 0,
    conversionRate: 0,
    topProducts: [],
  });
});

router.get("/inventory", auth, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, { lowStock: [], outOfStock: [] });
});

router.post("/coupons", auth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, { message: "Coupon created", coupon: req.body }, 201);
});

router.patch("/coupons/:id", auth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  sendSuccess(res, { message: `Coupon ${id} updated` });
});

export default router;
