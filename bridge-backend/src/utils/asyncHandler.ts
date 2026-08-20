import type { NextFunction, Request, Response, RequestHandler } from "express";

/**
 * Wrap an async request handler so rejected promises are forwarded to the
 * error handler. Express 5 forwards rejections natively, but this keeps the
 * intent explicit and is harmless.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
