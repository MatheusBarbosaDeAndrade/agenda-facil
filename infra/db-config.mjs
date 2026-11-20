// Configuração de conexão compartilhada entre a aplicação (Next.js) e os
// scripts de linha de comando (migrações, seed, manutenção).

export function getSslConfig() {
  // Em produção a conexão com o banco deve ser criptografada, a não ser que o
  // banco esteja na mesma rede privada (ex.: docker compose) — nesse caso
  // defina POSTGRES_SSL=disable explicitamente.
  const mode = process.env.POSTGRES_SSL;
  if (mode === "disable") return false;
  if (mode === "require") return { rejectUnauthorized: true };
  if (mode === "no-verify") return { rejectUnauthorized: false };
  const production =
    process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  return production ? { rejectUnauthorized: true } : false;
}

/**
 * { unpooled: true } prefere a conexão direta (DATABASE_URL_UNPOOLED, criada
 * pela integração Neon da Vercel) — necessária para as migrações, que usam
 * locks de sessão incompatíveis com o pooler (PgBouncer em modo transação).
 */
export function getConnectionConfig({ unpooled = false } = {}) {
  const url =
    (unpooled && process.env.DATABASE_URL_UNPOOLED) || process.env.DATABASE_URL;
  if (url) {
    const { connectionString, sslRequested } = stripSslParams(url);
    let ssl = getSslConfig();
    // URL com sslmode (ex.: Neon) usada fora de produção: mantém o SSL ligado.
    if (!ssl && sslRequested && process.env.POSTGRES_SSL !== "disable") {
      ssl = { rejectUnauthorized: true };
    }
    return { connectionString, ssl };
  }
  return {
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    ssl: getSslConfig(),
  };
}

/**
 * Remove sslmode/channel_binding da URL (o Neon os inclui) para que o SSL seja
 * controlado só por getSslConfig(), sempre com verificação do certificado.
 * Sem isso o pg emite um aviso e, na v9, "sslmode=require" deixaria de
 * verificar o certificado.
 */
function stripSslParams(url) {
  try {
    const parsed = new URL(url);
    const mode = parsed.searchParams.get("sslmode");
    for (const key of ["sslmode", "channel_binding", "uselibpqcompat"]) {
      parsed.searchParams.delete(key);
    }
    return {
      connectionString: parsed.toString(),
      sslRequested: Boolean(mode) && mode !== "disable",
    };
  } catch {
    return { connectionString: url, sslRequested: false };
  }
}
