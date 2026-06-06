import { z } from "zod";

export const listProductsSchema = z.object({
  category: z.string().optional(),
  categoryId: z.string().optional(),
  sort: z.enum(["price-asc", "price-desc", "newest", "popular"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  q: z.string().optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().min(1),
  categoryId: z.string().min(1),
  price: z.number().int().positive(),
  comparePrice: z.number().int().positive().optional(),
  images: z.array(z.string()).min(1),
  tags: z.array(z.string()).default([]),
  variants: z.array(z.object({
    size: z.string().min(1),
    color: z.string().optional(),
    sku: z.string().min(1),
    stock: z.number().int().nonnegative().default(0),
    price: z.number().int().positive().optional(),
  })).min(1),
});

export const updateProductSchema = createProductSchema.partial();

export type ListProductsInput = z.infer<typeof listProductsSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
