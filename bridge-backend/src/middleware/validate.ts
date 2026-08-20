import type { NextFunction, Request, Response } from "express";
import { z, type ZodType } from "zod";
import { ValidationError } from "../utils/errors.js";

/**
 * Request-validation middleware factory (spec §15). Validates and replaces
 * `body`, `params`, and/or `query` with the parsed, typed result. On failure it
 * throws a ValidationError with a safe, field-level summary.
 */
export interface RequestSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

function formatIssues(error: z.ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError("Request body validation failed.", formatIssues(result.error));
      }
      req.body = result.data;
    }
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        throw new ValidationError("Request params validation failed.", formatIssues(result.error));
      }
      // req.params is read-only in Express 5; assign field-by-field.
      Object.assign(req.params, result.data);
    }
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        throw new ValidationError("Request query validation failed.", formatIssues(result.error));
      }
      Object.assign(req.query as object, result.data);
    }
    next();
  };
}
