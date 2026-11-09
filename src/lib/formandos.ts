import type { EstadoMatricula, FormaPagamento, MetodoPagamento } from "@prisma/client";
import { calcularInteresse } from "./interesse";
import { comPago, resumirParcelas, type EstadoParcela } from "./parcelas";

/**
 * Métricas derivadas de um formando (n.º de formações, dívida, interesse),
 * calculadas a partir das matrículas lidas da BD. Funções puras.
 */

export type MatriculaParaMetricas = {
  estado: EstadoMatricula;
  createdAt: Date;
  parcelas: { valor: bigint; vencimento: Date; alocacoes: { valor: bigint }[] }[];
};

const DIA_MS = 24 * 60 * 60 * 1000;

export function metricasFormando(
  f: { intencaoCompra: boolean; avaliacaoEquipa: number | null; matriculas: MatriculaParaMetricas[] },
  hoje: Date,
) {
  const validas = f.matriculas.filter((m) => m.estado !== "CANCELADA");
  const resumo = resumirParcelas(
    validas.flatMap((m) => m.parcelas.map(comPago)),
    hoje,
  );
  const ultima = validas.reduce<number | null>((max, m) => Math.max(max ?? 0, m.createdAt.getTime()), null);
  const diasDesdeUltimaCompra = ultima === null ? null : Math.max(0, Math.floor((hoje.getTime() - ultima) / DIA_MS));
  const interesse = calcularInteresse({
    formacoesCompradas: validas.length,
    diasDesdeUltimaCompra,
    parcelasEmAtraso: resumo.parcelasEmAtraso,
    avaliacaoEquipa: f.avaliacaoEquipa,
    intencaoCompra: f.intencaoCompra,
  });
  return { formacoesCompradas: validas.length, diasDesdeUltimaCompra, resumo, interesse };
}

export const NOMES_METODO: Record<MetodoPagamento, string> = {
  MULTICAIXA: "Multicaixa Express",
  REFERENCIA: "Pagamento por referência",
  TRANSFERENCIA: "Transferência bancária",
  NUMERARIO: "Numerário",
  TPA: "TPA",
  OUTRO: "Outro",
};

export const NOMES_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  PRONTO: "A pronto",
  PARCELADO: "Parcelado",
};

export const NOMES_ESTADO_MATRICULA: Record<EstadoMatricula, string> = {
  ATIVA: "Ativa",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const NOMES_ESTADO_PARCELA: Record<EstadoParcela, string> = {
  PAGA: "Paga",
  PARCIAL: "Parcial",
  EM_ATRASO: "Em atraso",
  PENDENTE: "Pendente",
};

export const CORES_ESTADO_PARCELA = {
  PAGA: "verde",
  PARCIAL: "amarelo",
  EM_ATRASO: "vermelho",
  PENDENTE: "cinza",
} as const satisfies Record<EstadoParcela, string>;

/** Link wa.me para um número em formato internacional. */
export function linkWhatsapp(whatsapp: string) {
  return `https://wa.me/${whatsapp.replace(/\D/g, "")}`;
}
