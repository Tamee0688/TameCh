"use strict";

const http = require("node:http");
const path = require("node:path");
const { promises: fs } = require("node:fs");
const { promisify } = require("node:util");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mysql = require("mysql2/promise");
const {
  randomBytes,
  scrypt,
  timingSafeEqual
} = require("node:crypto");

const scryptAsync = promisify(scrypt);
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 3000;
const HOST = process.env.PORTFOLIO_HOST || "127.0.0.1";
const ROOT = __dirname;
const PROJECTS_FILE = path.join(ROOT, "data", "private-projects.json");
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "connect_to_me",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: "utf8mb4"
};
const COOKIE_NAME = "portfolio_session";
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_LIFETIME_MS / 1000);
const MAX_BODY_BYTES = 12 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 12;
const APP_ORIGIN = process.env.APP_ORIGIN || "";
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === "true" || APP_ORIGIN.startsWith("https://");
const SCRYPT_OPTIONS = {
  N: 1 << 15,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
};

const DUMMY_SALT = Buffer.alloc(16, 0);
const DUMMY_HASH = Buffer.alloc(64, 0);
const sessions = new Map();
const rateLimits = new Map();
let dbPool;

const PUBLIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/documents.html", "documents.html"],
  ["/videos.html", "videos.html"],
  ["/style.css", "style.css"],
  ["/script.js", "script.js"],
  ["/dashboard.js", "dashboard.js"],
  ["/assets/tamiru-chalchisa.jpg", "assets/tamiru-chalchisa.jpg"],
  ["/assets/site-logo.png", "assets/site-logo.png"],
  ["/assets/project-ecommerce.png", "assets/project-ecommerce.png"],
  ["/assets/project-student-management.png", "assets/project-student-management.png"],
  ["/assets/project-payment-card.png", "assets/project-payment-card.png"]
]);

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"]
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function securityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' https://cdn.jsdelivr.net",
      "style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https://images.unsplash.com",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join("; ")
  );
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, message) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(message);
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isSameOriginRequest(request) {
  const origin = request.headers.origin;
  if (!origin) return false;

  try {
    const expectedOrigin = APP_ORIGIN ||
      `${request.socket.encrypted ? "https" : "http"}://${request.headers.host}`;
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

function checkRateLimit(request, response) {
  const key = request.socket.remoteAddress || "unknown";
  const now = Date.now();
  let entry = rateLimits.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  entry.count += 1;
  rateLimits.set(key, entry);

  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    sendJson(
      response,
      429,
      { message: "Too many attempts. Please wait a little and try again." },
      { "Retry-After": String(retryAfter) }
    );
    return false;
  }

  return true;
}

function readJson(request) {
  const contentType = request.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return Promise.reject(new HttpError(415, "Send the form as JSON."));
  }

  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    request.resume();
    return Promise.reject(new HttpError(413, "The submitted form is too large."));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    request.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      if (tooLarge) {
        reject(new HttpError(413, "The submitted form is too large."));
        return;
      }

      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new HttpError(400, "The submitted form is not valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

async function initializeDatabase() {
  if (!MYSQL_CONFIG.user) {
    throw new Error("MYSQL_USER is not set. Copy .env.example to .env and enter your MySQL connection details.");
  }
  if (!Number.isInteger(MYSQL_CONFIG.port) || MYSQL_CONFIG.port < 1 || MYSQL_CONFIG.port > 65535) {
    throw new Error("MYSQL_PORT must be a valid port number.");
  }

  dbPool = mysql.createPool(MYSQL_CONFIG);
  try {
    await dbPool.query("SELECT 1");
    await dbPool.query("SELECT id, name, email, password, created_at FROM users LIMIT 0");
  } catch (error) {
    await dbPool.end().catch(() => undefined);
    dbPool = undefined;
    const code = error.code ? ` (${error.code})` : "";
    throw new Error(`Could not prepare the MySQL database "${MYSQL_CONFIG.database}"${code}. Check .env, make sure MariaDB is running, and confirm the users table has id, name, email, and password columns.`);
  }
}

function cookieFlags() {
  return COOKIE_SECURE ? "; Secure" : "";
}

function setSessionCookie(response, token) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${cookieFlags()}`
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${cookieFlags()}`
  );
}

function sessionToken(request) {
  const cookieHeader = request.headers.cookie || "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));

  return cookie ? cookie.slice(COOKIE_NAME.length + 1) : "";
}

function getSession(request) {
  const token = sessionToken(request);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session;
}

