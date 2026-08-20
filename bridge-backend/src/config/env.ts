import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// Load .env into process.env before we read anything. Safe to call once here;
// server.ts imports this module first.
loadDotenv();

/**
 * A comma-separated list env var -> string[]. Trims blanks. `defaultValue` is
 * applied to the raw string *before* the transform so Zod's output-typed
 * `.default()` stays happy.
 */
const csv = (defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );

/**
 * Coerce common truthy strings to boolean.
 */
const boolish = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(["true", "false", "1", "0", "yes", "no"]))
  .transform((value) => value === "true" || value === "1" || value === "yes");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Auth
  API_KEY: z.string().min(1, "API_KEY is required"),

  // CORS
  ALLOWED_ORIGINS: csv("*"),

  // Currency / FX
  CURRENCY_PROVIDER: z.enum(["exchangerate-api", "static"]).default("static"),
  CURRENCY_PROVIDER_API_KEY: z.string().optional(),
  CURRENCY_SPREAD_PERCENT: z.coerce.number().min(0).max(100).default(2),

  // Quotes
  QUOTE_EXPIRY_MINUTES: z.coerce.number().positive().default(5),

  // Card provider
  CARD_PROVIDER: z.enum(["mock"]).default("mock"),
  CARD_PROVIDER_API_KEY: z.string().optional(),
  CARD_PROVIDER_WEBHOOK_SECRET: z.string().min(1).default("whsec_card_dev"),

  // Payment / collection provider
  PAYMENT_PROVIDER: z.enum(["mock"]).default("mock"),
  PAYMENT_PROVIDER_SECRET: z.string().min(1).default("whsec_dev"),
  COLLECTION_ACCOUNT_NAME: z.string().min(1).default("BRIDGE PAYMENTS (SANDBOX)"),

  // Dev-only transfer simulation
  SIMULATE_TRANSFERS: boolish.default(false),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate the environment. Exits the process on failure so we never
 * boot a payment service with an invalid/insecure configuration.
 */
function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    // Use console here directly: the logger depends on env, which isn't ready yet.
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  const env = parsed.data;

  // Effective FX provider: fall back to static when the real provider has no key.
  if (env.CURRENCY_PROVIDER === "exchangerate-api" && !env.CURRENCY_PROVIDER_API_KEY) {
    console.warn(
      "[env] CURRENCY_PROVIDER=exchangerate-api but CURRENCY_PROVIDER_API_KEY is empty; " +
        "falling back to the static rate provider.",
    );
  }

  // Loud warning if transfer simulation is left on outside development.
  if (env.SIMULATE_TRANSFERS && env.NODE_ENV === "production") {
    console.error(
      "[env] SIMULATE_TRANSFERS must not be enabled in production. Refusing to start.",
    );
    process.exit(1);
  }

  return env;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
