import { Badge } from "@/components/ui";

export const ESTADOS_TURMA = {
  PLANEADA: { label: "Planeada", cor: "azul" },
  EM_CURSO: { label: "Em curso", cor: "verde" },
  CONCLUIDA: { label: "Concluída", cor: "cinza" },
  CANCELADA: { label: "Cancelada", cor: "vermelho" },
} as const;

export const ESTADOS_SESSAO = {
  AGENDADA: { label: "Agendada", cor: "azul" },
  REALIZADA: { label: "Realizada", cor: "verde" },
  CANCELADA: { label: "Cancelada", cor: "vermelho" },
} as const;

export function BadgeTurma({ estado }: { estado: keyof typeof ESTADOS_TURMA }) {
  const e = ESTADOS_TURMA[estado];
  return <Badge cor={e.cor}>{e.label}</Badge>;
}

export function BadgeSessao({ estado }: { estado: keyof typeof ESTADOS_SESSAO }) {
  const e = ESTADOS_SESSAO[estado];
  return <Badge cor={e.cor}>{e.label}</Badge>;
}
