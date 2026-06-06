import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { sendError } from "../utils/response";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return sendError(res, err.code, err.message, err.status);
  }

  if (process.env.NODE_ENV !== "production") {
    console.error("Unhandled error:", err);
  }

  return sendError(
    res,
    "INTERNAL_ERROR",
    process.env.NODE_ENV === "production" ? "An unexpected error occurred" : err.message,
    500
  );
}
