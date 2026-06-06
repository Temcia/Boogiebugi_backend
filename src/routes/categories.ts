import { Router, Request, Response } from "express";
import { sendSuccess, sendError } from "../utils/response";
import { prisma } from "../lib/prisma";

const router = Router();

// Returns top-level parent categories, each with their children nested inside.
// Useful for building grouped dropdowns on the frontend.
router.get("/", async (_req: Request, res: Response) => {
  try {
    const parents = await prisma.category.findMany({
      where: { parentId: null },
      orderBy: { name: "asc" },
      include: {
        children: {
          orderBy: { name: "asc" },
        },
      },
    });
    sendSuccess(res, { categories: parents });
  } catch (error) {
    console.error(error);
    sendError(res, "SERVER_ERROR", "Failed to fetch categories", 500);
  }
});

export default router;
