import type { TipoRelatorioIA } from "@prisma/client";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  DoorOpen,
  MessageCircle,
  Repeat,
  Settings,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Badge, Card, CardHeader, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { formatData, formatDataHora } from "@/lib/datas";
import { linkWhatsapp } from "@/lib/formandos";
import { NOMES_TIPO_RELATORIO } from "@/lib/ia/claude";
import { calcularMetricasSemanalComercial, type FormandoRiscoItem } from "@/lib/ia/metricas";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { pode } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { gerarRelatorioIaAction } from "./actions";
import { GeradorRelatorioIaForm } from "./forms";

export const metadata = { title: "CRM & Relatórios IA" };

const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const FILTROS_TIPO: { valor: string; rotulo: string }[] = [
  { valor: "TODOS", rotulo: "Todos" },
  { valor: "SEMANAL_COMERCIAL", rotulo: "Semanal Comercial" },
  { valor: "MENSAL_FINANCEIRO", rotulo: "Mensal Financeiro" },
  { valor: "POR_FORMACAO", rotulo: "Por Formação" },
  { valor: "POR_FORMADOR", rotulo: "Por Formador" },
  { valor: "ALERTA_IMEDIATO", rotulo: "Alertas Imediatos" },
];

export default async function InteligenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { user, db } = await exigir("inteligencia:ver");
  const { tipo = "TODOS" } = await searchParams;

  const podeFinanceiro = pode(user.perfil, "financeiro:ver");
  const podeComercial = user.perfil === "ADMIN" || pode(user.perfil, "leads:ver");
  const podeConfigurar = pode(user.perfil, "configuracoes:editar");

  const [cfg, snapshotSql, formacoes, formadores, followUps, historico] = await Promise.all([
    obterConfiguracao(comoCliente(db), user.tenantId),
    calcularMetricasSemanalComercial(user.tenantId),
    db.formacao.findMany({
      where: { ativa: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    db.formador.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    podeComercial
      ? db.interacaoLead.findMany({
          where: {
            proximoFollowUp: { not: null },
            lead: { estado: { in: ["NOVO", "CONTACTADO"] } },
          },
          orderBy: { proximoFollowUp: "asc" },
          take: 15,
          include: {
            lead: { select: { id: true, nome: true, whatsapp: true, formacao: { select: { nome: true } } } },
            user: { select: { nome: true } },
          },
        })
      : Promise.resolve([]),
    db.relatorioIA.findMany({
      where: {
        ...(tipo !== "TODOS" ? { tipo: tipo as TipoRelatorioIA } : {}),
        ...(!podeFinanceiro ? { tipo: { not: "MENSAL_FINANCEIRO" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);

  const dados = snapshotSql.metricas.dadosDetalhados as {
    comercial: {
      novosLeadsSemana: number;
      variacaoLeads: string;
      taxaConversaoSemanaPct: number;
      variacaoConversao: string;
      taxaRecompraGlobalPct: number;
      leadsSemPrimeiroContactoMais48h: number;
    };
    cobranca: {
      taxaInadimplenciaPct: number;
      parcelasEmAtrasoQtd: number;
      valorTotalEmAtrasoKz: string;
    };
    retencaoERiscoDesistencia: {
      totalFormandosEmRisco: number;
      listaFormandosEmRisco: FormandoRiscoItem[];
    };
    ocupacao: {
      ocupacaoSalasPct: number;
      ocupacaoTurmasPct: number;
      horasOcupadas: number;
      turmasEmAberto: number;
    };
  };

  const agora = new Date();

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium tracking-wider text-zinc-500 uppercase">
            {user.tenant.nome} · Business Intelligence, CRM &amp; Claude AI
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1C1D21]">
            CRM, Análise de Dados &amp; Relatórios IA
          </h1>
        </div>

        {podeConfigurar && (
          <Link
            href="/configuracoes?tab=ia"
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#1C1D21] px-4 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-zinc-800"
          >
            <Settings className="size-3.5 text-[#FBD34D]" aria-hidden />
            Agendamento, Canal e Chave Claude
          </Link>
        )}
      </div>

      {/* 4 Cartões KPI SQL em Tempo Real */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Conversão Comercial (7d)</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D]">
              <TrendingUp className="size-4" aria-hidden />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            {dados.comercial.taxaConversaoSemanaPct}%
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {dados.comercial.novosLeadsSemana} leads · {dados.comercial.variacaoConversao}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Inadimplência Global</span>
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full",
                dados.cobranca.taxaInadimplenciaPct >= cfg.limiarInadimplenciaPct
                  ? "bg-red-100 text-red-700"
                  : "bg-[#F5F4EF] text-[#1C1D21]",
              )}
            >
              <AlertTriangle className="size-4" aria-hidden />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            {dados.cobranca.taxaInadimplenciaPct}%
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {dados.cobranca.parcelasEmAtrasoQtd} parcela(s) vencida(s) · Limiar alerta: {cfg.limiarInadimplenciaPct}%
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Taxa de Recompra</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-[#F5F4EF] text-[#1C1D21]">
              <Repeat className="size-4" aria-hidden />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            {dados.comercial.taxaRecompraGlobalPct}%
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Formandos com 2 ou mais cursos inscritos
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Ocupação (Turmas / Salas)</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-[#FBD34D] text-[#1C1D21]">
              <DoorOpen className="size-4" aria-hidden />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            {dados.ocupacao.ocupacaoTurmasPct}%{" "}
            <span className="text-base font-normal text-zinc-400">/ {dados.ocupacao.ocupacaoSalasPct}%</span>
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {dados.ocupacao.turmasEmAberto} turma(s) ativa(s) · {dados.ocupacao.horasOcupadas}h sala (7d)
          </div>
        </Card>
      </div>

      {/* Gerador de Relatórios Automáticos por IA */}
      <Card>
        <CardHeader
          titulo="Gerar Relatório Executivo por IA (SQL + Claude)"
          descricao={`Agendamento ativo: ${
            cfg.iaAtiva
              ? `Semanal (${DIAS_SEMANA[cfg.diaSemanaRelatorio] ?? "Segunda"}) · Mensal (dia ${cfg.diaMesRelatorio}) · Alertas se inadimplência ≥ ${cfg.limiarInadimplenciaPct}%`
              : "Desativado"
          }`}
          acoes={
            <Badge cor={cfg.iaAtiva ? "verde" : "cinza"}>
              {cfg.iaAtiva ? `Canal padrão: ${cfg.canalRelatorio}` : "Agendamento pausado"}
            </Badge>
          }
        />
        <GeradorRelatorioIaForm
          acao={gerarRelatorioIaAction}
          formacoes={formacoes}
          formadores={formadores}
          canalPadrao={cfg.canalRelatorio}
          podeFinanceiro={podeFinanceiro}
          podeComercial={podeComercial}
        />
      </Card>

      {/* Radar Operacional CRM: Risco de Desistência + Follow-ups de Leads */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            titulo={`Radar de Retenção: Formandos em Risco (${dados.retencaoERiscoDesistencia.totalFormandosEmRisco})`}
            descricao="Detetados automaticamente por faltas consecutivas, baixa assiduidade ou parcelas vencidas."
          />
          <div className="p-5">
            {dados.retencaoERiscoDesistencia.listaFormandosEmRisco.length === 0 ? (
              <Vazio>Nenhum formando em risco crítico de desistência no momento.</Vazio>
            ) : (
              <GrelhaProgressiva passo={10} labelItem="formandos em risco" className="space-y-3">
                {dados.retencaoERiscoDesistencia.listaFormandosEmRisco.map((item) => (
                  <div
                    key={`${item.formandoId}-${item.turmaCodigo}`}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/formandos/${item.formandoId}`}
                          className="font-semibold text-[#1C1D21] hover:underline"
                        >
                          {item.nome}
                        </Link>
                        <Badge cor="vermelho">Assiduidade {item.assiduidadePct}%</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {item.formacaoNome} · Turma {item.turmaCodigo}
                      </p>
                      <p className="mt-1 text-xs font-medium text-red-700">
                        {item.motivosRisco.join(" · ")}
                      </p>
                    </div>
                    <a
                      href={linkWhatsapp(item.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#FBD34D] px-3.5 text-xs font-semibold text-[#1C1D21] hover:bg-[#f5c82e]"
                    >
                      <MessageCircle className="size-3.5" aria-hidden /> Contactar
                    </a>
                  </div>
                ))}
              </GrelhaProgressiva>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            titulo={`Agenda de Follow-ups CRM (${followUps.length})`}
            descricao="Próximos contactos agendados pela equipa comercial em leads abertos."
            acoes={
              <Link href="/leads" className="text-xs font-semibold text-[#1C1D21] hover:underline">
                Ver Pipeline ↗
              </Link>
            }
          />
          <div className="p-5">
            {followUps.length === 0 ? (
              <Vazio>Sem follow-ups agendados pendentes nos leads em aberto.</Vazio>
            ) : (
              <GrelhaProgressiva passo={10} labelItem="follow-ups" className="space-y-3">
                {followUps.map((f) => {
                  const vencido = f.proximoFollowUp ? f.proximoFollowUp <= agora : false;
                  return (
                    <div
                      key={f.id}
                      className="flex flex-col justify-between gap-2 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/leads/${f.lead.id}`}
                            className="font-semibold text-[#1C1D21] hover:underline"
                          >
                            {f.lead.nome}
                          </Link>
                          <Badge cor={vencido ? "vermelho" : "amarelo"}>
                            <CalendarClock className="mr-1 inline size-3" aria-hidden />
                            {f.proximoFollowUp ? formatDataHora(f.proximoFollowUp) : "—"}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {f.lead.formacao.nome} · {f.resumo}
                        </p>
                      </div>
                      <Link
                        href={`/leads/${f.lead.id}`}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-[#1C1D21] px-3 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        Abrir Lead <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                  );
                })}
              </GrelhaProgressiva>
            )}
          </div>
        </Card>
      </div>

      {/* Histórico de Relatórios Gerados */}
      <Card>
        <CardHeader
          titulo={`Histórico de Relatórios e Alertas Gerados (${historico.length})`}
          descricao="Formato padronizado de 4 secções fixas para comparação histórica entre semanas e meses."
        />
        <div className="border-b border-zinc-100 px-6 pb-4">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#F5F4EF] p-1">
            {FILTROS_TIPO.filter((f) => f.valor !== "MENSAL_FINANCEIRO" || podeFinanceiro).map((f) => (
              <Link
                key={f.valor}
                href={f.valor === "TODOS" ? "/inteligencia" : `/inteligencia?tipo=${f.valor}`}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  tipo === f.valor
                    ? "bg-[#1C1D21] text-white shadow-2xs"
                    : "text-zinc-600 hover:text-[#1C1D21]",
                )}
              >
                {f.rotulo}
              </Link>
            ))}
          </div>
        </div>

        <div className="p-6">
          {historico.length === 0 ? (
            <Vazio>
              Ainda não existem relatórios gerados neste filtro. Utilize o gerador acima para criar o primeiro
              relatório!
            </Vazio>
          ) : (
            <GrelhaProgressiva passo={10} labelItem="relatórios" className="grid gap-4 sm:grid-cols-2">
              {historico.map((rel) => (
                <Link
                  key={rel.id}
                  href={`/inteligencia/${rel.id}`}
                  className="group flex flex-col justify-between rounded-3xl border border-zinc-200/80 bg-[#FAF9F5] p-5 transition-all hover:border-[#1C1D21] hover:bg-white"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge cor={rel.tipo === "ALERTA_IMEDIATO" ? "vermelho" : "amarelo"}>
                        {NOMES_TIPO_RELATORIO[rel.tipo]}
                      </Badge>
                      <span className="text-xs text-zinc-500">{formatDataHora(rel.createdAt)}</span>
                    </div>
                    <h3 className="mt-3 text-base font-bold text-[#1C1D21] group-hover:underline">
                      {rel.titulo}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Período: {formatData(rel.periodoInicio)} a {formatData(rel.periodoFim)}
                    </p>
                    <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-600">
                      {rel.resumoExecutivo}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dotted border-zinc-200 pt-3 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      {rel.entregueWhatsapp && <Badge cor="verde">WhatsApp</Badge>}
                      {rel.entregueEmail && <Badge cor="azul">E-mail</Badge>}
                      <span className="text-zinc-400">{rel.modeloUtilizado}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 font-semibold text-[#1C1D21]">
                      Abrir PDF / Formatos <ArrowUpRight className="size-3.5" aria-hidden />
                    </span>
                  </div>
                </Link>
              ))}
            </GrelhaProgressiva>
          )}
        </div>
      </Card>
    </div>
  );
}
