import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { notFound } from "next/navigation";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { LinkButton } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { dataSimples, formatData, formatDataHora, hojeLocal } from "@/lib/datas";
import { NOMES_METODO } from "@/lib/formandos";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { formatKz } from "@/lib/money";
import { comPago, resumirParcelas } from "@/lib/parcelas";

export const metadata = { title: "Comprovativo de Liquidação A4" };

export default async function ReciboInternoPage({
  params,
}: {
  params: Promise<{ id: string; pagamentoId: string }>;
}) {
  const { user, db } = await exigir("pagamentos:ver");
  const { id, pagamentoId } = await params;

  const [pagamento, cfg] = await Promise.all([
    db.pagamento.findFirst({
      where: { id: pagamentoId, formandoId: id },
      include: {
        formando: true,
        registadoPor: { select: { nome: true } },
        alocacoes: {
          include: { parcela: true },
          orderBy: { parcela: { numero: "asc" } },
        },
        matricula: {
          include: {
            turma: { include: { formacao: true } },
            parcelas: {
              orderBy: { numero: "asc" },
              include: { alocacoes: { select: { valor: true } } },
            },
          },
        },
      },
    }),
    obterConfiguracao(comoCliente(db), user.tenantId),
  ]);

  if (!pagamento) notFound();

  const hoje = dataSimples(hojeLocal());
  const resumo = resumirParcelas(pagamento.matricula.parcelas.map(comPago), hoje);
  const numeroComprovativo = `LIQ-${pagamento.dataPagamento.getUTCFullYear()}-${pagamento.id.slice(-8).toUpperCase()}`;

  return (
    <div className="space-y-6">
      {/* Barra superior (oculta na impressão) */}
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <LinkButton href={`/formandos/${pagamento.formandoId}`} variante="secundario">
          <ArrowLeft className="size-4" aria-hidden /> Voltar à ficha do formando
        </LinkButton>
        <BotaoImprimir rotulo="Imprimir Comprovativo (A4)" />
      </div>

      {/* Documento A4 de Comprovativo de Liquidação */}
      <article className="mx-auto max-w-3xl rounded-3xl border border-zinc-200/80 bg-white p-8 text-[#1C1D21] shadow-[0_2px_24px_-6px_rgba(28,29,33,0.07)] sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* Cabeçalho Institucional */}
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-[#1C1D21] pb-6">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-sm font-extrabold tracking-wider text-[#FBD34D]">
              {user.tenant.nome.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
                Centro de Formação Profissional
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-[#1C1D21] uppercase sm:text-2xl">
                {user.tenant.nome}
              </h1>
              {cfg.titularConta && (
                <div className="text-xs text-zinc-500">Titular: {cfg.titularConta}</div>
              )}
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block rounded-full bg-[#FBD34D] px-3.5 py-1 text-xs font-extrabold tracking-wide text-[#1C1D21] uppercase">
              Comprovativo de Liquidação
            </span>
            <div className="mt-2 font-mono text-sm font-bold text-[#1C1D21]">{numeroComprovativo}</div>
            <div className="text-xs text-zinc-500">Data do pagamento: {formatData(pagamento.dataPagamento)}</div>
          </div>
        </header>

        {/* Destaque do Valor Liquidado */}
        <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E5E3DC] bg-[#FAF9F5] p-5">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E6332]">
              <CheckCircle2 className="size-4" aria-hidden /> Liquidação registada e confirmada
            </div>
            <div className="mt-1 text-3xl font-extrabold tracking-tight text-[#1C1D21]">
              {formatKz(pagamento.valor)}
            </div>
          </div>

          <div className="space-y-1 text-right text-xs">
            <div>
              <span className="text-zinc-500">Meio de pagamento: </span>
              <strong className="text-[#1C1D21]">{NOMES_METODO[pagamento.metodo]}</strong>
            </div>
            <div>
              <span className="text-zinc-500">Ref.ª da transação: </span>
              <strong className="font-mono text-[#1C1D21]">{pagamento.referencia ?? "—"}</strong>
            </div>
            {pagamento.referenciaRecibo && (
              <div>
                <span className="text-zinc-500">Recibo certificado AGT: </span>
                <strong className="font-mono text-[#1C1D21]">{pagamento.referenciaRecibo}</strong>
              </div>
            )}
          </div>
        </section>

        {/* Identificação do Formando e da Formação */}
        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200/90 p-4 text-xs space-y-2">
            <div className="font-bold tracking-wider text-zinc-500 uppercase">Dados do Formando</div>
            <div className="flex items-baseline">
              <span className="text-zinc-500">Nome completo</span>
              <span className="leader-dots" />
              <span className="font-bold text-[#1C1D21]">{pagamento.formando.nome}</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-zinc-500">Contacto WhatsApp</span>
              <span className="leader-dots" />
              <span className="font-mono font-semibold text-[#1C1D21]">{pagamento.formando.whatsapp}</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-zinc-500">Correio eletrónico</span>
              <span className="leader-dots" />
              <span className="font-medium text-[#1C1D21]">{pagamento.formando.email ?? "—"}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/90 p-4 text-xs space-y-2">
            <div className="font-bold tracking-wider text-zinc-500 uppercase">Ação de Formação</div>
            <div className="flex items-baseline">
              <span className="text-zinc-500">Curso</span>
              <span className="leader-dots" />
              <span className="font-bold text-[#1C1D21]">{pagamento.matricula.turma.formacao.nome}</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-zinc-500">Código da turma</span>
              <span className="leader-dots" />
              <span className="font-mono font-bold text-[#1C1D21]">{pagamento.matricula.turma.codigo}</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-zinc-500">Carga horária</span>
              <span className="leader-dots" />
              <span className="font-semibold text-[#1C1D21]">
                {pagamento.matricula.turma.formacao.cargaHoraria} horas
              </span>
            </div>
          </div>
        </section>

        {/* Imputação às Parcelas */}
        <section className="mt-6">
          <h2 className="mb-2.5 text-xs font-bold tracking-wider text-zinc-500 uppercase">
            Detalhe de Imputação no Plano de Parcelas
          </h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#1C1D21] text-white">
                <th className="border border-zinc-300 px-3 py-2 text-left font-semibold">Parcela</th>
                <th className="border border-zinc-300 px-3 py-2 text-left font-semibold">Data de Vencimento</th>
                <th className="border border-zinc-300 px-3 py-2 text-right font-semibold">Valor da Parcela</th>
                <th className="border border-zinc-300 px-3 py-2 text-right font-semibold">Valor Liquidado</th>
              </tr>
            </thead>
            <tbody>
              {pagamento.alocacoes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="border border-zinc-300 px-3 py-3 text-center text-zinc-500">
                    Liquidação global de matrícula ({formatKz(pagamento.valor)})
                  </td>
                </tr>
              ) : (
                pagamento.alocacoes.map((al) => (
                  <tr key={al.id} className="odd:bg-white even:bg-[#FAF9F5]">
                    <td className="border border-zinc-300 px-3 py-2 font-semibold text-[#1C1D21]">
                      {al.parcela.numero}.ª Parcela
                    </td>
                    <td className="border border-zinc-300 px-3 py-2 text-zinc-600">
                      {formatData(al.parcela.vencimento)}
                    </td>
                    <td className="border border-zinc-300 px-3 py-2 text-right text-zinc-700">
                      {formatKz(al.parcela.valor)}
                    </td>
                    <td className="border border-zinc-300 px-3 py-2 text-right font-bold text-[#1E6332]">
                      {formatKz(al.valor)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* Posição Financeira Atualizada da Matrícula */}
        <section className="mt-6 rounded-2xl border border-[#E5E3DC] bg-[#FAF9F5] p-4 text-xs">
          <div className="mb-2 font-bold tracking-wider text-zinc-500 uppercase">
            Posição Atualizada da Matrícula
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <span className="text-zinc-500">Valor total contratado:</span>
              <div className="mt-0.5 text-sm font-bold text-[#1C1D21]">{formatKz(resumo.total)}</div>
            </div>
            <div>
              <span className="text-zinc-500">Total acumulado pago:</span>
              <div className="mt-0.5 text-sm font-bold text-[#1E6332]">{formatKz(resumo.pago)}</div>
            </div>
            <div>
              <span className="text-zinc-500">Saldo remanescente em dívida:</span>
              <div
                className={`mt-0.5 text-sm font-bold ${
                  resumo.divida > 0n ? "text-[#B42318]" : "text-[#1E6332]"
                }`}
              >
                {resumo.divida > 0n ? formatKz(resumo.divida) : "0,00 Kz (Plano Concluído)"}
              </div>
            </div>
          </div>
          {pagamento.notas && (
            <div className="mt-3 border-t border-dotted border-zinc-300 pt-2 text-zinc-600">
              <strong>Observações:</strong> {pagamento.notas}
            </div>
          )}
        </section>

        {/* Rodapé e Assinatura */}
        <footer className="mt-10 grid items-end gap-8 border-t border-dotted border-zinc-300 pt-6 text-xs text-zinc-500 sm:grid-cols-2">
          <div className="space-y-1">
            <div>
              Registado por: <strong className="text-[#1C1D21]">{pagamento.registadoPor?.nome ?? "Tesouraria"}</strong>
            </div>
            <div>Registo no sistema: {formatDataHora(pagamento.createdAt)}</div>
            <p className="pt-1 text-[11px] leading-relaxed text-zinc-400">
              Documento interno de quitação e controlo académico emitido por {user.tenant.nome}. Não substitui a
              fatura-recibo fiscal emitida em software certificado pela AGT quando aplicável.
            </p>
          </div>

          <div className="pt-6 text-center">
            <div className="mx-auto max-w-[220px] border-t border-[#1C1D21] pt-2 font-bold text-[#1C1D21]">
              A Tesouraria / Secretaria
            </div>
            <div className="text-[11px] text-zinc-500">{user.tenant.nome}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
