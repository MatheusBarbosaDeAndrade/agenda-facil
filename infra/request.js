export const isVercel = () => process.env.VERCEL === "1";

/**
 * Obtém o IP do cliente. Só confia em X-Forwarded-For quando a aplicação está
 * atrás de um proxy reverso confiável (TRUST_PROXY=true ou Vercel, cuja borda
 * sobrescreve esse cabeçalho), evitando falsificação.
 */
export function getClientIp(req) {
  if (process.env.TRUST_PROXY === "true" || isVercel()) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0].trim().slice(0, 45);
    }
    const realIp = req.headers["x-real-ip"];
    if (typeof realIp === "string") return realIp.slice(0, 45);
  }
  return (req.socket?.remoteAddress || "desconhecido").slice(0, 45);
}

/**
 * URL pública da aplicação. Na Vercel, se APP_URL não estiver definida (ex.:
 * deploys de preview), usa as URLs fornecidas automaticamente pela plataforma.
 */
export function getAppUrl() {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, "");
  if (isVercel()) {
    const host =
      process.env.VERCEL_ENV === "production"
        ? process.env.VERCEL_PROJECT_PRODUCTION_URL
        : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (host) return `https://${host}`;
  }
  return "http://localhost:3000";
}

/** Origens aceitas em requisições que alteram estado (proteção CSRF). */
export function getAllowedOrigins() {
  const origins = new Set([getAppUrl()]);
  if (isVercel()) {
    for (const key of [
      "VERCEL_URL",
      "VERCEL_BRANCH_URL",
      "VERCEL_PROJECT_PRODUCTION_URL",
    ]) {
      if (process.env[key]) origins.add(`https://${process.env[key]}`);
    }
  }
  return origins;
}

/**
 * Origem do próprio host que recebeu a requisição (checagem padrão de mesma
 * origem). Um site de terceiros envia o Origin dele, que não coincide com o
 * Host do nosso servidor, então a proteção CSRF continua valendo — e o site
 * funciona em qualquer domínio que aponte para ele (www, *.vercel.app etc.).
 */
export function getRequestOrigins(req) {
  const origins = [];
  const behindProxy = process.env.TRUST_PROXY === "true" || isVercel();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = (behindProxy && forwardedHost) || req.headers.host;
  if (!host) return origins;
  origins.push(`https://${host}`);
  if (process.env.NODE_ENV !== "production") origins.push(`http://${host}`);
  return origins;
}

export function isSecureContext() {
  return getAppUrl().startsWith("https://");
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

export function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${options.path || "/"}`);
  if (options.maxAge !== undefined)
    segments.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.httpOnly !== false) segments.push("HttpOnly");
  segments.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.secure ?? isSecureContext()) segments.push("Secure");
  return segments.join("; ");
}

export function appendSetCookie(res, cookie) {
  const current = res.getHeader("Set-Cookie");
  if (!current) res.setHeader("Set-Cookie", [cookie]);
  else
    res.setHeader("Set-Cookie", [
      ...(Array.isArray(current) ? current : [current]),
      cookie,
    ]);
}
