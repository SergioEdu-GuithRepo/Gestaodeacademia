import type { CategoriaDespesa } from "@prisma/client";
import { ArrowUpRight, BellRing, Download } from "lucide-react";
import Link from "next/link";
import { GrelhaProgressiva, TbodyProgressivo } from "@/components/lista-progressiva";
import { Badge, Card, CardHeader, Tabela, Td, Th, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { dataSimples, formatData, formatDataHora, hojeLocal } from "@/lib/datas";
import {
  calcularPagamentosFormadores,
  calcularPrevisaoCaixa,
  calcularResumoFinanceiro,
  CATEGORIAS_DESPESA,
  custoSessao,
  NOMES_CATEGORIA_DESPESA,
  type DespesaInput,
  type SessaoFinanceiraInput,
} from "@/lib/financeiro";
import { NOMES_METODO } from "@/lib/formandos";
import { formatKz } from "@/lib/money";
import { comPago, estadoParcela } from "@/lib/parcelas";
import { formatHoras, horasSessao, precoHoraFormador } from "@/lib/precos-formador";
import { pode } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import {
  BotaoApagarDespesa,
  BotaoImprimirRelatorio,
  BotoesValidarAvisoPagamento,
  FormLiquidarFormador,
  FormNovaDespesa,
} from "./forms";

export const dynamic = "force-dynamic";

type AbaFinanceiro = "resumo" | "despesas" | "formadores" | "formacoes" | "previsao";

const ABAS: { id: AbaFinanceiro; label: string }[] = [
  { id: "resumo", label: "Visão Geral" },
  { id: "despesas", label: "Despesas Operacionais" },
  { id: "formadores", label: "Honorários de Formadores" },
  { id: "formacoes", label: "Rentabilidade por Curso" },
  { id: "previsao", label: "Previsão 30 / 60 / 90d" },
];

function lerDataFiltro(valor: string | undefined, padrao: string): string {
  if (valor === "") return "";
  if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  return padrao;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "A";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, db } = await exigir("financeiro:ver");
  const podeEditar = pode(user.perfil, "financeiro:editar");
  const podeRegistarPagamentos = pode(user.perfil, "pagamentos:registar");
  const sp = await searchParams;

  const hojeIso = hojeLocal();
  const hoje = dataSimples(hojeIso);
  const [anoHoje, mesHoje] = hojeIso.split("-");
  const inicioAnoIso = `${anoHoje}-01-01`;
  const inicioMesIso = `${anoHoje}-${mesHoje}-01`;

  const deIso = typeof sp.de === "string" ? lerDataFiltro(sp.de, inicioAnoIso) : inicioAnoIso;
  const ateIso = typeof sp.ate === "string" ? lerDataFiltro(sp.ate, hojeIso) : hojeIso;
  const abaRaw = typeof sp.tab === "string" ? sp.tab : "resumo";
  const aba: AbaFinanceiro = ABAS.some((a) => a.id === abaRaw) ? (abaRaw as AbaFinanceiro) : "resumo";
  const filtroCat =
    typeof sp.categoria === "string" && CATEGORIAS_DESPESA.includes(sp.categoria as CategoriaDespesa)
      ? (sp.categoria as CategoriaDespesa)
      : "";

  const dataDe = deIso ? dataSimples(deIso) : undefined;
  const dataAte = ateIso ? dataSimples(ateIso) : undefined;
  const fimDiaAte = ateIso ? new Date(`${ateIso}T23:59:59.999Z`) : undefined;

  const [
    formacoes,
    turmas,
    formadores,
    precosOverrides,
    matriculas,
    pagamentos,
    despesas,
    sessoesPeriodo,
    sessoesFuturas,
    parcelasAbertasRaw,
    avisosPendentes,
  ] = await Promise.all([
    db.formacao.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, categoria: true },
    }),
    db.turma.findMany({
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, formacaoId: true },
    }),
    db.formador.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        precoHoraComportamental: true,
        precoHoraTecnica: true,
      },
    }),
    db.precoFormadorFormacao.findMany({
      select: { formadorId: true, formacaoId: true, precoHora: true },
    }),
    db.matricula.findMany({
      where: {
        ...(dataDe || fimDiaAte
          ? {
              createdAt: {
                ...(dataDe ? { gte: dataDe } : {}),
                ...(fimDiaAte ? { lte: fimDiaAte } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        valorTotal: true,
        desconto: true,
        estado: true,
        turma: { select: { formacaoId: true } },
      },
    }),
    db.pagamento.findMany({
      where: {
        ...(dataDe || dataAte
          ? {
              dataPagamento: {
                ...(dataDe ? { gte: dataDe } : {}),
                ...(dataAte ? { lte: dataAte } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ dataPagamento: "desc" }, { createdAt: "desc" }],
      include: {
        formando: { select: { id: true, nome: true } },
        matricula: {
          select: {
            id: true,
            turma: { select: { codigo: true, formacaoId: true, formacao: { select: { nome: true } } } },
          },
        },
        registadoPor: { select: { nome: true } },
      },
    }),
    db.despesa.findMany({
      where: {
        ...(dataDe || dataAte
          ? {
              data: {
                ...(dataDe ? { gte: dataDe } : {}),
                ...(dataAte ? { lte: dataAte } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }],
      include: {
        formacao: { select: { id: true, nome: true } },
        turma: { select: { id: true, codigo: true } },
        formador: { select: { id: true, nome: true } },
        registadoPor: { select: { nome: true } },
      },
    }),
    db.sessao.findMany({
      where: {
        estado: "REALIZADA",
        ...(dataDe || fimDiaAte
          ? {
              inicio: {
                ...(dataDe ? { gte: dataDe } : {}),
                ...(fimDiaAte ? { lte: fimDiaAte } : {}),
              },
            }
          : {}),
      },
      orderBy: { inicio: "desc" },
      include: {
        formador: {
          select: { id: true, nome: true, precoHoraComportamental: true, precoHoraTecnica: true },
        },
        turma: {
          select: {
            id: true,
            codigo: true,
            formacao: { select: { id: true, nome: true, categoria: true } },
          },
        },
      },
    }),
    db.sessao.findMany({
      where: {
        estado: "AGENDADA",
        inicio: { gte: hoje },
      },
      orderBy: { inicio: "asc" },
      include: {
        formador: {
          select: { id: true, nome: true, precoHoraComportamental: true, precoHoraTecnica: true },
        },
        turma: {
          select: {
            id: true,
            codigo: true,
            formacao: { select: { id: true, nome: true, categoria: true } },
          },
        },
      },
    }),
    db.parcela.findMany({
      where: {
        matricula: { estado: { not: "CANCELADA" } },
      },
      orderBy: { vencimento: "asc" },
      include: {
        alocacoes: { select: { valor: true } },
        matricula: {
          select: {
            id: true,
            formando: { select: { id: true, nome: true } },
            turma: { select: { codigo: true, formacao: { select: { nome: true } } } },
          },
        },
      },
    }),
    db.avisoPagamento.findMany({
      where: { estado: "PENDENTE" },
      orderBy: { createdAt: "asc" },
      include: {
        formando: { select: { id: true, nome: true, whatsapp: true } },
        matricula: {
          include: {
            turma: {
              include: {
                formacao: { select: { id: true, nome: true } },
              },
            },
          },
        },
        parcela: { select: { id: true, numero: true, valor: true, vencimento: true } },
      },
    }),
  ]);

  const mapaOverrides = new Map<string, bigint>();
  for (const ov of precosOverrides) {
    mapaOverrides.set(`${ov.formadorId}:${ov.formacaoId}`, ov.precoHora);
  }

  const mapearSessao = (s: (typeof sessoesPeriodo)[number]): SessaoFinanceiraInput => ({
    id: s.id,
    estado: s.estado,
    inicio: s.inicio,
    fim: s.fim,
    horasLecionadas: s.horasLecionadas ? Number(s.horasLecionadas.toString()) : null,
    formadorId: s.formador.id,
    formadorNome: s.formador.nome,
    formadorPrecos: {
      precoHoraComportamental: s.formador.precoHoraComportamental,
      precoHoraTecnica: s.formador.precoHoraTecnica,
    },
    formacaoId: s.turma.formacao.id,
    formacaoNome: s.turma.formacao.nome,
    formacaoCategoria: s.turma.formacao.categoria,
    turmaId: s.turma.id,
    turmaCodigo: s.turma.codigo,
    overridePrecoHora: mapaOverrides.get(`${s.formador.id}:${s.turma.formacao.id}`) ?? null,
  });

  const sessoesRealizadasInput = sessoesPeriodo.map(mapearSessao);
  const sessoesAgendadasInput = sessoesFuturas.map(mapearSessao);

  const despesasInput: DespesaInput[] = despesas.map((d) => ({
    id: d.id,
    categoria: d.categoria,
    valor: d.valor,
    data: d.data,
    formacaoId: d.formacaoId,
    turmaId: d.turmaId,
    formadorId: d.formadorId,
    horasPagas: d.horasPagas ? Number(d.horasPagas.toString()) : null,
  }));

  const resumo = calcularResumoFinanceiro({
    formacoes: formacoes.map((f) => ({ id: f.id, nome: f.nome })),
    matriculas: matriculas.map((m) => ({
      formacaoId: m.turma.formacaoId,
      valorTotal: m.valorTotal,
      estado: m.estado,
    })),
    pagamentos: pagamentos.map((p) => ({
      formacaoId: p.matricula.turma.formacaoId,
      valor: p.valor,
    })),
    despesas: despesasInput,
    sessoesRealizadas: sessoesRealizadasInput,
  });

  const resumoFormadores = calcularPagamentosFormadores(sessoesRealizadasInput, despesasInput);
  const totalEmFaltaFormadores = resumoFormadores.reduce((s, r) => s + r.emFalta, 0n);

  const parcelasComSaldo = parcelasAbertasRaw.map((p) => {
    const cp = comPago(p);
    const emFalta = cp.valor > cp.pago ? cp.valor - cp.pago : 0n;
    const estado = estadoParcela(cp, hoje);
    return { ...cp, emFalta, estado };
  });

  const totalEmAtraso = parcelasComSaldo
    .filter((p) => p.estado === "EM_ATRASO")
    .reduce((s, p) => s + p.emFalta, 0n);

  const previsaoCaixa = calcularPrevisaoCaixa({
    hoje,
    parcelasAbertas: parcelasComSaldo.map((p) => ({ vencimento: p.vencimento, emFalta: p.emFalta })),
    sessoesAgendadas: sessoesAgendadasInput,
  });

  const despesasFiltradas = filtroCat ? despesas.filter((d) => d.categoria === filtroCat) : despesas;

  const qsPeriodo = `de=${encodeURIComponent(deIso)}&ate=${encodeURIComponent(ateIso)}`;
  const urlAba = (t: AbaFinanceiro) => `/financeiro?tab=${t}&${qsPeriodo}`;

  // Cálculo proporcional das 4 barras de topo (estilo Referência 3)
  const somaBarras =
    Number(resumo.totalEntradas) +
    Number(resumo.totalSaidas) +
    Number(totalEmFaltaFormadores) +
    Number(totalEmAtraso) || 1;
  const pctEntradas = Math.max(18, Math.round((Number(resumo.totalEntradas) / somaBarras) * 100));
  const pctSaidas = Math.max(15, Math.round((Number(resumo.totalSaidas) / somaBarras) * 100));
  const pctFormadores = Math.max(14, Math.round((Number(totalEmFaltaFormadores) / somaBarras) * 100));
  const pctAtraso = Math.max(14, 100 - pctEntradas - pctSaidas - pctFormadores);

  const periodoAtivo =
    deIso === inicioMesIso && ateIso === hojeIso
      ? "mes"
      : deIso === inicioAnoIso && ateIso === hojeIso
        ? "ano"
        : deIso === "" && ateIso === ""
          ? "tudo"
          : "custom";

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial + Exportações em Pílula */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium tracking-wider text-zinc-500 uppercase">
            {user.tenant.nome} · Gestão de Tesouraria
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1C1D21]">Caixa e Finanças</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <a
            href={`/api/relatorios/financeiro?tipo=movimentos&${qsPeriodo}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white px-4 text-xs font-medium text-[#1C1D21] shadow-2xs transition-colors hover:bg-zinc-50"
          >
            <Download className="size-3.5 text-zinc-500" aria-hidden /> Movimentos CSV
          </a>
          <a
            href={`/api/relatorios/financeiro?tipo=formadores&${qsPeriodo}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white px-4 text-xs font-medium text-[#1C1D21] shadow-2xs transition-colors hover:bg-zinc-50"
          >
            <Download className="size-3.5 text-zinc-500" aria-hidden /> Formadores CSV
          </a>
          <a
            href={`/api/relatorios/financeiro?tipo=formacoes&${qsPeriodo}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white px-4 text-xs font-medium text-[#1C1D21] shadow-2xs transition-colors hover:bg-zinc-50"
          >
            <Download className="size-3.5 text-zinc-500" aria-hidden /> Rentabilidade CSV
          </a>
          <a
            href="/api/relatorios/financeiro?tipo=atrasos"
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white px-4 text-xs font-medium text-[#1C1D21] shadow-2xs transition-colors hover:bg-zinc-50"
          >
            <Download className="size-3.5 text-zinc-500" aria-hidden /> Atrasos CSV
          </a>
          <BotaoImprimirRelatorio />
        </div>
      </div>

      {/* Cabeçalho visível apenas na impressão / PDF */}
      <div className="hidden border-b border-zinc-300 pb-4 print:block">
        <div className="text-lg font-bold text-[#1C1D21]">{user.tenant.nome} — Relatório Financeiro Operacional</div>
        <div className="text-xs text-zinc-600">
          Período: {deIso ? formatData(dataSimples(deIso)) : "Início"} a {ateIso ? formatData(dataSimples(ateIso)) : "Hoje"} · Emitido por {user.nome}
        </div>
      </div>

      {/* Bloco Principal Editorial (Referências 2 e 3: Números Grandes + Filtro Pílula + 4 Barras Proporcionais) */}
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
                {formatKz(resumo.totalEntradas)}
              </span>
              <span className="text-2xl font-light text-zinc-300">/</span>
              <span
                className={cn(
                  "text-2xl font-normal tracking-tight sm:text-3xl",
                  resumo.sobraOperacional >= 0n ? "text-emerald-700" : "text-red-600",
                )}
              >
                {resumo.sobraOperacional >= 0n
                  ? `+${formatKz(resumo.sobraOperacional)}`
                  : formatKz(resumo.sobraOperacional)}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Entradas recebidas vs. Sobra operacional disponível no período ({deIso ? formatData(dataSimples(deIso)) : "Início"} — {ateIso ? formatData(dataSimples(ateIso)) : "Hoje"})
            </p>
          </div>

          {/* Barra de Período em Pílulas (Referência 3) */}
          <form method="get" action="/financeiro" className="flex flex-wrap items-center gap-2 print:hidden">
            <input type="hidden" name="tab" value={aba} />
            <div className="inline-flex items-center rounded-full bg-[#F5F4EF] p-1">
              <Link
                href={`/financeiro?tab=${aba}&de=${inicioMesIso}&ate=${hojeIso}`}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  periodoAtivo === "mes"
                    ? "bg-[#1C1D21] text-white shadow-2xs"
                    : "text-zinc-600 hover:text-[#1C1D21]",
                )}
              >
                Este mês
              </Link>
              <Link
                href={`/financeiro?tab=${aba}&de=${inicioAnoIso}&ate=${hojeIso}`}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  periodoAtivo === "ano"
                    ? "bg-[#1C1D21] text-white shadow-2xs"
                    : "text-zinc-600 hover:text-[#1C1D21]",
                )}
              >
                Este ano
              </Link>
              <Link
                href={`/financeiro?tab=${aba}&de=&ate=`}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  periodoAtivo === "tudo"
                    ? "bg-[#1C1D21] text-white shadow-2xs"
                    : "text-zinc-600 hover:text-[#1C1D21]",
                )}
              >
                Tudo
              </Link>
            </div>

            <div className="flex items-center gap-1.5 rounded-full border border-zinc-200/90 bg-[#FAF9F5] px-3 py-1">
              <input
                type="date"
                name="de"
                defaultValue={deIso}
                aria-label="Data inicial"
                className="bg-transparent text-xs text-zinc-700 focus:outline-none"
              />
              <span className="text-xs text-zinc-400">→</span>
              <input
                type="date"
                name="ate"
                defaultValue={ateIso}
                aria-label="Data final"
                className="bg-transparent text-xs text-zinc-700 focus:outline-none"
              />
              <button
                type="submit"
                className="ml-1 rounded-full bg-[#FBD34D] px-2.5 py-1 text-[11px] font-semibold text-[#1C1D21] hover:bg-[#f5c82e]"
              >
                Aplicar
              </button>
            </div>
          </form>
        </div>

        {/* 4 Barras Horizontais Proporcionais em Pílula (Referência 3) */}
        <div className="mt-6 space-y-2">
          <div className="flex flex-wrap items-center justify-between text-[11px] font-medium text-zinc-500">
            <span>Entradas ({pagamentos.length} receb.)</span>
            <span>Saídas ({despesas.length} desp.)</span>
            <span>Honorários p/ liquidar ({sessoesRealizadasInput.length} sessões)</span>
            <span>Parcelas em atraso</span>
          </div>
          <div className="flex h-11 w-full items-stretch gap-2 overflow-hidden">
            <div
              style={{ width: `${pctEntradas}%` }}
              className="flex min-w-28 items-center justify-between rounded-full bg-[#FBD34D] px-4 text-xs font-semibold text-[#1C1D21] transition-all"
              title="Entradas recebidas no período"
            >
              <span className="truncate">{formatKz(resumo.totalEntradas)}</span>
              <span className="ml-1 text-[10px] opacity-75">Entradas</span>
            </div>
            <div
              style={{ width: `${pctSaidas}%` }}
              className="flex min-w-24 items-center justify-between rounded-full bg-[#1C1D21] px-4 text-xs font-medium text-white transition-all"
              title="Saídas operacionais no período"
            >
              <span className="truncate">{formatKz(resumo.totalSaidas)}</span>
              <span className="ml-1 hidden text-[10px] text-zinc-400 sm:inline">Saídas</span>
            </div>
            <div
              style={{ width: `${pctFormadores}%` }}
              className="bg-hatched flex min-w-24 items-center justify-between rounded-full border border-zinc-300/80 px-3.5 text-xs font-semibold text-[#1C1D21] transition-all"
              title="Honorários de formadores por liquidar"
            >
              <span className="truncate">{formatKz(totalEmFaltaFormadores)}</span>
            </div>
            <div
              style={{ width: `${pctAtraso}%` }}
              className="flex min-w-24 items-center justify-between rounded-full border border-zinc-200 bg-[#F5F4EF] px-3.5 text-xs font-semibold text-red-700 transition-all"
              title="Parcelas vencidas em atraso"
            >
              <span className="truncate">{formatKz(totalEmAtraso)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Comunicações de Pagamento do Portal (AvisoPagamento) */}
      <Card
        className={cn(
          "print:hidden",
          avisosPendentes.length > 0 && "border-[#FBD34D] ring-1 ring-[#FBD34D]/60",
        )}
      >
        <CardHeader
          titulo="Comunicações de Pagamento do Portal"
          descricao={
            avisosPendentes.length > 0
              ? "Transferências e pagamentos comunicados pelos formandos a aguardar validação bancária da tesouraria."
              : "Sem comunicações de pagamento pendentes no momento."
          }
          acoes={
            <div className="flex items-center gap-2">
              {avisosPendentes.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBD34D] px-3 py-1 text-xs font-extrabold text-[#1C1D21]">
                  <BellRing className="size-3.5" aria-hidden />
                  {avisosPendentes.length} pendente(s) ·{" "}
                  {formatKz(avisosPendentes.reduce((s, a) => s + a.valor, 0n))}
                </span>
              ) : (
                <Badge cor="cinza">0 pendentes</Badge>
              )}
            </div>
          }
        />

        {avisosPendentes.length > 0 && (
          <Tabela>
            <thead>
              <tr>
                <Th>Formando</Th>
                <Th>Curso / Turma</Th>
                <Th>Data Transf.</Th>
                <Th>Método e Referência</Th>
                <Th className="text-right">Valor Comunicado</Th>
                {podeRegistarPagamentos && <Th className="text-right">Validação Tesouraria</Th>}
              </tr>
            </thead>
            <TbodyProgressivo passo={10} colSpan={podeRegistarPagamentos ? 6 : 5}>
              {avisosPendentes.map((av) => (
                <tr key={av.id} className="bg-[#FAF9F5]/70 transition-colors hover:bg-[#FBD34D]/15">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[11px] font-bold text-[#FBD34D]">
                        {iniciais(av.formando.nome)}
                      </div>
                      <div>
                        <Link
                          href={`/formandos/${av.formando.id}`}
                          className="font-semibold text-[#1C1D21] hover:underline"
                        >
                          {av.formando.nome}
                        </Link>
                        <div className="font-mono text-[11px] text-zinc-500">{av.formando.whatsapp}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="font-medium text-[#1C1D21]">{av.matricula.turma.formacao.nome}</div>
                    <div className="text-xs text-zinc-500">
                      Turma <span className="font-mono font-semibold">{av.matricula.turma.codigo}</span>
                      {av.parcela ? ` · Parcela #${av.parcela.numero}` : ""}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-zinc-700">
                    <div>{formatData(av.dataTransferencia)}</div>
                    <div className="text-[11px] text-zinc-400">Submetido {formatDataHora(av.createdAt)}</div>
                  </Td>
                  <Td className="text-xs">
                    <Badge cor="cinza">{NOMES_METODO[av.metodo]}</Badge>
                    <div className="mt-1 font-mono text-xs font-semibold text-[#1C1D21]">
                      Ref.: {av.referencia}
                    </div>
                    {av.notas && <div className="mt-0.5 text-[11px] text-zinc-500">{av.notas}</div>}
                  </Td>
                  <Td className="text-right font-bold whitespace-nowrap text-[#1C1D21]">
                    {formatKz(av.valor)}
                  </Td>
                  {podeRegistarPagamentos && (
                    <Td className="text-right">
                      <BotoesValidarAvisoPagamento
                        avisoId={av.id}
                        formandoNome={av.formando.nome}
                        valorFormatado={formatKz(av.valor)}
                      />
                    </Td>
                  )}
                </tr>
              ))}
            </TbodyProgressivo>
          </Tabela>
        )}
      </Card>

      {/* Formulário rápido para registar despesa (visível para ADMIN e FINANCEIRO) */}
      {podeEditar && (
        <FormNovaDespesa
          hojeIso={hojeIso}
          formacoes={formacoes.map((f) => ({ id: f.id, nome: f.nome }))}
          turmas={turmas}
          formadores={formadores.map((f) => ({ id: f.id, nome: f.nome }))}
          abertoInicial={aba === "despesas"}
        />
      )}

      {/* Navegação por Separadores em Pílula (Estilo Editorial) */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {ABAS.map((t) => {
          const ativa = aba === t.id;
          return (
            <Link
              key={t.id}
              href={urlAba(t.id)}
              className={cn(
                "inline-flex h-10 items-center rounded-full px-4 text-xs font-medium transition-all",
                ativa
                  ? "bg-[#1C1D21] text-white shadow-xs"
                  : "border border-zinc-200/80 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-[#1C1D21]",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* ───────────────────────────── ABA 1: RESUMO ───────────────────────────── */}
      {aba === "resumo" && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Coluna Esquerda (5 cols): Custos por Categoria estilo Statistics Referência 2 */}
          <Card className="p-6 lg:col-span-5">
            <CardHeader
              titulo="Saídas por Categoria"
              descricao="Proporção das despesas operacionais registadas no período."
            />
            <div className="space-y-4">
              {CATEGORIAS_DESPESA.map((cat, idx) => {
                const val = resumo.porCategoria[cat] ?? 0n;
                const pct =
                  resumo.totalSaidas > 0n ? Number((val * 100n) / resumo.totalSaidas) : 0;
                const usarAmarelo = idx % 2 === 0;
                return (
                  <div key={cat} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-700">{NOMES_CATEGORIA_DESPESA[cat]}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#1C1D21]">{formatKz(val)}</span>
                        <span className="rounded-full bg-[#F5F4EF] px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                          {pct}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#F5F4EF]">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          usarAmarelo ? "bg-[#FBD34D]" : "bg-[#1C1D21]",
                        )}
                        style={{ width: `${val > 0n ? Math.max(6, Math.min(100, pct)) : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Coluna Direita (7 cols): Últimas Entradas Recebidas (Diretório Referência 3) */}
          <Card className="p-6 lg:col-span-7">
            <CardHeader
              titulo="Últimas Entradas Recebidas"
              descricao="Pagamentos de formandos registados no período selecionado."
            />
            {pagamentos.length === 0 ? (
              <Vazio>Sem pagamentos registados neste período.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Formando / Turma</Th>
                    <Th>Data</Th>
                    <Th>Método</Th>
                    <Th className="text-right">Valor</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={4}>
                  {pagamentos.map((p, idx) => (
                    <tr
                      key={p.id}
                      className={cn(
                        "transition-colors",
                        idx === 0 ? "bg-[#FBD34D]/20 hover:bg-[#FBD34D]/35" : "hover:bg-[#FBD34D]/15",
                      )}
                    >
                      <Td>
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                              idx === 0 ? "bg-[#1C1D21] text-[#FBD34D]" : "bg-[#F5F4EF] text-[#1C1D21]",
                            )}
                          >
                            {iniciais(p.formando.nome)}
                          </div>
                          <div>
                            <Link
                              href={`/formandos/${p.formando.id}`}
                              className="font-semibold text-[#1C1D21] hover:underline"
                            >
                              {p.formando.nome}
                            </Link>
                            <div className="text-xs text-zinc-500">
                              {p.matricula.turma.formacao.nome} · {p.matricula.turma.codigo}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td className="text-xs text-zinc-600">{formatData(p.dataPagamento)}</Td>
                      <Td>
                        <Badge cor="cinza">{p.metodo}</Badge>
                        {p.referenciaRecibo && (
                          <div className="mt-0.5 text-[11px] text-zinc-500">Recibo: {p.referenciaRecibo}</div>
                        )}
                      </Td>
                      <Td className="text-right font-semibold text-[#1C1D21]">+{formatKz(p.valor)}</Td>
                    </tr>
                  ))}
                </TbodyProgressivo>
              </Tabela>
            )}
          </Card>
        </div>
      )}

      {/* ─────────────────────── ABA 2: DESPESAS OPERACIONAIS ──────────────────── */}
      {aba === "despesas" && (
        <Card className="p-6">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-[#1C1D21]">Registo de Despesas Operacionais</h2>
              <p className="text-xs text-zinc-500">Histórico auditável de todas as saídas do centro.</p>
            </div>

            {/* Pílulas de filtro rápido por categoria */}
            <div className="flex flex-wrap items-center gap-1.5 print:hidden">
              <Link
                href={`/financeiro?tab=despesas&${qsPeriodo}`}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  filtroCat === ""
                    ? "bg-[#1C1D21] text-white"
                    : "bg-[#F5F4EF] text-zinc-600 hover:text-[#1C1D21]",
                )}
              >
                Todas ({despesas.length})
              </Link>
              {CATEGORIAS_DESPESA.map((cat) => (
                <Link
                  key={cat}
                  href={`/financeiro?tab=despesas&categoria=${cat}&${qsPeriodo}`}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    filtroCat === cat
                      ? "bg-[#FBD34D] font-semibold text-[#1C1D21]"
                      : "bg-[#F5F4EF] text-zinc-600 hover:text-[#1C1D21]",
                  )}
                >
                  {NOMES_CATEGORIA_DESPESA[cat]}
                </Link>
              ))}
            </div>
          </div>

          {despesasFiltradas.length === 0 ? (
            <Vazio>Nenhuma despesa operacional encontrada para os filtros selecionados.</Vazio>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Categoria</Th>
                  <Th>Descrição / Beneficiário</Th>
                  <Th>Imputação</Th>
                  <Th>Método / Ref.</Th>
                  <Th className="text-right">Valor</Th>
                  {podeEditar && <Th className="w-10 print:hidden" />}
                </tr>
              </thead>
              <TbodyProgressivo passo={10} colSpan={7}>
                {despesasFiltradas.map((d) => (
                  <tr key={d.id} className="transition-colors hover:bg-[#FBD34D]/15">
                    <Td className="text-xs text-zinc-600">{formatData(d.data)}</Td>
                    <Td>
                      <Badge cor={d.categoria === "FORMADOR" ? "amarelo" : "cinza"}>
                        {NOMES_CATEGORIA_DESPESA[d.categoria]}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="font-semibold text-[#1C1D21]">{d.descricao}</div>
                      {d.fornecedor && <div className="text-xs text-zinc-500">Beneficiário: {d.fornecedor}</div>}
                      {d.notas && <div className="text-xs text-zinc-400">{d.notas}</div>}
                    </Td>
                    <Td className="text-xs text-zinc-600">
                      {d.formacao ? <div>Formação: {d.formacao.nome}</div> : null}
                      {d.turma ? <div>Turma: {d.turma.codigo}</div> : null}
                      {d.formador ? (
                        <div>
                          Formador: {d.formador.nome}
                          {d.horasPagas ? ` (${d.horasPagas.toString()} h)` : ""}
                        </div>
                      ) : null}
                      {!d.formacao && !d.turma && !d.formador && <span className="text-zinc-400">Geral do centro</span>}
                    </Td>
                    <Td className="text-xs text-zinc-600">
                      <div>{d.metodo}</div>
                      {d.referencia && <div className="text-zinc-400">Ref: {d.referencia}</div>}
                    </Td>
                    <Td className="text-right font-semibold text-[#1C1D21]">{formatKz(d.valor)}</Td>
                    {podeEditar && (
                      <Td className="text-right print:hidden">
                        <BotaoApagarDespesa despesaId={d.id} />
                      </Td>
                    )}
                  </tr>
                ))}
              </TbodyProgressivo>
            </Tabela>
          )}
        </Card>
      )}

      {/* ───────────────────── ABA 3: PAGAMENTOS A FORMADORES ──────────────────── */}
      {aba === "formadores" && (
        <div className="space-y-6">
          {/* Cards de Formadores ao estilo da Coluna Esquerda da Referência 2 */}
          <Card className="p-6">
            <CardHeader
              titulo="Apuramento de Honorários de Formadores"
              descricao="Calculado automaticamente com base nas sessões dadas como REALIZADA e no valor/hora de cada formador."
            />
            {resumoFormadores.length === 0 ? (
              <Vazio>Sem sessões realizadas nem pagamentos a formadores no período selecionado.</Vazio>
            ) : (
              <GrelhaProgressiva passo={10} className="grid gap-4 md:grid-cols-2">
                {resumoFormadores.map((r, idx) => {
                  const pctPago =
                    r.valorDevido > 0n
                      ? Math.min(100, Math.round((Number(r.valorPago) / Number(r.valorDevido)) * 100))
                      : 100;
                  return (
                    <div
                      key={r.formadorId}
                      className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 transition-colors hover:border-zinc-300"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                idx % 2 === 0 ? "bg-[#1C1D21] text-[#FBD34D]" : "bg-[#FBD34D] text-[#1C1D21]",
                              )}
                            >
                              {iniciais(r.formadorNome)}
                            </div>
                            <div>
                              <Link
                                href={`/formadores/${r.formadorId}`}
                                className="font-semibold text-[#1C1D21] hover:underline"
                              >
                                {r.formadorNome}
                              </Link>
                              <div className="text-xs text-zinc-500">
                                {r.sessoesRealizadas} sessão(ões) · {formatHoras(r.horasLecionadas)} lecionadas
                              </div>
                            </div>
                          </div>
                          <Link
                            href={`/formadores/${r.formadorId}`}
                            className="inline-flex size-8 items-center justify-center rounded-full bg-white text-zinc-600 shadow-2xs hover:text-[#1C1D21]"
                            title="Abrir ficha do formador"
                          >
                            <ArrowUpRight className="size-4" aria-hidden />
                          </Link>
                        </div>

                        {/* Barra de progresso bicolor estilo Referência 2 (Amarelo + Antracite) */}
                        <div className="mt-4 space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">
                              Pago: <strong className="text-[#1C1D21]">{formatKz(r.valorPago)}</strong>
                            </span>
                            <span className="text-zinc-500">
                              Devido: <strong className="text-[#1C1D21]">{formatKz(r.valorDevido)}</strong>
                            </span>
                          </div>
                          <div className="flex h-2.5 w-full gap-1 overflow-hidden rounded-full bg-[#ECEAE2] p-0.5">
                            {pctPago > 0 && (
                              <div
                                className="h-full rounded-full bg-[#FBD34D]"
                                style={{ width: `${pctPago}%` }}
                              />
                            )}
                            {pctPago < 100 && (
                              <div
                                className="h-full rounded-full bg-[#1C1D21]"
                                style={{ width: `${100 - pctPago}%` }}
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dotted border-zinc-200 pt-3">
                        <div className="text-xs">
                          <span className="text-zinc-500">Em falta: </span>
                          <span className={cn("font-semibold", r.emFalta > 0n ? "text-amber-800" : "text-emerald-700")}>
                            {formatKz(r.emFalta)}
                          </span>
                        </div>
                        {podeEditar && (
                          <FormLiquidarFormador
                            formadorId={r.formadorId}
                            formadorNome={r.formadorNome}
                            horasLecionadas={r.horasLecionadas}
                            emFalta={r.emFalta}
                            hojeIso={hojeIso}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </GrelhaProgressiva>
            )}
          </Card>

          <Card className="p-6">
            <CardHeader
              titulo="Detalhe de Sessões Realizadas no Período"
              descricao="Base de cálculo das horas lecionadas por turma e formação."
            />
            {sessoesRealizadasInput.length === 0 ? (
              <Vazio>Nenhuma sessão marcada como REALIZADA neste período.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Data / Hora</Th>
                    <Th>Formador</Th>
                    <Th>Formação / Turma</Th>
                    <Th className="text-right">Horas</Th>
                    <Th className="text-right">Valor/hora</Th>
                    <Th className="text-right">Custo apurado</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={6}>
                  {sessoesRealizadasInput.map((s) => {
                    const ph = precoHoraFormador(s.formadorPrecos, s.formacaoCategoria, s.overridePrecoHora);
                    const custo = custoSessao(s, ph);
                    return (
                      <tr key={s.id} className="transition-colors hover:bg-[#FBD34D]/15">
                        <Td className="text-xs text-zinc-600">{formatDataHora(s.inicio)}</Td>
                        <Td className="font-semibold text-[#1C1D21]">{s.formadorNome}</Td>
                        <Td>
                          <div className="font-medium text-[#1C1D21]">{s.formacaoNome}</div>
                          <div className="text-xs text-zinc-500">Turma {s.turmaCodigo}</div>
                        </Td>
                        <Td className="text-right">{formatHoras(horasSessao(s))}</Td>
                        <Td className="text-right">
                          {ph ? formatKz(ph) : <Badge cor="amarelo">Não definido</Badge>}
                        </Td>
                        <Td className="text-right font-semibold text-[#1C1D21]">{formatKz(custo)}</Td>
                      </tr>
                    );
                  })}
                </TbodyProgressivo>
              </Tabela>
            )}
          </Card>
        </div>
      )}

      {/* ──────────────────── ABA 4: RENTABILIDADE POR FORMAÇÃO ────────────────── */}
      {aba === "formacoes" && (
        <Card className="p-6">
          <CardHeader
            titulo="Rentabilidade e Margem por Curso"
            descricao="Comparação entre receitas recebidas, custo de horas de formadores e consumíveis/despesas imputadas."
          />
          {resumo.porFormacao.length === 0 ? (
            <Vazio>Nenhuma formação registada no catálogo.</Vazio>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Formação</Th>
                  <Th className="text-right">Matrículas</Th>
                  <Th className="text-right">Contratado</Th>
                  <Th className="text-right">Receita recebida</Th>
                  <Th className="text-right">Custo formadores</Th>
                  <Th className="text-right">Despesas diretas</Th>
                  <Th className="text-right">Margem líquida</Th>
                </tr>
              </thead>
              <TbodyProgressivo passo={10} colSpan={7}>
                {resumo.porFormacao.map((f, idx) => (
                  <tr
                    key={f.formacaoId}
                    className={cn(
                      "transition-colors",
                      idx === 0 ? "bg-[#FBD34D]/20 hover:bg-[#FBD34D]/35" : "hover:bg-[#FBD34D]/15",
                    )}
                  >
                    <Td className="font-semibold text-[#1C1D21]">{f.formacaoNome}</Td>
                    <Td className="text-right">{f.matriculasAtivas}</Td>
                    <Td className="text-right text-zinc-600">{formatKz(f.valorContratado)}</Td>
                    <Td className="text-right font-medium text-emerald-700">{formatKz(f.receitaRecebida)}</Td>
                    <Td className="text-right text-zinc-700">{formatKz(f.custoFormadores)}</Td>
                    <Td className="text-right text-zinc-700">{formatKz(f.despesasDiretas)}</Td>
                    <Td
                      className={cn(
                        "text-right font-semibold",
                        f.margem >= 0n ? "text-[#1C1D21]" : "text-red-600",
                      )}
                    >
                      {f.margem >= 0n ? `+${formatKz(f.margem)}` : formatKz(f.margem)}
                    </Td>
                  </tr>
                ))}
              </TbodyProgressivo>
            </Tabela>
          )}
        </Card>
      )}

      {/* ────────────────────── ABA 5: PREVISÃO DE CAIXA ───────────────────────── */}
      {aba === "previsao" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {previsaoCaixa.map((j, idx) => {
              const escuro = idx === 0;
              const dourado = idx === 1;
              return (
                <div
                  key={j.dias}
                  className={cn(
                    "rounded-3xl p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]",
                    escuro
                      ? "bg-[#1C1D21] text-white"
                      : dourado
                        ? "bg-[#FBD34D] text-[#1C1D21]"
                        : "border border-zinc-200/70 bg-white text-[#1C1D21]",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs font-medium tracking-wider uppercase",
                        escuro ? "text-zinc-400" : dourado ? "text-[#1C1D21]/75" : "text-zinc-500",
                      )}
                    >
                      Próximos {j.dias} dias
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        escuro
                          ? "bg-white/10 text-[#FBD34D]"
                          : dourado
                            ? "bg-[#1C1D21] text-white"
                            : "bg-emerald-50 text-emerald-800",
                      )}
                    >
                      {j.saldoProjetado >= 0n ? "Positivo" : "Défice"}
                    </span>
                  </div>

                  <div className="mt-4 text-2xl font-semibold tracking-tight">
                    {j.saldoProjetado >= 0n ? `+${formatKz(j.saldoProjetado)}` : formatKz(j.saldoProjetado)}
                  </div>
                  <p className={cn("mt-0.5 text-xs", escuro ? "text-zinc-400" : " opacity-75")}>
                    Saldo operacional projetado
                  </p>

                  <div
                    className={cn(
                      "mt-5 space-y-2 border-t border-dotted pt-4 text-xs",
                      escuro ? "border-zinc-700" : "border-zinc-300/80",
                    )}
                  >
                    <div className="flex justify-between">
                      <span className={escuro ? "text-zinc-400" : "opacity-80"}>
                        Entradas ({j.numParcelas} parc.)
                      </span>
                      <span className="font-semibold">{formatKz(j.entradasPrevistas)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={escuro ? "text-zinc-400" : "opacity-80"}>
                        Formadores ({j.numSessoes} aulas)
                      </span>
                      <span className="font-semibold">{formatKz(j.saidasFormadoresPrevistas)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="p-6">
            <CardHeader
              titulo="Parcelas em Aberto (Vencidas e Próximos 90 Dias)"
              descricao="Valores contratados ainda por receber dos formandos."
            />
            {parcelasComSaldo.filter((p) => p.emFalta > 0n).length === 0 ? (
              <Vazio>Não existem parcelas pendentes ou em atraso.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Formando</Th>
                    <Th>Formação / Parcela</Th>
                    <Th>Vencimento</Th>
                    <Th>Estado</Th>
                    <Th className="text-right">Em falta</Th>
                    <Th className="text-right print:hidden">Ação</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={6}>
                  {parcelasComSaldo
                    .filter((p) => p.emFalta > 0n)
                    .map((p, idx) => (
                      <tr
                        key={p.id}
                        className={cn(
                          "transition-colors",
                          idx === 0 ? "bg-[#FBD34D]/20 hover:bg-[#FBD34D]/35" : "hover:bg-[#FBD34D]/15",
                        )}
                      >
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F5F4EF] text-[11px] font-semibold text-[#1C1D21]">
                              {iniciais(p.matricula.formando.nome)}
                            </div>
                            <Link
                              href={`/formandos/${p.matricula.formando.id}`}
                              className="font-semibold text-[#1C1D21] hover:underline"
                            >
                              {p.matricula.formando.nome}
                            </Link>
                          </div>
                        </Td>
                        <Td>
                          <div className="font-medium text-[#1C1D21]">{p.matricula.turma.formacao.nome}</div>
                          <div className="text-xs text-zinc-500">
                            Turma {p.matricula.turma.codigo} · Parcela #{p.numero}
                          </div>
                        </Td>
                        <Td className="text-xs text-zinc-600 whitespace-nowrap">{formatData(p.vencimento)}</Td>
                        <Td>
                          <Badge
                            cor={
                              p.estado === "EM_ATRASO"
                                ? "vermelho"
                                : p.estado === "PARCIAL"
                                  ? "amarelo"
                                  : "cinza"
                            }
                          >
                            {p.estado === "EM_ATRASO"
                              ? "Vencida"
                              : p.estado === "PARCIAL"
                                ? "Parcial"
                                : "Pendente"}
                          </Badge>
                        </Td>
                        <Td className="text-right font-semibold whitespace-nowrap text-[#1C1D21]">
                          {formatKz(p.emFalta)}
                        </Td>
                        <Td className="text-right print:hidden">
                          <Link
                            href={`/formandos/${p.matricula.formando.id}/pagamento?matriculaId=${p.matricula.id}`}
                            className="inline-flex h-8 items-center rounded-full bg-[#1C1D21] px-3.5 text-xs font-medium text-white hover:bg-zinc-800"
                          >
                            Receber
                          </Link>
                        </Td>
                      </tr>
                    ))}
                </TbodyProgressivo>
              </Tabela>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
