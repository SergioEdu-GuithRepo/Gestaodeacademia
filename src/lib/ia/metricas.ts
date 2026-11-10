import type { Prisma, TipoRelatorioIA } from "@prisma/client";
import { CRITERIOS, formatNota, mediasAvaliacoes } from "@/lib/avaliacoes";
import { dataSimples, formatData, hojeLocal } from "@/lib/datas";
import { comRls } from "@/lib/db";
import { custoSessao } from "@/lib/financeiro";
import { formatKz } from "@/lib/money";
import { comPago, estadoParcela, resumirParcelas } from "@/lib/parcelas";
import { horasSessao, precoHoraFormador } from "@/lib/precos-formador";
import { calcularAssiduidade } from "@/lib/presencas";

/**
 * Motor determinístico de indicadores (SQL / Base de Dados).
 *
 * REGRA ARQUITETURAL CRÍTICA:
 * A IA interpreta e explica, MAS NUNCA CALCULA. Todos os totais, percentagens,
 * margens, taxas de conversão, inadimplência, recompra, ocupação de salas e
 * variações face ao período anterior são calculados aqui dentro de uma
 * transação PostgreSQL com Row-Level Security (`comRls(tenantId, ...)`).
 */

const DIA_MS = 24 * 60 * 60 * 1000;

