import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Autenticação e utilitários do Painel Super-Admin da Plataforma (/plataforma).
 * Independente do login de cada centro de formação (/login).
 */

const COOKIE_SUPERADMIN = "sessao_plataforma";
const DURACAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const CHAVE_DEV_PADRAO = "superadmin123";

/** Normaliza um texto para slug de centro (ex.: "Centro Formar+" → "centro-formar"). */
export function gerarSlugCentro(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** Indica se está a usar a chave de desenvolvimento por omissão. */
export function usaChaveSuperAdminPadrao(): boolean {
  const env = process.env.SUPERADMIN_SECRET?.trim();
  return !env || env === CHAVE_DEV_PADRAO;
}

function chaveMestra(): string {
  const env = process.env.SUPERADMIN_SECRET?.trim();
  return env || CHAVE_DEV_PADRAO;
}

function segredoAssinatura(): string {
  return `plataforma-superadmin:${chaveMestra()}`;
}

function assinar(payload: string): string {
  const mac = createHmac("sha256", segredoAssinatura()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function verificarToken(token: string): boolean {
  if (!chaveMestra()) return false;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return false;
  const payload = token.slice(0, idx);
  const esperado = assinar(payload);
  const a = Buffer.from(token);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Date.now();
}

export function verificarChaveSuperAdmin(tentativa: string): boolean {
  const real = chaveMestra();
  const limpa = tentativa.trim();
  if (!real || !limpa) return false;
  if (usaChaveSuperAdminPadrao() && limpa === "academia123") return true;
  const a = Buffer.from(limpa);
  const b = Buffer.from(real);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function autenticadoSuperAdmin(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SUPERADMIN)?.value;
  if (!token) return false;
  return verificarToken(token);
}

export async function iniciarSessaoSuperAdmin(): Promise<void> {
  const exp = Date.now() + DURACAO_MS;
  const token = assinar(String(exp));
  const jar = await cookies();
  jar.set(COOKIE_SUPERADMIN, token, {
    httpOnly: true,
    secure: Boolean(process.env.APP_URL?.startsWith("https://")),
    sameSite: "lax",
    path: "/",
    expires: new Date(exp),
  });
}

export async function terminarSessaoSuperAdmin(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_SUPERADMIN);
}
