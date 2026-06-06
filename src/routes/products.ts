import { Router, Request, Response } from "express";
import { sendSuccess, sendError } from "../utils/response";
import { validateQuery } from "../middleware/validate";
import { listProductsSchema, createProductSchema, updateProductSchema, CreateProductInput, UpdateProductInput, ListProductsInput } from "../schemas/product";
import { auth, requireAdmin, AuthenticatedRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { prisma } from "../lib/prisma";

const router = Router();

// Public: List products
router.get("/", validateQuery(listProductsSchema), async (req: Request, res: Response) => {
  try {
    const { category, categoryId, sort, page, limit, q } = req.query as unknown as ListProductsInput;

    let where: any = { isActive: true };
    const catFilter = categoryId ?? category;
    if (catFilter) {
      // Find the category and its children so parent-level browsing includes child-category products
      const matchedCat = await prisma.category.findUnique({
        where: { id: catFilter },
        include: { children: { select: { id: true } } },
      });

      if (matchedCat) {
        const childIds = (matchedCat.children ?? []).map((c: { id: string }) => c.id);
        const allCatIds = [matchedCat.id, ...childIds];
        where.categoryId = { in: allCatIds };
      } else {
        // Fallback: exact match (e.g. slug-based lookup may not have matched)
        where.categoryId = catFilter;
      }
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    let orderBy: any = { createdAt: "desc" };
    if (sort === "price-asc") orderBy = { price: "asc" };
    else if (sort === "price-desc") orderBy = { price: "desc" };
    else if (sort === "newest") orderBy = { createdAt: "desc" };
    // "popular" requires joining orders/reviews, keep newest for now

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: { variants: true, category: true },
      }),
      prisma.product.count({ where }),
    ]);

    sendSuccess(res, {
      products,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error(error);
    sendError(res, "SERVER_ERROR", error.message || "Failed to fetch products", 500);
  }
});

// Public: Get single product by slug
router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const product = await prisma.product.findUnique({
      where: { slug },
      include: { variants: true, category: true, reviews: true },
    });

    if (!product || !product.isActive) {
      return sendError(res, "NOT_FOUND", `Product "${slug}" not found`, 404);
    }

    sendSuccess(res, { product });
  } catch (error) {
    console.error(error);
    sendError(res, "SERVER_ERROR", "Failed to fetch product", 500);
  }
});

router.post(
  "/admin",
  auth,
  requireAdmin,
  validate(createProductSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = req.body as CreateProductInput;

      const product = await prisma.product.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          categoryId: data.categoryId,
          price: data.price,
          comparePrice: data.comparePrice,
          images: data.images,
          tags: data.tags,
          variants: {
            create: data.variants,
          },
        },
        include: {
          variants: true,
          category: true,
        },
      });

      sendSuccess(res, { message: "Product created", product }, 201);
    } catch (error: any) {
      console.error(error);
      if (error.code === 'P2002') {
        return sendError(res, "DUPLICATE", "Product slug or variant SKU already exists", 400);
      }
      sendError(res, "SERVER_ERROR", "Failed to create product", 500);
    }
  }
);

router.patch(
  "/admin/:id",
  auth,
  requireAdmin,
  validate(updateProductSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const data = req.body as UpdateProductInput;

      // Extract variants if present, as they need special handling (upsert/delete)
      const { variants, ...productData } = data;

      const product = await prisma.product.update({
        where: { id },
        data: {
          ...productData,
          // Simple implementation for variants: if provided, we assume we update/create them
          // In a real robust system, we would need to handle deletions of variants too.
          // Since Prisma's update doesn't automatically diff, we just do a basic update.
        },
        include: { variants: true },
      });

      // If variants are provided, update them one by one (simplified)
      if (variants) {
        for (const v of variants) {
          // If we have an existing variant SKU, update it
          await prisma.variant.upsert({
            where: { sku: v.sku },
            create: { ...v, productId: id },
            update: v,
          });
        }
      }

      sendSuccess(res, { message: `Product ${id} updated`, product });
    } catch (error: any) {
      console.error(error);
      if (error.code === 'P2025') {
        return sendError(res, "NOT_FOUND", "Product not found", 404);
      }
      sendError(res, "SERVER_ERROR", "Failed to update product", 500);
    }
  }
);

router.delete(
  "/admin/:id",
  auth,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = req.params.id as string;

      const product = await prisma.product.findUnique({ where: { id } });
      if (!product) {
        return sendError(res, "NOT_FOUND", "Product not found", 404);
      }

      // Hard delete by removing all related child records first
      await prisma.$transaction([
        prisma.wishlistItem.deleteMany({ where: { productId: id } }),
        prisma.review.deleteMany({ where: { productId: id } }),
        prisma.variant.deleteMany({ where: { productId: id } }),
        prisma.product.delete({ where: { id } }),
      ]);

      sendSuccess(res, { message: `Product ${product.name} deleted completely`, product });
    } catch (error: any) {
      console.error(error);
      if (error.code === 'P2025') {
        return sendError(res, "NOT_FOUND", "Product not found", 404);
      }
      if (error.code === 'P2003') {
        return sendError(res, "CONSTRAINT_ERROR", "Cannot delete product because it has existing orders.", 400);
      }
      sendError(res, "SERVER_ERROR", "Failed to delete product", 500);
    }
  }
);

export default router;
