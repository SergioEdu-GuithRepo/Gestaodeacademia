import "server-only";

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { dbTenant, prisma } from "./db";
import { pode, type Permissao } from "./rbac";

/**
 * Autenticação por email/palavra-passe com sessões guardadas na BD.
 * O cookie contém um token aleatório; na BD guarda-se apenas o seu hash.
 */

const COOKIE = "sessao";
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const HASH_FICTICIO = bcrypt.hashSync("utilizador-inexistente", 10);

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function verificarCredenciais(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { tenant: true },
  });
  // Comparação feita mesmo sem utilizador, para não revelar emails existentes pelo tempo de resposta.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? HASH_FICTICIO);
  if (!user || !ok || !user.ativo) return null;
  return user;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function criarSessao(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DURACAO_MS);
  await prisma.userSession.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: Boolean(process.env.APP_URL?.startsWith("https://")),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function terminarSessao() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.userSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(COOKIE);
}

/** Utilizador autenticado (ou null). Memorizado por pedido. */
export const utilizadorAtual = cache(async () => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const sessao = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { tenant: true } } },
  });
  if (!sessao || sessao.expiresAt < new Date() || !sessao.user.ativo) return null;
  const { passwordHash: _omit, ...user } = sessao.user;
  void _omit;
  return user;
});

export type Utilizador = NonNullable<Awaited<ReturnType<typeof utilizadorAtual>>>;

/**
 * Garante sessão (e permissão, se indicada) e devolve o utilizador e um
 * cliente de BD isolado para o seu centro. Usar no topo de páginas e actions.
 */
export async function exigir(permissao?: Permissao) {
  const user = await utilizadorAtual();
  if (!user) redirect("/login");
  if (permissao && !pode(user.perfil, permissao)) redirect("/sem-permissao");
  const db = dbTenant({ tenantId: user.tenantId, userId: user.id });
  return { user, db };
}
