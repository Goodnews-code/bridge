import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type { Express } from "express";

/**
 * In-process HTTP injector for the sandbox (no TCP port binding allowed).
 *
 * Drives the REAL Express app as a (req,res) handler. We use a genuine
 * http.IncomingMessage (backed by an unconnected socket) rather than a
 * PassThrough, because Express reassigns req's prototype to its own request
 * object chained to IncomingMessage.prototype — a plain Duplex would lose its
 * stream methods. The request body is fed via req.push(); the response is
 * captured by overriding res.write/res.end (nothing ever touches the socket).
 *
 * This exercises the true middleware chain: helmet, cors,
 * express.json({verify}) raw-body capture, rate-limit, auth, validation,
 * routing, controllers, and the centralized error handler.
 */
export interface InjectOptions {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface InjectResponse {
  statusCode: number;
  headers: Record<string, unknown>;
  rawBody: string;
  json: <T = any>() => T;
}

export function inject(app: Express, opts: InjectOptions): Promise<InjectResponse> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    // A live connection always has a peer address; express-rate-limit requires
    // it. An unconnected socket leaves it undefined, so set it explicitly.
    Object.defineProperty(socket, "remoteAddress", { value: "127.0.0.1", configurable: true });
    const req = new IncomingMessage(socket);

    const hasBody = opts.body !== undefined;
    const bodyBuf = hasBody
      ? Buffer.from(typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body), "utf8")
      : Buffer.alloc(0);

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k.toLowerCase()] = v;
    if (hasBody) {
      if (!headers["content-type"]) headers["content-type"] = "application/json";
      headers["content-length"] = String(bodyBuf.length);
    }

    req.method = opts.method.toUpperCase();
    req.url = opts.path;
    req.headers = headers;
    req.httpVersion = "1.1";
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];

    res.write = ((chunk: unknown): boolean => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return true;
    }) as typeof res.write;

    let settled = false;
    const finish = (chunk?: unknown): void => {
      if (settled) return;
      settled = true;
      if (chunk && typeof chunk !== "function") {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      resolve({
        statusCode: res.statusCode,
        headers: res.getHeaders(),
        rawBody,
        json: <T,>() => JSON.parse(rawBody) as T,
      });
    };

    res.end = ((chunk?: unknown): ServerResponse => {
      finish(chunk);
      return res;
    }) as typeof res.end;

    req.on("error", reject);
    res.on("error", reject);

    try {
      (app as unknown as (r: IncomingMessage, s: ServerResponse) => void)(req, res);
    } catch (err) {
      reject(err);
      return;
    }

    // Feed the body once body-parser has attached its stream listeners.
    setImmediate(() => {
      if (hasBody) req.push(bodyBuf);
      req.push(null);
    });
  });
}
