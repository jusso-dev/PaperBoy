import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureDefaultOrganization } from "@/lib/organizations";
import { normalizeTimeZone } from "@/lib/time";

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;

if (!secret || secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
}

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL is required");
}

export const auth = betterAuth({
  appName: "PaperBoy",
  baseURL,
  secret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user, context) => {
          try {
            await ensureDefaultOrganization({
              activeOrgId:
                typeof user.activeOrgId === "string" ? user.activeOrgId : null,
              defaultOrgId:
                typeof user.defaultOrgId === "string"
                  ? user.defaultOrgId
                  : null,
              id: user.id,
              name: user.name,
            });
          } catch (error) {
            if (context) {
              context.context.logger.error(
                "Failed to provision a default organization; the next authenticated request will retry",
                error,
              );
            } else {
              console.error(
                "Failed to provision a default organization; the next authenticated request will retry",
              );
            }
          }
        },
      },
    },
  },
  user: {
    additionalFields: {
      activeOrgId: {
        type: "string",
        input: false,
        required: false,
      },
      defaultOrgId: {
        type: "string",
        input: false,
        required: false,
      },
      timezone: {
        type: "string",
        defaultValue: "UTC",
        required: true,
        transform: {
          input: normalizeTimeZone,
        },
      },
    },
  },
  plugins: [nextCookies()],
});