async function createAccount(request, response) {
  if (!checkRateLimit(request, response)) return;
  if (!isSameOriginRequest(request)) {
    sendJson(response, 403, { message: "This request could not be verified." });
    return;
  }

  const submitted = await readJson(request);
  const body = submitted && typeof submitted === "object" ? submitted : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || name.length > 80) {
    sendJson(response, 400, { message: "Enter a name under 80 characters." });
    return;
  }
  if (!isValidEmail(email)) {
    sendJson(response, 400, { message: "Enter a valid email address." });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    sendJson(response, 400, { message: "Use a password between 8 and 128 characters." });
    return;
  }

  const salt = randomBytes(16);
  const passwordHash = await scryptAsync(password, salt, 64, SCRYPT_OPTIONS);
  const passwordRecord = "scrypt$" + salt.toString("hex") + "$" + passwordHash.toString("hex");
  try {
    await dbPool.execute(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, passwordRecord]
    );
  } catch (error) {
    if (error.code !== "ER_DUP_ENTRY") throw error;
    sendJson(response, 409, {
      message: "An account already uses that email. Log in instead."
    });
    return;
  }

  sendJson(response, 201, {
    ok: true,
    message: "Account created. Log in to continue."
  });
}

async function logIn(request, response) {
  if (!checkRateLimit(request, response)) return;
  if (!isSameOriginRequest(request)) {
    sendJson(response, 403, { message: "This request could not be verified." });
    return;
  }

  const submitted = await readJson(request);
  const body = submitted && typeof submitted === "object" ? submitted : {};
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidEmail(email) || password.length > 128) {
    sendJson(response, 401, { message: "Email or password is incorrect." });
    return;
  }

  const [accounts] = await dbPool.execute(
    "SELECT id, name, email, password FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  const account = accounts[0];
  const passwordParts = typeof account?.password === "string"
    ? account.password.split("$")
    : [];
  const hasPasswordRecord = passwordParts.length === 3 &&
    passwordParts[0] === "scrypt" &&
    /^[a-f0-9]{32}$/i.test(passwordParts[1]) &&
    /^[a-f0-9]{128}$/i.test(passwordParts[2]);
  const salt = hasPasswordRecord
    ? Buffer.from(passwordParts[1], "hex")
    : DUMMY_SALT;
  const expectedHash = hasPasswordRecord
    ? Buffer.from(passwordParts[2], "hex")
    : DUMMY_HASH;
  const suppliedHash = await scryptAsync(password, salt, 64, SCRYPT_OPTIONS);
  const hashMatches = expectedHash.length === suppliedHash.length &&
    timingSafeEqual(expectedHash, suppliedHash);

  if (!account || !hasPasswordRecord || !hashMatches) {
    sendJson(response, 401, { message: "Email or password is incorrect." });
    return;
  }

  const token = randomBytes(32).toString("base64url");
  sessions.set(token, {
    userId: account.id,
    name: account.name,
    email: account.email,
    expiresAt: Date.now() + SESSION_LIFETIME_MS
  });

  setSessionCookie(response, token);
  sendJson(response, 200, {
    authenticated: true,
    user: { name: account.name, email: account.email }
  });
}

async function serveStaticFile(response, pathname, method) {
  const relativePath = PUBLIC_FILES.get(pathname);
  if (!relativePath) {
    sendText(response, 404, "Not found");
    return;
  }

  const filePath = path.join(ROOT, relativePath);
  try {
    const contents = await fs.readFile(filePath);
    const contentType = CONTENT_TYPES.get(path.extname(filePath)) ||
      "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache"
    });
    response.end(method === "HEAD" ? undefined : contents);
  } catch {
    sendText(response, 404, "Not found");
  }
}

async function handleRequest(request, response) {
  securityHeaders(response);

  let pathname;
  try {
    pathname = new URL(request.url, "http://localhost").pathname;
  } catch {
    sendText(response, 400, "Bad request");
    return;
  }

  if (pathname === "/api/signup" && request.method === "POST") {
    await createAccount(request, response);
    return;
  }

  if (pathname === "/api/login" && request.method === "POST") {
    await logIn(request, response);
    return;
  }

  if (pathname === "/api/logout" && request.method === "POST") {
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { message: "This request could not be verified." });
      return;
    }

    sessions.delete(sessionToken(request));
    clearSessionCookie(response);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/session" && request.method === "GET") {
    const session = getSession(request);
    sendJson(response, 200, session
      ? { authenticated: true, user: { name: session.name, email: session.email } }
      : { authenticated: false });
    return;
  }

  if (pathname === "/api/private-projects" && request.method === "GET") {
    if (!getSession(request)) {
      sendJson(response, 401, { message: "Log in to view these projects." });
      return;
    }

    const projects = await fs.readFile(PROJECTS_FILE, "utf8");
    sendJson(response, 200, JSON.parse(projects));
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(response, 404, { message: "API route not found." });
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed");
    return;
  }

  await serveStaticFile(response, pathname, request.method);
}

async function startServer() {
  await initializeDatabase();

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }

      if (error instanceof HttpError) {
        sendJson(response, error.status, { message: error.message });
        return;
      }

      console.error("Portfolio request failed:", error.message);
      sendJson(response, 500, { message: "Something went wrong. Please try again." });
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`Portfolio running at http://127.0.0.1:${PORT}`);
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
  for (const [ip, entry] of rateLimits) {
    if (entry.resetAt <= now) rateLimits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

startServer().catch((error) => {
  console.error("Could not start the portfolio server:", error.message);
  process.exitCode = 1;
});
