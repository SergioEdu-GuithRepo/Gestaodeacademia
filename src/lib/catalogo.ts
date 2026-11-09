import type { CategoriaFormacao } from "@prisma/client";

/** Catálogo de formações: rótulos e utilitários puros. */

export const NOMES_CATEGORIA: Record<CategoriaFormacao, string> = {
  COMPORTAMENTAL: "Comportamental",
  TECNICA: "Técnica",
};

/** "Gestão de Projetos (Nível I)" → "gestao-de-projetos-nivel-i" */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
