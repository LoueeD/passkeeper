import {
  PasskeeperError,
  createPasskeeper,
  type AuthenticationResponseJSON,
  type PasskeeperConfig,
  type PasskeeperSession,
  type RegistrationResponseJSON,
} from "@passkeeper/core";

export interface SessionCookieOptions {
  name?: string;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
}

export interface PasskeeperRequestHookInput {
  request: Request;
  path: string;
  method: string;
}

export type PasskeeperRequestHook = (
  input: PasskeeperRequestHookInput,
) => Response | null | undefined | Promise<Response | null | undefined>;

export interface PasskeeperRoutesOptions extends PasskeeperConfig {
  basePath?: string;
  maxBodyBytes?: number;
  sessionCookie?: SessionCookieOptions;
  beforeRequest?: PasskeeperRequestHook;
}

export interface PasskeeperRoutes {
  handle(request: Request): Promise<Response>;
}

export type PublicPasskeeperSession = Omit<PasskeeperSession, "tokenHash">;

interface RegisterBeginBody {
  username?: unknown;
  displayName?: unknown;
  userId?: unknown;
  inviteCode?: unknown;
}

interface RegisterCompleteBody {
  challengeId?: unknown;
  userId?: unknown;
  credential?: unknown;
  inviteCode?: unknown;
}

interface LoginBeginBody {
  username?: unknown;
}

interface LoginCompleteBody {
  challengeId?: unknown;
  credential?: unknown;
}

const DEFAULT_BASE_PATH = "/auth";
const DEFAULT_COOKIE_NAME = "pk_session";
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const MIN_MAX_BODY_BYTES = 1024;
const MAX_MAX_BODY_BYTES = 1024 * 1024;

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

