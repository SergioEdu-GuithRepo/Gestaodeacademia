import {
  ArrowUpRight,
  CalendarDays,
  DoorOpen,
  Download,
  ExternalLink,
  FileSpreadsheet,
  GraduationCap,
  MessageCircle,
  Plus,
  Settings,
  ShieldUser,
  Smartphone,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { TbodyProgressivo } from "@/components/lista-progressiva";
import { Alerta, Badge, Card, CardHeader, Tabela, Td, Th, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { dataSimples, formatData, formatDiaSemana, formatHora, hojeLocal } from "@/lib/datas";
import { linkWhatsapp } from "@/lib/formandos";
import { CORES_ESTADO_LEAD, NOMES_ESTADO_LEAD } from "@/lib/leads";
import { origemLead } from "@/lib/mensagens/eventos";
import { formatKz } from "@/lib/money";
import { comPago } from "@/lib/parcelas";
import { NOMES_PERFIL, pode } from "@/lib/rbac";

export const metadata = { title: "Visão Geral" };

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "GA";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
}

export default async function PainelPage() {
  const { user, db } = await exigir("painel:ver");
  const agora = new Date();
  const em7dias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
  const hoje = dataSimples(hojeLocal());

  const verPagamentos = pode(user.perfil, "pagamentos:ver");
  const verFinanceiro = pode(user.perfil, "financeiro:ver");
  const verCampanhas = pode(user.perfil, "campanhas:ver");
  const verLeads = pode(user.perfil, "leads:ver");
  const verMensagens = pode(user.perfil, "mensagens:ver");
  const podeMatricular = pode(user.perfil, "matriculas:editar");

  const [anoHoje, mesHoje] = hojeLocal().split("-");
  const inicioMes = dataSimples(`${anoHoje}-${mesHoje}-01`);

  const [
    nFormacoes,
    nSalas,
    nFormadores,
    nTurmasAtivas,
    nFormandos,
    nLeadsNovos,
    proximas,
    parcelasVencidas,
    entradasMes,
    saidasMes,
    nCampanhasAtivas,
    ultimosPagamentos,
    sessoesRealizadasCount,
    leadsAbertos,
    nMatriculasMes,
    turmasAtivasLista,
  ] = await Promise.all([
    db.formacao.count({ where: { ativa: true } }),
    db.sala.count({ where: { ativa: true } }),
    db.formador.count({ where: { ativo: true } }),
    db.turma.count({ where: { estado: { in: ["PLANEADA", "EM_CURSO"] } } }),
    db.formando.count(),
    verLeads ? db.lead.count({ where: { estado: "NOVO" } }) : 0,
    db.sessao.findMany({
      where: { estado: "AGENDADA", inicio: { gte: agora, lt: em7dias } },
      orderBy: { inicio: "asc" },
      include: {
        turma: { select: { id: true, codigo: true, formacao: { select: { id: true, nome: true } } } },
        formador: { select: { id: true, nome: true } },
        sala: { select: { id: true, nome: true } },
      },
    }),
    verPagamentos
      ? db.parcela.findMany({
          where: { vencimento: { lt: hoje }, matricula: { estado: "ATIVA" } },
          orderBy: { vencimento: "asc" },
          include: {
            alocacoes: { select: { valor: true } },
            matricula: {
              select: {
                id: true,
                formando: { select: { id: true, nome: true, whatsapp: true } },
                turma: { select: { codigo: true, formacao: { select: { nome: true } } } },
              },
            },
          },
        })
      : null,
    verFinanceiro
      ? db.pagamento.aggregate({
          where: { dataPagamento: { gte: inicioMes } },
          _sum: { valor: true },
        })
      : null,
    verFinanceiro
      ? db.despesa.aggregate({
          where: { data: { gte: inicioMes } },
          _sum: { valor: true },
        })
      : null,
    verCampanhas
      ? db.campanha.count({
          where: { estado: { in: ["ATIVA", "ENVIADA"] } },
        })
      : 0,
    verPagamentos
      ? db.pagamento.findMany({
          orderBy: [{ dataPagamento: "desc" }, { createdAt: "desc" }],
          take: 5,
          include: {
            formando: { select: { id: true, nome: true } },
            matricula: { select: { turma: { select: { codigo: true, formacao: { select: { nome: true } } } } } },
          },
        })
      : [],
    verFinanceiro || pode(user.perfil, "agenda:ver")
      ? db.sessao.count({
          where: { estado: "REALIZADA" },
        })
      : 0,
    verLeads
      ? db.lead.findMany({
          where: { estado: { in: ["NOVO", "CONTACTADO"] } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: {
            formacao: { select: { id: true, nome: true } },
            turma: { select: { id: true, codigo: true } },
          },
        })
      : [],
    podeMatricular
      ? db.matricula.count({
          where: { estado: { not: "CANCELADA" }, createdAt: { gte: inicioMes } },
        })
      : 0,
    pode(user.perfil, "agenda:ver")
      ? db.turma.findMany({
          where: { estado: { in: ["PLANEADA", "EM_CURSO"] } },
          orderBy: [{ estado: "desc" }, { codigo: "asc" }],
          include: {
            formacao: { select: { id: true, nome: true, categoria: true } },
            _count: {
              select: {
                matriculas: { where: { estado: { not: "CANCELADA" } } },
                sessoes: { where: { estado: { not: "CANCELADA" } } },
              },
            },
            sessoes: {
              where: { estado: "REALIZADA" },
              select: { id: true },
            },
          },
        })
      : [],
  ]);

  const emAtraso = (parcelasVencidas ?? []).map(comPago).filter((p) => p.pago < p.valor);
  const totalAtraso = emAtraso.reduce((s, p) => s + (p.valor - p.pago), 0n);
  const entradasMesValor = entradasMes?._sum.valor ?? 0n;
  const saidasMesValor = saidasMes?._sum.valor ?? 0n;
  const sobraMes = entradasMesValor - saidasMesValor;

  const [mensagensFalhadas, mensagensPresas] = verMensagens
    ? await Promise.all([
        db.mensagem.count({
          where: { estado: "FALHADA", updatedAt: { gte: new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000) } },
        }),
        db.mensagem.count({
          where: { estado: "PENDENTE", proximaTentativa: { lt: new Date(agora.getTime() - 15 * 60 * 1000) } },
        }),
      ])
    : [0, 0];

  const primeiroNome = user.nome.split(" ")[0];

  /* ═══════════════════════════════════════════════════════════════════════════
   * 1. ECRÃ EXCLUSIVO DO PERFIL FINANCEIRO (Inspirado nas Referências 2, 3 e 4)
   * ═══════════════════════════════════════════════════════════════════════════ */
  if (user.perfil === "FINANCEIRO") {
    const somaBase = entradasMesValor + saidasMesValor + totalAtraso;
    const pctEntradas = somaBase > 0n ? Math.max(18, Number((entradasMesValor * 100n) / somaBase)) : 45;
    const pctSaidas = somaBase > 0n ? Math.max(15, Number((saidasMesValor * 100n) / somaBase)) : 25;
    const pctAtraso = Math.max(15, 100 - pctEntradas - pctSaidas);

    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Coluna Principal */}
        <div className="min-w-0 space-y-6">
          {/* Saudação Editorial */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
                Olá, {primeiroNome} <span aria-hidden>👋</span>
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Panorama de tesouraria, cobranças e honorários de formadores
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/financeiro?tab=despesas"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#1C1D21] px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-zinc-800"
              >
                <Plus className="size-4 text-[#FBD34D]" aria-hidden /> Registar despesa
              </Link>
              <Link
                href="/financeiro"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-zinc-800 shadow-2xs transition-colors hover:bg-zinc-50"
              >
                Abrir Caixa completo <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>

          {mensagensFalhadas > 0 && (
            <Alerta tipo="aviso">
              {mensagensFalhadas} mensagem(ns) de WhatsApp falharam nos últimos 7 dias.{" "}
              <Link href="/mensagens?estado=FALHADA" className="font-semibold underline">
                Ver fila de WhatsApp
              </Link>
            </Alerta>
          )}

          {/* Bloco de Métrica Principal + Pílulas Proporcionais (Referências 2 e 3) */}
          <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-400">Entradas no mês / Saldo operacional líquido</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
                    {formatKz(entradasMesValor)}
                  </span>
                  <span className="text-2xl font-light text-zinc-300">/</span>
                  <span
                    className={`text-2xl font-normal tracking-tight sm:text-3xl ${
                      sobraMes >= 0n ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {sobraMes >= 0n ? `+${formatKz(sobraMes)}` : formatKz(sobraMes)}
                  </span>
                </div>
              </div>

              <span className="rounded-full bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-zinc-600">
                Mês {mesHoje}/{anoHoje}
              </span>
            </div>

            {/* Pílulas Horizontais Proporcionais */}
            <div className="mt-6 grid gap-2.5 sm:grid-cols-12">
              <div className="flex min-w-0 flex-col justify-between sm:col-span-5">
                <span className="mb-1.5 text-xs font-medium text-zinc-500">Entradas recebidas</span>
                <Link
                  href="/financeiro?tab=resumo"
                  className="flex h-12 items-center justify-between rounded-full bg-[#FBD34D] px-5 text-xs font-semibold text-[#1C1D21] transition-transform hover:scale-[1.01]"
                >
                  <span>{pctEntradas}%</span>
                  <span className="truncate font-bold">{formatKz(entradasMesValor)}</span>
                </Link>
              </div>

              <div className="flex min-w-0 flex-col justify-between sm:col-span-4">
                <span className="mb-1.5 text-xs font-medium text-zinc-500">Saídas e despesas</span>
                <Link
                  href="/financeiro?tab=despesas"
                  className="flex h-12 items-center justify-between rounded-full bg-[#1C1D21] px-5 text-xs font-semibold text-white transition-transform hover:scale-[1.01]"
                >
                  <span>{pctSaidas}%</span>
                  <span className="truncate font-bold">{formatKz(saidasMesValor)}</span>
                </Link>
              </div>

              <div className="flex min-w-0 flex-col justify-between sm:col-span-3">
                <span className="mb-1.5 text-xs font-medium text-zinc-500">Em atraso ({emAtraso.length})</span>
                <a
                  href="#cobrancas-prioritarias"
                  className="bg-hatched flex h-12 items-center justify-between rounded-full px-5 text-xs font-semibold text-zinc-800 transition-transform hover:scale-[1.01]"
                >
                  <span>{pctAtraso}%</span>
                  <span className="truncate font-bold">{formatKz(totalAtraso)}</span>
                </a>
              </div>
            </div>
          </div>

          {/* 2 Cartões de Destaque Estilo Art Academy (Referência 4: Dark Card + Yellow Card) */}
          <div className="grid gap-5 md:grid-cols-2">
            {/* Cartão Escuro — Honorários de Formadores */}
            <Link
              href="/financeiro?tab=formadores"
              className="group flex flex-col justify-between rounded-3xl bg-[#1C1D21] p-6 text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold tracking-tight">Honorários de Formadores</h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-[#FBD34D]">
                    {sessoesRealizadasCount} aulas dadas ↗
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  Cálculo automático pelas horas confirmadas como realizadas multiplicadas pelo valor/hora de cada formador.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                <div className="text-xs text-zinc-300">
                  <span className="underline decoration-zinc-500 underline-offset-4 group-hover:text-[#FBD34D]">
                    Apurar e liquidar formadores
                  </span>
                  <div className="mt-1 text-[11px] text-zinc-400">{nFormadores} formadores ativos no centro</div>
                </div>
                <div className="flex -space-x-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-[#FBD34D] text-[11px] font-bold text-[#1C1D21] ring-2 ring-[#1C1D21]">
                    PA
                  </span>
                  <span className="flex size-8 items-center justify-center rounded-full bg-zinc-700 text-[11px] font-bold text-white ring-2 ring-[#1C1D21]">
                    MC
                  </span>
                  <span className="flex size-8 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white ring-2 ring-[#1C1D21]">
                    +{Math.max(1, nFormadores - 2)}
                  </span>
                </div>
              </div>
            </Link>

            {/* Cartão Amarelo Quente — Rentabilidade e Previsão */}
            <Link
              href="/financeiro?tab=formacoes"
              className="group flex flex-col justify-between rounded-3xl bg-[#FBD34D] p-6 text-[#1C1D21] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold tracking-tight">Rentabilidade e Previsão</h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-900/15 bg-white/40 px-3 py-1 text-xs font-semibold text-[#1C1D21]">
                    30 / 60 / 90 dias ↗
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-800/80">
                  Compare a receita recebida por formação com os custos de formadores e consumíveis para proteger a margem.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-zinc-900/10 pt-4">
                <div className="text-xs font-semibold text-zinc-900">
                  <span className="underline decoration-zinc-900/40 underline-offset-4">
                    Ver margem por curso e fluxo de caixa
                  </span>
                  <div className="mt-1 text-[11px] font-normal text-zinc-800/75">
                    {nFormacoes} formações em acompanhamento
                  </div>
                </div>
                <span className="flex size-9 items-center justify-center rounded-full bg-[#1C1D21] text-white transition-transform group-hover:translate-x-0.5">
                  <ArrowUpRight className="size-4" aria-hidden />
                </span>
              </div>
            </Link>
          </div>

          {/* Tabela Diretório de Parcelas em Atraso (5 colunas compactas + 10 em 10) */}
          <div
            id="cobrancas-prioritarias"
            className="rounded-3xl bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] sm:p-6"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-zinc-900">Parcelas em atraso</h2>
                <p className="text-xs text-zinc-400">
                  {emAtraso.length} parcela(s) vencida(s) · Total a cobrar:{" "}
                  <strong className="text-zinc-700">{formatKz(totalAtraso)}</strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/financeiro?tab=previsao"
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Previsão 90 dias
                </Link>
                <a
                  href="/api/relatorios/financeiro?tipo=atrasos"
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <Download className="size-3.5" aria-hidden /> Exportar
                </a>
              </div>
            </div>

            {emAtraso.length === 0 ? (
              <Vazio>Não existem parcelas vencidas de momento.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Formando</Th>
                    <Th>Curso / Parcela</Th>
                    <Th>Vencimento</Th>
                    <Th className="text-right">Em falta</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={5}>
                  {emAtraso.map((p, idx) => {
                    const dividaParcela = p.valor - p.pago;
                    return (
                      <tr
                        key={p.id}
                        className={`transition-colors ${
                          idx === 0 ? "bg-[#FBD34D]/65 hover:bg-[#FBD34D]/80" : "hover:bg-[#FBD34D]/20"
                        }`}
                      >
                        <Td>
                          <Link href={`/formandos/${p.matricula.formando.id}`} className="flex items-center gap-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[11px] font-bold text-[#FBD34D]">
                              {iniciais(p.matricula.formando.nome)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-zinc-900 hover:underline">
                                {p.matricula.formando.nome}
                              </div>
                              <div className="text-[11px] text-zinc-500">{p.matricula.formando.whatsapp}</div>
                            </div>
                          </Link>
                        </Td>
                        <Td>
                          <div className="font-medium text-zinc-800">{p.matricula.turma.formacao.nome}</div>
                          <div className="text-[11px] text-zinc-500">
                            {p.matricula.turma.codigo} · Parcela {p.numero}
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap">
                          <div className="text-xs text-zinc-700">{formatData(p.vencimento)}</div>
                          <div className="mt-0.5">
                            <Badge cor="vermelho">Vencida</Badge>
                          </div>
                        </Td>
                        <Td className="text-right font-semibold whitespace-nowrap text-zinc-900">
                          {formatKz(dividaParcela)}
                        </Td>
                        <Td className="text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/formandos/${p.matricula.formando.id}/pagamento?matriculaId=${p.matricula.id}`}
                              className="inline-flex items-center rounded-full bg-[#1C1D21] px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                            >
                              Receber
                            </Link>
                            <a
                              href={linkWhatsapp(p.matricula.formando.whatsapp)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex size-8 items-center justify-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-emerald-50 hover:text-emerald-700"
                              title="Contactar no WhatsApp"
                            >
                              <MessageCircle className="size-3.5" aria-hidden />
                            </a>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </TbodyProgressivo>
              </Tabela>
            )}
          </div>
        </div>

        {/* Coluna Lateral Direita (Inspirada nas Referências 2 e 4: Profile + Documents + Schedule) */}
        <aside className="space-y-6">
          <div className="overflow-hidden rounded-3xl bg-white shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <div className="h-20 bg-gradient-to-r from-[#1C1D21] via-[#2D2A24] to-[#B4831E]" />
            <div className="px-6 pb-6">
              <div className="-mt-9 flex justify-center">
                <div className="flex size-18 items-center justify-center rounded-full bg-[#FBD34D] text-lg font-extrabold text-[#1C1D21] ring-4 ring-white shadow-sm">
                  {iniciais(user.nome)}
                </div>
              </div>
              <div className="mt-2.5 text-center">
                <h2 className="text-base font-bold text-zinc-900">{user.nome}</h2>
                <p className="text-xs text-zinc-400">
                  {NOMES_PERFIL[user.perfil]} · {user.tenant.nome}
                </p>
              </div>

              <div className="mt-6">
                <div className="text-xs font-semibold text-zinc-900">Resumo do Mês</div>
                <dl className="mt-3 space-y-2.5 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Entradas</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className="font-semibold text-zinc-900">{formatKz(entradasMesValor)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Despesas</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className="font-semibold text-zinc-900">{formatKz(saidasMesValor)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Saldo líquido</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className={`font-bold ${sobraMes >= 0n ? "text-emerald-700" : "text-red-600"}`}>
                      {formatKz(sobraMes)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Em atraso</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className="font-semibold text-red-600">{formatKz(totalAtraso)}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-6">
                <div className="text-xs font-semibold text-zinc-900">Exportar Relatórios</div>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <a
                    href="/api/relatorios/financeiro?tipo=movimentos"
                    className="flex items-center gap-2.5 rounded-2xl bg-[#E8EFF8] p-3 transition-transform hover:scale-[1.02]"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#2B579A] text-white">
                      <FileSpreadsheet className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-zinc-900">Caixa</div>
                      <div className="text-[10px] text-zinc-500">Excel / CSV</div>
                    </div>
                  </a>

                  <a
                    href="/api/relatorios/financeiro?tipo=formadores"
                    className="flex items-center gap-2.5 rounded-2xl bg-[#FCECE6] p-3 transition-transform hover:scale-[1.02]"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#D24726] text-white">
                      <FileSpreadsheet className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-zinc-900">Formadores</div>
                      <div className="text-[10px] text-zinc-500">Excel / CSV</div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900">Últimos Recebimentos</h3>
              <Link href="/financeiro?tab=resumo" className="text-xs font-medium text-zinc-400 hover:text-zinc-900">
                Ver todos
              </Link>
            </div>

            {ultimosPagamentos.length === 0 ? (
              <p className="mt-4 text-xs text-zinc-400">Ainda sem recebimentos registados.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {ultimosPagamentos.map((pg) => (
                  <Link
                    key={pg.id}
                    href={`/formandos/${pg.formando.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#EBF3EE] to-[#FDF6DF] p-3.5 transition-transform hover:scale-[1.01]"
                  >
                    <div className="border-r border-zinc-900/10 pr-3 text-xs font-bold text-zinc-900">
                      {formatData(pg.dataPagamento).slice(0, 5)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-zinc-900">{pg.formando.nome}</div>
                      <div className="truncate text-[11px] text-zinc-500">
                        {pg.matricula.turma.codigo} · {pg.metodo}
                      </div>
                    </div>
                    <div className="text-xs font-extrabold text-emerald-800">+{formatKz(pg.valor)}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/portais"
            className="flex items-center justify-between rounded-3xl bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] transition-colors hover:bg-[#FBD34D]/25"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-[#EEF4FB] text-[#2B579A]">
                <Smartphone className="size-5" aria-hidden />
              </span>
              <div>
                <div className="text-xs font-bold text-zinc-900">Portal</div>
                <div className="text-[11px] text-zinc-400">Fichas, parcelas e links de portal</div>
              </div>
            </div>
            <ArrowUpRight className="size-4 text-zinc-400" aria-hidden />
          </Link>
        </aside>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * 2. ECRÃ EXCLUSIVO DO PERFIL COMERCIAL (Inspirado nas Referências 2, 3 e 4)
   * ═══════════════════════════════════════════════════════════════════════════ */
  if (user.perfil === "COMERCIAL") {
    const somaComercial = leadsAbertos.length + nFormandos + emAtraso.length || 1;
    const pctLeads = Math.max(22, Math.round((leadsAbertos.length / somaComercial) * 100));
    const pctFormandosBar = Math.max(25, Math.round((nFormandos / somaComercial) * 100));
    const pctAtrasoBar = Math.max(15, 100 - pctLeads - pctFormandosBar);

    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Coluna Principal */}
        <div className="min-w-0 space-y-6">
          {/* Saudação Editorial */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
                Olá, {primeiroNome} <span aria-hidden>👋</span>
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Captação de leads, matrículas, acompanhamento de formandos e campanhas
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/matriculas/nova"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#1C1D21] px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-zinc-800"
              >
                <Plus className="size-4 text-[#FBD34D]" aria-hidden /> Nova Matrícula
              </Link>
              <Link
                href="/formandos/novo"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-zinc-800 shadow-2xs transition-colors hover:bg-zinc-50"
              >
                <Plus className="size-3.5" aria-hidden /> Novo Formando
              </Link>
            </div>
          </div>

          {mensagensFalhadas > 0 && (
            <Alerta tipo="aviso">
              {mensagensFalhadas} mensagem(ns) de WhatsApp falharam nos últimos 7 dias.{" "}
              <Link href="/mensagens?estado=FALHADA" className="font-semibold underline">
                Ver fila de WhatsApp
              </Link>
            </Alerta>
          )}

          {/* Bloco de Métrica Principal + Pílulas Proporcionais (Referências 2 e 3) */}
          <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-400">
                  Leads em aberto para contactar / Matrículas realizadas no mês
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
                    {leadsAbertos.length} leads
                  </span>
                  <span className="text-2xl font-light text-zinc-300">/</span>
                  <span className="text-2xl font-normal tracking-tight text-emerald-700 sm:text-3xl">
                    {nMatriculasMes} matrícula(s)
                  </span>
                </div>
              </div>

              <Link
                href={`/p/${user.tenant.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F4EF] px-3.5 py-1.5 text-xs font-medium text-[#1C1D21] hover:bg-[#FBD34D]/50"
              >
                Catálogo /p/{user.tenant.slug} <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </div>

            {/* 3 Pílulas Horizontais Proporcionais */}
            <div className="mt-6 grid gap-2.5 sm:grid-cols-12">
              <div className="flex min-w-0 flex-col justify-between sm:col-span-5">
                <span className="mb-1.5 text-xs font-medium text-zinc-500">Leads novos ({nLeadsNovos})</span>
                <Link
                  href="/leads"
                  className="flex h-12 items-center justify-between rounded-full bg-[#FBD34D] px-5 text-xs font-semibold text-[#1C1D21] transition-transform hover:scale-[1.01]"
                >
                  <span>{pctLeads}%</span>
                  <span className="truncate font-bold">{leadsAbertos.length} em aberto</span>
                </Link>
              </div>

              <div className="flex min-w-0 flex-col justify-between sm:col-span-4">
                <span className="mb-1.5 text-xs font-medium text-zinc-500">Formandos na base</span>
                <Link
                  href="/formandos"
                  className="flex h-12 items-center justify-between rounded-full bg-[#1C1D21] px-5 text-xs font-semibold text-white transition-transform hover:scale-[1.01]"
                >
                  <span>{pctFormandosBar}%</span>
                  <span className="truncate font-bold">{nFormandos} formandos</span>
                </Link>
              </div>

              <div className="flex min-w-0 flex-col justify-between sm:col-span-3">
                <span className="mb-1.5 text-xs font-medium text-zinc-500">Em atraso ({emAtraso.length})</span>
                <a
                  href="#parcelas-comercial"
                  className="bg-hatched flex h-12 items-center justify-between rounded-full px-5 text-xs font-semibold text-zinc-800 transition-transform hover:scale-[1.01]"
                >
                  <span>{pctAtrasoBar}%</span>
                  <span className="truncate font-bold">{formatKz(totalAtraso)}</span>
                </a>
              </div>
            </div>
          </div>

          {/* 2 Cartões de Destaque Estilo Art Academy (Referência 4: Dark Card + Yellow Card) */}
          <div className="grid gap-5 md:grid-cols-2">
            {/* Cartão Escuro — Funil de Leads */}
            <Link
              href="/leads"
              className="group flex flex-col justify-between rounded-3xl bg-[#1C1D21] p-6 text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold tracking-tight">Pré-Cadastros & Leads</h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-[#FBD34D]">
                    {nLeadsNovos} novo(s) ↗
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  Interessados que já aceitaram o preço e as datas na página pública de anúncios e aguardam contacto no WhatsApp.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                <div className="text-xs text-zinc-300">
                  <span className="underline decoration-zinc-500 underline-offset-4 group-hover:text-[#FBD34D]">
                    Converter leads em matrículas
                  </span>
                  <div className="mt-1 text-[11px] text-zinc-400">{nTurmasAtivas} turmas com inscrições abertas</div>
                </div>
                <div className="flex -space-x-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-[#FBD34D] text-[11px] font-bold text-[#1C1D21] ring-2 ring-[#1C1D21]">
                    LD
                  </span>
                  <span className="flex size-8 items-center justify-center rounded-full bg-zinc-700 text-[11px] font-bold text-white ring-2 ring-[#1C1D21]">
                    WA
                  </span>
                  <span className="flex size-8 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white ring-2 ring-[#1C1D21]">
                    +{leadsAbertos.length}
                  </span>
                </div>
              </div>
            </Link>

            {/* Cartão Amarelo Quente — Campanhas e Fidelização */}
            <Link
              href="/campanhas"
              className="group flex flex-col justify-between rounded-3xl bg-[#FBD34D] p-6 text-[#1C1D21] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold tracking-tight">Campanhas e Retenção</h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-900/15 bg-white/40 px-3 py-1 text-xs font-semibold text-[#1C1D21]">
                    {nCampanhasAtivas} ativa(s) ↗
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-800/80">
                  Dispare campanhas sazonais por WhatsApp e aplique descontos de fidelização e pontos de indicação na matrícula.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-zinc-900/10 pt-4">
                <div className="text-xs font-semibold text-zinc-900">
                  <span className="underline decoration-zinc-900/40 underline-offset-4">
                    Gerir promoções e disparos
                  </span>
                  <div className="mt-1 text-[11px] font-normal text-zinc-800/75">
                    {nFormacoes} cursos disponíveis no catálogo
                  </div>
                </div>
                <span className="flex size-9 items-center justify-center rounded-full bg-[#1C1D21] text-white transition-transform group-hover:translate-x-0.5">
                  <ArrowUpRight className="size-4" aria-hidden />
                </span>
              </div>
            </Link>
          </div>

          {/* Tabela Diretório 1: Leads em Aberto (Referência 3, 10 em 10) */}
          <div className="rounded-3xl bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-zinc-900">Leads prontos a contactar</h2>
                <p className="text-xs text-zinc-400">
                  Pré-cadastros qualificados com preço e datas aceites
                </p>
              </div>
              <Link
                href="/leads"
                className="rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Abrir pipeline completo
              </Link>
            </div>

            {leadsAbertos.length === 0 ? (
              <Vazio>Não existem leads pendentes de contacto de momento.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Candidato</Th>
                    <Th>Formação / Turma</Th>
                    <Th>Origem</Th>
                    <Th>Estado</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={5}>
                  {leadsAbertos.map((l, idx) => (
                    <tr
                      key={l.id}
                      className={`transition-colors ${
                        idx === 0 ? "bg-[#FBD34D]/65 hover:bg-[#FBD34D]/80" : "hover:bg-[#FBD34D]/20"
                      }`}
                    >
                      <Td>
                        <Link href={`/leads/${l.id}`} className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[11px] font-bold text-[#FBD34D]">
                            {iniciais(l.nome)}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-zinc-900 hover:underline">{l.nome}</div>
                            <div className="text-[11px] text-zinc-500">{l.whatsapp}</div>
                          </div>
                        </Link>
                      </Td>
                      <Td>
                        <div className="font-medium text-zinc-800">{l.formacao.nome}</div>
                        <div className="text-[11px] text-zinc-500">
                          {l.turma ? `Turma ${l.turma.codigo}` : "Qualquer turma"} · {formatKz(l.precoApresentado)}
                        </div>
                      </Td>
                      <Td className="text-xs text-zinc-600">{origemLead(l)}</Td>
                      <Td>
                        <Badge cor={CORES_ESTADO_LEAD[l.estado]}>{NOMES_ESTADO_LEAD[l.estado]}</Badge>
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/leads/${l.id}`}
                            className="inline-flex items-center rounded-full bg-[#1C1D21] px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                          >
                            Converter
                          </Link>
                          <a
                            href={linkWhatsapp(l.whatsapp)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex size-8 items-center justify-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-emerald-50 hover:text-emerald-700"
                            title="Contactar no WhatsApp"
                          >
                            <MessageCircle className="size-3.5" aria-hidden />
                          </a>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </TbodyProgressivo>
              </Tabela>
            )}
          </div>

          {/* Tabela Diretório 2: Parcelas em Atraso (5 colunas compactas + 10 em 10) */}
          <div
            id="parcelas-comercial"
            className="rounded-3xl bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] sm:p-6"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-zinc-900">Parcelas em atraso</h2>
                <p className="text-xs text-zinc-400">
                  {emAtraso.length} parcela(s) vencida(s) · Total em aberto:{" "}
                  <strong className="text-zinc-700">{formatKz(totalAtraso)}</strong>
                </p>
              </div>
              <Link
                href="/formandos?atraso=1"
                className="rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Ver formandos em atraso
              </Link>
            </div>

            {emAtraso.length === 0 ? (
              <Vazio>Não existem parcelas vencidas de momento.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Formando</Th>
                    <Th>Curso / Parcela</Th>
                    <Th>Vencimento</Th>
                    <Th className="text-right">Em falta</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={5}>
                  {emAtraso.map((p) => {
                    const dividaParcela = p.valor - p.pago;
                    return (
                      <tr key={p.id} className="transition-colors hover:bg-[#FBD34D]/20">
                        <Td>
                          <Link href={`/formandos/${p.matricula.formando.id}`} className="flex items-center gap-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F5F4EF] text-[11px] font-bold text-[#1C1D21]">
                              {iniciais(p.matricula.formando.nome)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-zinc-900 hover:underline">
                                {p.matricula.formando.nome}
                              </div>
                              <div className="text-[11px] text-zinc-500">{p.matricula.formando.whatsapp}</div>
                            </div>
                          </Link>
                        </Td>
                        <Td>
                          <div className="font-medium text-zinc-800">{p.matricula.turma.formacao.nome}</div>
                          <div className="text-[11px] text-zinc-500">
                            {p.matricula.turma.codigo} · Parcela {p.numero}
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap">
                          <div className="text-xs text-zinc-700">{formatData(p.vencimento)}</div>
                          <div className="mt-0.5">
                            <Badge cor="vermelho">Vencida</Badge>
                          </div>
                        </Td>
                        <Td className="text-right font-semibold whitespace-nowrap text-zinc-900">
                          {formatKz(dividaParcela)}
                        </Td>
                        <Td className="text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/formandos/${p.matricula.formando.id}/pagamento?matriculaId=${p.matricula.id}`}
                              className="inline-flex items-center rounded-full bg-[#1C1D21] px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                            >
                              Receber
                            </Link>
                            <a
                              href={linkWhatsapp(p.matricula.formando.whatsapp)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex size-8 items-center justify-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-emerald-50 hover:text-emerald-700"
                              title="Contactar no WhatsApp"
                            >
                              <MessageCircle className="size-3.5" aria-hidden />
                            </a>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </TbodyProgressivo>
              </Tabela>
            )}
          </div>
        </div>

        {/* Coluna Lateral Direita Comercial (Referências 2 e 4) */}
        <aside className="space-y-6">
          <div className="overflow-hidden rounded-3xl bg-white shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <div className="h-20 bg-gradient-to-r from-[#1C1D21] via-[#2D2A24] to-[#B4831E]" />
            <div className="px-6 pb-6">
              <div className="-mt-9 flex justify-center">
                <div className="flex size-18 items-center justify-center rounded-full bg-[#FBD34D] text-lg font-extrabold text-[#1C1D21] ring-4 ring-white shadow-sm">
                  {iniciais(user.nome)}
                </div>
              </div>
              <div className="mt-2.5 text-center">
                <h2 className="text-base font-bold text-zinc-900">{user.nome}</h2>
                <p className="text-xs text-zinc-400">
                  {NOMES_PERFIL[user.perfil]} · {user.tenant.nome}
                </p>
              </div>

              <div className="mt-6">
                <div className="text-xs font-semibold text-zinc-900">Metas e Atividade</div>
                <dl className="mt-3 space-y-2.5 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Leads novos</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className="font-semibold text-zinc-900">{nLeadsNovos}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Matrículas (mês)</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className="font-bold text-emerald-700">{nMatriculasMes}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Turmas abertas</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className="font-semibold text-zinc-900">{nTurmasAtivas}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Campanhas ativas</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className="font-semibold text-zinc-900">{nCampanhasAtivas}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-6">
                <div className="text-xs font-semibold text-zinc-900">Atalhos de Venda</div>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <Link
                    href="/matriculas/nova"
                    className="flex items-center gap-2.5 rounded-2xl bg-[#E8EFF8] p-3 transition-transform hover:scale-[1.02]"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#2B579A] text-white">
                      <Plus className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-zinc-900">Matricular</div>
                      <div className="text-[10px] text-zinc-500">Inscrição</div>
                    </div>
                  </Link>

                  <Link
                    href={`/p/${user.tenant.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-2xl bg-[#FCECE6] p-3 transition-transform hover:scale-[1.02]"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#D24726] text-white">
                      <ExternalLink className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-zinc-900">Catálogo</div>
                      <div className="text-[10px] text-zinc-500">Página pública</div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Próximas Aulas (Estilo Schedule da Referência 4) */}
          <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900">Próximas Aulas (7 dias)</h3>
              <Link href="/agenda" className="text-xs font-medium text-zinc-400 hover:text-zinc-900">
                Calendário
              </Link>
            </div>

            {proximas.length === 0 ? (
              <p className="mt-4 text-xs text-zinc-400">Sem aulas agendadas nos próximos 7 dias.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {proximas.slice(0, 5).map((s) => (
                  <Link
                    key={s.id}
                    href={`/turmas/${s.turma.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#EBF3EE] to-[#FDF6DF] p-3.5 transition-transform hover:scale-[1.01]"
                  >
                    <div className="border-r border-zinc-900/10 pr-3 text-xs font-bold text-zinc-900">
                      {formatHora(s.inicio)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-zinc-900">{s.turma.formacao.nome}</div>
                      <div className="truncate text-[11px] text-zinc-500">
                        {formatDiaSemana(s.inicio).split(",")[0]} · {s.turma.codigo} · {s.sala.nome}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/portais"
            className="flex items-center justify-between rounded-3xl bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] transition-colors hover:bg-[#FBD34D]/25"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-[#EEF4FB] text-[#2B579A]">
                <Smartphone className="size-5" aria-hidden />
              </span>
              <div>
                <div className="text-xs font-bold text-zinc-900">Portal</div>
                <div className="text-[11px] text-zinc-400">Links móveis dos formandos</div>
              </div>
            </div>
            <ArrowUpRight className="size-4 text-zinc-400" aria-hidden />
          </Link>
        </aside>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * 3. ECRÃ EXCLUSIVO DO PERFIL COORDENAÇÃO PEDAGÓGICA (Inspirado nas Referências 2, 3 e 4)
   * ═══════════════════════════════════════════════════════════════════════════ */
  if (user.perfil === "PEDAGOGICO") {
    const somaRecursos = Math.max(1, nTurmasAtivas + nFormadores + nSalas);
    const pctTurmas = Math.max(20, Math.round((nTurmasAtivas * 100) / somaRecursos));
    const pctFormadores = Math.max(20, Math.round((nFormadores * 100) / somaRecursos));
    const pctSalas = Math.max(15, 100 - pctTurmas - pctFormadores);

    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Coluna Principal */}
        <div className="min-w-0 space-y-6">
          {/* Saudação Editorial */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
                Olá, {primeiroNome} <span aria-hidden>👋</span>
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Coordenação pedagógica de turmas, calendário de sessões, corpo docente e salas
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/turmas/nova"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#1C1D21] px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-zinc-800"
              >
                <Plus className="size-4 text-[#FBD34D]" aria-hidden /> Nova turma
              </Link>
              <Link
                href="/formadores/novo"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-zinc-800 shadow-2xs transition-colors hover:bg-zinc-50"
              >
                + Novo formador
              </Link>
              <Link
                href="/formacoes/nova"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-zinc-800 shadow-2xs transition-colors hover:bg-zinc-50"
              >
                + Nova formação
              </Link>
            </div>
          </div>

          {/* Bloco de Métrica Principal + Pílulas Proporcionais (Referências 2 e 3) */}
          <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-zinc-400">
                  Turmas ativas (em curso ou planeadas) / Sessões nos próximos 7 dias
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
                    {nTurmasAtivas} {nTurmasAtivas === 1 ? "turma" : "turmas"}
                  </span>
                  <span className="text-2xl font-light text-zinc-300">/</span>
                  <span className="text-2xl font-normal tracking-tight text-zinc-700 sm:text-3xl">
                    {proximas.length} {proximas.length === 1 ? "aula" : "aulas"} (7d)
                  </span>
                </div>
              </div>

              <span className="rounded-full bg-[#FAF9F5] px-3.5 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/80">
                {nFormacoes} formações ativas · {sessoesRealizadasCount} aulas realizadas
              </span>
            </div>

            {/* 3 Barras Horizontais Proporcionais */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div style={{ flex: pctTurmas }} className="min-w-[140px]">
                <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                  <span>Turmas abertas e em curso</span>
                  <span className="font-semibold text-zinc-800">{nTurmasAtivas} ativa(s)</span>
                </div>
                <div className="flex h-11 items-center justify-between rounded-2xl bg-[#FBD34D] px-4 text-xs font-bold text-[#1C1D21]">
                  <span>Edições ativas</span>
                  <span>{pctTurmas}%</span>
                </div>
              </div>

              <div style={{ flex: pctFormadores }} className="min-w-[140px]">
                <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                  <span>Equipa de formadores</span>
                  <span className="font-semibold text-zinc-800">{nFormadores} ativo(s)</span>
                </div>
                <div className="flex h-11 items-center justify-between rounded-2xl bg-[#1C1D21] px-4 text-xs font-semibold text-white">
                  <span>Corpo docente</span>
                  <span>{pctFormadores}%</span>
                </div>
              </div>

              <div style={{ flex: pctSalas }} className="min-w-[130px]">
                <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                  <span>Salas e laboratórios</span>
                  <span className="font-semibold text-zinc-700">{nSalas} sala(s)</span>
                </div>
                <div className="bg-hatched flex h-11 items-center justify-between rounded-2xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800">
                  <span>Espaços</span>
                  <span>{pctSalas}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2 Cartões de Destaque em Par (Referência 4 — Art Academy) */}
          <div className="grid gap-5 md:grid-cols-2">
            {/* Cartão Escuro: Turmas & Calendário */}
            <div className="flex flex-col justify-between rounded-3xl bg-[#1C1D21] p-6 text-white shadow-sm">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-[#FBD34D]">
                    Planeamento & Horários
                  </span>
                  <Link
                    href="/agenda"
                    className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-[#FBD34D] hover:text-[#1C1D21]"
                    aria-label="Abrir calendário"
                  >
                    <CalendarDays className="size-4" aria-hidden />
                  </Link>
                </div>

                <h2 className="mt-4 text-xl font-bold tracking-tight">Turmas & Calendário</h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Planeie edições de cursos, gere grelhas automáticas de sessões e valide ocupação de salas sem conflitos.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <div className="text-[11px] text-zinc-400">Próximos 7 dias</div>
                  <div className="text-lg font-bold text-[#FBD34D]">
                    {proximas.length} {proximas.length === 1 ? "sessão agendada" : "sessões agendadas"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/turmas"
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                  >
                    Turmas
                  </Link>
                  <Link
                    href="/agenda"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#FBD34D] px-4 py-2 text-xs font-bold text-[#1C1D21] transition-transform hover:scale-[1.02]"
                  >
                    Calendário <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>

            {/* Cartão Amarelo Quente: Corpo Docente & Catálogo */}
            <div className="flex flex-col justify-between rounded-3xl bg-[#FBD34D] p-6 text-[#1C1D21] shadow-sm">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-[#1C1D21]/10 px-3 py-1 text-[11px] font-bold text-[#1C1D21]">
                    Qualidade Pedagógica
                  </span>
                  <Link
                    href="/formadores"
                    className="flex size-9 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D] transition-transform hover:scale-105"
                    aria-label="Abrir formadores"
                  >
                    <GraduationCap className="size-4" aria-hidden />
                  </Link>
                </div>

                <h2 className="mt-4 text-xl font-bold tracking-tight">Corpo Docente & Catálogo</h2>
                <p className="mt-1 text-xs leading-relaxed text-[#1C1D21]/75">
                  Acompanhe competências, avaliações de desempenho em 5 critérios, valores/hora e o catálogo de formações.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#1C1D21]/10 pt-4">
                <div>
                  <div className="text-[11px] font-medium text-[#1C1D21]/70">Equipa e cursos</div>
                  <div className="text-lg font-bold text-[#1C1D21]">
                    {nFormadores} formadores · {nFormacoes} cursos
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/formacoes"
                    className="inline-flex items-center gap-1 rounded-full bg-[#1C1D21]/10 px-3.5 py-2 text-xs font-bold text-[#1C1D21] transition-colors hover:bg-[#1C1D21]/20"
                  >
                    Catálogo
                  </Link>
                  <Link
                    href="/formadores"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#1C1D21] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800"
                  >
                    Formadores <ArrowUpRight className="size-3.5 text-[#FBD34D]" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Tabela Diretório 1: Próximas Sessões Agendadas (7 dias) */}
          <Card>
            <CardHeader
              titulo={`Próximas Sessões Agendadas (${proximas.length})`}
              descricao="Aulas previstas para os próximos 7 dias em todas as turmas."
              acoes={
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/agenda"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#FAF9F5] px-3.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200/80 transition-colors hover:bg-[#FBD34D]/30"
                  >
                    <CalendarDays className="size-3.5" aria-hidden /> Calendário mensal
                  </Link>
                </div>
              }
            />
            {proximas.length === 0 ? (
              <Vazio>Sem sessões agendadas para os próximos 7 dias.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Data / Hora</Th>
                    <Th>Formação / Turma</Th>
                    <Th>Formador</Th>
                    <Th>Sala</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={5}>
                  {proximas.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-[#FBD34D]/10">
                      <Td className="whitespace-nowrap">
                        <div className="font-semibold text-zinc-900">{formatDiaSemana(s.inicio)}</div>
                        <div className="text-[11px] text-zinc-500">
                          {formatHora(s.inicio)}–{formatHora(s.fim)}
                        </div>
                      </Td>
                      <Td>
                        <Link
                          href={`/turmas/${s.turma.id}`}
                          className="font-semibold text-zinc-900 hover:underline"
                        >
                          {s.turma.formacao.nome}
                        </Link>
                        <div className="text-[11px] text-zinc-500">Turma {s.turma.codigo}</div>
                      </Td>
                      <Td>
                        <Link
                          href={`/formadores/${s.formador.id}`}
                          className="inline-flex items-center gap-2 font-medium text-zinc-800 hover:underline"
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[10px] font-bold text-[#FBD34D]">
                            {iniciais(s.formador.nome)}
                          </span>
                          <span className="truncate">{s.formador.nome}</span>
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="rounded-full bg-[#FAF9F5] px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200/80">
                          {s.sala.nome}
                        </span>
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <Link
                          href={`/turmas/${s.turma.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-[#1C1D21] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800"
                        >
                          Abrir turma <ArrowUpRight className="size-3.5 text-[#FBD34D]" aria-hidden />
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </TbodyProgressivo>
              </Tabela>
            )}
          </Card>

          {/* Tabela Diretório 2: Turmas Ativas — Ocupação e Progresso */}
          <Card>
            <CardHeader
              titulo={`Turmas Ativas e Planeadas (${turmasAtivasLista.length})`}
              descricao="Acompanhamento de vagas ocupadas e avanço de sessões por edição."
              acoes={
                <Link
                  href="/turmas"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#1C1D21] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800"
                >
                  Ver todas <ArrowUpRight className="size-3.5 text-[#FBD34D]" aria-hidden />
                </Link>
              }
            />
            {turmasAtivasLista.length === 0 ? (
              <Vazio>Não existem turmas planeadas ou em curso de momento.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Turma</Th>
                    <Th>Formação</Th>
                    <Th>Ocupação</Th>
                    <Th>Progresso de Aulas</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <TbodyProgressivo passo={10} colSpan={5}>
                  {turmasAtivasLista.map((t) => {
                    const inscritos = t._count.matriculas;
                    const totalSessoes = t._count.sessoes;
                    const concluidas = t.sessoes.length;
                    const pctAulas = totalSessoes > 0 ? Math.min(100, Math.round((concluidas * 100) / totalSessoes)) : 0;

                    return (
                      <tr key={t.id} className="transition-colors hover:bg-[#FBD34D]/10">
                        <Td className="whitespace-nowrap">
                          <Link href={`/turmas/${t.id}`} className="font-bold text-zinc-900 hover:underline">
                            {t.codigo}
                          </Link>
                          <div className="mt-0.5">
                            <Badge cor={t.estado === "EM_CURSO" ? "verde" : "azul"}>
                              {t.estado === "EM_CURSO" ? "Em curso" : "Planeada"}
                            </Badge>
                          </div>
                        </Td>
                        <Td>
                          <Link href={`/formacoes/${t.formacao.id}`} className="font-medium text-zinc-800 hover:underline">
                            {t.formacao.nome}
                          </Link>
                        </Td>
                        <Td className="whitespace-nowrap">
                          <span className="font-semibold text-zinc-900">
                            {inscritos}
                            {t.vagas ? ` / ${t.vagas}` : ""}
                          </span>{" "}
                          <span className="text-xs text-zinc-400">formandos</span>
                        </Td>
                        <Td>
                          <div className="max-w-[160px] space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-zinc-800">
                                {concluidas}/{totalSessoes} aulas
                              </span>
                              <span className="text-zinc-400">{pctAulas}%</span>
                            </div>
                            <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-100">
                              <div className="bg-[#FBD34D]" style={{ width: `${pctAulas}%` }} />
                              <div className="bg-[#1C1D21]" style={{ width: `${Math.max(0, 100 - pctAulas)}%` }} />
                            </div>
                          </div>
                        </Td>
                        <Td className="text-right whitespace-nowrap">
                          <Link
                            href={`/turmas/${t.id}`}
                            className="inline-flex items-center gap-1 rounded-full bg-[#FAF9F5] px-3 py-1.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200/80 transition-colors hover:bg-[#FBD34D]"
                          >
                            Gerir <ArrowUpRight className="size-3.5" aria-hidden />
                          </Link>
                        </Td>
                      </tr>
                    );
                  })}
                </TbodyProgressivo>
              </Tabela>
            )}
          </Card>
        </div>

        {/* Coluna Lateral Direita Pedagógica (Padronizada com Financeiro e Comercial) */}
        <aside className="space-y-6">
          <div className="overflow-hidden rounded-3xl bg-white shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <div className="h-20 bg-gradient-to-r from-[#1C1D21] via-[#2D2A24] to-[#B4831E]" />
            <div className="px-6 pb-6">
              <div className="-mt-9 flex justify-center">
                <div className="flex size-18 items-center justify-center rounded-full bg-[#FBD34D] text-lg font-extrabold text-[#1C1D21] ring-4 ring-white shadow-sm">
                  {iniciais(user.nome)}
                </div>
              </div>
              <div className="mt-2.5 text-center">
                <h2 className="text-base font-bold text-zinc-900">{user.nome}</h2>
                <p className="text-xs text-zinc-400">
                  {NOMES_PERFIL[user.perfil]} · {user.tenant.nome}
                </p>
              </div>

              <div className="mt-6">
                <div className="text-xs font-semibold text-zinc-900">Resumo Pedagógico</div>
                <dl className="mt-3 space-y-2.5 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Formações em catálogo</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className="font-semibold text-zinc-900">{nFormacoes}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Turmas ativas</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className="font-semibold text-zinc-900">{nTurmasAtivas}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Formadores ativos</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className="font-bold text-emerald-700">{nFormadores}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-zinc-400">Salas disponíveis</dt>
                    <span className="flex-1 border-b border-dotted border-zinc-200" />
                    <dd className="font-semibold text-zinc-900">{nSalas}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-6">
                <div className="text-xs font-semibold text-zinc-900">Atalhos Pedagógicos</div>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <Link
                    href="/turmas/nova"
                    className="flex items-center gap-2.5 rounded-2xl bg-[#E8EFF8] p-3 transition-transform hover:scale-[1.02]"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#2B579A] text-white">
                      <Plus className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-zinc-900">Turma</div>
                      <div className="text-[10px] text-zinc-500">Criar edição</div>
                    </div>
                  </Link>

                  <Link
                    href="/salas"
                    className="flex items-center gap-2.5 rounded-2xl bg-[#FCECE6] p-3 transition-transform hover:scale-[1.02]"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#D24726] text-white">
                      <DoorOpen className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-zinc-900">Salas</div>
                      <div className="text-[10px] text-zinc-500">Gerir espaços</div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Próximas Aulas (Estilo Schedule da Referência 4, igual ao Comercial) */}
          <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900">Próximas Aulas (7 dias)</h3>
              <Link href="/agenda" className="text-xs font-medium text-zinc-400 hover:text-zinc-900">
                Calendário
              </Link>
            </div>

            {proximas.length === 0 ? (
              <p className="mt-4 text-xs text-zinc-400">Sem aulas agendadas nos próximos 7 dias.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {proximas.slice(0, 5).map((s) => (
                  <Link
                    key={s.id}
                    href={`/turmas/${s.turma.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#EBF3EE] to-[#FDF6DF] p-3.5 transition-transform hover:scale-[1.01]"
                  >
                    <div className="border-r border-zinc-900/10 pr-3 text-xs font-bold text-zinc-900">
                      {formatHora(s.inicio)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-zinc-900">{s.turma.formacao.nome}</div>
                      <div className="truncate text-[11px] text-zinc-500">
                        {formatDiaSemana(s.inicio)} · {s.turma.codigo} · {s.sala.nome}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Atalho Rápido para o Portal */}
          <Link
            href="/portais"
            className="flex items-center justify-between rounded-3xl bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] transition-colors hover:bg-[#FBD34D]/25"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-[#EEF4FB] text-[#2B579A]">
                <Smartphone className="size-5" aria-hidden />
              </span>
              <div>
                <div className="text-xs font-bold text-zinc-900">Portal</div>
                <div className="text-[11px] text-zinc-400">Links móveis de formadores e formandos</div>
              </div>
            </div>
            <ArrowUpRight className="size-4 text-zinc-400" aria-hidden />
          </Link>
        </aside>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * 4. ECRÃ EXCLUSIVO DO PERFIL ADMINISTRAÇÃO (Inspirado nas Referências 2, 3 e 4)
   * ═══════════════════════════════════════════════════════════════════════════ */
  const somaAdmin = entradasMesValor + saidasMesValor + totalAtraso;
  const pctEntradasAdmin = somaAdmin > 0n ? Math.max(22, Number((entradasMesValor * 100n) / somaAdmin)) : 45;
  const pctSaidasAdmin = somaAdmin > 0n ? Math.max(18, Number((saidasMesValor * 100n) / somaAdmin)) : 30;
  const pctAtrasoAdmin = Math.max(15, 100 - pctEntradasAdmin - pctSaidasAdmin);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* Coluna Principal */}
      <div className="min-w-0 space-y-6">
        {/* Saudação Editorial */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
              Olá, {primeiroNome} <span aria-hidden>👋</span>
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Direção geral de tesouraria, vendas, ensino e equipa de <strong>{user.tenant.nome}</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/matriculas/nova"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#1C1D21] px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-zinc-800"
            >
              <Plus className="size-4 text-[#FBD34D]" aria-hidden /> Nova matrícula
            </Link>
            <Link
              href="/financeiro"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-zinc-800 shadow-2xs transition-colors hover:bg-zinc-50"
            >
              Caixa e Finanças <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
            <Link
              href="/configuracoes"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-zinc-800 shadow-2xs transition-colors hover:bg-zinc-50"
            >
              <Settings className="size-3.5 text-zinc-500" aria-hidden /> Configurações
            </Link>
          </div>
        </div>

        {mensagensFalhadas > 0 && (
          <Alerta tipo="aviso">
            {mensagensFalhadas === 1
              ? "1 mensagem de WhatsApp falhou nos últimos 7 dias."
              : `${mensagensFalhadas} mensagens de WhatsApp falharam nos últimos 7 dias.`}{" "}
            <Link href="/mensagens?estado=FALHADA" className="font-semibold underline">
              Ver fila de WhatsApp
            </Link>
          </Alerta>
        )}

        {mensagensPresas > 0 && (
          <Alerta tipo="aviso">
            Há {mensagensPresas} mensagem(ns) pendente(s) há mais de 15 min.{" "}
            <Link href="/mensagens?estado=PENDENTE" className="font-semibold underline">
              Verificar fila
            </Link>
          </Alerta>
        )}

        {/* Bloco de Métrica Principal + 3 Pílulas Proporcionais (Referências 2 e 3) */}
        <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-zinc-400">
                Receita cobrada no mês / Saldo operacional líquido
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
                  {formatKz(entradasMesValor)}
                </span>
                <span className="text-2xl font-light text-zinc-300">/</span>
                <span
                  className={`text-2xl font-normal tracking-tight sm:text-3xl ${
                    sobraMes >= 0n ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {sobraMes >= 0n ? `+${formatKz(sobraMes)}` : formatKz(sobraMes)}
                </span>
              </div>
            </div>

            <span className="rounded-full bg-[#FAF9F5] px-3.5 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/80">
              {nTurmasAtivas} turmas · {nFormandos} formandos · {nMatriculasMes} matrículas no mês
            </span>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div style={{ flex: pctEntradasAdmin }} className="min-w-[140px]">
              <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                <span>Entradas no mês</span>
                <span className="font-semibold text-zinc-800">{formatKz(entradasMesValor)}</span>
              </div>
              <div className="flex h-11 items-center justify-between rounded-2xl bg-[#FBD34D] px-4 text-xs font-bold text-[#1C1D21]">
                <span>Receita</span>
                <span>{pctEntradasAdmin}%</span>
              </div>
            </div>

            <div style={{ flex: pctSaidasAdmin }} className="min-w-[140px]">
              <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                <span>Despesas no mês</span>
                <span className="font-semibold text-zinc-800">{formatKz(saidasMesValor)}</span>
              </div>
              <div className="flex h-11 items-center justify-between rounded-2xl bg-[#1C1D21] px-4 text-xs font-semibold text-white">
                <span>Saídas</span>
                <span>{pctSaidasAdmin}%</span>
              </div>
            </div>

            <div style={{ flex: pctAtrasoAdmin }} className="min-w-[130px]">
              <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                <span>Parcelas vencidas</span>
                <span className="font-semibold text-red-600">{formatKz(totalAtraso)}</span>
              </div>
              <div className="bg-hatched flex h-11 items-center justify-between rounded-2xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800">
                <span>{emAtraso.length} em atraso</span>
                <span>{pctAtrasoAdmin}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2 Cartões de Destaque em Par (Referência 4 — Art Academy) */}
        <div className="grid gap-5 md:grid-cols-2">
          {/* Cartão Escuro: Tesouraria, Vendas & Captação */}
          <div className="flex flex-col justify-between rounded-3xl bg-[#1C1D21] p-6 text-white shadow-sm">
            <div>
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-[#FBD34D]">
                  Finanças & Comercial
                </span>
                <Link
                  href="/financeiro"
                  className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-[#FBD34D] hover:text-[#1C1D21]"
                  aria-label="Abrir Caixa e Finanças"
                >
                  <Wallet className="size-4" aria-hidden />
                </Link>
              </div>

              <h2 className="mt-4 text-xl font-bold tracking-tight">Tesouraria & Funil Comercial</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Controlo de recebimentos, despesas por categoria, honorários de formadores, leads e campanhas ativas.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div>
                <div className="text-[11px] text-zinc-400">Pipeline & Campanhas</div>
                <div className="text-lg font-bold text-[#FBD34D]">
                  {nLeadsNovos} lead(s) novo(s) · {nCampanhasAtivas} campanha(s)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/leads"
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                >
                  Leads
                </Link>
                <Link
                  href="/financeiro"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#FBD34D] px-4 py-2 text-xs font-bold text-[#1C1D21] transition-transform hover:scale-[1.02]"
                >
                  Caixa <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          </div>

          {/* Cartão Amarelo Quente: Ensino, Turmas & Corpo Docente */}
          <div className="flex flex-col justify-between rounded-3xl bg-[#FBD34D] p-6 text-[#1C1D21] shadow-sm">
            <div>
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-[#1C1D21]/10 px-3 py-1 text-[11px] font-bold text-[#1C1D21]">
                  Coordenação & Ensino
                </span>
                <Link
                  href="/turmas"
                  className="flex size-9 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D] transition-transform hover:scale-105"
                  aria-label="Abrir Turmas"
                >
                  <GraduationCap className="size-4" aria-hidden />
                </Link>
              </div>

              <h2 className="mt-4 text-xl font-bold tracking-tight">Ensino, Agenda & Corpo Docente</h2>
              <p className="mt-1 text-xs leading-relaxed text-[#1C1D21]/75">
                Supervisione o catálogo de formações, ocupação de turmas, calendário de salas e desempenho dos formadores.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#1C1D21]/10 pt-4">
              <div>
                <div className="text-[11px] font-medium text-[#1C1D21]/70">Capacidade ativa</div>
                <div className="text-lg font-bold text-[#1C1D21]">
                  {nTurmasAtivas} turmas · {nFormadores} formadores
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/formadores"
                  className="inline-flex items-center gap-1 rounded-full bg-[#1C1D21]/10 px-3.5 py-2 text-xs font-bold text-[#1C1D21] transition-colors hover:bg-[#1C1D21]/20"
                >
                  Formadores
                </Link>
                <Link
                  href="/turmas"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1C1D21] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800"
                >
                  Turmas <ArrowUpRight className="size-3.5 text-[#FBD34D]" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Tabela Diretório 1: Parcelas em Atraso (10 em 10, sem scroll horizontal) */}
        <Card>
          <CardHeader
            titulo={`Parcelas em Atraso (${emAtraso.length})`}
            descricao="Prestações vencidas de matrículas ativas que requerem cobrança ou regularização."
            acoes={
              <Link
                href="/financeiro"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#FAF9F5] px-3.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200/80 transition-colors hover:bg-[#FBD34D]/30"
              >
                Abrir Caixa <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {emAtraso.length === 0 ? (
            <Vazio>Excelente — não existem parcelas em atraso de momento.</Vazio>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Formando</Th>
                  <Th>Turma / Parc.</Th>
                  <Th>Venceu</Th>
                  <Th className="text-right">Em Dívida</Th>
                  <Th className="text-right">Ação</Th>
                </tr>
              </thead>
              <TbodyProgressivo passo={10} colSpan={5}>
                {emAtraso.map((p) => {
                  const emFalta = p.valor - p.pago;
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-[#FBD34D]/10">
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[11px] font-bold text-[#FBD34D]">
                            {iniciais(p.matricula.formando.nome)}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/formandos/${p.matricula.formando.id}`}
                              className="block truncate font-semibold text-zinc-900 hover:underline"
                            >
                              {p.matricula.formando.nome}
                            </Link>
                            <div className="truncate font-mono text-[11px] text-zinc-400">
                              {p.matricula.formando.whatsapp}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <div className="font-semibold text-zinc-800">{p.matricula.turma.codigo}</div>
                        <div className="text-[11px] text-zinc-400">Parcela {p.numero}</div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <Badge cor="vermelho">{formatData(p.vencimento)}</Badge>
                      </Td>
                      <Td className="text-right font-bold whitespace-nowrap text-red-600">{formatKz(emFalta)}</Td>
                      <Td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/formandos/${p.matricula.formando.id}/pagamento?matriculaId=${p.matricula.id}`}
                            className="inline-flex items-center rounded-full bg-[#1C1D21] px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                          >
                            Receber
                          </Link>
                          <a
                            href={linkWhatsapp(p.matricula.formando.whatsapp)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex size-8 items-center justify-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-emerald-50 hover:text-emerald-700"
                            title="Contactar no WhatsApp"
                          >
                            <MessageCircle className="size-3.5" aria-hidden />
                          </a>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </TbodyProgressivo>
            </Tabela>
          )}
        </Card>

        {/* Tabela Diretório 2: Próximas Sessões Agendadas (7 dias, 10 em 10) */}
        <Card>
          <CardHeader
            titulo={`Próximas Sessões Agendadas (${proximas.length})`}
            descricao="Aulas previstas nos próximos 7 dias em todas as turmas."
            acoes={
              <Link
                href="/agenda"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#FAF9F5] px-3.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200/80 transition-colors hover:bg-[#FBD34D]/30"
              >
                <CalendarDays className="size-3.5" aria-hidden /> Calendário
              </Link>
            }
          />
          {proximas.length === 0 ? (
            <Vazio>Sem sessões agendadas para os próximos 7 dias.</Vazio>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Data / Hora</Th>
                  <Th>Formação / Turma</Th>
                  <Th>Formador</Th>
                  <Th>Sala</Th>
                  <Th className="text-right">Ação</Th>
                </tr>
              </thead>
              <TbodyProgressivo passo={10} colSpan={5}>
                {proximas.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-[#FBD34D]/10">
                    <Td className="whitespace-nowrap">
                      <div className="font-semibold text-zinc-900">{formatDiaSemana(s.inicio)}</div>
                      <div className="text-[11px] text-zinc-500">
                        {formatHora(s.inicio)}–{formatHora(s.fim)}
                      </div>
                    </Td>
                    <Td>
                      <Link href={`/turmas/${s.turma.id}`} className="font-semibold text-zinc-900 hover:underline">
                        {s.turma.formacao.nome}
                      </Link>
                      <div className="text-[11px] text-zinc-500">Turma {s.turma.codigo}</div>
                    </Td>
                    <Td>
                      <Link
                        href={`/formadores/${s.formador.id}`}
                        className="inline-flex items-center gap-2 font-medium text-zinc-800 hover:underline"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[10px] font-bold text-[#FBD34D]">
                          {iniciais(s.formador.nome)}
                        </span>
                        <span className="truncate">{s.formador.nome}</span>
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="rounded-full bg-[#FAF9F5] px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200/80">
                        {s.sala.nome}
                      </span>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <Link
                        href={`/turmas/${s.turma.id}`}
                        className="inline-flex items-center gap-1 rounded-full bg-[#FAF9F5] px-3 py-1.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200/80 transition-colors hover:bg-[#FBD34D]"
                      >
                        Abrir turma <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    </Td>
                  </tr>
                ))}
              </TbodyProgressivo>
            </Tabela>
          )}
        </Card>

        {/* Tabela Diretório 3: Leads em Aberto (10 em 10) */}
        <Card>
          <CardHeader
            titulo={`Leads em Aberto (${leadsAbertos.length})`}
            descricao="Candidatos pré-qualificados que aguardam contacto comercial ou matrícula."
            acoes={
              <Link
                href="/leads"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#FAF9F5] px-3.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200/80 transition-colors hover:bg-[#FBD34D]/30"
              >
                Pipeline de Leads <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {leadsAbertos.length === 0 ? (
            <Vazio>Não existem leads pendentes de acompanhamento.</Vazio>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Candidato</Th>
                  <Th>Curso / Turma</Th>
                  <Th>Origem</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Ação</Th>
                </tr>
              </thead>
              <TbodyProgressivo passo={10} colSpan={5}>
                {leadsAbertos.map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-[#FBD34D]/10">
                    <Td>
                      <Link href={`/leads/${l.id}`} className="font-semibold text-zinc-900 hover:underline">
                        {l.nome}
                      </Link>
                      <div className="font-mono text-[11px] text-zinc-400">{l.whatsapp}</div>
                    </Td>
                    <Td>
                      <div className="font-medium text-zinc-800">{l.formacao.nome}</div>
                      {l.turma && <div className="text-[11px] text-zinc-400">Turma {l.turma.codigo}</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-zinc-500">{origemLead(l)}</Td>
                    <Td className="whitespace-nowrap">
                      <Badge cor={CORES_ESTADO_LEAD[l.estado]}>{NOMES_ESTADO_LEAD[l.estado]}</Badge>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <Link
                        href={`/leads/${l.id}`}
                        className="inline-flex items-center gap-1 rounded-full bg-[#1C1D21] px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                      >
                        Atender <ArrowUpRight className="size-3.5 text-[#FBD34D]" aria-hidden />
                      </Link>
                    </Td>
                  </tr>
                ))}
              </TbodyProgressivo>
            </Tabela>
          )}
        </Card>
      </div>

      {/* Coluna Lateral Direita Administração (Padronizada com Financeiro, Comercial e Pedagógico) */}
      <aside className="space-y-6">
        <div className="overflow-hidden rounded-3xl bg-white shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
          <div className="h-20 bg-gradient-to-r from-[#1C1D21] via-[#2D2A24] to-[#B4831E]" />
          <div className="px-6 pb-6">
            <div className="-mt-9 flex justify-center">
              <div className="flex size-18 items-center justify-center rounded-full bg-[#FBD34D] text-lg font-extrabold text-[#1C1D21] ring-4 ring-white shadow-sm">
                {iniciais(user.nome)}
              </div>
            </div>
            <div className="mt-2.5 text-center">
              <h2 className="text-base font-bold text-zinc-900">{user.nome}</h2>
              <p className="text-xs text-zinc-400">
                {NOMES_PERFIL[user.perfil]} · {user.tenant.nome}
              </p>
            </div>

            <div className="mt-6">
              <div className="text-xs font-semibold text-zinc-900">Indicadores Globais</div>
              <dl className="mt-3 space-y-2.5 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-zinc-400">Saldo líquido (mês)</dt>
                  <span className="flex-1 border-b border-dotted border-zinc-200" />
                  <dd className={`font-bold ${sobraMes >= 0n ? "text-emerald-700" : "text-red-600"}`}>
                    {formatKz(sobraMes)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-zinc-400">Matrículas (mês)</dt>
                  <span className="flex-1 border-b border-dotted border-zinc-200" />
                  <dd className="font-semibold text-zinc-900">{nMatriculasMes}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-zinc-400">Turmas ativas</dt>
                  <span className="flex-1 border-b border-dotted border-zinc-200" />
                  <dd className="font-semibold text-zinc-900">{nTurmasAtivas}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-zinc-400">Formadores ativos</dt>
                  <span className="flex-1 border-b border-dotted border-zinc-200" />
                  <dd className="font-semibold text-zinc-900">{nFormadores}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-zinc-400">Parcelas vencidas</dt>
                  <span className="flex-1 border-b border-dotted border-zinc-200" />
                  <dd className="font-bold text-red-600">{emAtraso.length}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-6">
              <div className="text-xs font-semibold text-zinc-900">Equipa e Sistema</div>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <Link
                  href="/utilizadores"
                  className="flex items-center gap-2.5 rounded-2xl bg-[#E8EFF8] p-3 transition-transform hover:scale-[1.02]"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#2B579A] text-white">
                    <ShieldUser className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-zinc-900">Equipa</div>
                    <div className="text-[10px] text-zinc-500">Utilizadores</div>
                  </div>
                </Link>

                <Link
                  href="/configuracoes"
                  className="flex items-center gap-2.5 rounded-2xl bg-[#FCECE6] p-3 transition-transform hover:scale-[1.02]"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#D24726] text-white">
                    <Settings className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-zinc-900">Definições</div>
                    <div className="text-[10px] text-zinc-500">WhatsApp & Regras</div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Últimos Recebimentos */}
        <div className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900">Últimos Recebimentos</h3>
            <Link href="/financeiro?tab=resumo" className="text-xs font-medium text-zinc-400 hover:text-zinc-900">
              Ver todos
            </Link>
          </div>

          {ultimosPagamentos.length === 0 ? (
            <p className="mt-4 text-xs text-zinc-400">Ainda sem recebimentos registados.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {ultimosPagamentos.map((pg) => (
                <Link
                  key={pg.id}
                  href={`/formandos/${pg.formando.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#EBF3EE] to-[#FDF6DF] p-3.5 transition-transform hover:scale-[1.01]"
                >
                  <div className="border-r border-zinc-900/10 pr-3 text-xs font-bold text-zinc-900">
                    {formatData(pg.dataPagamento).slice(0, 5)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-zinc-900">{pg.formando.nome}</div>
                    <div className="truncate text-[11px] text-zinc-500">
                      {pg.matricula.turma.codigo} · {pg.metodo}
                    </div>
                  </div>
                  <div className="text-xs font-extrabold text-emerald-800">+{formatKz(pg.valor)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Atalhos Rápidos: Portal e Catálogo Público */}
        <div className="space-y-3">
          <Link
            href="/portais"
            className="flex items-center justify-between rounded-3xl bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] transition-colors hover:bg-[#FBD34D]/25"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-[#EEF4FB] text-[#2B579A]">
                <Smartphone className="size-5" aria-hidden />
              </span>
              <div>
                <div className="text-xs font-bold text-zinc-900">Portal</div>
                <div className="text-[11px] text-zinc-400">Links móveis de formadores e formandos</div>
              </div>
            </div>
            <ArrowUpRight className="size-4 text-zinc-400" aria-hidden />
          </Link>

          <Link
            href={`/p/${user.tenant.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-3xl bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] transition-colors hover:bg-[#FBD34D]/25"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-[#FCECE6] text-[#D24726]">
                <ExternalLink className="size-5" aria-hidden />
              </span>
              <div>
                <div className="text-xs font-bold text-zinc-900">Catálogo Público</div>
                <div className="text-[11px] text-zinc-400">/p/{user.tenant.slug}</div>
              </div>
            </div>
            <ArrowUpRight className="size-4 text-zinc-400" aria-hidden />
          </Link>
        </div>
      </aside>
    </div>
  );
}
