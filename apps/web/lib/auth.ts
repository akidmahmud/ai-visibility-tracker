import { createPrisma } from "@avt/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
    : undefined;

export const auth = betterAuth({
  database: prismaAdapter(createPrisma(), { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  socialProviders: google,
  telemetry: { enabled: false },
  // nextCookies must stay last: it lets server actions set auth cookies
  plugins: [organization(), nextCookies()],
});
