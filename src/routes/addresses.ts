import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendSuccess, sendError } from "../utils/response";
import { auth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// GET /api/addresses
// Returns the authenticated user's saved addresses
router.get("/", auth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  try {
    const addresses = await prisma.address.findMany({
      where: { userId },
      orderBy: { isDefault: "desc" },
    });

    sendSuccess(res, addresses);
  } catch (err) {
    console.error("[Addresses] GET error:", err);
    sendError(res, "SERVER_ERROR", "Failed to fetch addresses", 500);
  }
});

export default router;