function pct(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

function pctBig(parte: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Number((parte * 1000n) / total) / 10;
}

function variacaoPct(atual: number, anterior: number): string {
  if (anterior === 0) return atual > 0 ? "+100,0% (base anterior zero)" : "0,0%";
  const diff = Math.round(((atual - anterior) / anterior) * 1000) / 10;
  const sinal = diff > 0 ? "+" : "";
  return `${sinal}${diff.toLocaleString("pt-AO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function variacaoBigPct(atual: bigint, anterior: bigint): string {
  if (anterior === 0n) return atual > 0n ? "+100,0% (base anterior zero)" : "0,0%";
  const diffDecimos = Number(((atual - anterior) * 1000n) / anterior);
  const diff = diffDecimos / 10;
  const sinal = diff > 0 ? "+" : "";
  return `${sinal}${diff.toLocaleString("pt-AO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function variacaoPp(atualPct: number, anteriorPct: number): string {
  const diff = Math.round((atualPct - anteriorPct) * 10) / 10;
  const sinal = diff > 0 ? "+" : "";
  return `${sinal}${diff.toLocaleString("pt-AO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
}

export type FormandoRiscoItem = {
  formandoId: string;
  nome: string;
  whatsapp: string;
  turmaCodigo: string;
  formacaoNome: string;
  assiduidadePct: number;
  faltasSeguidas: number;
  parcelasEmAtraso: number;
  dividaKz: string;
  motivosRisco: string[];
};

export type MetricasRelatorio = {
  tipo: TipoRelatorioIA;
  centroNome: string;
  geradoEm: string;
  periodo: {
    inicio: string;
    fim: string;
    anteriorInicio?: string;
    anteriorFim?: string;
  };
  kpisDestaque: { rotulo: string; valor: string; comparacao?: string }[];
  dadosDetalhados: Record<string, unknown>;
};

/** Calcula formandos em risco de desistência (faltas consecutivas, assiduidade baixa ou atraso financeiro). */
async function apurarFormandosEmRisco(tx: Prisma.TransactionClient, tenantId: string): Promise<FormandoRiscoItem[]> {
  const hoje = dataSimples(hojeLocal());
  const matriculas = await tx.matricula.findMany({
    where: { tenantId, estado: "ATIVA" },
    include: {
      formando: { select: { id: true, nome: true, whatsapp: true } },
      turma: {
        select: {
          codigo: true,
          formacao: { select: { nome: true } },
          sessoes: {
            where: { estado: "REALIZADA" },
            orderBy: { inicio: "asc" },
            select: {
              id: true,
              inicio: true,
              estado: true,
              presencas: { select: { matriculaId: true, estado: true } },
            },
          },
        },
      },
      parcelas: { include: { alocacoes: { select: { valor: true } } } },
    },
  });

  const lista: FormandoRiscoItem[] = [];
  for (const m of matriculas) {
    const sessoesAluno = m.turma.sessoes.map((s) => {
      const registo = s.presencas.find((p) => p.matriculaId === m.id);
      return {
        id: s.id,
        inicio: s.inicio,
        estado: s.estado,
        temChamadaLancada: s.presencas.length > 0,
        estadoAluno: registo?.estado ?? null,
      };
    });
    const assid = calcularAssiduidade(sessoesAluno);
    const resumoFin = resumirParcelas(m.parcelas.map(comPago), hoje);

    const motivos: string[] = [];
    if (assid.faltasSeguidas >= 2) {
      motivos.push(`${assid.faltasSeguidas} faltas consecutivas`);
    } else if (assid.sessoesComChamada >= 2 && assid.assiduidadePct < 75) {
      motivos.push(`Assiduidade baixa (${assid.assiduidadePct}%)`);
    }
    if (resumoFin.parcelasEmAtraso >= 2) {
      motivos.push(`${resumoFin.parcelasEmAtraso} parcelas vencidas`);
    } else if (resumoFin.parcelasEmAtraso >= 1 && (assid.faltas >= 1 || assid.assiduidadePct < 80)) {
      motivos.push("Parcela em atraso + falta registada");
    }

    if (motivos.length > 0) {
      lista.push({
        formandoId: m.formando.id,
        nome: m.formando.nome,
        whatsapp: m.formando.whatsapp,
        turmaCodigo: m.turma.codigo,
        formacaoNome: m.turma.formacao.nome,
        assiduidadePct: assid.assiduidadePct,
        faltasSeguidas: assid.faltasSeguidas,
        parcelasEmAtraso: resumoFin.parcelasEmAtraso,
        dividaKz: formatKz(resumoFin.divida),
        motivosRisco: motivos,
      });
    }
  }

  return lista.sort(
    (a, b) => b.faltasSeguidas - a.faltasSeguidas || b.parcelasEmAtraso - a.parcelasEmAtraso,
  );
}

/** Calcula taxa global de inadimplência do centro (valor vencido não pago / total contratado ativo+concluído). */
async function apurarInadimplenciaGlobal(tx: Prisma.TransactionClient, tenantId: string) {
  const hoje = dataSimples(hojeLocal());
  const parcelas = await tx.parcela.findMany({
    where: { tenantId, matricula: { estado: { not: "CANCELADA" } } },
    include: { alocacoes: { select: { valor: true } } },
  });

  let totalContratado = 0n;
  let totalVencidoEmAtraso = 0n;
  let qtdParcelasAtraso = 0;

  for (const raw of parcelas) {
    const p = comPago(raw);
    totalContratado += p.valor;
    const est = estadoParcela(p, hoje);
    if (est === "EM_ATRASO") {
      const falta = p.valor > p.pago ? p.valor - p.pago : 0n;
      totalVencidoEmAtraso += falta;
      qtdParcelasAtraso += 1;
    }
  }

  return {
    totalContratado,
    totalVencidoEmAtraso,
    qtdParcelasAtraso,
    taxaInadimplenciaPct: pctBig(totalVencidoEmAtraso, totalContratado),
  };
}

/** Calcula ocupação média de salas e de vagas de turmas num intervalo. */
async function apurarOcupacao(
  tx: Prisma.TransactionClient,
  tenantId: string,
  inicio: Date,
  fim: Date,
) {
  const [salas, sessoesPeriodo, turmasAtivas] = await Promise.all([
    tx.sala.findMany({ where: { tenantId, ativa: true }, select: { id: true, nome: true, capacidade: true } }),
    tx.sessao.findMany({
      where: {
        tenantId,
        estado: { not: "CANCELADA" },
        inicio: { gte: inicio, lte: fim },
      },
      select: { inicio: true, fim: true, salaId: true, horasLecionadas: true },
    }),
    tx.turma.findMany({
      where: { tenantId, estado: { in: ["PLANEADA", "EM_CURSO"] } },
      select: {
        codigo: true,
        vagas: true,
        _count: { select: { matriculas: { where: { estado: { not: "CANCELADA" } } } } },
      },
    }),
  ]);

  const dias = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / DIA_MS));
  // Capacidade útil de referência: 8 horas/dia por sala ativa
  const horasDisponiveis = salas.length * dias * 8;
  const horasOcupadas = sessoesPeriodo.reduce((acc, s) => acc + horasSessao(s), 0);
  const ocupacaoSalasPct = horasDisponiveis > 0 ? Math.min(100, pct(horasOcupadas, horasDisponiveis)) : 0;

  const comVagas = turmasAtivas.filter((t) => (t.vagas ?? 0) > 0);
  const totalVagas = comVagas.reduce((s, t) => s + (t.vagas ?? 0), 0);
  const totalInscritos = comVagas.reduce((s, t) => s + t._count.matriculas, 0);
  const ocupacaoTurmasPct = totalVagas > 0 ? Math.min(100, pct(totalInscritos, totalVagas)) : 0;

  return {
    salasAtivas: salas.length,
    horasOcupadas: Math.round(horasOcupadas * 10) / 10,
    horasDisponiveisReferencia: horasDisponiveis,
    ocupacaoSalasPct,
    ocupacaoTurmasPct,
    turmasEmAberto: turmasAtivas.length,
  };
}

/** 1. Relatório Semanal Comercial & CRM */
export async function calcularMetricasSemanalComercial(
  tenantId: string,
  referencia = new Date(),
): Promise<{ metricas: MetricasRelatorio; inicio: Date; fim: Date; antInicio: Date; antFim: Date }> {
  const fim = referencia;
  const inicio = new Date(fim.getTime() - 7 * DIA_MS);
  const antFim = inicio;
  const antInicio = new Date(inicio.getTime() - 7 * DIA_MS);
  const limite48h = new Date(fim.getTime() - 2 * DIA_MS);

  const metricas = await comRls(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nome: true } });

    const [
      leadsAtuais,
      leadsAnteriores,
      leadsSemContacto48h,
      followUpsVencidos,
      matriculasAtuais,
      matriculasAnteriores,
      inadimplencia,
      risco,
      ocupacao,
      formandosRecompra,
      totalFormandosComMatricula,
    ] = await Promise.all([
      tx.lead.findMany({
        where: { tenantId, createdAt: { gte: inicio, lte: fim } },
        select: { estado: true, utmSource: true, formacao: { select: { nome: true } } },
      }),
      tx.lead.findMany({
        where: { tenantId, createdAt: { gte: antInicio, lt: antFim } },
        select: { estado: true },
      }),
      tx.lead.count({
        where: { tenantId, estado: "NOVO", createdAt: { lte: limite48h } },
      }),
      tx.interacaoLead.count({
        where: {
          tenantId,
          proximoFollowUp: { lte: fim },
          lead: { estado: { in: ["NOVO", "CONTACTADO"] } },
        },
      }),
      tx.matricula.findMany({
        where: { tenantId, estado: { not: "CANCELADA" }, createdAt: { gte: inicio, lte: fim } },
        select: { valorTotal: true },
      }),
      tx.matricula.findMany({
        where: { tenantId, estado: { not: "CANCELADA" }, createdAt: { gte: antInicio, lt: antFim } },
        select: { valorTotal: true },
      }),
      apurarInadimplenciaGlobal(tx, tenantId),
      apurarFormandosEmRisco(tx, tenantId),
      apurarOcupacao(tx, tenantId, inicio, fim),
      tx.formando.count({
        where: {
          tenantId,
          matriculas: { some: { estado: { not: "CANCELADA" } } },
          AND: [{ matriculas: { some: {} } }],
        },
      }),
      tx.formando.findMany({
        where: { tenantId },
        select: { _count: { select: { matriculas: { where: { estado: { not: "CANCELADA" } } } } } },
      }),
    ]);

    void formandosRecompra;
    const comUmaOuMais = totalFormandosComMatricula.filter((f) => f._count.matriculas >= 1).length;
    const comDuasOuMais = totalFormandosComMatricula.filter((f) => f._count.matriculas >= 2).length;
    const taxaRecompraPct = pct(comDuasOuMais, comUmaOuMais);

    const nLeadsAtuais = leadsAtuais.length;
    const nConvertidosAtuais = leadsAtuais.filter((l) => l.estado === "CONVERTIDO").length;
    const convAtualPct = pct(nConvertidosAtuais, nLeadsAtuais);

    const nLeadsAnt = leadsAnteriores.length;
    const nConvAnt = leadsAnteriores.filter((l) => l.estado === "CONVERTIDO").length;
    const convAntPct = pct(nConvAnt, nLeadsAnt);

    const receitaContratadaAtual = matriculasAtuais.reduce((s, m) => s + m.valorTotal, 0n);
    const receitaContratadaAnt = matriculasAnteriores.reduce((s, m) => s + m.valorTotal, 0n);

    return {
      tipo: "SEMANAL_COMERCIAL" as const,
      centroNome: tenant.nome,
      geradoEm: new Date().toISOString(),
      periodo: {
        inicio: formatData(inicio),
        fim: formatData(fim),
        anteriorInicio: formatData(antInicio),
        anteriorFim: formatData(antFim),
      },
      kpisDestaque: [
        {
          rotulo: "Novos Leads (7 dias)",
          valor: String(nLeadsAtuais),
          comparacao: `${variacaoPct(nLeadsAtuais, nLeadsAnt)} vs. semana anterior (${nLeadsAnt})`,
        },
        {
          rotulo: "Taxa de Conversão",
          valor: `${convAtualPct}%`,
          comparacao: `${variacaoPp(convAtualPct, convAntPct)} vs. semana anterior (${convAntPct}%)`,
        },
        {
          rotulo: "Novas Matrículas",
          valor: `${matriculasAtuais.length} (${formatKz(receitaContratadaAtual)})`,
          comparacao: `${variacaoBigPct(receitaContratadaAtual, receitaContratadaAnt)} em receita contratada`,
        },
        {
          rotulo: "Parcelas em Atraso",
          valor: `${inadimplencia.qtdParcelasAtraso} (${formatKz(inadimplencia.totalVencidoEmAtraso)})`,
          comparacao: `Inadimplência global: ${inadimplencia.taxaInadimplenciaPct}%`,
        },
      ],
      dadosDetalhados: {
        comercial: {
          novosLeadsSemana: nLeadsAtuais,
          novosLeadsSemanaAnterior: nLeadsAnt,
          variacaoLeads: variacaoPct(nLeadsAtuais, nLeadsAnt),
          leadsConvertidosSemana: nConvertidosAtuais,
          taxaConversaoSemanaPct: convAtualPct,
          taxaConversaoSemanaAnteriorPct: convAntPct,
          variacaoConversao: variacaoPp(convAtualPct, convAntPct),
          leadsSemPrimeiroContactoMais48h: leadsSemContacto48h,
          followUpsCrmPendentes: followUpsVencidos,
          novasMatriculasSemana: matriculasAtuais.length,
          novasMatriculasSemanaAnterior: matriculasAnteriores.length,
          receitaContratadaSemanaKz: formatKz(receitaContratadaAtual),
          receitaContratadaSemanaAnteriorKz: formatKz(receitaContratadaAnt),
          variacaoReceitaContratada: variacaoBigPct(receitaContratadaAtual, receitaContratadaAnt),
          taxaRecompraGlobalPct: taxaRecompraPct,
        },
        cobranca: {
          parcelasEmAtrasoQtd: inadimplencia.qtdParcelasAtraso,
          valorTotalEmAtrasoKz: formatKz(inadimplencia.totalVencidoEmAtraso),
          taxaInadimplenciaPct: inadimplencia.taxaInadimplenciaPct,
        },
        retencaoERiscoDesistencia: {
          totalFormandosEmRisco: risco.length,
          listaFormandosEmRisco: risco.slice(0, 12),
        },
        ocupacao: ocupacao,
      },
    };
  });

  return { metricas, inicio, fim, antInicio, antFim };
}

/** 2. Relatório Mensal Financeiro */
export async function calcularMetricasMensalFinanceiro(
  tenantId: string,
  referencia = new Date(),
): Promise<{ metricas: MetricasRelatorio; inicio: Date; fim: Date; antInicio: Date; antFim: Date }> {
  const fim = referencia;
  const inicio = new Date(fim.getTime() - 30 * DIA_MS);
  const antFim = inicio;
  const antInicio = new Date(inicio.getTime() - 30 * DIA_MS);

  const metricas = await comRls(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nome: true } });

    const [
      pagamentosAtuais,
      pagamentosAnt,
      despesasAtuais,
      despesasAnt,
      formacoes,
      campanhas,
      sessoesRealizadasPeriodo,
      precosEspeciais,
      inadimplencia,
      ocupacao,
    ] = await Promise.all([
      tx.pagamento.findMany({
        where: { tenantId, dataPagamento: { gte: inicio, lte: fim } },
        include: { matricula: { select: { turma: { select: { formacaoId: true } } } } },
      }),
      tx.pagamento.findMany({
        where: { tenantId, dataPagamento: { gte: antInicio, lt: antFim } },
        select: { valor: true },
      }),
      tx.despesa.findMany({
        where: { tenantId, data: { gte: inicio, lte: fim } },
      }),
      tx.despesa.findMany({
        where: { tenantId, data: { gte: antInicio, lt: antFim } },
        select: { valor: true },
      }),
      tx.formacao.findMany({
        where: { tenantId },
        select: { id: true, nome: true, categoria: true },
      }),
      tx.campanha.findMany({
        where: { tenantId },
        include: {
          matriculas: {
            where: { estado: { not: "CANCELADA" }, createdAt: { gte: inicio, lte: fim } },
            select: { valorTotal: true, desconto: true },
          },
        },
      }),
      tx.sessao.findMany({
        where: { tenantId, estado: "REALIZADA", inicio: { gte: inicio, lte: fim } },
        include: {
          formador: { select: { id: true, nome: true, precoHoraComportamental: true, precoHoraTecnica: true } },
          turma: { select: { formacaoId: true, formacao: { select: { categoria: true } } } },
        },
      }),
      tx.precoFormadorFormacao.findMany({ where: { tenantId } }),
      apurarInadimplenciaGlobal(tx, tenantId),
      apurarOcupacao(tx, tenantId, inicio, fim),
    ]);

    const mapaOverride = new Map(precosEspeciais.map((p) => [`${p.formadorId}:${p.formacaoId}`, p.precoHora]));

    const receitaAtual = pagamentosAtuais.reduce((s, p) => s + p.valor, 0n);
    const receitaAnt = pagamentosAnt.reduce((s, p) => s + p.valor, 0n);
    const custoAtual = despesasAtuais.reduce((s, d) => s + d.valor, 0n);
    const custoAnt = despesasAnt.reduce((s, d) => s + d.valor, 0n);
    const resultadoAtual = receitaAtual - custoAtual;
    const resultadoAnt = receitaAnt - custoAnt;

    // Receita vs custos diretos por formação
    const porFormacao = formacoes.map((f) => {
      const rec = pagamentosAtuais
        .filter((p) => p.matricula.turma.formacaoId === f.id)
        .reduce((s, p) => s + p.valor, 0n);
      const despDiretas = despesasAtuais
        .filter((d) => d.formacaoId === f.id && d.categoria !== "FORMADOR")
        .reduce((s, d) => s + d.valor, 0n);
      const custoAulas = sessoesRealizadasPeriodo
        .filter((s) => s.turma.formacaoId === f.id)
        .reduce((acc, s) => {
          const ov = mapaOverride.get(`${s.formadorId}:${f.id}`) ?? null;
          const ph = precoHoraFormador(s.formador, s.turma.formacao.categoria, ov);
          return acc + custoSessao(s, ph);
        }, 0n);
      const custosTotais = despDiretas + custoAulas;
      const margem = rec - custosTotais;
      return {
        formacao: f.nome,
        receitaKz: formatKz(rec),
        custosDiretosKz: formatKz(custosTotais),
        margemKz: formatKz(margem),
        margemPct: pctBig(margem > 0n ? margem : 0n, rec),
        temMovimento: rec > 0n || custosTotais > 0n,
      };
    }).filter((x) => x.temMovimento);

    // Margem das campanhas
    const resumoCampanhas = campanhas
      .filter((c) => c.matriculas.length > 0 || c.estado === "ATIVA" || c.estado === "ENVIADA")
      .map((c) => {
        const recGerada = c.matriculas.reduce((s, m) => s + m.valorTotal, 0n);
        const descConcedido = c.matriculas.reduce((s, m) => s + m.desconto, 0n);
        return {
          campanha: c.nome,
          tipo: c.tipo,
          descontoPct: c.descontoPct,
          matriculasConvertidas: c.matriculas.length,
          receitaLiquidaGeradaKz: formatKz(recGerada),
          descontosConcedidosKz: formatKz(descConcedido),
        };
      });

    // Honorários de formadores no período
    const honorariosGeradosPeriodo = sessoesRealizadasPeriodo.reduce((acc, s) => {
      const ov = mapaOverride.get(`${s.formadorId}:${s.turma.formacaoId}`) ?? null;
      const ph = precoHoraFormador(s.formador, s.turma.formacao.categoria, ov);
      return acc + custoSessao(s, ph);
    }, 0n);
    const pagoFormadoresPeriodo = despesasAtuais
      .filter((d) => d.categoria === "FORMADOR")
      .reduce((s, d) => s + d.valor, 0n);

    return {
      tipo: "MENSAL_FINANCEIRO" as const,
      centroNome: tenant.nome,
      geradoEm: new Date().toISOString(),
      periodo: {
        inicio: formatData(inicio),
        fim: formatData(fim),
        anteriorInicio: formatData(antInicio),
        anteriorFim: formatData(antFim),
      },
      kpisDestaque: [
        {
          rotulo: "Receita Recebida (30d)",
          valor: formatKz(receitaAtual),
          comparacao: `${variacaoBigPct(receitaAtual, receitaAnt)} vs. período anterior (${formatKz(receitaAnt)})`,
        },
        {
          rotulo: "Despesas Operacionais (30d)",
          valor: formatKz(custoAtual),
          comparacao: `${variacaoBigPct(custoAtual, custoAnt)} vs. período anterior (${formatKz(custoAnt)})`,
        },
        {
          rotulo: "Resultado Líquido",
          valor: formatKz(resultadoAtual),
          comparacao: `Anterior: ${formatKz(resultadoAnt)}`,
        },
        {
          rotulo: "Pagamentos a Formadores",
          valor: formatKz(pagoFormadoresPeriodo),
          comparacao: `Honorários gerados nas aulas: ${formatKz(honorariosGeradosPeriodo)}`,
        },
      ],
      dadosDetalhados: {
        resumoCaixa: {
          receitaPeriodoKz: formatKz(receitaAtual),
          receitaAnteriorKz: formatKz(receitaAnt),
          variacaoReceita: variacaoBigPct(receitaAtual, receitaAnt),
          despesasPeriodoKz: formatKz(custoAtual),
          despesasAnterioresKz: formatKz(custoAnt),
          variacaoDespesas: variacaoBigPct(custoAtual, custoAnt),
          resultadoLiquidoKz: formatKz(resultadoAtual),
          resultadoLiquidoAnteriorKz: formatKz(resultadoAnt),
        },
        rentabilidadePorFormacao: porFormacao,
        desempenhoCampanhas: resumoCampanhas,
        formadores: {
          aulasRealizadasNoPeriodo: sessoesRealizadasPeriodo.length,
          honorariosGeradosKz: formatKz(honorariosGeradosPeriodo),
          pagamentosEfetuadosKz: formatKz(pagoFormadoresPeriodo),
        },
        inadimplencia: {
          taxaInadimplenciaPct: inadimplencia.taxaInadimplenciaPct,
          parcelasVencidas: inadimplencia.qtdParcelasAtraso,
          valorEmAtrasoKz: formatKz(inadimplencia.totalVencidoEmAtraso),
        },
        ocupacaoSalas: ocupacao,
      },
    };
  });

  return { metricas, inicio, fim, antInicio, antFim };
}

/** 3. Relatório por Formação */
export async function calcularMetricasPorFormacao(
  tenantId: string,
  formacaoId: string,
): Promise<{ metricas: MetricasRelatorio; inicio: Date; fim: Date }> {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - 90 * DIA_MS);

  const metricas = await comRls(tenantId, async (tx) => {
    const [tenant, formacao] = await Promise.all([
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nome: true } }),
      tx.formacao.findFirstOrThrow({
        where: { id: formacaoId, tenantId },
        include: {
          turmas: {
            include: {
              matriculas: {
                where: { estado: { not: "CANCELADA" } },
                include: {
                  formando: {
                    select: {
                      id: true,
                      _count: { select: { matriculas: { where: { estado: { not: "CANCELADA" } } } } },
                    },
                  },
                  pagamentos: { select: { valor: true } },
                },
              },
              avaliacoes: { orderBy: { createdAt: "desc" } },
            },
          },
        },
      }),
    ]);

    const todasAvaliacoes = formacao.turmas.flatMap((t) => t.avaliacoes);
    const resumoAv = mediasAvaliacoes(todasAvaliacoes);
    const comentarios = todasAvaliacoes
      .map((a) => a.comentario?.trim())
      .filter((c): c is string => Boolean(c))
      .slice(0, 20);

    const todasMatriculas = formacao.turmas.flatMap((t) => t.matriculas);
    const formandosUnicos = new Map<string, number>();
    for (const m of todasMatriculas) {
      formandosUnicos.set(m.formando.id, m.formando._count.matriculas);
    }
    const nUnicos = formandosUnicos.size;
    const nRecompra = Array.from(formandosUnicos.values()).filter((qtd) => qtd >= 2).length;
    const taxaRecompraPct = pct(nRecompra, nUnicos);

    const turmasComVagas = formacao.turmas.filter((t) => (t.vagas ?? 0) > 0 && t.estado !== "CANCELADA");
    const capTotal = turmasComVagas.reduce((s, t) => s + (t.vagas ?? 0), 0);
    const inscCap = turmasComVagas.reduce((s, t) => s + t.matriculas.length, 0);
    const ocupacaoPct = capTotal > 0 ? Math.min(100, pct(inscCap, capTotal)) : 0;

    const receitaTotal = todasMatriculas.reduce(
      (s, m) => s + m.pagamentos.reduce((sp, p) => sp + p.valor, 0n),
      0n,
    );

    return {
      tipo: "POR_FORMACAO" as const,
      centroNome: tenant.nome,
      geradoEm: new Date().toISOString(),
      periodo: { inicio: formatData(inicio), fim: formatData(fim) },
      kpisDestaque: [
        {
          rotulo: "Avaliação Média",
          valor: resumoAv.geral !== null ? `${formatNota(resumoAv.geral)} / 5,0` : "Sem avaliações",
          comparacao: `${resumoAv.total} avaliação(ões) registada(s)`,
        },
        {
          rotulo: "Ocupação Média de Turmas",
          valor: `${ocupacaoPct}%`,
          comparacao: `${todasMatriculas.length} inscrições em ${formacao.turmas.length} turma(s)`,
        },
        {
          rotulo: "Taxa de Recompra",
          valor: `${taxaRecompraPct}%`,
          comparacao: `${nRecompra} de ${nUnicos} formandos fizeram mais de 1 curso`,
        },
        {
          rotulo: "Receita Liquidada",
          valor: formatKz(receitaTotal),
          comparacao: `Preço tabela: ${formatKz(formacao.preco)}`,
        },
      ],
      dadosDetalhados: {
        formacao: {
          nome: formacao.nome,
          categoria: formacao.categoria,
          cargaHoraria: formacao.cargaHoraria,
          precoTabelaKz: formatKz(formacao.preco),
          totalTurmas: formacao.turmas.length,
          totalInscritos: todasMatriculas.length,
          ocupacaoMediaPct: ocupacaoPct,
          taxaRecompraPct,
          receitaTotalLiquidadaKz: formatKz(receitaTotal),
        },
        qualidadePedagogica: {
          totalAvaliacoes: resumoAv.total,
          mediaGeral: resumoAv.geral,
          porCriterio: Object.fromEntries(
            CRITERIOS.map((c) => [c.nome, resumoAv.porCriterio[c.campo]]),
          ),
          comentariosDosFormandosECoordenacao: comentarios,
        },
      },
    };
  });

  return { metricas, inicio, fim };
}

/** 4. Relatório por Formador */
export async function calcularMetricasPorFormador(
  tenantId: string,
  formadorId: string,
): Promise<{ metricas: MetricasRelatorio; inicio: Date; fim: Date }> {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - 90 * DIA_MS);

  const metricas = await comRls(tenantId, async (tx) => {
    const [tenant, formador, precosEspeciais] = await Promise.all([
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nome: true } }),
      tx.formador.findFirstOrThrow({
        where: { id: formadorId, tenantId },
        include: {
          avaliacoes: { orderBy: { createdAt: "desc" }, include: { turma: { select: { codigo: true } } } },
          sessoes: {
            where: { estado: { not: "CANCELADA" } },
            include: {
              turma: { select: { codigo: true, formacaoId: true, formacao: { select: { nome: true, categoria: true } } } },
              presencas: { select: { estado: true } },
            },
          },
          despesas: { where: { categoria: "FORMADOR" }, select: { valor: true } },
        },
      }),
      tx.precoFormadorFormacao.findMany({ where: { tenantId, formadorId } }),
    ]);

    const mapaOverride = new Map(precosEspeciais.map((p) => [p.formacaoId, p.precoHora]));
    const resumoAv = mediasAvaliacoes(formador.avaliacoes);
    const comentarios = formador.avaliacoes
      .map((a) => a.comentario?.trim())
      .filter((c): c is string => Boolean(c))
      .slice(0, 20);

    const realizadas = formador.sessoes.filter((s) => s.estado === "REALIZADA");
    const horasTotal = Math.round(realizadas.reduce((s, a) => s + horasSessao(a), 0) * 10) / 10;
    const honorariosGerados = realizadas.reduce((acc, s) => {
      const ov = mapaOverride.get(s.turma.formacaoId) ?? null;
      const ph = precoHoraFormador(formador, s.turma.formacao.categoria, ov);
      return acc + custoSessao(s, ph);
    }, 0n);
    const honorariosPagos = formador.despesas.reduce((s, d) => s + d.valor, 0n);
    const honorariosPendentes = honorariosGerados > honorariosPagos ? honorariosGerados - honorariosPagos : 0n;

    const todasPresencas = realizadas.flatMap((s) => s.presencas);
    const positivas = todasPresencas.filter((p) => p.estado !== "FALTA").length;
    const assiduidadeTurmasPct = todasPresencas.length > 0 ? pct(positivas, todasPresencas.length) : 100;

    return {
      tipo: "POR_FORMADOR" as const,
      centroNome: tenant.nome,
      geradoEm: new Date().toISOString(),
      periodo: { inicio: formatData(inicio), fim: formatData(fim) },
      kpisDestaque: [
        {
          rotulo: "Média nos 5 Critérios",
          valor: resumoAv.geral !== null ? `${formatNota(resumoAv.geral)} / 5,0` : "Sem avaliações",
          comparacao: `${resumoAv.total} avaliação(ões) recebida(s)`,
        },
        {
          rotulo: "Horas Lecionadas",
          valor: `${horasTotal.toLocaleString("pt-AO")} h`,
          comparacao: `${realizadas.length} sessão(ões) realizada(s)`,
        },
        {
          rotulo: "Assiduidade nas Aulas",
          valor: `${assiduidadeTurmasPct}%`,
          comparacao:
            todasPresencas.length > 0
              ? `${todasPresencas.length} registos nominais`
              : "Sem faltas nominais registadas",
        },
        {
          rotulo: "Honorários Pendentes",
          valor: formatKz(honorariosPendentes),
          comparacao: `Total gerado: ${formatKz(honorariosGerados)} · Pago: ${formatKz(honorariosPagos)}`,
        },
      ],
      dadosDetalhados: {
        formador: {
          nome: formador.nome,
          sessoesRealizadas: realizadas.length,
          horasLecionadas: horasTotal,
          assiduidadeMediaAlunosPct: assiduidadeTurmasPct,
          honorariosGeradosKz: formatKz(honorariosGerados),
          honorariosPagosKz: formatKz(honorariosPagos),
          honorariosPendentesKz: formatKz(honorariosPendentes),
        },
        desempenhoCincoCriterios: Object.fromEntries(
          CRITERIOS.map((c) => [c.nome, resumoAv.porCriterio[c.campo]]),
        ),
        mediaGeral: resumoAv.geral,
        totalAvaliacoes: resumoAv.total,
        comentariosAnonimosECoordenacao: comentarios,
      },
    };
  });

  return { metricas, inicio, fim };
}

/** 5. Verificação de Alertas Imediatos (Anomalias fora do normal) */
export async function verificarMetricasAlertaImediato(
  tenantId: string,
  limiarInadimplenciaPct: number,
  forcarManual = false,
): Promise<{
  deveDisparar: boolean;
  motivosDisparo: string[];
  metricas: MetricasRelatorio;
  inicio: Date;
  fim: Date;
}> {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - 7 * DIA_MS);
  const limite48h = new Date(fim.getTime() - 2 * DIA_MS);

  const res = await comRls(tenantId, async (tx) => {
    const [tenant, inadimplencia, risco, leadsEsquecidos] = await Promise.all([
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nome: true } }),
      apurarInadimplenciaGlobal(tx, tenantId),
      apurarFormandosEmRisco(tx, tenantId),
      tx.lead.count({ where: { tenantId, estado: "NOVO", createdAt: { lte: limite48h } } }),
    ]);

    const motivos: string[] = [];
    if (inadimplencia.taxaInadimplenciaPct >= limiarInadimplenciaPct) {
      motivos.push(
        `Inadimplência atingiu ${inadimplencia.taxaInadimplenciaPct}% (acima do limiar configurado de ${limiarInadimplenciaPct}%).`,
      );
    }
    const faltasCriticas = risco.filter((r) => r.faltasSeguidas >= 2);
    if (faltasCriticas.length > 0) {
      motivos.push(
        `${faltasCriticas.length} formando(s) com 2 ou mais faltas consecutivas em risco imediato de desistência.`,
      );
    }
    if (leadsEsquecidos >= 5) {
      motivos.push(`${leadsEsquecidos} leads qualificados aguardam primeiro contacto há mais de 48 horas.`);
    }

    const metricas: MetricasRelatorio = {
      tipo: "ALERTA_IMEDIATO",
      centroNome: tenant.nome,
      geradoEm: new Date().toISOString(),
      periodo: { inicio: formatData(inicio), fim: formatData(fim) },
      kpisDestaque: [
        {
          rotulo: "Taxa de Inadimplência Atual",
          valor: `${inadimplencia.taxaInadimplenciaPct}%`,
          comparacao: `Limiar máximo definido: ${limiarInadimplenciaPct}%`,
        },
        {
          rotulo: "Valor Vencido Não Pago",
          valor: formatKz(inadimplencia.totalVencidoEmAtraso),
          comparacao: `${inadimplencia.qtdParcelasAtraso} parcela(s) vencida(s)`,
        },
        {
          rotulo: "Formandos em Risco",
          valor: String(risco.length),
          comparacao: `${faltasCriticas.length} com >= 2 faltas seguidas`,
        },
        {
          rotulo: "Leads > 48h Sem Resposta",
          valor: String(leadsEsquecidos),
          comparacao: "Aguardam abordagem comercial",
        },
      ],
      dadosDetalhados: {
        limiarInadimplenciaConfiguradoPct: limiarInadimplenciaPct,
        anomaliasDetetadas: motivos.length > 0 ? motivos : ["Verificação manual de controlo solicitada pelo gestor."],
        inadimplencia: {
          taxaInadimplenciaPct: inadimplencia.taxaInadimplenciaPct,
          parcelasEmAtraso: inadimplencia.qtdParcelasAtraso,
          valorEmAtrasoKz: formatKz(inadimplencia.totalVencidoEmAtraso),
        },
        formandosEmRisco: risco.slice(0, 10),
        leadsSemContactoMais48h: leadsEsquecidos,
      },
    };

    return {
      deveDisparar: forcarManual || motivos.length > 0,
      motivosDisparo: motivos,
      metricas,
    };
  });

  return { ...res, inicio, fim };
}
