import { Router, Request, Response } from "express";
import crypto from "crypto";
import redis from "../services/redis";
import { sendOTP } from "../services/fast2sms";
import { sendSuccess, sendError } from "../utils/response";
import { validate } from "../middleware/validate";
import { sendOTPSchema, verifyOTPSchema } from "../schemas/auth";
import { supabaseAdmin } from "../services/supabase";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

const router = Router();

// ---------------------------------------------------------------------------
// Upstash Redis auto-deserializes JSON — never call JSON.parse on redis.get()
// ---------------------------------------------------------------------------
interface OtpRecord {
  otp: string;
  attempts: number;
}

// POST /api/auth/send-otp
router.post(
  "/send-otp",
  validate(sendOTPSchema),
  async (req: Request, res: Response) => {
    const { phone } = req.body;

    // Rate limit: max 3 requests per phone per 10 min
    const rateLimitKey = `otp_limit:${phone}`;
    const attempts = await redis.get<number>(rateLimitKey);

    if (attempts && attempts >= 3) {
      return sendError(
        res,
        "RATE_LIMITED",
        "Too many OTP requests. Please try again later.",
        429
      );
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Store OTP in Redis with 5 min TTL
    // Pass a plain object — @upstash/redis serializes it; never JSON.stringify here
    const otpKey = `otp:${phone}`;
    await redis.set(otpKey, { otp, attempts: 0 }, { ex: 300 });

    // Increment rate limit counter
    await redis.incr(rateLimitKey);
    await redis.expire(rateLimitKey, 600);

    // Send OTP via Fast2SMS
    try {
      await sendOTP(phone, otp);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send OTP";
      console.error("Fast2SMS error:", message);
      return sendError(
        res,
        "SMS_FAILED",
        "Failed to send OTP. Please try again.",
        500
      );
    }

    return sendSuccess(res, { message: "OTP sent" });
  }
);

// POST /api/auth/verify-otp
router.post(
  "/verify-otp",
  validate(verifyOTPSchema),
  async (req: Request, res: Response) => {
    const { phone, otp } = req.body;

    const otpKey = `otp:${phone}`;
    // @upstash/redis returns an already-parsed object — no JSON.parse needed
    const stored = await redis.get<OtpRecord>(otpKey);

    if (!stored) {
      return sendError(
        res,
        "OTP_EXPIRED",
        "OTP expired. Please request a new one.",
        400
      );
    }

    const { otp: storedOTP, attempts } = stored;

    // Check attempts
    if (attempts >= 3) {
      await redis.del(otpKey);
      return sendError(
        res,
        "TOO_MANY_ATTEMPTS",
        "Too many attempts. Please request a new OTP.",
        400
      );
    }

    // Verify OTP
    if (otp !== storedOTP) {
      // Increment attempts
      await redis.set(
        otpKey,
        { otp: storedOTP, attempts: attempts + 1 },
        { ex: 300 }
      );
      return sendError(res, "INVALID_OTP", "Invalid OTP.", 400);
    }

    // OTP is valid — delete from Redis
    await redis.del(otpKey);

    // -----------------------------------------------------------------------
    // Supabase Auth Integration
    // -----------------------------------------------------------------------

    // Generate deterministic dummy password for Supabase Auth
    const dummyPassword = crypto
      .createHash("sha256")
      .update((env.SUPABASE_SERVICE_ROLE_KEY || "fallback") + phone)
      .digest("hex")
      .substring(0, 20) + "A1!";

    let dbUser = await prisma.user.findUnique({ where: { phone } });
    let isNewUser = false;

    if (!dbUser) {
      isNewUser = true;

      // 1. Create user in Supabase Auth via email (phone provider is disabled)
      //    Dummy email = {phone}@boogiebugi.com — never shown to the user
      const dummyEmail = `${phone}@boogiebugi.com`;
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: dummyEmail,
        email_confirm: true,
        password: dummyPassword,
        user_metadata: { role: "CUSTOMER", phone },
      });

      if (authError) {
        console.error("Supabase Auth error:", authError);

        if (authError.message.includes("already registered") || authError.message.includes("already exists")) {
          // User exists in Supabase but not Prisma — sync them
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
          const existing = listData?.users.find((u) => u.email === dummyEmail);
          if (existing) {
            await supabaseAdmin.auth.admin.updateUserById(existing.id, {
              password: dummyPassword,
            });
            dbUser = await prisma.user.create({
              data: {
                id: existing.id,
                phone,
                role: "CUSTOMER",
                name: req.body.name || null,
                email: req.body.email || null,
              },
            });
          } else {
            return sendError(res, "AUTH_STATE_ERROR", "Auth state inconsistent. Please contact support.", 500);
          }
        } else {
          return sendError(res, "AUTH_CREATION_FAILED", "Failed to create user account.", 500);
        }
      } else {
        // 2. Create user in Prisma DB
        dbUser = await prisma.user.create({
          data: {
            id: authData.user.id,
            phone,
            role: "CUSTOMER",
            name: req.body.name || null,
            email: req.body.email || null,
          },
        });
      }
    } else {
      // If user exists and provided name/email (e.g. during register flow), update them
      if (req.body.name || req.body.email) {
        dbUser = await prisma.user.update({
          where: { phone },
          data: {
            name: req.body.name || dbUser.name,
            email: req.body.email || dbUser.email,
          },
        });
      }
    }

    // 3. Sign in via email (phone provider is disabled in Supabase)
    //    We use the deterministic dummy email assigned at creation time
    const loginEmail = dbUser?.email || `${phone}@boogiebugi.com`;
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: loginEmail,
      password: dummyPassword,
    });

    if (signInError || !signInData.session) {
      console.error("Supabase signIn error:", signInError);
      return sendError(res, "SESSION_CREATION_FAILED", "Failed to create user session.", 500);
    }

    return sendSuccess(res, {
      message: "OTP verified",
      isNewUser,
      user: dbUser,
      session: signInData.session,
    });
  }
);

export default router;
