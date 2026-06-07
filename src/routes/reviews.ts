import { Router, Request, Response } from "express";
import { sendSuccess, sendError } from "../utils/response";
import { auth, AuthenticatedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const router = Router();

/**
 * GET /api/reviews/:productId
 * Public — returns all reviews for a product, ordered newest first.
 * Includes the reviewer's display name from the User table.
 */
router.get("/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId as string;

    // Verify product exists
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return sendError(res, "NOT_FOUND", "Product not found", 404);
    }

    const reviews = await prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true } },
      },
    });

    // Compute aggregate stats
    const count = reviews.length;
    const avgRating =
      count > 0
        ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
        : 0;

    sendSuccess(res, { reviews, count, avgRating });
  } catch (error: any) {
    console.error(error);
    sendError(res, "SERVER_ERROR", "Failed to fetch reviews", 500);
  }
});

/**
 * POST /api/reviews/:productId
 * Authenticated — submit a review for a product.
 * A user can only review a product once.
 */
router.post("/:productId", auth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = req.params.productId as string;
    const userId = req.user!.id as string;

    const { rating, title, body } = req.body as {
      rating: number;
      title?: string;
      body?: string;
    };

    // Basic validation
    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return sendError(res, "VALIDATION_ERROR", "Rating must be a number between 1 and 5", 400);
    }

    // Verify product exists
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return sendError(res, "NOT_FOUND", "Product not found", 404);
    }

    // One review per user per product
    const existing = await prisma.review.findFirst({ where: { userId, productId } });
    if (existing) {
      return sendError(res, "DUPLICATE", "You have already reviewed this product", 409);
    }

    const review = await prisma.review.create({
      data: {
        userId,
        productId,
        rating,
        title: title ?? null,
        body: body ?? null,
        isVerified: false,
      },
      include: {
        user: { select: { name: true } },
      },
    });

    sendSuccess(res, { review }, 201);
  } catch (error: any) {
    console.error(error);
    sendError(res, "SERVER_ERROR", "Failed to submit review", 500);
  }
});

export default router;
