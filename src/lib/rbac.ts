import type { Perfil } from "@prisma/client";

/**
 * Controlo de acesso por perfis (RBAC).
 * A matriz é a única fonte de verdade: usada no menu, nas páginas e em cada
 * Server Action.
 */
const MATRIZ = {
  "painel:ver": ["ADMIN", "COMERCIAL", "PEDAGOGICO", "FINANCEIRO"],

  "formadores:ver": ["ADMIN", "PEDAGOGICO", "FINANCEIRO"],
  "formadores:editar": ["ADMIN", "PEDAGOGICO"],
  "formadores:avaliar": ["ADMIN", "PEDAGOGICO"],
  "formadores:precos": ["ADMIN", "PEDAGOGICO", "FINANCEIRO"],

  "salas:ver": ["ADMIN", "PEDAGOGICO"],

  "formacoes:ver": ["ADMIN", "PEDAGOGICO", "COMERCIAL"],
  "formacoes:editar": ["ADMIN", "PEDAGOGICO"],

  "agenda:ver": ["ADMIN", "PEDAGOGICO", "COMERCIAL"],
  "agenda:editar": ["ADMIN", "PEDAGOGICO"],

  "formandos:ver": ["ADMIN", "COMERCIAL", "FINANCEIRO"],
  "formandos:editar": ["ADMIN", "COMERCIAL"],

  "matriculas:editar": ["ADMIN", "COMERCIAL"],
  "pagamentos:ver": ["ADMIN", "COMERCIAL", "FINANCEIRO"],
  "pagamentos:registar": ["ADMIN", "FINANCEIRO", "COMERCIAL"],

  "financeiro:ver": ["ADMIN", "FINANCEIRO"],
  "financeiro:editar": ["ADMIN", "FINANCEIRO"],
  "configuracoes:editar": ["ADMIN"],
  "utilizadores:gerir": ["ADMIN"],

  "leads:ver": ["ADMIN", "COMERCIAL"],
  "leads:editar": ["ADMIN", "COMERCIAL"],

  "campanhas:ver": ["ADMIN", "COMERCIAL"],
  "campanhas:editar": ["ADMIN", "COMERCIAL"],

  "mensagens:ver": ["ADMIN", "COMERCIAL", "FINANCEIRO"],
  "mensagens:gerir": ["ADMIN", "COMERCIAL", "FINANCEIRO"],

  "certificados:gerir": ["ADMIN", "PEDAGOGICO"],
  "inteligencia:ver": ["ADMIN", "COMERCIAL", "PEDAGOGICO", "FINANCEIRO"],
  "inteligencia:gerar": ["ADMIN"],
} as const satisfies Record<string, readonly Perfil[]>;

export type Permissao = keyof typeof MATRIZ;

export function pode(perfil: Perfil, permissao: Permissao): boolean {
  return (MATRIZ[permissao] as readonly Perfil[]).includes(perfil);
}

export const NOMES_PERFIL: Record<Perfil, string> = {
  ADMIN: "Administrador",
  COMERCIAL: "Comercial",
  PEDAGOGICO: "Coordenação pedagógica",
  FINANCEIRO: "Financeiro",
};
