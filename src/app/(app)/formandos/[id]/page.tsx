import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  Gift,
  MessageCircle,
  Pencil,
  Plus,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeEstadoMensagem } from "@/components/estado-mensagem";
import { TbodyProgressivo } from "@/components/lista-progressiva";
import { Badge, Card, CardHeader, LinkButton, Tabela, Td, Th, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { truncar } from "@/lib/configuracoes";
import { dataSimples, diaLocal, formatData, formatDataHora, hojeLocal } from "@/lib/datas";
import {
  CORES_ESTADO_PARCELA,
  NOMES_ESTADO_MATRICULA,
  NOMES_ESTADO_PARCELA,
  NOMES_FORMA_PAGAMENTO,
  NOMES_METODO,
  linkWhatsapp,
  metricasFormando,
} from "@/lib/formandos";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { NOMES_TIPO_MENSAGEM } from "@/lib/mensagens/modelos";
import { formatKz } from "@/lib/money";
import { comPago, estadoParcela, resumirParcelas } from "@/lib/parcelas";
import { pode } from "@/lib/rbac";
import { calcularSaldoPontos } from "@/lib/retencao";
import { BotoesPortal } from "../../portais/botoes-portal";
import { enviarMensagemManual } from "../actions";
import { CancelarMatricula } from "./cancelar-matricula";
import { EnviarMensagemForm } from "./comunicacoes";

export const metadata = { title: "Ficha do formando" };

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export default async function FichaFormandoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await exigir("formandos:ver");
  const verPagamentos = pode(user.perfil, "pagamentos:ver");
  const podeRegistar = pode(user.perfil, "pagamentos:registar");
  const podeMatricular = pode(user.perfil, "matriculas:editar");
  const podeEditar = pode(user.perfil, "formandos:editar");

  const f = await db.formando.findFirst({
    where: { id },
    include: {
      indicadoPor: { select: { id: true, nome: true, whatsapp: true } },
      indicados: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          nome: true,
          whatsapp: true,
          createdAt: true,
          matriculas: {
            where: { estado: { not: "CANCELADA" } },
            select: { id: true, estado: true },
          },
        },
      },
      movimentosPontos: {
        orderBy: { createdAt: "desc" },
        include: {
          indicado: { select: { id: true, nome: true } },
          matricula: { select: { id: true, turma: { select: { codigo: true } } } },
        },
      },
      matriculas: {
        orderBy: { createdAt: "desc" },
        include: {
          campanha: { select: { id: true, nome: true, descontoPct: true } },
          turma: { select: { id: true, codigo: true, estado: true, formacao: { select: { id: true, nome: true } } } },
          parcelas: { orderBy: { numero: "asc" }, include: { alocacoes: { select: { valor: true } } } },
        },
      },
    },
  });
  if (!f) notFound();

  const verMensagens = pode(user.perfil, "mensagens:ver");
  const podeGerirMensagens = pode(user.perfil, "mensagens:gerir");

  const [pagamentos, mensagens, cfg] = await Promise.all([
    verPagamentos
      ? db.pagamento.findMany({
          where: { formandoId: f.id },
          orderBy: [{ dataPagamento: "desc" }, { createdAt: "desc" }],
          include: {
            registadoPor: { select: { nome: true } },
            matricula: { select: { turma: { select: { codigo: true } } } },
          },
        })
      : Promise.resolve([]),
    verMensagens
      ? db.mensagem.findMany({
          where: { formandoId: f.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
        })
      : Promise.resolve([]),
    obterConfiguracao(comoCliente(db), user.tenantId),
  ]);

  const hoje = dataSimples(hojeLocal());
  const agora = new Date();
  const m = metricasFormando(f, hoje);
  const saldoPontos = calcularSaldoPontos(f.movimentosPontos, agora);
  const descontoPontosDisponivelPct = Math.min(
    cfg.limiteDescontoIndicacaoPct,
    saldoPontos.saldoDisponivel * cfg.percentagemPorPonto,
  );
  const elegivelFidelizacao = m.formacoesCompradas >= 1 && cfg.descontoFidelizacaoPct > 0;
  const pctInteresse = Math.max(8, Math.min(100, m.interesse.pontuacao));

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div
            className={`flex size-13 shrink-0 items-center justify-center rounded-full text-base font-bold ${
              m.interesse.nivel === "MUITO" ? "bg-[#FBD34D] text-[#1C1D21]" : "bg-[#1C1D21] text-white"
            }`}
          >
            {iniciais(f.nome)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Ficha do Formando · {f.profissao ?? "Profissão não indicada"}
              </span>
              <Badge cor={m.interesse.nivel === "MUITO" ? "verde" : "cinza"}>
                {m.interesse.nivel === "MUITO" ? "Muito interesse" : "Pouco interesse"} · {m.interesse.pontuacao} pts
              </Badge>
              {elegivelFidelizacao && (
                <span className="rounded-full bg-[#FBD34D] px-2.5 py-0.5 text-xs font-extrabold text-[#1C1D21]">
                  Fidelização -{cfg.descontoFidelizacaoPct}%
                </span>
              )}
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">{f.nome}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href="/formandos" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar
          </LinkButton>
          <LinkButton href={linkWhatsapp(f.whatsapp)} target="_blank" rel="noopener noreferrer" variante="secundario">
            <MessageCircle className="size-4 text-emerald-600" aria-hidden /> WhatsApp
          </LinkButton>
          {podeEditar && (
            <LinkButton href={`/formandos/${f.id}/editar`} variante="secundario">
              <Pencil className="size-4" aria-hidden /> Editar
            </LinkButton>
          )}
          {podeMatricular && (
            <LinkButton href={`/matriculas/nova?formandoId=${f.id}`}>
              <Plus className="size-4" aria-hidden /> Nova matrícula
            </LinkButton>
          )}
        </div>
      </div>

      {/* Bloco Editorial de Métricas + 3 Pílulas Horizontais Proporcionais (Referência 2) */}
      <div className="rounded-[26px] border border-[#E5E3DC] bg-white/95 p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)] space-y-5">
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <div className="text-xs font-medium text-slate-500">Formações compradas</div>
            <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
              {m.formacoesCompradas}{" "}
              <span className="text-sm font-medium text-slate-500">matrícula(s)</span>
            </div>
          </div>
          {verPagamentos && (
            <>
              <div>
                <div className="text-xs font-medium text-slate-500">Total liquidado</div>
                <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
                  {formatKz(m.resumo.pago)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Saldo em aberto</div>
                <div
                  className={`mt-1 text-2xl font-light tracking-tight sm:text-3xl ${
                    m.resumo.parcelasEmAtraso > 0 ? "font-normal text-[#9E2A2B]" : "text-[#1C1D21]"
                  }`}
                >
                  {formatKz(m.resumo.divida)}{" "}
                  {m.resumo.parcelasEmAtraso > 0 && (
                    <span className="text-xs font-semibold text-[#9E2A2B]">
                      ({m.resumo.parcelasEmAtraso} em atraso)
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
          <div>
            <div className="text-xs font-medium text-slate-500">Pontos de indicação</div>
            <div className="mt-1 text-2xl font-light tracking-tight text-[#1C1D21] sm:text-3xl">
              {saldoPontos.saldoDisponivel} pts{" "}
              <span className="text-xs font-semibold text-emerald-700">({descontoPontosDisponivelPct}% desc.)</span>
            </div>
          </div>
        </div>

        {/* 3 Pílulas Horizontais */}
        <div className="grid gap-2.5 sm:grid-cols-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Nível de interesse comercial</span>
              <span className="font-semibold text-[#1C1D21]">{m.interesse.pontuacao}/100 pts</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#FBD34D] px-3.5 text-xs font-bold text-[#1C1D21]">
              <span>{m.interesse.nivel === "MUITO" ? "Muito interesse" : "Pouco interesse"}</span>
              <span>{m.interesse.pontuacao} pts</span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Fidelização e Indicação</span>
              <span className="font-semibold text-[#1C1D21]">{f.indicados.length} indicado(s)</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#1C1D21] px-3.5 text-xs font-semibold text-white">
              <span>Saldo de pontos</span>
              <span className="text-[#FBD34D]">
                {saldoPontos.saldoDisponivel} pts (-{descontoPontosDisponivelPct}%)
              </span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Situação de tesouraria</span>
              <span className="font-semibold text-[#1C1D21]">
                {verPagamentos ? `${m.resumo.parcelasEmFalta} parcela(s) pendente(s)` : "Ativo"}
              </span>
            </div>
            <div className="bg-hatched flex h-10 items-center justify-between rounded-2xl border border-[#E5E3DC] px-3.5 text-xs font-semibold text-[#1C1D21]">
              <span>{m.resumo.parcelasEmAtraso > 0 ? "Com atraso" : "Regularizado"}</span>
              <span>{verPagamentos ? formatKz(m.resumo.divida) : `${m.formacoesCompradas} curso(s)`}</span>
            </div>
          </div>
        </div>

        {/* Barra de dois tons do interesse */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#ECEAE3]">
          <div className="bg-[#FBD34D]" style={{ width: `${pctInteresse}%` }} />
          <div className="bg-[#1C1D21]" style={{ width: `${Math.max(0, 100 - pctInteresse)}%` }} />
        </div>
      </div>

      {/* Grelha Assimétrica de 2 Colunas */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        {/* Coluna Esquerda: Matrículas, Pagamentos e Fidelização */}
        <div className="min-w-0 space-y-6">
          {/* 1. Matrículas e Plano de Parcelas */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1C1D21]">
                  Matrículas e Plano de Parcelas ({f.matriculas.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Histórico de inscrições, descontos aplicados e estado de cada parcela.
                </p>
              </div>
            </div>

            {f.matriculas.length === 0 && (
              <Card>
                <Vazio>Este formando ainda não tem matrículas registadas.</Vazio>
              </Card>
            )}

            {f.matriculas.map((mat) => {
              const parcelas = mat.parcelas.map(comPago);
              const resumo = resumirParcelas(parcelas, hoje);
              const cancelada = mat.estado === "CANCELADA";
              const pctPago =
                mat.valorTotal > 0n ? Math.min(100, Number((resumo.pago * 100n) / mat.valorTotal)) : 100;

              return (
                <Card key={mat.id} className={cancelada ? "opacity-70" : undefined}>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ECEAE3] px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/turmas/${mat.turma.id}`}
                          className="rounded-full bg-[#1C1D21] px-2.5 py-0.5 font-mono text-xs font-bold text-[#FBD34D] hover:opacity-90"
                        >
                          {mat.turma.codigo}
                        </Link>
                        <Link
                          href={`/formacoes/${mat.turma.formacao.id}`}
                          className="font-bold text-[#1C1D21] hover:underline"
                        >
                          {mat.turma.formacao.nome}
                        </Link>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Inscrito em {formatData(dataSimples(diaLocal(mat.createdAt)))}
                        {mat.campanha && (
                          <>
                            {" · "}Campanha:{" "}
                            <Link
                              href={`/campanhas/${mat.campanha.id}`}
                              className="font-semibold text-[#1C1D21] hover:underline"
                            >
                              {mat.campanha.nome} (-{mat.campanha.descontoPct}%)
                            </Link>
                          </>
                        )}
                        {mat.pontosResgatados > 0 && <> · {mat.pontosResgatados} pts resgatados</>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge cor={mat.estado === "ATIVA" ? "azul" : mat.estado === "CONCLUIDA" ? "verde" : "cinza"}>
                        {NOMES_ESTADO_MATRICULA[mat.estado]}
                      </Badge>
                      {verPagamentos && !cancelada && resumo.divida === 0n && (
                        <Badge cor="verde">Plano totalmente pago</Badge>
                      )}
                    </div>
                  </div>

                  {verPagamentos && (
                    <>
                      {/* Resumo financeiro da matrícula + Barra de dois tons */}
                      <div className="border-b border-[#ECEAE3] bg-[#FBFBF8] px-5 py-3.5">
                        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                          <div>
                            <div className="text-slate-500">Valor contratado</div>
                            <div className="mt-0.5 text-sm font-bold text-[#1C1D21]">{formatKz(mat.valorTotal)}</div>
                            {mat.desconto > 0n && (
                              <div className="text-[11px] font-medium text-emerald-700">
                                Desconto: -{formatKz(mat.desconto)}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-slate-500">Liquidado</div>
                            <div className="mt-0.5 text-sm font-bold text-emerald-700">{formatKz(resumo.pago)}</div>
                          </div>
                          <div>
                            <div className="text-slate-500">Em falta</div>
                            <div
                              className={`mt-0.5 text-sm font-bold ${
                                resumo.parcelasEmAtraso > 0 && !cancelada ? "text-[#9E2A2B]" : "text-[#1C1D21]"
                              }`}
                            >
                              {formatKz(resumo.divida)}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500">Parcelas por pagar</div>
                            <div className="mt-0.5 text-sm font-bold text-[#1C1D21]">
                              {resumo.parcelasEmFalta} de {parcelas.length}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[#ECEAE3]">
                          <div className="bg-[#FBD34D]" style={{ width: `${pctPago}%` }} />
                          <div className="bg-[#1C1D21]" style={{ width: `${Math.max(0, 100 - pctPago)}%` }} />
                        </div>
                      </div>

                      <Tabela>
                        <thead>
                          <tr>
                            <Th>Parcela</Th>
                            <Th>Vencimento</Th>
                            <Th className="text-right">Valor</Th>
                            <Th className="text-right">Pago</Th>
                            <Th>Estado</Th>
                          </tr>
                        </thead>
                        <TbodyProgressivo passo={10} colSpan={5}>
                          {parcelas.map((p) => {
                            const e = estadoParcela(p, hoje);
                            return (
                              <tr key={p.id}>
                                <Td className="font-semibold text-[#1C1D21]">{p.numero}.ª</Td>
                                <Td className="whitespace-nowrap text-xs">{formatData(p.vencimento)}</Td>
                                <Td className="text-right font-medium whitespace-nowrap">{formatKz(p.valor)}</Td>
                                <Td className="text-right font-semibold text-[#1C1D21] whitespace-nowrap">
                                  {formatKz(p.pago)}
                                </Td>
                                <Td>
                                  <Badge cor={cancelada && e !== "PAGA" ? "cinza" : CORES_ESTADO_PARCELA[e]}>
                                    {NOMES_ESTADO_PARCELA[e]}
                                  </Badge>
                                </Td>
                              </tr>
                            );
                          })}
                        </TbodyProgressivo>
                      </Tabela>
                    </>
                  )}

                  {!cancelada && (podeRegistar || podeMatricular) && (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-[#ECEAE3] px-5 py-3">
                      {podeMatricular && (
                        <CancelarMatricula matriculaId={mat.id} formando={f.nome} turma={mat.turma.codigo} />
                      )}
                      {podeRegistar && mat.estado === "ATIVA" && resumo.divida > 0n && (
                        <LinkButton href={`/formandos/${f.id}/pagamento?matriculaId=${mat.id}`}>
                          <CreditCard className="size-4" aria-hidden /> Registar pagamento
                        </LinkButton>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* 2. Histórico de Pagamentos */}
          {verPagamentos && (
            <Card>
              <CardHeader titulo="Histórico de Pagamentos" descricao={`${pagamentos.length} pagamento(s) registado(s)`} />
              {pagamentos.length === 0 ? (
                <Vazio>Sem pagamentos registados para este formando.</Vazio>
              ) : (
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Data</Th>
                      <Th>Turma</Th>
                      <Th>Método</Th>
                      <Th>Referência / AGT</Th>
                      <Th>Registado por</Th>
                      <Th className="text-right">Valor</Th>
                    </tr>
                  </thead>
                  <TbodyProgressivo passo={10} colSpan={6}>
                    {pagamentos.map((p) => (
                      <tr key={p.id}>
                        <Td className="whitespace-nowrap text-xs font-medium">{formatData(p.dataPagamento)}</Td>
                        <Td>
                          <span className="rounded-full bg-[#F6F5F0] px-2 py-0.5 font-mono text-xs font-semibold text-[#1C1D21]">
                            {p.matricula.turma.codigo}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap text-xs">{NOMES_METODO[p.metodo]}</Td>
                        <Td className="text-xs text-slate-600">
                          <div>{p.referencia ?? "—"}</div>
                          {p.referenciaRecibo && (
                            <div className="text-[11px] text-slate-400">AGT: {p.referenciaRecibo}</div>
                          )}
                        </Td>
                        <Td className="text-xs">
                          <div className="font-medium text-[#1C1D21]">{p.registadoPor?.nome ?? "—"}</div>
                          {p.notas && <div className="text-[11px] text-slate-500">{p.notas}</div>}
                        </Td>
                        <Td className="text-right font-bold text-[#1C1D21] whitespace-nowrap">{formatKz(p.valor)}</Td>
                      </tr>
                    ))}
                  </TbodyProgressivo>
                </Tabela>
              )}
            </Card>
          )}

          {/* 3. Programa de Indicação e Pontos */}
          <Card>
            <CardHeader
              titulo="Programa de Indicação e Pontos"
              descricao={`Cada indicado matriculado gera ${cfg.pontosPorIndicacao} pontos (${cfg.percentagemPorPonto}% por ponto, até ${cfg.limiteDescontoIndicacaoPct}% por matrícula).`}
              acoes={
                elegivelFidelizacao ? (
                  <Badge cor="verde">
                    <Gift className="mr-1 size-3.5" aria-hidden />
                    Fidelização -{cfg.descontoFidelizacaoPct}% ativa
                  </Badge>
                ) : (
                  <Badge cor="cinza">Requer 1 formação anterior</Badge>
                )
              }
            />

            <div className="grid grid-cols-2 gap-2.5 border-b border-[#ECEAE3] p-4 sm:grid-cols-4">
              <div className="rounded-2xl bg-[#FBD34D] p-3 text-[#1C1D21]">
                <div className="text-[11px] font-semibold opacity-75 uppercase">Saldo disponível</div>
                <div className="mt-0.5 text-xl font-bold">{saldoPontos.saldoDisponivel} pts</div>
                <div className="text-[11px] font-medium">={descontoPontosDisponivelPct}% de desconto</div>
              </div>
              <div className="rounded-2xl bg-[#1C1D21] p-3 text-white">
                <div className="text-[11px] font-semibold text-white/70 uppercase">Total ganhos</div>
                <div className="mt-0.5 text-xl font-bold text-[#FBD34D]">+{saldoPontos.totalGanhos} pts</div>
                <div className="text-[11px] text-white/75">{f.indicados.length} indicado(s)</div>
              </div>
              <div className="bg-hatched rounded-2xl border border-[#E5E3DC] p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Resgatados</div>
                <div className="mt-0.5 text-xl font-bold text-[#1C1D21]">{saldoPontos.totalResgatados} pts</div>
                <div className="text-[11px] text-slate-500">Em matrículas</div>
              </div>
              <div className="rounded-2xl border border-[#E5E3DC] bg-[#F8F7F3] p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Expirados</div>
                <div className="mt-0.5 text-xl font-bold text-slate-600">{saldoPontos.totalExpirados} pts</div>
                <div className="text-[11px] text-slate-500">Validade {cfg.validadePontosMeses}m</div>
              </div>
            </div>

            <div className="grid divide-y divide-[#ECEAE3] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              {/* Indicados */}
              <div>
                <div className="px-4 py-3 text-xs font-bold tracking-wide text-[#1C1D21] uppercase">
                  Formandos indicados ({f.indicados.length})
                </div>
                {f.indicados.length === 0 ? (
                  <Vazio>Este formando ainda não indicou outros formandos.</Vazio>
                ) : (
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Formando</Th>
                        <Th>Data</Th>
                        <Th>Estado</Th>
                      </tr>
                    </thead>
                    <TbodyProgressivo passo={10} colSpan={3}>
                      {f.indicados.map((ind) => {
                        const temMatricula = ind.matriculas.length > 0;
                        return (
                          <tr key={ind.id}>
                            <Td>
                              <Link
                                href={`/formandos/${ind.id}`}
                                className="font-semibold text-[#1C1D21] hover:underline"
                              >
                                {ind.nome}
                              </Link>
                              <div className="font-mono text-xs text-slate-500">{ind.whatsapp}</div>
                            </Td>
                            <Td className="whitespace-nowrap text-xs">
                              {formatData(dataSimples(diaLocal(ind.createdAt)))}
                            </Td>
                            <Td>
                              {temMatricula ? (
                                <Badge cor="verde">Matriculado ({ind.matriculas.length})</Badge>
                              ) : (
                                <Badge cor="amarelo">Sem matrícula</Badge>
                              )}
                            </Td>
                          </tr>
                        );
                      })}
                    </TbodyProgressivo>
                  </Tabela>
                )}
              </div>

              {/* Movimentos de pontos */}
              <div>
                <div className="px-4 py-3 text-xs font-bold tracking-wide text-[#1C1D21] uppercase">
                  Histórico de pontos ({f.movimentosPontos.length})
                </div>
                {f.movimentosPontos.length === 0 ? (
                  <Vazio>Sem movimentos de pontos registados.</Vazio>
                ) : (
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Data</Th>
                        <Th>Motivo</Th>
                        <Th className="text-right">Pts</Th>
                      </tr>
                    </thead>
                    <TbodyProgressivo passo={10} colSpan={3}>
                      {f.movimentosPontos.map((mov) => {
                        const expirado =
                          mov.expiraEm && mov.expiraEm.getTime() < agora.getTime() && mov.pontos > 0;
                        return (
                          <tr key={mov.id}>
                            <Td className="whitespace-nowrap text-xs">
                              <div>{formatData(dataSimples(diaLocal(mov.createdAt)))}</div>
                              {mov.expiraEm && (
                                <div className={`text-[11px] ${expirado ? "text-red-600 line-through" : "text-slate-400"}`}>
                                  Val: {formatData(dataSimples(diaLocal(mov.expiraEm)))}
                                </div>
                              )}
                            </Td>
                            <Td className="text-xs">
                              <div className="font-medium text-[#1C1D21]">{mov.motivo}</div>
                              {mov.indicado && (
                                <div className="text-slate-500">
                                  Indicado:{" "}
                                  <Link
                                    href={`/formandos/${mov.indicado.id}`}
                                    className="font-semibold text-[#1C1D21] hover:underline"
                                  >
                                    {mov.indicado.nome}
                                  </Link>
                                </div>
                              )}
                            </Td>
                            <Td className="text-right font-bold whitespace-nowrap">
                              <span className={mov.pontos > 0 ? "text-emerald-700" : "text-[#1C1D21]"}>
                                {mov.pontos > 0 ? `+${mov.pontos}` : mov.pontos}
                              </span>
                            </Td>
                          </tr>
                        );
                      })}
                    </TbodyProgressivo>
                  </Tabela>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Coluna Direita (350px) — Ficha de Perfil, Portal & Comunicações */}
        <div className="space-y-5">
          {/* 1. Cartão de Perfil com Linhas Pontilhadas (Referência 2) */}
          <div className="rounded-[26px] border border-[#E5E3DC] bg-white p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)]">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D]">
                <UserRound className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="truncate font-bold text-[#1C1D21]">Dados do Formando</div>
                <div className="truncate text-xs text-slate-500">{f.profissao ?? "Profissão não indicada"}</div>
              </div>
            </div>

            <div className="mt-5 space-y-2.5 text-xs">
              <div className="flex items-baseline">
                <span className="text-slate-500">WhatsApp</span>
                <span className="leader-dots" />
                <a
                  href={linkWhatsapp(f.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono font-bold text-[#1C1D21] hover:underline"
                >
                  {f.whatsapp}
                </a>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Email</span>
                <span className="leader-dots" />
                <span className="max-w-44 truncate font-semibold text-[#1C1D21]">{f.email ?? "—"}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Aniversário</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">
                  {f.dataNascimento ? formatData(f.dataNascimento) : "—"}
                </span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Intenção de compra</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{f.intencaoCompra ? "Sim" : "Não"}</span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Pagamento preferido</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">
                  {f.formaPagamentoPreferida ? NOMES_FORMA_PAGAMENTO[f.formaPagamentoPreferida] : "—"}
                </span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Avaliação da equipa</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">
                  {f.avaliacaoEquipa ? (
                    <span aria-label={`${f.avaliacaoEquipa} de 5`}>
                      <span className="text-amber-500">{"★".repeat(f.avaliacaoEquipa)}</span>
                      <span className="text-slate-300">{"★".repeat(5 - f.avaliacaoEquipa)}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              <div className="flex items-baseline">
                <span className="text-slate-500">Indicado por</span>
                <span className="leader-dots" />
                {f.indicadoPor ? (
                  <Link href={`/formandos/${f.indicadoPor.id}`} className="font-bold text-[#1C1D21] hover:underline">
                    {f.indicadoPor.nome}
                  </Link>
                ) : (
                  <span className="font-semibold text-slate-400">—</span>
                )}
              </div>
            </div>

            {f.notas && (
              <div className="mt-4 rounded-2xl bg-[#F8F7F3] p-3 text-xs whitespace-pre-line text-slate-700">
                <div className="mb-1 font-semibold text-[#1C1D21]">Notas da equipa</div>
                {f.notas}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-[#F8F7F3] p-3">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <CalendarDays className="size-3.5" aria-hidden />
                  <span className="text-[11px]">Cursos</span>
                </div>
                <div className="mt-1 text-base font-bold text-[#1C1D21]">{m.formacoesCompradas}</div>
              </div>
              <div className="rounded-2xl bg-[#FBD34D]/25 p-3">
                <div className="flex items-center gap-1.5 text-[#1C1D21]">
                  <Sparkles className="size-3.5" aria-hidden />
                  <span className="text-[11px] font-medium">Interesse</span>
                </div>
                <div className="mt-1 text-base font-bold text-[#1C1D21]">{m.interesse.pontuacao} pts</div>
              </div>
            </div>
          </div>

          {/* 2. Portal do Formando */}
          <div className="rounded-[26px] border border-[#E5E3DC] bg-white p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)] space-y-3">
            <div>
              <div className="text-sm font-bold text-[#1C1D21]">Portal do Formando</div>
              <p className="mt-0.5 text-xs text-slate-500">
                Link direto para o formando consultar horários, parcelas e programa Indique um Amigo.
              </p>
            </div>
            <BotoesPortal
              tipo="formando"
              id={f.id}
              nome={f.nome}
              portalToken={f.portalToken}
              temTelefone={Boolean(f.whatsapp)}
            />
          </div>

          {/* 3. Comunicações WhatsApp */}
          {verMensagens && (
            <Card>
              <CardHeader
                titulo="Comunicações WhatsApp"
                descricao={`${mensagens.length} mensagem(ns)`}
                acoes={
                  <Link
                    href={`/mensagens?formandoId=${f.id}`}
                    className="text-xs font-semibold text-[#1C1D21] hover:underline"
                  >
                    Ver todas →
                  </Link>
                }
              />
              {mensagens.length === 0 ? (
                <Vazio>Ainda não foram enviadas mensagens a este formando.</Vazio>
              ) : (
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Data / Tipo</Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <TbodyProgressivo passo={10} colSpan={2}>
                    {mensagens.map((msg) => (
                      <tr key={msg.id}>
                        <Td>
                          <Link
                            href={`/mensagens/${msg.id}`}
                            className="text-xs font-semibold text-[#1C1D21] hover:underline"
                          >
                            {NOMES_TIPO_MENSAGEM[msg.tipo]}
                          </Link>
                          <div className="text-[11px] text-slate-400">{formatDataHora(msg.createdAt)}</div>
                          <div className="mt-0.5 text-xs text-slate-600">{truncar(msg.texto, 65)}</div>
                        </Td>
                        <Td className="align-top">
                          <BadgeEstadoMensagem estado={msg.estado} />
                        </Td>
                      </tr>
                    ))}
                  </TbodyProgressivo>
                </Tabela>
              )}
              {podeGerirMensagens && (
                <EnviarMensagemForm acao={enviarMensagemManual.bind(null, f.id)} whatsapp={f.whatsapp} />
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}


