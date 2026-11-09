import {
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  MapPin,
  Star,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, Tabela, Td, Th, Vazio } from "@/components/ui";
import { CRITERIOS, formatNota, mediasAvaliacoes } from "@/lib/avaliacoes";
import { NOMES_CATEGORIA } from "@/lib/catalogo";
import { dataSimples, diaLocal, formatData, formatDiaSemana, formatHora } from "@/lib/datas";
import { dbTenant, prisma } from "@/lib/db";
import { custoSessao } from "@/lib/financeiro";
import { NOMES_METODO } from "@/lib/formandos";
import { formatKz } from "@/lib/money";
import { formatHoras, horasSessao, precoHoraFormador, totalHoras } from "@/lib/precos-formador";
import { FormConfirmarSessaoPortal } from "./forms";

type Props = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const formador = await prisma.formador.findUnique({
    where: { portalToken: token },
    select: { nome: true, ativo: true, tenant: { select: { nome: true } } },
  });
  if (!formador || !formador.ativo) {
    return { title: "Portal do Formador" };
  }
  return {
    title: `${formador.nome} — Portal do Formador · ${formador.tenant.nome}`,
  };
}

export default async function PortalFormadorPage({ params }: Props) {
  const { token } = await params;

  const formadorBase = await prisma.formador.findUnique({
    where: { portalToken: token },
    include: { tenant: true },
  });

  if (!formadorBase || !formadorBase.ativo) {
    notFound();
  }

  const db = dbTenant({ tenantId: formadorBase.tenantId });

  const [areas, competencias, precos, avaliacoes, sessoes, despesas] = await Promise.all([
    db.area.findMany({
      where: { formadores: { some: { id: formadorBase.id } } },
      orderBy: { nome: "asc" },
    }),
    db.competencia.findMany({
      where: { formadores: { some: { id: formadorBase.id } } },
      orderBy: { nome: "asc" },
    }),
    db.precoFormadorFormacao.findMany({
      where: { formadorId: formadorBase.id },
      include: { formacao: { select: { id: true, nome: true, categoria: true } } },
    }),
    db.avaliacaoFormador.findMany({
      where: { formadorId: formadorBase.id },
      orderBy: { createdAt: "desc" },
    }),
    db.sessao.findMany({
      where: { formadorId: formadorBase.id },
      orderBy: { inicio: "asc" },
      include: {
        turma: {
          select: {
            id: true,
            codigo: true,
            estado: true,
            formacao: { select: { id: true, nome: true, categoria: true } },
          },
        },
        sala: { select: { id: true, nome: true } },
      },
    }),
    db.despesa.findMany({
      where: { categoria: "FORMADOR", formadorId: formadorBase.id },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const overridePorFormacao = new Map(precos.map((p) => [p.formacaoId, p.precoHora]));
  const precosCat = {
    precoHoraComportamental: formadorBase.precoHoraComportamental,
    precoHoraTecnica: formadorBase.precoHoraTecnica,
  };

  const sessoesAgendadas = sessoes.filter((s) => s.estado === "AGENDADA");
  const sessoesRealizadas = sessoes
    .filter((s) => s.estado === "REALIZADA")
    .sort((a, b) => b.inicio.getTime() - a.inicio.getTime());

  const horasConfirmadas = totalHoras(sessoesRealizadas);

  let valorDevido = 0n;
  for (const s of sessoesRealizadas) {
    const ph = precoHoraFormador(
      precosCat,
      s.turma.formacao.categoria,
      overridePorFormacao.get(s.turma.formacao.id) ?? null,
    );
    valorDevido += custoSessao(s, ph);
  }

  let valorPago = 0n;
  for (const d of despesas) {
    valorPago += d.valor;
  }

  const emFalta = valorDevido > valorPago ? valorDevido - valorPago : 0n;
  const medias = mediasAvaliacoes(avaliacoes);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Cabeçalho do Portal do Formador */}
      <header className="bg-gradient-to-br from-slate-900 via-marca-950 to-marca-800 text-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-marca-100 backdrop-blur">
              <GraduationCap className="size-4" aria-hidden />
              <span>{formadorBase.tenant.nome}</span>
              <span className="opacity-60">·</span>
              <span>Portal do Formador</span>
            </div>
            <Link
              href={`/p/${formadorBase.tenant.slug}`}
              className="text-xs font-medium text-marca-100 underline-offset-4 hover:text-white hover:underline"
            >
              Ver catálogo público do centro ↗
            </Link>
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{formadorBase.nome}</h1>
          <p className="mt-1 text-sm text-slate-300">
            {[formadorBase.email, formadorBase.telefone].filter(Boolean).join(" · ") ||
              "Área pessoal de agenda, confirmação de aulas e consulta de honorários."}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {areas.map((a) => (
              <span
                key={a.id}
                className="rounded-full bg-white/15 px-2.5 py-1 font-medium text-white"
              >
                {a.nome}
              </span>
            ))}
            {competencias.map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-slate-800/80 px-2.5 py-1 text-slate-200 ring-1 ring-white/15"
              >
                {c.nome}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4 text-xs text-slate-200">
            <div>
              <span className="text-slate-400">Valor/hora Comportamental:</span>{" "}
              <strong className="font-semibold text-white">
                {formatKz(formadorBase.precoHoraComportamental)}
              </strong>
            </div>
            <div>
              <span className="text-slate-400">Valor/hora Técnica:</span>{" "}
              <strong className="font-semibold text-white">
                {formatKz(formadorBase.precoHoraTecnica)}
              </strong>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        {/* 4 Cartões de KPI */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between text-xs font-medium tracking-wide text-slate-500 uppercase">
              <span>Próximas sessões</span>
              <CalendarDays className="size-4 text-marca-600" aria-hidden />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{sessoesAgendadas.length}</div>
            <div className="mt-0.5 text-xs text-slate-500">Sessão(ões) agendada(s)</div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between text-xs font-medium tracking-wide text-slate-500 uppercase">
              <span>Horas confirmadas</span>
              <Clock className="size-4 text-emerald-600" aria-hidden />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{formatHoras(horasConfirmadas)}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {sessoesRealizadas.length} sessão(ões) realizada(s)
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between text-xs font-medium tracking-wide text-slate-500 uppercase">
              <span>Honorários em aberto</span>
              <Wallet className="size-4 text-amber-600" aria-hidden />
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900">{formatKz(emFalta)}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              Apurado: {formatKz(valorDevido)} · Pago: {formatKz(valorPago)}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between text-xs font-medium tracking-wide text-slate-500 uppercase">
              <span>Avaliação média</span>
              <Star className="size-4 text-amber-500" aria-hidden />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {medias.geral !== null ? `${formatNota(medias.geral)} / 5` : "—"}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">{medias.total} avaliação(ões)</div>
          </Card>
        </div>

        {/* Secção 1: Calendário de Sessões e Confirmação de Horas */}
        <Card>
          <CardHeader
            titulo="Calendário de Sessões e Confirmação de Horas"
            descricao="Confirme as sessões lecionadas e registe o sumário da aula para apuramento automático dos seus honorários."
          />

          <div className="divide-y divide-slate-100">
            {/* Sessões Agendadas */}
            <div className="p-4">
              <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Sessões agendadas ({sessoesAgendadas.length})
              </h3>
              {sessoesAgendadas.length === 0 ? (
                <Vazio>Não tem sessões agendadas pendentes de confirmação.</Vazio>
              ) : (
                <ul className="space-y-3">
                  {sessoesAgendadas.map((s) => {
                    const duracao = horasSessao(s);
                    const ph = precoHoraFormador(
                      precosCat,
                      s.turma.formacao.categoria,
                      overridePorFormacao.get(s.turma.formacao.id) ?? null,
                    );
                    return (
                      <li
                        key={s.id}
                        className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-slate-900">
                                {s.turma.formacao.nome}
                              </span>
                              <Badge cor="azul">Turma {s.turma.codigo}</Badge>
                              <Badge cor="amarelo">Agendada</Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                              <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                                <CalendarDays className="size-3.5 text-marca-600" aria-hidden />
                                {formatDiaSemana(s.inicio)} ({formatData(dataSimples(diaLocal(s.inicio)))})
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="size-3.5 text-slate-400" aria-hidden />
                                {formatHora(s.inicio)}–{formatHora(s.fim)} ({formatHoras(duracao)})
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="size-3.5 text-slate-400" aria-hidden />
                                {s.sala.nome}
                              </span>
                            </div>
                          </div>

                          <div className="text-right text-xs text-slate-500">
                            <div>Valor/hora: {formatKz(ph)}</div>
                            <div className="font-semibold text-slate-800">
                              Previsto: {formatKz(custoSessao(s, ph))}
                            </div>
                          </div>
                        </div>

                        {s.notas && (
                          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            {s.notas}
                          </p>
                        )}

                        <FormConfirmarSessaoPortal
                          portalToken={token}
                          sessaoId={s.id}
                          estadoAtual={s.estado}
                          horasPadrao={duracao}
                          notasAtuais={s.notas}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Sessões Realizadas */}
            <div className="p-4">
              <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Sessões realizadas confirmadas ({sessoesRealizadas.length})
              </h3>
              {sessoesRealizadas.length === 0 ? (
                <Vazio>Ainda não existem sessões realizadas confirmadas.</Vazio>
              ) : (
                <ul className="space-y-3">
                  {sessoesRealizadas.map((s) => {
                    const h = horasSessao(s);
                    const ph = precoHoraFormador(
                      precosCat,
                      s.turma.formacao.categoria,
                      overridePorFormacao.get(s.turma.formacao.id) ?? null,
                    );
                    const valor = custoSessao(s, ph);
                    return (
                      <li
                        key={s.id}
                        className="rounded-xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-slate-900">
                                {s.turma.formacao.nome}
                              </span>
                              <Badge cor="cinza">Turma {s.turma.codigo}</Badge>
                              <Badge cor="verde">
                                <CheckCircle2 className="mr-1 size-3" aria-hidden />
                                Realizada · {formatHoras(h)}
                              </Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                              <span>
                                {formatDiaSemana(s.inicio)} ({formatData(dataSimples(diaLocal(s.inicio)))})
                              </span>
                              <span>
                                {formatHora(s.inicio)}–{formatHora(s.fim)}
                              </span>
                              <span>Sala: {s.sala.nome}</span>
                              <span>{NOMES_CATEGORIA[s.turma.formacao.categoria]}</span>
                            </div>
                          </div>

                          <div className="text-right text-xs">
                            <div className="text-slate-500">{formatKz(ph)} / hora</div>
                            <div className="text-sm font-semibold text-emerald-700">
                              {formatKz(valor)}
                            </div>
                          </div>
                        </div>

                        {s.notas && (
                          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs whitespace-pre-line text-slate-700">
                            <strong className="font-medium text-slate-900">Sumário:</strong> {s.notas}
                          </p>
                        )}

                        <FormConfirmarSessaoPortal
                          portalToken={token}
                          sessaoId={s.id}
                          estadoAtual={s.estado}
                          horasPadrao={h}
                          notasAtuais={s.notas}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </Card>

        {/* Secção 2: Histórico de Pagamentos Recebidos */}
        <Card>
          <CardHeader
            titulo="Histórico de Pagamentos Recebidos"
            descricao="Pagamentos de honorários liquidados pelo centro de formação."
            acoes={
              emFalta > 0n ? (
                <Badge cor="amarelo">Saldo a receber: {formatKz(emFalta)}</Badge>
              ) : valorDevido > 0n ? (
                <Badge cor="verde">Honorários em dia</Badge>
              ) : undefined
            }
          />
          {despesas.length === 0 ? (
            <Vazio>Ainda não existem pagamentos de honorários registados.</Vazio>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Descrição</Th>
                  <Th className="text-right">Horas pagas</Th>
                  <Th>Método / Ref.</Th>
                  <Th className="text-right">Valor pago</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {despesas.map((d) => (
                  <tr key={d.id}>
                    <Td className="whitespace-nowrap">{formatData(d.data)}</Td>
                    <Td>
                      <div className="font-medium text-slate-900">{d.descricao}</div>
                      {d.notas && <div className="text-xs text-slate-500">{d.notas}</div>}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {d.horasPagas ? formatHoras(Number(d.horasPagas.toString())) : "—"}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div>{NOMES_METODO[d.metodo]}</div>
                      {d.referencia && <div className="text-xs text-slate-500">Ref.: {d.referencia}</div>}
                    </Td>
                    <Td className="text-right font-semibold whitespace-nowrap text-emerald-700">
                      {formatKz(d.valor)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Card>

        {/* Resumo de Avaliações Pedagógicas (se houver) */}
        {medias.total > 0 && (
          <Card>
            <CardHeader
              titulo="Desempenho Pedagógico"
              descricao={`Média de ${medias.total} avaliação(ões) realizada(s) pela coordenação pedagógica.`}
            />
            <div className="space-y-2 p-4">
              {CRITERIOS.map((c) => {
                const v = medias.porCriterio[c.campo] ?? 0;
                return (
                  <div
                    key={c.campo}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[18rem_1fr_auto]"
                  >
                    <span className="text-sm text-slate-700">{c.nome}</span>
                    <div className="order-last col-span-2 h-2 rounded-full bg-slate-100 sm:order-none sm:col-span-1">
                      <div
                        className="h-2 rounded-full bg-marca-500"
                        style={{ width: `${(v / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {formatNota(medias.porCriterio[c.campo])}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
