import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, LinkButton } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { formatData, formatDataHora } from "@/lib/datas";
import { NOMES_TIPO_RELATORIO } from "@/lib/ia/claude";
import type { MetricasRelatorio } from "@/lib/ia/metricas";
import { pode } from "@/lib/rbac";
import { reenviarRelatorioIaAction } from "../actions";
import { FormatosAdicionaisRelatorio } from "../forms";

export const metadata = { title: "Relatório Executivo IA" };

export default async function RelatorioDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, db } = await exigir("inteligencia:ver");

  const rel = await db.relatorioIA.findFirst({
    where: { id },
    include: { geradoPor: { select: { nome: true } } },
  });
  if (!rel) notFound();

  if (rel.tipo === "MENSAL_FINANCEIRO" && !pode(user.perfil, "financeiro:ver")) {
    notFound();
  }

  const metricas = rel.metricasSql as unknown as MetricasRelatorio;
  const kpis = Array.isArray(metricas?.kpisDestaque) ? metricas.kpisDestaque : [];

  return (
    <div className="space-y-6">
      {/* Barra de Topo (oculta na impressão PDF) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <LinkButton href="/inteligencia" variante="secundario">
          <ArrowLeft className="size-4" aria-hidden /> Voltar ao Histórico IA
        </LinkButton>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {rel.entregueWhatsapp && <Badge cor="verde">Entregue via WhatsApp</Badge>}
          {rel.entregueEmail && <Badge cor="azul">Entregue via E-mail</Badge>}
          <Badge cor="cinza">Motor: {rel.modeloUtilizado}</Badge>
        </div>
      </div>

      {/* Seletor de Formatos (PDF, WhatsApp curto, E-mail HTML, Dados SQL) */}
      <FormatosAdicionaisRelatorio
        mensagemWhatsapp={rel.mensagemCurtaWhatsapp}
        corpoEmailHtml={rel.corpoEmailHtml}
        metricasJson={JSON.stringify(rel.metricasSql, null, 2)}
        acaoEnviarWhatsapp={reenviarRelatorioIaAction.bind(null, rel.id, "WHATSAPP")}
        acaoEnviarEmail={reenviarRelatorioIaAction.bind(null, rel.id, "EMAIL")}
      />

      {/* Folha Executiva A4 (Imprimível / Exportável como PDF) */}
      <article className="mx-auto max-w-[960px] overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-[0_8px_32px_-8px_rgba(28,29,33,0.08)] print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        {/* Cabeçalho Institucional Escuro Editorial */}
        <div className="bg-[#1C1D21] px-8 py-8 text-white sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBD34D] px-3.5 py-1 text-[11px] font-extrabold tracking-wider text-[#1C1D21] uppercase">
              <Sparkles className="size-3.5" aria-hidden />
              {NOMES_TIPO_RELATORIO[rel.tipo]}
            </span>
            <span className="text-xs text-zinc-400">
              Emitido em {formatDataHora(rel.createdAt)}
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {rel.titulo}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-300">
            <strong>{user.tenant.nome}</strong> · Período analisado:{" "}
            {formatData(rel.periodoInicio)} a {formatData(rel.periodoFim)}
            {rel.periodoAnteriorInicio && rel.periodoAnteriorFim
              ? ` (comparado com ${formatData(rel.periodoAnteriorInicio)} a ${formatData(rel.periodoAnteriorFim)})`
              : ""}
          </p>
        </div>

        <div className="space-y-8 p-8 sm:p-10">
          {/* Grelha dos 4 Indicadores SQL Base */}
          {kpis.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-bold tracking-wider text-zinc-400 uppercase">
                Indicadores Apurados na Base de Dados (SQL)
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {kpis.map((k, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] p-4"
                  >
                    <div className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
                      {k.rotulo}
                    </div>
                    <div className="mt-1.5 text-xl font-bold text-[#1C1D21]">{k.valor}</div>
                    {k.comparacao && (
                      <div className="mt-1 text-xs text-zinc-600">{k.comparacao}</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4 Secções Fixas Padronizadas */}
          <section className="space-y-2 border-t border-dotted border-zinc-200 pt-6">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-[#1C1D21] text-[11px] font-bold text-[#FBD34D]">
                01
              </span>
              <h2 className="text-sm font-bold tracking-wider text-[#1C1D21] uppercase">
                Resumo Executivo
              </h2>
            </div>
            <p className="pl-8 text-sm leading-relaxed whitespace-pre-line text-zinc-800">
              {rel.resumoExecutivo}
            </p>
          </section>

          <section className="space-y-2 border-t border-dotted border-zinc-200 pt-6">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-[#1C1D21] text-[11px] font-bold text-[#FBD34D]">
                02
              </span>
              <h2 className="text-sm font-bold tracking-wider text-[#1C1D21] uppercase">
                Variações Face ao Período Anterior
              </h2>
            </div>
            <p className="pl-8 text-sm leading-relaxed whitespace-pre-line text-zinc-800">
              {rel.variacoesPeriodo}
            </p>
          </section>

          <section className="space-y-2 border-t border-dotted border-zinc-200 pt-6">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-[#FBD34D] text-[11px] font-bold text-[#1C1D21]">
                03
              </span>
              <h2 className="text-sm font-bold tracking-wider text-[#1C1D21] uppercase">
                Pontos de Atenção e Riscos
              </h2>
            </div>
            <div className="ml-8 rounded-2xl border border-amber-200/80 bg-[#FAF9F5] p-4 text-sm leading-relaxed whitespace-pre-line text-zinc-800">
              {rel.pontosAtencao}
            </div>
          </section>

          <section className="space-y-2 border-t border-dotted border-zinc-200 pt-6">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-[#1C1D21] text-[11px] font-bold text-[#FBD34D]">
                04
              </span>
              <h2 className="text-sm font-bold tracking-wider text-[#1C1D21] uppercase">
                Ações Recomendadas
              </h2>
            </div>
            <div className="ml-8 rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] p-4 text-sm leading-relaxed whitespace-pre-line text-[#1C1D21]">
              {rel.acoesRecomendadas}
            </div>
          </section>

          {/* Rodapé de Auditoria */}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-6 text-xs text-zinc-500">
            <span>
              Centro: <strong className="text-[#1C1D21]">{user.tenant.nome}</strong> (isolamento multi-tenant RLS ativo)
            </span>
            <span>
              {rel.geradoPor ? `Solicitado por ${rel.geradoPor.nome}` : "Gerado por Tarefa Agendada (Cron)"} ·{" "}
              <Link href="/inteligencia" className="underline print:hidden">
                Histórico
              </Link>
            </span>
          </footer>
        </div>
      </article>
    </div>
  );
}