export function createPasskeeperRoutes(options: PasskeeperRoutesOptions): PasskeeperRoutes {
  const basePath = normalizeBasePath(options.basePath ?? DEFAULT_BASE_PATH);
  const maxBodyBytes = normalizeMaxBodyBytes(options.maxBodyBytes);
  const cookieOptions = normalizeCookieOptions(options.sessionCookie);
  const beforeRequest = normalizeRequestHook(options.beforeRequest);
  const passkeeper = createPasskeeper(options);

  async function requireSession(request: Request) {
    const token = getCookie(request.headers.get("cookie"), cookieOptions.name);

    if (token === null) {
      throw new PasskeeperError({
        code: "invalid_credential",
        message: "Authentication is required.",
      });
    }

    return passkeeper.sessions.verify({ token });
  }

  return {
    async handle(request) {
      try {
        const url = new URL(request.url);
        const path = stripBasePath(url.pathname, basePath);

        if (path === null) {
          return json({ error: "Not found" }, { status: 404 });
        }

        const allowedMethods = allowedMethodsForPath(path);

        if (allowedMethods !== null) {
          validateRequestOrigin(request, passkeeper.config.origin);

          const hookResponse = await beforeRequest?.({
            request,
            path,
            method: request.method,
          });

          if (hookResponse !== undefined && hookResponse !== null) {
            if (!(hookResponse instanceof Response)) {
              throw new PasskeeperError({
                code: "invalid_config",
                message: "beforeRequest must return a Response, null, or undefined.",
              });
            }

            return hookResponse;
          }
        }

        if (request.method === "POST" && path === "/passkey/register/begin") {
          const body = await readJson<RegisterBeginBody>(request, maxBodyBytes);
          const result = await passkeeper.register.begin({
            username: requireString(body.username, "username"),
            ...(body.displayName === undefined
              ? {}
              : { displayName: requireString(body.displayName, "displayName") }),
            ...(body.userId === undefined ? {} : { userId: requireString(body.userId, "userId") }),
            ...(body.inviteCode === undefined
              ? {}
              : { inviteCode: requireString(body.inviteCode, "inviteCode") }),
          });

          return json(result);
        }

        if (request.method === "POST" && path === "/passkey/register/complete") {
          const body = await readJson<RegisterCompleteBody>(request, maxBodyBytes);
          const result = await passkeeper.register.complete({
            challengeId: requireString(body.challengeId, "challengeId"),
            userId: requireString(body.userId, "userId"),
            credential: requireObject(body.credential, "credential") as unknown as RegistrationResponseJSON,
            ...(body.inviteCode === undefined
              ? {}
              : { inviteCode: requireString(body.inviteCode, "inviteCode") }),
          });
          const session = await passkeeper.sessions.create({
            userId: result.user.id,
          });

          return json(
            {
              user: result.user,
              credential: result.credential,
              session: publicSession(session.session),
            },
            {
              headers: {
                "set-cookie": serializeSessionCookie(session.token, cookieOptions),
              },
            },
          );
        }

        if (request.method === "POST" && path === "/passkey/register/add/begin") {
          const current = await requireSession(request);
          const result = await passkeeper.register.add.begin({
            userId: current.user.id,
          });

          return json(result);
        }

        if (request.method === "POST" && path === "/passkey/register/add/complete") {
          const current = await requireSession(request);
          const body = await readJson<RegisterCompleteBody>(request, maxBodyBytes);
          const userId = requireString(body.userId, "userId");

          if (userId !== current.user.id) {
            throw new PasskeeperError({
              code: "invalid_credential",
              message: "Registration user does not match the authenticated session.",
            });
          }

          const result = await passkeeper.register.add.complete({
            challengeId: requireString(body.challengeId, "challengeId"),
            userId,
            credential: requireObject(body.credential, "credential") as unknown as RegistrationResponseJSON,
          });

          return json({
            ...result,
            session: publicSession(current.session),
          });
        }

        if (request.method === "POST" && path === "/passkey/login/begin") {
          const body = await readJson<LoginBeginBody>(request, maxBodyBytes);
          const result = await passkeeper.login.begin({
            username: requireString(body.username, "username"),
          });

          return json(result);
        }

        if (request.method === "POST" && path === "/passkey/login/complete") {
          const body = await readJson<LoginCompleteBody>(request, maxBodyBytes);
          const result = await passkeeper.login.complete({
            challengeId: requireString(body.challengeId, "challengeId"),
            credential: requireObject(body.credential, "credential") as unknown as AuthenticationResponseJSON,
          });
          const session = await passkeeper.sessions.create({
            userId: result.user.id,
          });

          return json(
            {
              user: result.user,
              credential: result.credential,
              session: publicSession(session.session),
            },
            {
              headers: {
                "set-cookie": serializeSessionCookie(session.token, cookieOptions),
              },
            },
          );
        }

        if (request.method === "GET" && path === "/me") {
          const token = getCookie(request.headers.get("cookie"), cookieOptions.name);

          if (token === null) {
            return json({ user: null, session: null }, { status: 401 });
          }

          const result = await passkeeper.sessions.verify({ token });

          return json({
            user: result.user,
            session: publicSession(result.session),
          });
        }

        if (request.method === "POST" && path === "/logout") {
          const token = getCookie(request.headers.get("cookie"), cookieOptions.name);

          if (token !== null) {
            try {
              const result = await passkeeper.sessions.verify({
                token,
                updateLastSeen: false,
              });
              await passkeeper.sessions.delete(result.session.id);
            } catch (error) {
              if (!(error instanceof PasskeeperError)) {
                throw error;
              }
            }
          }

          return json(
            { ok: true },
            {
              headers: {
                "set-cookie": serializeExpiredSessionCookie(cookieOptions),
              },
            },
          );
        }

        if (allowedMethods !== null) {
          return methodNotAllowed(allowedMethods);
        }

        return json({ error: "Not found" }, { status: 404 });
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

function validateRequestOrigin(request: Request, expectedOrigin: string): void {
  if (request.method !== "POST") {
    return;
  }

  const requestOrigin = request.headers.get("origin");

  if (requestOrigin !== null && requestOrigin !== expectedOrigin) {
    throw new PasskeeperError({
      code: "invalid_origin",
      message: "Request origin does not match the configured origin.",
    });
  }
}

function normalizeRequestHook(hook: PasskeeperRequestHook | undefined): PasskeeperRequestHook | undefined {
  if (hook !== undefined && typeof hook !== "function") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "beforeRequest must be a function.",
    });
  }

  return hook;
}

function normalizeMaxBodyBytes(maxBodyBytes = DEFAULT_MAX_BODY_BYTES): number {
  if (
    !Number.isInteger(maxBodyBytes) ||
    maxBodyBytes < MIN_MAX_BODY_BYTES ||
    maxBodyBytes > MAX_MAX_BODY_BYTES
  ) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: `maxBodyBytes must be an integer between ${MIN_MAX_BODY_BYTES} and ${MAX_MAX_BODY_BYTES}.`,
    });
  }

  return maxBodyBytes;
}

function normalizeBasePath(basePath: string): string {
  if (typeof basePath !== "string" || basePath.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "basePath must be a non-empty string.",
    });
  }

  const trimmed = basePath.trim();

  if (/[\u0000-\u001f\u007f?#]/u.test(trimmed)) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "basePath must be a URL path without query, hash, or control characters.",
    });
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "") || DEFAULT_BASE_PATH;
}

