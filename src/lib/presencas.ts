import type { EstadoPresenca, EstadoSessao } from "@prisma/client";

export const NOMES_ESTADO_PRESENCA: Record<EstadoPresenca, string> = {
  PRESENTE: "Presente",
  FALTA: "Falta",
  JUSTIFICADA: "Falta justificada",
};

export const CORES_ESTADO_PRESENCA: Record<EstadoPresenca, "verde" | "vermelho" | "amarelo"> = {
  PRESENTE: "verde",
  FALTA: "vermelho",
  JUSTIFICADA: "amarelo",
};

export type SessaoComPresenca = {
  id: string;
  inicio: Date | string;
  estado: EstadoSessao;
  /** Lista de presenças lançadas nesta sessão (se vazia numa sessão antiga, considera sem chamada nominal). */
  temChamadaLancada?: boolean;
  estadoAluno?: EstadoPresenca | null;
};

export type ResumoAssiduidade = {
  sessoesRealizadas: number;
  sessoesComChamada: number;
  presencas: number;
  justificadas: number;
  faltas: number;
  /** Percentagem de assiduidade (0–100). PRESENTE e JUSTIFICADA contam positivamente. */
  assiduidadePct: number;
  /** Número de faltas não justificadas consecutivas nas últimas aulas com chamada. */
  faltasSeguidas: number;
  /** Verdadeiro se faltou a >= 2 aulas consecutivas. */
  alertaFaltasSeguidas: boolean;
};

/**
 * Calcula a assiduidade de um formando numa matrícula.
 *
 * Regras:
 * - Apenas sessões `REALIZADA` entram no cálculo.
 * - Se uma sessão realizada teve chamada nominal lançada (`temChamadaLancada = true`)
 *   e o aluno não tem registo explícito, considera-se `PRESENTE` por omissão apenas se
 *   não houver registos de ninguém; quando há chamada na sessão, usa `estadoAluno ?? "PRESENTE"`.
 * - Se nenhuma sessão realizada tiver chamada nominal lançada (turmas legadas), devolve 100%
 *   com `sessoesComChamada = 0` para não bloquear turmas concluídas antes da funcionalidade.
 */
export function calcularAssiduidade(sessoes: SessaoComPresenca[]): ResumoAssiduidade {
  const ordenadas = [...sessoes]
    .filter((s) => s.estado === "REALIZADA")
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

  const comChamada = ordenadas.filter((s) => s.temChamadaLancada || s.estadoAluno != null);
  if (comChamada.length === 0) {
    return {
      sessoesRealizadas: ordenadas.length,
      sessoesComChamada: 0,
      presencas: ordenadas.length,
      justificadas: 0,
      faltas: 0,
      assiduidadePct: 100,
      faltasSeguidas: 0,
      alertaFaltasSeguidas: false,
    };
  }

  let presencas = 0;
  let justificadas = 0;
  let faltas = 0;

  for (const s of comChamada) {
    const est = s.estadoAluno ?? "PRESENTE";
    if (est === "PRESENTE") presencas++;
    else if (est === "JUSTIFICADA") justificadas++;
    else faltas++;
  }

  // Conta faltas consecutivas a partir da aula mais recente
  let faltasSeguidas = 0;
  for (let i = comChamada.length - 1; i >= 0; i--) {
    const est = comChamada[i].estadoAluno ?? "PRESENTE";
    if (est === "FALTA") faltasSeguidas++;
    else break;
  }

  const positivas = presencas + justificadas;
  const assiduidadePct = Math.round((positivas / comChamada.length) * 100);

  return {
    sessoesRealizadas: ordenadas.length,
    sessoesComChamada: comChamada.length,
    presencas,
    justificadas,
    faltas,
    assiduidadePct,
    faltasSeguidas,
    alertaFaltasSeguidas: faltasSeguidas >= 2,
  };
}
