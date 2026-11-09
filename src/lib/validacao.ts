import { Prisma } from "@prisma/client";
import type { ZodError } from "zod";

/** Converte erros zod em { campo: mensagem } (primeira mensagem por campo). */
export function errosZod(e: ZodError): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const issue of e.issues) {
    const chave = String(issue.path[0] ?? "_");
    if (!erros[chave]) erros[chave] = issue.message;
  }
  return erros;
}

/** Violação de restrição de unicidade (P2002). */
export function eUnicidade(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
