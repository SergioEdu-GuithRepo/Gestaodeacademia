import { ArrowLeft, CheckCircle2, CreditCard, FileCheck2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { Badge } from "@/components/ui";
import { dataSimples, diaLocal, formatData, hojeLocal } from "@/lib/datas";
import { dbTenant, prisma } from "@/lib/db";
import { CORES_ESTADO_PARCELA, NOMES_ESTADO_PARCELA, NOMES_METODO } from "@/lib/formandos";
import { formatKz } from "@/lib/money";
import { comPago, estadoParcela, resumirParcelas } from "@/lib/parcelas";

type Props = {
  params: Promise<{ token: string; pagamentoId: string }>;
};

function iniciaisCentro(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "GA";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token, pagamentoId } = await params;
  const formando = await prisma.formando.findUnique({
    where: { portalToken: token },
    select: { nome: true, tenant: { select: { nome: true } } },
  });
  if (!formando) {
    return { title: "Comprovativo de Liquidação" };
  }
  return {
    title: `Comprovativo ${pagamentoId.slice(-8).toUpperCase()} — ${formando.nome} · ${formando.tenant.nome}`,
  };
}

export default async function ReciboPagamentoA4Page({ params }: Props) {
  const { token, pagamentoId } = await params;

  const formando = await prisma.formando.findUnique({
    where: { portalToken: token },
    include: { tenant: true },
  });
  if (!formando) {
    notFound();
  }

  const db = dbTenant({ tenantId: formando.tenantId });
  const pagamento = await db.pagamento.findFirst({
    where: {
      id: pagamentoId,
      formandoId: formando.id,
    },
    include: {
      registadoPor: { select: { nome: true } },
      alocacoes: {
        include: {
          parcela: {
            select: {
              id: true,
              numero: true,
              valor: true,
              vencimento: true,
            },
          },
        },
        orderBy: {
          parcela: { numero: "asc" },
        },
      },
      matricula: {
        include: {
          turma: {
            include: {
              formacao: { select: { nome: true, cargaHoraria: true } },
            },
          },
          parcelas: {
            orderBy: { numero: "asc" },
            include: { alocacoes: { select: { valor: true } } },
          },
        },
      },
    },
  });

  if (!pagamento) {
    notFound();
  }

  const hoje = dataSimples(hojeLocal());
  const parcelasComPago = pagamento.matricula.parcelas.map(comPago);
  const mapaParcelas = new Map(parcelasComPago.map((p) => [p.id, p]));
  const resumoMatricula = resumirParcelas(parcelasComPago, hoje);
  const numeroComprovativo = `LIQ-${pagamento.id.slice(-8).toUpperCase()}`;

  return (
    <div className="min-h-dvh bg-[#F5F4EF] px-4 py-6 text-[#1C1D21] sm:px-8 sm:py-10 print:min-h-0 print:bg-white print:p-0">
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      {/* Barra de ações (oculta na impressão) */}
      <div className="mx-auto mb-6 flex max-w-[820px] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/portal/formando/${token}`}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-zinc-200/90 bg-white px-4 text-xs font-semibold text-[#1C1D21] shadow-2xs transition-all hover:-translate-y-0.5 hover:bg-[#FAF9F5]"
        >
          <ArrowLeft className="size-4" aria-hidden /> Voltar ao Portal do Formando
        </Link>

        <BotaoImprimir rotulo="Imprimir / Guardar Comprovativo (A4)" />
      </div>

      {/* Folha A4 Editorial */}
      <article className="mx-auto max-w-[820px] rounded-3xl border border-zinc-200/90 bg-white p-8 shadow-xl sm:p-12 print:rounded-none print:border-zinc-300 print:p-6 print:shadow-none">
        {/* Cabeçalho do Documento */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#1C1D21] pb-6">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#1C1D21] text-sm font-extrabold tracking-widest text-[#FBD34D]">
              {iniciaisCentro(formando.tenant.nome)}
            </div>
            <div>
              <div className="text-lg font-extrabold tracking-tight text-[#1C1D21] uppercase">
                {formando.tenant.nome}
              </div>
              <div className="text-xs font-medium text-zinc-500">
                Tesouraria & Gestão Académica · República de Angola
              </div>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F4E8] px-3 py-1 text-xs font-bold text-[#1E6332]">
              <CheckCircle2 className="size-3.5" aria-hidden /> Liquidação Confirmada
            </div>
            <h1 className="mt-2 text-lg font-extrabold tracking-tight text-[#1C1D21] uppercase">
              Comprovativo de Liquidação
            </h1>
            <div className="font-mono text-xs text-zinc-500">N.º {numeroComprovativo}</div>
          </div>
        </header>

        {/* Destaque do Montante Liquidado */}
        <section className="mt-6 grid items-center gap-4 rounded-2xl border border-zinc-200 bg-[#FAF9F5] p-5 sm:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
              Montante Total Recebido
            </div>
            <div className="mt-1 text-3xl font-extrabold tracking-tight text-[#1E6332] sm:text-4xl">
              {formatKz(pagamento.valor)}
            </div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600">
              <CreditCard className="size-3.5 text-zinc-400" aria-hidden />
              {NOMES_METODO[pagamento.metodo]} · Data de pagamento: {formatData(pagamento.dataPagamento)}
            </div>
          </div>

          <div className="space-y-1.5 rounded-xl border border-zinc-200/80 bg-white p-3.5 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-zinc-500">Ref. Transação:</span>
              <span className="font-mono font-bold text-[#1C1D21]">
                {pagamento.referencia || "—"}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-zinc-500">
                <FileCheck2 className="size-3.5 text-[#1C1D21]" aria-hidden /> Recibo AGT:
              </span>
              <span className="font-mono font-bold text-[#1C1D21]">
                {pagamento.referenciaRecibo || "Não associado"}
              </span>
            </div>
          </div>
        </section>

        {/* Identificação do Formando e da Matrícula */}
        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="space-y-2.5 rounded-2xl border border-zinc-200/80 p-4 text-xs">
            <div className="border-b border-dotted border-zinc-200 pb-1.5 font-bold tracking-wider text-zinc-500 uppercase">
              Dados do Formando
            </div>
            <div className="flex items-baseline">
              <span className="text-zinc-500">Nome completo</span>
              <span className="leader-dots" />
              <span className="font-bold text-[#1C1D21]">{formando.nome}</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-zinc-500">WhatsApp</span>
              <span className="leader-dots" />
              <span className="font-medium text-[#1C1D21]">{formando.whatsapp}</span>
            </div>
            {formando.email && (
              <div className="flex items-baseline">
                <span className="text-zinc-500">Email</span>
                <span className="leader-dots" />
                <span className="font-medium text-[#1C1D21]">{formando.email}</span>
              </div>
            )}
          </div>

          <div className="space-y-2.5 rounded-2xl border border-zinc-200/80 p-4 text-xs">
            <div className="border-b border-dotted border-zinc-200 pb-1.5 font-bold tracking-wider text-zinc-500 uppercase">
              Dados Académicos
            </div>
            <div className="flex items-baseline">
              <span className="text-zinc-500">Formação</span>
              <span className="leader-dots" />
              <span className="font-bold text-[#1C1D21]">
                {pagamento.matricula.turma.formacao.nome}
              </span>
            </div>
            <div className="flex items-baseline">
              <span className="text-zinc-500">Turma / Edição</span>
              <span className="leader-dots" />
              <span className="font-bold text-[#1C1D21]">{pagamento.matricula.turma.codigo}</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-zinc-500">Carga horária</span>
              <span className="leader-dots" />
              <span className="font-medium text-[#1C1D21]">
                {pagamento.matricula.turma.formacao.cargaHoraria} h
              </span>
            </div>
          </div>
        </section>

        {/* Tabela de Parcelas Liquidadas neste Pagamento */}
        <section className="mt-6">
          <h2 className="mb-2.5 text-xs font-bold tracking-wider text-zinc-500 uppercase">
            Imputação às Parcelas do Plano Financeiro
          </h2>
          <div className="overflow-hidden rounded-2xl border border-zinc-200">
            <table className="min-w-full divide-y divide-zinc-200 text-xs">
              <thead className="bg-[#FAF9F5]">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-zinc-600">Parcela</th>
                  <th className="px-4 py-3 text-left font-bold text-zinc-600">Vencimento</th>
                  <th className="px-4 py-3 text-right font-bold text-zinc-600">Valor da Parcela</th>
                  <th className="px-4 py-3 text-right font-bold text-zinc-600">
                    Liquidado neste Ato
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-zinc-600">Estado Atual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dotted divide-zinc-200 bg-white">
                {pagamento.alocacoes.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 font-semibold text-[#1C1D21]">
                      Liquidação direta de matrícula
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{formatData(pagamento.dataPagamento)}</td>
                    <td className="px-4 py-3 text-right text-zinc-700">
                      {formatKz(pagamento.matricula.valorTotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[#1E6332]">
                      {formatKz(pagamento.valor)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge cor="verde">Confirmado</Badge>
                    </td>
                  </tr>
                ) : (
                  pagamento.alocacoes.map((aloc) => {
                    const pCompleta = mapaParcelas.get(aloc.parcela.id);
                    const est = pCompleta ? estadoParcela(pCompleta, hoje) : "PAGA";
                    return (
                      <tr key={aloc.id}>
                        <td className="px-4 py-3 font-semibold text-[#1C1D21]">
                          {aloc.parcela.numero}.ª parcela
                        </td>
                        <td className="px-4 py-3 text-zinc-600">
                          {formatData(aloc.parcela.vencimento)}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-700">
                          {formatKz(aloc.parcela.valor)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#1E6332]">
                          {formatKz(aloc.valor)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge cor={CORES_ESTADO_PARCELA[est]}>
                            {NOMES_ESTADO_PARCELA[est]}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Posição Financeira Atualizada da Matrícula */}
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-[#FAF9F5] p-5 text-xs">
          <div className="mb-3 font-bold tracking-wider text-zinc-500 uppercase">
            Posição Financeira Atualizada na Matrícula
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline">
              <span className="text-zinc-600">Valor total contratado da matrícula</span>
              <span className="leader-dots" />
              <span className="font-bold text-[#1C1D21]">{formatKz(resumoMatricula.total)}</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-zinc-600">Total acumulado liquidado até à data</span>
              <span className="leader-dots" />
              <span className="font-bold text-[#1E6332]">{formatKz(resumoMatricula.pago)}</span>
            </div>
            <div className="flex items-baseline pt-1 text-sm">
              <span className="font-bold text-[#1C1D21]">Saldo remanescente em aberto</span>
              <span className="leader-dots" />
              <span
                className={`font-extrabold ${
                  resumoMatricula.divida === 0n ? "text-[#1E6332]" : "text-[#1C1D21]"
                }`}
              >
                {formatKz(resumoMatricula.divida)}
                {resumoMatricula.divida === 0n ? " (Plano 100% liquidado)" : ""}
              </span>
            </div>
          </div>
        </section>

        {pagamento.notas && (
          <section className="mt-5 rounded-2xl border border-zinc-200/80 bg-white p-4 text-xs text-zinc-600">
            <strong className="font-semibold text-[#1C1D21]">Observações da tesouraria:</strong>{" "}
            {pagamento.notas}
          </section>
        )}

        {/* Rodapé institucional */}
        <footer className="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-dotted border-zinc-300 pt-5 text-[11px] text-zinc-500">
          <div className="space-y-0.5">
            <div>
              Registado em{" "}
              <strong className="text-[#1C1D21]">
                {formatData(dataSimples(diaLocal(pagamento.createdAt)))}
              </strong>{" "}
              por{" "}
              <strong className="text-[#1C1D21]">
                {pagamento.registadoPor?.nome ?? "Tesouraria do Centro"}
              </strong>
              .
            </div>
            <div>
              {pagamento.referenciaRecibo
                ? `Associado ao recibo fiscal certificado AGT n.º ${pagamento.referenciaRecibo}.`
                : "Comprovativo interno de quitação académica emitido através do Portal do Formando."}
            </div>
          </div>

          <div className="font-mono text-[11px] font-semibold text-[#1C1D21]">
            {formando.tenant.nome} · {numeroComprovativo}
          </div>
        </footer>
      </article>
    </div>
  );
}
