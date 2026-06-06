import { Response } from "express";

export function sendSuccess(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function sendError(
  res: Response,
  error: string,
  message: string,
  status = 400,
  details?: unknown
) {
  const body: Record<string, unknown> = { success: false, error, message };
  if (details) body.details = details;
  return res.status(status).json(body);
}
