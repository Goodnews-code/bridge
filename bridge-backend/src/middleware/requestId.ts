import type { NextFunction, Response } from "express";
import { randomUUID } from "node:crypto";
import type { AuthedRequest } from "../types/http.js";

/**
 * Attach a request id (from the inbound `x-request-id` header or freshly
 * generated) and echo it back on the response. Used to correlate logs.
 */
export function requestId(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header("x-request-id");
  const id = incoming && incoming.length <= 200 ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
