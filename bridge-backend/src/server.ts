import type { Server } from "node:http";
import { createApp } from "./app.js";
import { env, isDevelopment } from "./config/env.js";
import { logger } from "./utils/logger.js";

/**
 * Process entrypoint. Builds the app, starts the HTTP listener, and installs
 * graceful-shutdown + last-resort crash handlers.
 */
const app = createApp();

const server: Server = app.listen(env.PORT, () => {
  logger.info("Paron backend started", {
    port: env.PORT,
    environment: env.NODE_ENV,
    currencyProvider: env.CURRENCY_PROVIDER,
    cardProvider: env.CARD_PROVIDER,
    paymentProvider: env.PAYMENT_PROVIDER,
    simulateTransfers: env.SIMULATE_TRANSFERS,
  });
  if (isDevelopment) {
    logger.info("Health check available", { url: `http://localhost:${env.PORT}/health` });
  }
});

/** Close the server, then exit. Forces exit if connections don't drain in time. */
function shutdown(signal: string): void {
  logger.info("Shutting down", { signal });
  const forceExit = setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      logger.error("Error during shutdown", { message: err.message });
      process.exit(1);
    }
    logger.info("Shutdown complete");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught exception", { message: error.message, stack: error.stack });
  // An uncaught exception leaves the process in an undefined state; exit.
  process.exit(1);
});
