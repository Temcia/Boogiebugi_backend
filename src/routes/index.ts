import { Router } from "express";
import productsRouter from "./products";
import cartRouter from "./cart";
import ordersRouter from "./orders";
import paymentsRouter from "./payments";
import webhooksRouter from "./webhooks";
import wishlistRouter from "./wishlist";
import adminRouter from "./admin";
import authRouter from "./auth";
import categoriesRouter from "./categories";

const router = Router();

router.use("/products", productsRouter);
router.use("/cart", cartRouter);
router.use("/orders", ordersRouter);
router.use("/payments", paymentsRouter);
router.use("/webhooks", webhooksRouter);
router.use("/wishlist", wishlistRouter);
router.use("/admin", adminRouter);
router.use("/auth", authRouter);
router.use("/categories", categoriesRouter);

export default router;
