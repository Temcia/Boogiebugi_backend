import { Router, Response } from "express";
import { sendSuccess, sendError } from "../utils/response";
import { auth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/", auth, async (req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, { items: [] });
});

router.post("/", auth, async (req: AuthenticatedRequest, res: Response) => {
  const { productId } = req.body;
  if (!productId) {
    return sendError(res, "VALIDATION_ERROR", "productId is required", 400);
  }
  sendSuccess(res, { message: `Added product ${productId} to wishlist` }, 201);
});

router.delete("/:productId", auth, async (req: AuthenticatedRequest, res: Response) => {
  const { productId } = req.params;
  sendSuccess(res, { message: `Removed product ${productId} from wishlist` });
});

export default router;
