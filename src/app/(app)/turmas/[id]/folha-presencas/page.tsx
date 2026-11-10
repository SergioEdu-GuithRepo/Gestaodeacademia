import { ArrowLeft, ClipboardList, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { LinkButton } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { verificarElegibilidadeCertificado } from "@/lib/certificados";
import { dataSimples, diaLocal, formatData, formatHora, hojeLocal } from "@/lib/datas";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { formatKz } from "@/lib/money";
import { comPago, resumirParcelas } from "@/lib/parcelas";
import { calcularAssiduidade } from "@/lib/presencas";
import { pode } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { ESTADOS_TURMA } from "../../rotulos";

export const metadata = { title: "Lista de Presenças e Pauta A4" };

function dataCurta(isoData: string): string {
  const [, m, d] = isoData.split("-");
  return `${d}/${m}`;
}

export default async function FolhaPresencasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ modo?: string }>;
}) {
  const { user, db } = await exigir("agenda:ver");
  const verPagamentos = pode(user.perfil, "pagamentos:ver");
  const { id } = await params;
  const sp = await searchParams;

  const modo: "presencas" | "pauta" = sp.modo === "pauta" && verPagamentos ? "pauta" : "presencas";

  const [turma, cfg] = await Promise.all([
    db.turma.findFirst({
      where: { id },
      include: {
        formacao: true,
        sessoes: {
          where: { estado: { not: "CANCELADA" } },
          orderBy: { inicio: "asc" },
          include: {
            formador: { select: { id: true, nome: true } },
            sala: { select: { id: true, nome: true } },
            presencas: { select: { matriculaId: true, estado: true } },
          },
        },
        matriculas: {
          where: { estado: { not: "CANCELADA" } },
          orderBy: { formando: { nome: "asc" } },
          include: {
            formando: { select: { id: true, nome: true, whatsapp: true, profissao: true } },
            parcelas: { include: { alocacoes: { select: { valor: true } } } },
            certificado: true,
          },
        },
      },
    }),
    obterConfiguracao(comoCliente(db), user.tenantId),
  ]);

  if (!turma) notFound();

  const hojeIso = hojeLocal();
  const hoje = dataSimples(hojeIso);
  const sessoes = turma.sessoes;

  const formadoresNomes = Array.from(new Set(sessoes.map((s) => s.formador.nome)));
  const salasNomes = Array.from(new Set(sessoes.map((s) => s.sala.nome)));

  const primeiraSessao = sessoes[0];
  const ultimaSessao = sessoes[sessoes.length - 1];
  const intervaloDatas =
    primeiraSessao && ultimaSessao
      ? primeiraSessao.id === ultimaSessao.id
        ? formatData(dataSimples(diaLocal(primeiraSessao.inicio)))
        : `${formatData(dataSimples(diaLocal(primeiraSessao.inicio)))} a ${formatData(dataSimples(diaLocal(ultimaSessao.inicio)))}`
      : "Por calendarizar";

  const colunasEmBranco = sessoes.length === 0 ? Array.from({ length: 6 }, (_, i) => i + 1) : [];

  const linhas = turma.matriculas.map((m, idx) => {
    const resumo = resumirParcelas(m.parcelas.map(comPago), hoje);
    const assiduidade = calcularAssiduidade(
      sessoes.map((s) => ({
        id: s.id,
        inicio: s.inicio,
        estado: s.estado,
        temChamadaLancada: s.presencas.length > 0,
        estadoAluno: s.presencas.find((p) => p.matriculaId === m.id)?.estado ?? null,
      })),
    );
    const estadoMat =
      m.estado === "ATIVA" && turma.estado === "CONCLUIDA" && resumo.divida <= 0n ? "CONCLUIDA" : m.estado;
    const elegibilidade = verificarElegibilidadeCertificado({
      estadoMatricula: estadoMat,
      dividaCentimos: resumo.divida,
      assiduidadePct: assiduidade.assiduidadePct,
      minAssiduidadePct: cfg.minAssiduidadeCertificadoPct,
      revogado: Boolean(m.certificado?.revogadoEm),
    });
    return { numero: idx + 1, m, resumo, assiduidade, elegibilidade };
  });

  const totalPagoTurma = linhas.reduce((acc, l) => acc + l.resumo.pago, 0n);
  const totalDividaTurma = linhas.reduce((acc, l) => acc + l.resumo.divida, 0n);

  return (
    <div className="space-y-6">
      {/* Barra de ações (oculta na impressão) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2.5">
          <LinkButton href={`/turmas/${turma.id}`} variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar à Turma
          </LinkButton>

          <div className="inline-flex flex-wrap items-center rounded-full border border-zinc-200/90 bg-white p-1 shadow-2xs">
            <Link
              href={`/turmas/${turma.id}/folha-presencas?modo=presencas`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                modo === "presencas"
                  ? "bg-[#1C1D21] text-white shadow-2xs"
                  : "text-zinc-600 hover:text-[#1C1D21]",
              )}
            >
              <ClipboardList className="size-3.5 text-[#FBD34D]" aria-hidden />
              Lista de Presenças (Sala / INEFOP)
            </Link>
            {verPagamentos && (
              <Link
                href={`/turmas/${turma.id}/folha-presencas?modo=pauta`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  modo === "pauta"
                    ? "bg-[#1C1D21] text-white shadow-2xs"
                    : "text-zinc-600 hover:text-[#1C1D21]",
                )}
              >
                <FileSpreadsheet className="size-3.5 text-[#FBD34D]" aria-hidden />
                Pauta Completa
              </Link>
            )}
          </div>
        </div>

        <BotaoImprimir
          rotulo={modo === "pauta" ? "Imprimir Pauta A4" : "Imprimir Folha de Presenças A4"}
        />
      </div>

      {/* Folha A4 Institucional */}
      <article className="mx-auto max-w-[1120px] rounded-3xl border border-zinc-200/80 bg-white p-6 text-[#1C1D21] shadow-[0_2px_24px_-6px_rgba(28,29,33,0.07)] sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* Cabeçalho Institucional */}
        <header className="border-b-2 border-[#1C1D21] pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
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
              </div>
            </div>

            <div className="text-right">
              <div className="inline-block rounded-full bg-[#FBD34D] px-3.5 py-1 text-xs font-extrabold tracking-wide text-[#1C1D21] uppercase">
                {modo === "pauta"
                  ? "Pauta Pedagógica e Financeira"
                  : "Folha Oficial de Presenças · Sala / INEFOP"}
              </div>
              <div className="mt-1.5 text-xs text-zinc-600">
                Data de emissão: <strong>{formatData(hoje)}</strong> · Turma{" "}
                <strong className="font-mono">{turma.codigo}</strong>
              </div>
            </div>
          </div>

          {/* Grelha Técnica do Curso e Turma */}
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-2xl border border-zinc-300 bg-[#FAF9F5] p-4 text-xs sm:grid-cols-4">
            <div className="col-span-2">
              <span className="text-zinc-500">Curso / Ação de Formação:</span>
              <div className="mt-0.5 font-bold text-[#1C1D21]">{turma.formacao.nome}</div>
            </div>
            <div>
              <span className="text-zinc-500">Categoria:</span>
              <div className="mt-0.5 font-semibold text-[#1C1D21]">
                {turma.formacao.categoria === "TECNICA" ? "Técnica" : "Comportamental"}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Carga Horária Total:</span>
              <div className="mt-0.5 font-bold text-[#1C1D21]">{turma.formacao.cargaHoraria} horas</div>
            </div>

            <div>
              <span className="text-zinc-500">Código e Estado:</span>
              <div className="mt-0.5 font-mono font-bold text-[#1C1D21]">
                {turma.codigo} ({ESTADOS_TURMA[turma.estado].label})
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Período de Realização:</span>
              <div className="mt-0.5 font-semibold text-[#1C1D21]">{intervaloDatas}</div>
            </div>
            <div>
              <span className="text-zinc-500">Formador(es):</span>
              <div className="mt-0.5 font-semibold text-[#1C1D21]">
                {formadoresNomes.length > 0 ? formadoresNomes.join(", ") : "A designar"}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Sala(s) de Formação:</span>
              <div className="mt-0.5 font-semibold text-[#1C1D21]">
                {salasNomes.length > 0 ? salasNomes.join(", ") : "A definir"}
              </div>
            </div>
          </div>
        </header>

        {/* Tabela Numerada de Assiduidade / Pauta */}
        <div className="mt-6 overflow-x-auto">
          {linhas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-500">
              Não existem formandos inscritos nesta turma.
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[#1C1D21] text-white print:bg-zinc-900">
                  <th className="w-9 border border-zinc-300 px-2 py-2 text-center font-bold">N.º</th>
                  <th className="min-w-[200px] border border-zinc-300 px-3 py-2 text-left font-bold">
                    Nome Completo do Formando
                  </th>

                  {sessoes.length > 0
                    ? sessoes.map((s, idx) => (
                        <th
                          key={s.id}
                          className="min-w-[50px] border border-zinc-300 px-1.5 py-1.5 text-center font-semibold"
                          title={`${formatData(dataSimples(diaLocal(s.inicio)))} (${formatHora(s.inicio)}–${formatHora(s.fim)})`}
                        >
                          <div className="text-[11px] font-bold text-[#FBD34D]">S{idx + 1}</div>
                          <div className="text-[10px] font-normal text-zinc-200">
                            {dataCurta(diaLocal(s.inicio))}
                          </div>
                        </th>
                      ))
                    : colunasEmBranco.map((n) => (
                        <th
                          key={n}
                          className="min-w-[64px] border border-zinc-300 px-2 py-1.5 text-center font-semibold"
                        >
                          <div className="text-[11px] font-bold text-[#FBD34D]">S{n}</div>
                          <div className="text-[10px] font-normal text-zinc-300">___/___</div>
                        </th>
                      ))}

                  <th className="w-20 border border-zinc-300 px-2 py-2 text-center font-bold">% Assid.</th>

                  {modo === "pauta" && (
                    <>
                      <th className="w-28 border border-zinc-300 px-2.5 py-2 text-right font-bold">Pago</th>
                      <th className="w-28 border border-zinc-300 px-2.5 py-2 text-right font-bold">Em Dívida</th>
                      <th className="w-40 border border-zinc-300 px-2.5 py-2 text-left font-bold">
                        Elegibilidade Certificado
                      </th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {linhas.map(({ numero, m, resumo, assiduidade, elegibilidade }, rowIdx) => {
                  const certAtivo = m.certificado && !m.certificado.revogadoEm ? m.certificado : null;
                  return (
                    <tr key={m.id} className={rowIdx % 2 === 1 ? "bg-[#FAF9F5]" : "bg-white"}>
                      <td className="border border-zinc-300 px-2 py-2 text-center font-mono font-semibold text-zinc-600">
                        {String(numero).padStart(2, "0")}
                      </td>
                      <td className="border border-zinc-300 px-3 py-2">
                        <div className="font-semibold text-[#1C1D21]">{m.formando.nome}</div>
                        <div className="font-mono text-[10px] text-zinc-500">{m.formando.whatsapp}</div>
                      </td>

                      {sessoes.length > 0
                        ? sessoes.map((s) => {
                            const reg = s.presencas.find((p) => p.matriculaId === m.id);
                            const temChamada = s.presencas.length > 0;
                            const estadoEfetivo =
                              reg?.estado ?? (s.estado === "REALIZADA" && temChamada ? "PRESENTE" : null);

                            if (!estadoEfetivo) {
                              return (
                                <td
                                  key={s.id}
                                  className="h-9 min-w-[50px] border border-zinc-300 px-1.5 py-1 text-center align-bottom"
                                  aria-label="Espaço para assinatura"
                                >
                                  <span className="block border-b border-dotted border-zinc-300 pt-3" />
                                </td>
                              );
                            }

                            const sigla =
                              estadoEfetivo === "PRESENTE" ? "P" : estadoEfetivo === "FALTA" ? "F" : "J";
                            const estilo =
                              estadoEfetivo === "PRESENTE"
                                ? "font-bold text-[#1E6332]"
                                : estadoEfetivo === "FALTA"
                                  ? "bg-[#FDECEB]/60 font-extrabold text-[#B42318]"
                                  : "bg-[#FEF3C7]/60 font-bold text-[#92400E]";

                            return (
                              <td
                                key={s.id}
                                className={cn("border border-zinc-300 px-1.5 py-2 text-center font-mono", estilo)}
                              >
                                {sigla}
                              </td>
                            );
                          })
                        : colunasEmBranco.map((n) => (
                            <td
                              key={n}
                              className="h-9 min-w-[64px] border border-zinc-300 px-2 py-1 text-center align-bottom"
                            >
                              <span className="block border-b border-dotted border-zinc-300 pt-3" />
                            </td>
                          ))}

                      <td className="border border-zinc-300 px-2 py-2 text-center font-mono font-bold">
                        {assiduidade.sessoesComChamada === 0 ? (
                          <span className="text-zinc-400">—</span>
                        ) : (
                          <span
                            className={
                              assiduidade.assiduidadePct >= cfg.minAssiduidadeCertificadoPct
                                ? "text-[#1E6332]"
                                : "text-[#B42318]"
                            }
                          >
                            {assiduidade.assiduidadePct}%
                          </span>
                        )}
                      </td>

                      {modo === "pauta" && (
                        <>
                          <td className="border border-zinc-300 px-2.5 py-2 text-right font-medium whitespace-nowrap text-[#1E6332]">
                            {formatKz(resumo.pago)}
                          </td>
                          <td
                            className={cn(
                              "border border-zinc-300 px-2.5 py-2 text-right font-semibold whitespace-nowrap",
                              resumo.divida > 0n ? "text-[#B42318]" : "text-zinc-500",
                            )}
                          >
                            {formatKz(resumo.divida)}
                          </td>
                          <td className="border border-zinc-300 px-2.5 py-2 text-[11px]">
                            {certAtivo ? (
                              <span className="font-bold text-[#1E6332]">Emitido ({certAtivo.codigo})</span>
                            ) : elegibilidade.elegivel ? (
                              <span className="font-bold text-[#1E6332]">Apto / Elegível</span>
                            ) : (
                              <span className="font-medium text-[#92400E]">
                                {[
                                  resumo.divida > 0n ? "Dívida pendente" : null,
                                  assiduidade.sessoesComChamada > 0 &&
                                  assiduidade.assiduidadePct < cfg.minAssiduidadeCertificadoPct
                                    ? `Assid. < ${cfg.minAssiduidadeCertificadoPct}%`
                                    : null,
                                  m.estado !== "CONCLUIDA" && turma.estado !== "CONCLUIDA" ? "Turma em curso" : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "Retido"}
                              </span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>

              {modo === "pauta" && (
                <tfoot>
                  <tr className="bg-[#FAF9F5] font-bold">
                    <td
                      colSpan={2 + (sessoes.length > 0 ? sessoes.length : colunasEmBranco.length) + 1}
                      className="border border-zinc-300 px-3 py-2.5 text-right uppercase"
                    >
                      Totais Financeiros da Turma ({linhas.length} formandos)
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-2.5 text-right whitespace-nowrap text-[#1E6332]">
                      {formatKz(totalPagoTurma)}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-2.5 text-right whitespace-nowrap text-[#B42318]">
                      {formatKz(totalDividaTurma)}
                    </td>
                    <td className="border border-zinc-300 px-2.5 py-2.5 text-[11px] text-zinc-600">
                      Mín. {cfg.minAssiduidadeCertificadoPct}% assid.
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {/* Legenda + Linhas de Assinatura Institucional */}
        <footer className="mt-6 space-y-12 pt-2 text-xs text-zinc-600">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dotted border-zinc-300 bg-[#FAF9F5] px-3.5 py-2 text-[11px]">
            <span>
              <strong>Legenda:</strong> <strong>P</strong> = Presente · <strong>F</strong> = Falta Injustificada ·{" "}
              <strong>J</strong> = Falta Justificada · Espaço em branco = Rubrica / assinatura presencial do formando
            </span>
            <span>
              Assiduidade mínima para certificação: <strong>{cfg.minAssiduidadeCertificadoPct}%</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-10 pt-6 text-center sm:gap-20">
            <div className="space-y-1.5">
              <div className="mx-auto max-w-xs border-t border-[#1C1D21] pt-2 font-bold text-[#1C1D21]">
                O(A) Formador(a)
              </div>
              <div className="text-[11px] text-zinc-500">
                {formadoresNomes.length > 0 ? formadoresNomes.join(" / ") : "Assinatura e data"}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="mx-auto max-w-xs border-t border-[#1C1D21] pt-2 font-bold text-[#1C1D21]">
                A Coordenação Pedagógica
              </div>
              <div className="text-[11px] text-zinc-500">{user.tenant.nome}</div>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
