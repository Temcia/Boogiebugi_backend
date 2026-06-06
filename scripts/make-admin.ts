import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { env } from "../src/config/env";

const prisma = new PrismaClient();

const supabaseAdmin = createClient(
  env.SUPABASE_URL || "https://placeholder.supabase.co",
  env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key",
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

async function makeAdmin(phone: string) {
  console.log(`Promoting ${phone} to ADMIN...`);

  // 1. Generate the same dummy password used in auth.ts
  const dummyPassword = crypto
    .createHash("sha256")
    .update((env.SUPABASE_SERVICE_ROLE_KEY || "fallback") + phone)
    .digest("hex")
    .substring(0, 20) + "A1!";

  // 2. Check if user already exists in Prisma
  let dbUser = await prisma.user.findUnique({ where: { phone } });

  if (!dbUser) {
    console.log("User not found in DB. Creating in Supabase Auth...");
    
    // Create in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      phone,
      phone_confirm: true,
      password: dummyPassword,
      user_metadata: { role: "ADMIN" }, // Set role in metadata
    });

    let supabaseUserId = authData?.user?.id;

    if (authError) {
      if (authError.message.includes("already registered") || authError.message.includes("already exists")) {
        console.log("User already exists in Supabase Auth. Fetching ID...");
        // Fetch users and find the one with this phone
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = listData?.users.find((u) => u.phone === phone || u.phone === `+91${phone}`);
        
        if (existingAuthUser) {
          supabaseUserId = existingAuthUser.id;
          
          // Make sure their dummy password is set correctly just in case
          await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
            password: dummyPassword,
            user_metadata: { role: "ADMIN" }
          });
        } else {
          console.error("Could not find existing user in Supabase Auth list.");
          process.exit(1);
        }
      } else {
        console.error("Supabase Auth error:", authError);
        process.exit(1);
      }
    }

    if (supabaseUserId) {
      console.log("Creating user in Prisma DB as ADMIN...");
      dbUser = await prisma.user.create({
        data: {
          id: supabaseUserId,
          phone,
          role: "ADMIN",
        },
      });
      console.log("✅ User created and promoted to ADMIN successfully!");
    }

  } else {
    console.log("User found in DB. Updating role to ADMIN...");
    
    // Update Prisma
    await prisma.user.update({
      where: { phone },
      data: { role: "ADMIN" },
    });

    // Update Supabase Auth metadata
    await supabaseAdmin.auth.admin.updateUserById(dbUser.id, {
      user_metadata: { role: "ADMIN" }
    });

    console.log("✅ User promoted to ADMIN successfully!");
  }
}

const phoneArg = process.argv[2];

if (!phoneArg || !/^[6-9]\d{9}$/.test(phoneArg)) {
  console.error("Usage: npx tsx scripts/make-admin.ts <10-digit-phone>");
  process.exit(1);
}

makeAdmin(phoneArg)
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
