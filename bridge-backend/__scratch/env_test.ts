import { env } from "../src/config/env.js";
console.log("ENV_OK", JSON.stringify({ node: env.NODE_ENV, port: env.PORT, provider: env.CURRENCY_PROVIDER, spread: env.CURRENCY_SPREAD_PERCENT, origins: env.ALLOWED_ORIGINS, sim: env.SIMULATE_TRANSFERS }));
