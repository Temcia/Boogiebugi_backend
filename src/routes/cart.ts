import { Router, Request, Response } from "express";
import { sendSuccess } from "../utils/response";
import { validate } from "../middleware/validate";
import { addToCartSchema, updateCartItemSchema } from "../schemas/cart";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  sendSuccess(res, { items: [], total: 0, itemCount: 0 });
});

router.post("/", validate(addToCartSchema), async (req: Request, res: Response) => {
  const { variantId, quantity } = req.body;
  sendSuccess(res, { message: `Added variant ${variantId} x${quantity} to cart` }, 201);
});

router.patch("/:itemId", validate(updateCartItemSchema), async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const { quantity } = req.body;
  sendSuccess(res, { message: `Updated cart item ${itemId} to x${quantity}` });
});

router.delete("/:itemId", async (req: Request, res: Response) => {
  const { itemId } = req.params;
  sendSuccess(res, { message: `Removed item ${itemId} from cart` });
});

router.delete("/", async (_req: Request, res: Response) => {
  sendSuccess(res, { message: "Cart cleared" });
});

export default router;
