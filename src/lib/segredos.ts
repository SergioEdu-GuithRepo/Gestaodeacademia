import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifra de segredos guardados na BD (ex.: chave da Evolution API) com
 * AES-256-GCM. A chave deriva de APP_SECRET (obrigatório em produção).
 * Formato: "v1:<iv>:<tag>:<dados>" em base64url.
 */

function chave(): Buffer {
  const segredo = process.env.APP_SECRET?.trim() || "dev-apenas-nao-usar-em-producao";
  return createHash("sha256").update(segredo).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), dados.toString("base64url")].join(":");
}

export function decifrar(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const [v, iv, tag, dados] = valor.split(":");
  if (v !== "v1" || !iv || !tag || !dados) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Mostra apenas os últimos 4 caracteres (para a interface). */
export function mascarar(valor: string | null): string {
  if (!valor) return "";
  return valor.length <= 4 ? "••••" : `••••••••${valor.slice(-4)}`;
}
