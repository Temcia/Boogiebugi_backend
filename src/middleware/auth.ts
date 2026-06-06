import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response";
import { supabaseAdmin } from "../services/supabase";
import { prisma } from "../lib/prisma";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: "CUSTOMER" | "ADMIN";
  };
}

export async function auth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return sendError(res, "UNAUTHORIZED", "Missing or invalid Authorization header", 401);
  }

  const token = header.slice(7);

  if (!token) {
    return sendError(res, "UNAUTHORIZED", "Token is required", 401);
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return sendError(res, "UNAUTHORIZED", "Invalid or expired token", 401);
    }

    // Query role from DB (not user_metadata) — keeps a single source of truth
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });

    req.user = {
      id: user.id,
      email: user.email || "",
      role: (dbUser?.role as "CUSTOMER" | "ADMIN") || "CUSTOMER",
    };

    next();
  } catch (err) {
    return sendError(res, "UNAUTHORIZED", "Failed to authenticate", 401);
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return sendError(res, "UNAUTHORIZED", "Authentication required", 401);
  }

  if (req.user.role !== "ADMIN") {
    return sendError(res, "FORBIDDEN", "Admin access required", 403);
  }

  next();
}
