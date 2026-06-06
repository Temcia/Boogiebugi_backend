import { z } from "zod";

export const sendOTPSchema = z.object({
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Invalid Indian phone number"),
});

export const verifyOTPSchema = z.object({
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Invalid Indian phone number"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});
