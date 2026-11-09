import type { EstadoCampanha, TipoCampanha } from "@prisma/client";
import type { exigir } from "@/lib/auth";
import { metricasFormando, type MatriculaParaMetricas } from "@/lib/formandos";
import type { NivelInteresse } from "@/lib/interesse";

export const NOMES_TIPO_CAMPANHA: Record<TipoCampanha, string> = {
  SAZONAL: "Sazonal",
  FIDELIZACAO: "Fidelização",
  SEGMENTADA: "Segmentada",
};

export const CORES_TIPO_CAMPANHA: Record<TipoCampanha, "amarelo" | "verde" | "azul"> = {
  SAZONAL: "amarelo",
  FIDELIZACAO: "verde",
  SEGMENTADA: "azul",
};

export const NOMES_ESTADO_CAMPANHA: Record<EstadoCampanha, string> = {
  RASCUNHO: "Rascunho",
  ATIVA: "Ativa",
  ENVIADA: "Enviada",
  ENCERRADA: "Encerrada",
};

export const CORES_ESTADO_CAMPANHA: Record<EstadoCampanha, "cinza" | "azul" | "verde" | "amarelo"> = {
  RASCUNHO: "cinza",
  ATIVA: "azul",
  ENVIADA: "verde",
  ENCERRADA: "cinza",
};

export const VARIAVEIS_CAMPANHA = [
  "primeiroNome",
  "nome",
  "campanha",
  "desconto",
  "formacao",
  "mes",
  "centro",
] as const;

export const TEXTO_CAMPANHA_PADRAO =
  "Olá {{primeiroNome}}! 👋\n\nEste mês de *{{mes}}*, temos a campanha *{{campanha}}* com *{{desconto}}* de desconto na formação *{{formacao}}*.\n\nAs vagas são limitadas! Responda a esta mensagem para garantir a sua inscrição.\n\n{{centro}}";

export type FiltrosSegmento = {
  filtroNivelInteresse?: string | null;
  filtroMinFormacoes?: number | null;
  filtroMaxFormacoes?: number | null;
  filtroProfissao?: string | null;
  filtroIntencaoCompra?: boolean | null;
};

export type FormandoParaSegmento = {
  id: string;
  nome: string;
  whatsapp: string;
  profissao: string | null;
  intencaoCompra: boolean;
  avaliacaoEquipa: number | null;
  matriculas: MatriculaParaMetricas[];
};

export type FormandoSegmentado = FormandoParaSegmento & {
  formacoesCompradas: number;
  nivelInteresse: NivelInteresse;
  pontuacaoInteresse: number;
};

/**
 * Filtra os formandos do centro de acordo com os critérios de segmentação da campanha.
 */
export function filtrarFormandosSegmento(
  formandos: readonly FormandoParaSegmento[],
  filtros: FiltrosSegmento,
  hoje: Date,
): FormandoSegmentado[] {
  const profFiltro = filtros.filtroProfissao?.trim().toLowerCase() ?? "";

  const resultado: FormandoSegmentado[] = [];
  for (const f of formandos) {
    const m = metricasFormando(f, hoje);

    if (filtros.filtroNivelInteresse === "MUITO" || filtros.filtroNivelInteresse === "POUCO") {
      if (m.interesse.nivel !== filtros.filtroNivelInteresse) continue;
    }

    if (filtros.filtroMinFormacoes !== null && filtros.filtroMinFormacoes !== undefined) {
      if (m.formacoesCompradas < filtros.filtroMinFormacoes) continue;
    }

    if (filtros.filtroMaxFormacoes !== null && filtros.filtroMaxFormacoes !== undefined) {
      if (m.formacoesCompradas > filtros.filtroMaxFormacoes) continue;
    }

    if (profFiltro) {
      const profFormando = (f.profissao ?? "").toLowerCase();
      if (!profFormando.includes(profFiltro)) continue;
    }

    if (typeof filtros.filtroIntencaoCompra === "boolean") {
      if (f.intencaoCompra !== filtros.filtroIntencaoCompra) continue;
    }

    resultado.push({
      ...f,
      formacoesCompradas: m.formacoesCompradas,
      nivelInteresse: m.interesse.nivel,
      pontuacaoInteresse: m.interesse.pontuacao,
    });
  }

  return resultado;
}

/**
 * Calcula a sobra operacional do mês atual: sum(pagamentos do mês) - sum(despesas do mês).
 */
export async function obterSobraOperacionalMesAtual(db: Awaited<ReturnType<typeof exigir>>["db"]) {
  const agora = new Date();
  const anoAtual = agora.getUTCFullYear();
  const mesAtual = agora.getUTCMonth() + 1;
  const inicioMes = new Date(Date.UTC(anoAtual, mesAtual - 1, 1));
  const fimMes = new Date(Date.UTC(anoAtual, mesAtual, 0));

  const [pagamentosAgg, despesasAgg] = await Promise.all([
    db.pagamento.aggregate({
      where: { dataPagamento: { gte: inicioMes, lte: fimMes } },
      _sum: { valor: true },
    }),
    db.despesa.aggregate({
      where: { data: { gte: inicioMes, lte: fimMes } },
      _sum: { valor: true },
    }),
  ]);

  const entradasMes = pagamentosAgg._sum.valor ?? 0n;
  const saidasMes = despesasAgg._sum.valor ?? 0n;
  const sobraOperacional = entradasMes - saidasMes;

  return {
    entradasMes,
    saidasMes,
    sobraOperacional,
    mesAtual,
    anoAtual,
  };
}