function stripBasePath(pathname: string, basePath: string): string | null {
  if (pathname === basePath) {
    return "/";
  }

  if (!pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  return pathname.slice(basePath.length);
}

function allowedMethodsForPath(path: string): string | null {
  switch (path) {
    case "/me":
      return "GET";
    case "/passkey/register/begin":
    case "/passkey/register/complete":
    case "/passkey/register/add/begin":
    case "/passkey/register/add/complete":
    case "/passkey/login/begin":
    case "/passkey/login/complete":
    case "/logout":
      return "POST";
    default:
      return null;
  }
}

function methodNotAllowed(allow: string): Response {
  return json(
    {
      error: "method_not_allowed",
      message: "Method not allowed.",
    },
    {
      status: 405,
      headers: {
        allow,
      },
    },
  );
}

function normalizeCookieOptions(options: SessionCookieOptions = {}): Required<SessionCookieOptions> {
  const normalized = {
    name: normalizeCookieName(options.name ?? DEFAULT_COOKIE_NAME),
    secure: options.secure ?? true,
    sameSite: options.sameSite ?? "Lax",
    path: normalizeCookiePath(options.path ?? "/"),
  };

  if (normalized.sameSite === "None" && !normalized.secure) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "sessionCookie.secure must be true when sessionCookie.sameSite is None.",
    });
  }

  return normalized;
}

function normalizeCookieName(name: string): string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "sessionCookie.name must be a non-empty string.",
    });
  }

  const value = name.trim();

  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "sessionCookie.name contains invalid cookie name characters.",
    });
  }

  return value;
}

function normalizeCookiePath(path: string): string {
  if (typeof path !== "string" || path.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "sessionCookie.path must be a non-empty string.",
    });
  }

  const value = path.trim();

  if (!value.startsWith("/") || /[\u0000-\u001f\u007f;]/u.test(value)) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "sessionCookie.path must start with / and must not contain control characters or semicolons.",
    });
  }

  return value;
}

async function readJson<T>(request: Request, maxBodyBytes: number): Promise<T> {
  const contentType = request.headers.get("content-type");
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();

  if (mediaType !== "application/json") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: "Request body must use application/json.",
    });
  }

  const contentLength = request.headers.get("content-length");

  if (contentLength !== null && /^\d+$/u.test(contentLength) && Number(contentLength) > maxBodyBytes) {
    throw new RequestBodyTooLargeError();
  }

  try {
    const text = await readBodyText(request, maxBodyBytes);
    const body = JSON.parse(text) as unknown;

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new PasskeeperError({
        code: "invalid_config",
        message: "Request body must be a JSON object.",
      });
    }

    return body as T;
  } catch (error) {
    if (error instanceof PasskeeperError || error instanceof RequestBodyTooLargeError) {
      throw error;
    }

    throw new PasskeeperError({
      code: "invalid_config",
      message: "Request body must be valid JSON.",
      cause: error,
    });
  }
}

async function readBodyText(request: Request, maxBodyBytes: number): Promise<string> {
  if (request.body === null) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > maxBodyBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestBodyTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PasskeeperError({
      code: "invalid_config",
      message: `${field} must be a non-empty string.`,
    });
  }

  return value.trim();
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PasskeeperError({
      code: "invalid_config",
      message: `${field} must be an object.`,
    });
  }

  return value as Record<string, unknown>;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function publicSession(session: PasskeeperSession): PublicPasskeeperSession {
  const { tokenHash: _tokenHash, ...publicValue } = session;
  return publicValue;
}

function errorResponse(error: unknown): Response {
  if (error instanceof RequestBodyTooLargeError) {
    return json(
      {
        error: "request_too_large",
        message: error.message,
      },
      { status: 413 },
    );
  }

  if (error instanceof PasskeeperError) {
    return json(
      {
        error: error.code,
        message: error.message,
      },
      { status: statusForError(error) },
    );
  }

  return json(
    {
      error: "internal_error",
      message: "Internal server error.",
    },
    { status: 500 },
  );
}

function statusForError(error: PasskeeperError): number {
  switch (error.code) {
    case "user_not_found":
    case "credential_not_found":
    case "challenge_not_found":
      return 404;
    case "challenge_expired":
    case "invalid_challenge":
    case "invalid_credential":
    case "invalid_invite":
    case "verification_failed":
      return 401;
    case "invalid_origin":
      return 403;
    case "invalid_config":
      return 400;
    default:
      return 500;
  }
}

function serializeSessionCookie(token: string, options: Required<SessionCookieOptions>): string {
  return [
    `${options.name}=${encodeURIComponent(token)}`,
    "HttpOnly",
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`,
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

function serializeExpiredSessionCookie(options: Required<SessionCookieOptions>): string {
  return [
    `${options.name}=`,
    "HttpOnly",
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`,
    "Max-Age=0",
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (cookieHeader === null) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split("=");

    if (rawName === name) {
      const encodedValue = rawValue.join("=");

      if (encodedValue === "") {
        return null;
      }

      try {
        return decodeURIComponent(encodedValue);
      } catch {
        return null;
      }
    }
  }

  return null;
}
