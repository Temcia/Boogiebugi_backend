import { z } from "zod";

export const addToCartSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive().max(10),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive().max(10),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
