import {
  ArrowUpRight,
  CalendarDays,
  Clock,
  GraduationCap,
  MapPin,
  Star,
  UserCheck,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GrelhaProgressiva, TbodyProgressivo } from "@/components/lista-progressiva";
import { Badge, Card, CardHeader, Tabela, Td, Th, Vazio } from "@/components/ui";
import { CRITERIOS, formatNota, mediasAvaliacoes } from "@/lib/avaliacoes";
import { NOMES_CATEGORIA } from "@/lib/catalogo";
import { dataSimples, diaLocal, formatData, formatDiaSemana, formatHora } from "@/lib/datas";
import { dbTenant, prisma } from "@/lib/db";
import { custoSessao } from "@/lib/financeiro";
import { NOMES_METODO } from "@/lib/formandos";
import { formatKz } from "@/lib/money";
import { formatHoras, horasSessao, precoHoraFormador, totalHoras } from "@/lib/precos-formador";
import { CORES_ESTADO_PRESENCA, NOMES_ESTADO_PRESENCA } from "@/lib/presencas";
import { FormConfirmarSessaoPortal } from "./forms";

type Props = {
  params: Promise<{ token: string }>;
};

function iniciaisNome(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "GA";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

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
            matriculas: {
              where: { estado: { not: "CANCELADA" } },
              orderBy: { formando: { nome: "asc" } },
              select: {
                id: true,
                formando: { select: { nome: true } },
              },
            },
          },
        },
        sala: { select: { id: true, nome: true } },
        presencas: {
          select: { matriculaId: true, estado: true, observacao: true },
        },
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
  const iniciais = iniciaisNome(formadorBase.nome);
  const iniciaisCentro = iniciaisNome(formadorBase.tenant.nome);

  return (
    <div className="min-h-dvh bg-[#F5F4EF] text-[#1C1D21]">
      {/* Barra superior editorial */}
      <nav className="sticky top-0 z-30 border-b border-zinc-200/70 bg-[#F5F4EF]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-[#1C1D21] text-xs font-extrabold tracking-wider text-[#FBD34D] shadow-2xs">
              {iniciaisCentro}
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-tight text-[#1C1D21] uppercase">
                {formadorBase.tenant.nome}
              </div>
              <div className="text-[11px] font-medium text-zinc-500">Portal Pessoal do Formador</div>
            </div>
          </div>

          <Link
            href={`/p/${formadorBase.tenant.slug}`}
            className="inline-flex min-h-9.5 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-[#1C1D21] shadow-2xs ring-1 ring-zinc-200/80 transition-all hover:-translate-y-0.5 hover:bg-[#FAF9F5]"
          >
            Catálogo do Centro <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {/* Hero do Formador */}
        <section className="anim-enter rounded-[2rem] border border-zinc-900/15 bg-[#1C1D21] p-6 text-white shadow-xl sm:p-8">
          <div className="grid items-center gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#FBD34D] text-lg font-extrabold text-[#1C1D21] shadow-sm">
                  {iniciais}
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-0.5 text-[11px] font-semibold text-[#FBD34D]">
                    <GraduationCap className="size-3.5" aria-hidden /> Formador Certificado
                  </div>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    {formadorBase.nome}
                  </h1>
                  <p className="mt-0.5 text-xs text-zinc-300 sm:text-sm">
                    {[formadorBase.email, formadorBase.telefone].filter(Boolean).join(" · ") ||
                      "Área pessoal de agenda, confirmação de aulas, chamada nominal e consulta de honorários."}
                  </p>
                </div>
              </div>

              {(areas.length > 0 || competencias.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                  {areas.map((a) => (
                    <span
                      key={a.id}
                      className="rounded-full bg-[#FBD34D] px-3 py-1 font-semibold text-[#1C1D21]"
                    >
                      {a.nome}
                    </span>
                  ))}
                  {competencias.map((c) => (
                    <span
                      key={c.id}
                      className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-zinc-200"
                    >
                      {c.nome}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Cartão lateral de Tabela de Honorários */}
            <div className="rounded-3xl border border-white/15 bg-[#FAF9F5] p-5 text-[#1C1D21] shadow-lg">
              <div className="mb-3 flex items-center justify-between border-b border-dotted border-zinc-300 pb-2">
                <span className="text-xs font-bold tracking-wider text-zinc-600 uppercase">Tabela de Honorários</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F4E8] px-2.5 py-0.5 text-[11px] font-semibold text-[#1E6332]">
                  <span className="size-1.5 rounded-full bg-[#288042]" aria-hidden /> Ativo
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Valor/hora Técnica</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">{formatKz(formadorBase.precoHoraTecnica)}</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Valor/hora Comportamental</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">{formatKz(formadorBase.precoHoraComportamental)}</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Total já liquidado</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1E6332]">{formatKz(valorPago)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4 Cartões de KPI */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Próximas Sessões</span>
              <span className="flex size-9 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D]">
                <CalendarDays className="size-4" aria-hidden />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
              {sessoesAgendadas.length}
            </div>
            <div className="mt-1 text-xs text-zinc-500">Sessão(ões) agendada(s)</div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Horas Confirmadas</span>
              <span className="flex size-9 items-center justify-center rounded-full bg-[#E7F4E8] text-[#1E6332]">
                <Clock className="size-4" aria-hidden />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
              {formatHoras(horasConfirmadas)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {sessoesRealizadas.length} sessão(ões) realizada(s)
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Honorários em Aberto</span>
              <span className="flex size-9 items-center justify-center rounded-full bg-[#FBD34D] text-[#1C1D21]">
                <Wallet className="size-4" aria-hidden />
              </span>
            </div>
            <div className="mt-3 text-xl font-bold tracking-tight text-[#1C1D21] sm:text-2xl">
              {formatKz(emFalta)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Apurado: {formatKz(valorDevido)} · Pago: {formatKz(valorPago)}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Avaliação Média</span>
              <span className="flex size-9 items-center justify-center rounded-full bg-[#F5F4EF] text-[#1C1D21]">
                <Star className="size-4" aria-hidden />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
              {medias.geral !== null ? `${formatNota(medias.geral)} / 5` : "—"}
            </div>
            <div className="mt-1 text-xs text-zinc-500">{medias.total} avaliação(ões)</div>
          </Card>
        </div>

        {/* Secção 1: Calendário de Sessões, Chamada Nominal e Confirmação de Horas */}
        <Card>
          <CardHeader
            titulo="Calendário de Sessões, Chamada Nominal e Confirmação de Horas"
            descricao="Confirme as sessões lecionadas, registe o sumário da aula e efetue a chamada nominal dos formandos."
          />

          <div className="divide-y divide-dotted divide-zinc-200">
            {/* Sessões Agendadas */}
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                  Sessões agendadas ({sessoesAgendadas.length})
                </h3>
                {sessoesAgendadas.length > 0 && <Badge cor="amarelo">Aguardam confirmação</Badge>}
              </div>

              {sessoesAgendadas.length === 0 ? (
                <Vazio>Não tem sessões agendadas pendentes de confirmação.</Vazio>
              ) : (
                <GrelhaProgressiva className="space-y-3" labelItem="sessões">
                  {sessoesAgendadas.map((s) => {
                    const duracao = horasSessao(s);
                    const ph = precoHoraFormador(
                      precosCat,
                      s.turma.formacao.categoria,
                      overridePorFormacao.get(s.turma.formacao.id) ?? null,
                    );
                    const mapaPresencas = new Map(s.presencas.map((p) => [p.matriculaId, p.estado]));
                    const alunosChamada = s.turma.matriculas.map((m) => ({
                      matriculaId: m.id,
                      nome: m.formando.nome,
                      estadoInicial: mapaPresencas.get(m.id) ?? "PRESENTE",
                    }));

                    return (
                      <div
                        key={s.id}
                        className="rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] p-5 transition-colors hover:bg-white"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-bold text-[#1C1D21]">
                                {s.turma.formacao.nome}
                              </span>
                              <Badge cor="azul">Turma {s.turma.codigo}</Badge>
                              <Badge cor="amarelo">Agendada</Badge>
                              <Badge cor="cinza">{alunosChamada.length} formando(s)</Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-600">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-[#1C1D21]">
                                <CalendarDays className="size-3.5 text-[#1C1D21]" aria-hidden />
                                {formatDiaSemana(s.inicio)} ({formatData(dataSimples(diaLocal(s.inicio)))})
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="size-3.5 text-zinc-400" aria-hidden />
                                {formatHora(s.inicio)}–{formatHora(s.fim)} ({formatHoras(duracao)})
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="size-3.5 text-zinc-400" aria-hidden />
                                {s.sala.nome}
                              </span>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-white px-3.5 py-2 text-right text-xs ring-1 ring-zinc-200/80">
                            <div className="text-zinc-500">Valor/hora: {formatKz(ph)}</div>
                            <div className="font-bold text-[#1C1D21]">
                              Previsto: {formatKz(custoSessao(s, ph))}
                            </div>
                          </div>
                        </div>

                        {s.notas && (
                          <p className="mt-3 rounded-xl bg-white px-3.5 py-2 text-xs text-zinc-600 ring-1 ring-zinc-200/70">
                            {s.notas}
                          </p>
                        )}

                        <FormConfirmarSessaoPortal
                          portalToken={token}
                          sessaoId={s.id}
                          estadoAtual={s.estado}
                          horasPadrao={duracao}
                          notasAtuais={s.notas}
                          alunos={alunosChamada}
                        />
                      </div>
                    );
                  })}
                </GrelhaProgressiva>
              )}
            </div>

            {/* Sessões Realizadas */}
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                  Sessões realizadas confirmadas ({sessoesRealizadas.length})
                </h3>
                {sessoesRealizadas.length > 0 && (
                  <Badge cor="verde">{formatHoras(horasConfirmadas)} lecionadas</Badge>
                )}
              </div>

              {sessoesRealizadas.length === 0 ? (
                <Vazio>Ainda não existem sessões realizadas confirmadas.</Vazio>
              ) : (
                <GrelhaProgressiva className="space-y-3" labelItem="sessões">
                  {sessoesRealizadas.map((s) => {
                    const h = horasSessao(s);
                    const ph = precoHoraFormador(
                      precosCat,
                      s.turma.formacao.categoria,
                      overridePorFormacao.get(s.turma.formacao.id) ?? null,
                    );
                    const valor = custoSessao(s, ph);
                    const mapaPresencas = new Map(s.presencas.map((p) => [p.matriculaId, p.estado]));
                    const alunosChamada = s.turma.matriculas.map((m) => ({
                      matriculaId: m.id,
                      nome: m.formando.nome,
                      estadoInicial: mapaPresencas.get(m.id) ?? "PRESENTE",
                    }));

                    const temChamada = s.presencas.length > 0;
                    const presentesCount = s.presencas.filter((p) => p.estado === "PRESENTE").length;
                    const faltasCount = s.presencas.filter((p) => p.estado === "FALTA").length;
                    const justificadasCount = s.presencas.filter((p) => p.estado === "JUSTIFICADA").length;

                    return (
                      <div
                        key={s.id}
                        className="rounded-2xl border border-zinc-200/80 bg-white p-5 transition-colors hover:bg-[#FAF9F5]/60"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-bold text-[#1C1D21]">
                                {s.turma.formacao.nome}
                              </span>
                              <Badge cor="cinza">Turma {s.turma.codigo}</Badge>
                              <Badge cor="verde">
                                Realizada · {formatHoras(h)}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
                              <span className="font-medium text-[#1C1D21]">
                                {formatDiaSemana(s.inicio)} ({formatData(dataSimples(diaLocal(s.inicio)))})
                              </span>
                              <span>
                                {formatHora(s.inicio)}–{formatHora(s.fim)}
                              </span>
                              <span>Sala: {s.sala.nome}</span>
                              <span>{NOMES_CATEGORIA[s.turma.formacao.categoria]}</span>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-[#FAF9F5] px-3.5 py-2 text-right text-xs ring-1 ring-zinc-200/80">
                            <div className="text-zinc-500">{formatKz(ph)} / hora</div>
                            <div className="text-sm font-bold text-[#1E6332]">
                              {formatKz(valor)}
                            </div>
                          </div>
                        </div>

                        {temChamada && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200/70 bg-[#FAF9F5] px-3.5 py-2 text-xs">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-[#1C1D21]">
                              <UserCheck className="size-3.5 text-[#1C1D21]" aria-hidden />
                              Chamada nominal:
                            </span>
                            <Badge cor={CORES_ESTADO_PRESENCA.PRESENTE}>
                              {presentesCount} {NOMES_ESTADO_PRESENCA.PRESENTE.toLowerCase()}(s)
                            </Badge>
                            {faltasCount > 0 && (
                              <Badge cor={CORES_ESTADO_PRESENCA.FALTA}>
                                {faltasCount} {NOMES_ESTADO_PRESENCA.FALTA.toLowerCase()}(s)
                              </Badge>
                            )}
                            {justificadasCount > 0 && (
                              <Badge cor={CORES_ESTADO_PRESENCA.JUSTIFICADA}>
                                {justificadasCount} {NOMES_ESTADO_PRESENCA.JUSTIFICADA.toLowerCase()}(s)
                              </Badge>
                            )}
                          </div>
                        )}

                        {s.notas && (
                          <p className="mt-3 rounded-xl bg-[#FAF9F5] px-3.5 py-2.5 text-xs whitespace-pre-line text-zinc-700">
                            <strong className="font-semibold text-[#1C1D21]">Sumário:</strong> {s.notas}
                          </p>
                        )}

                        <FormConfirmarSessaoPortal
                          portalToken={token}
                          sessaoId={s.id}
                          estadoAtual={s.estado}
                          horasPadrao={h}
                          notasAtuais={s.notas}
                          alunos={alunosChamada}
                        />
                      </div>
                    );
                  })}
                </GrelhaProgressiva>
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
              <TbodyProgressivo colSpan={5}>
                {despesas.map((d) => (
                  <tr key={d.id} className="bg-[#FAF9F5]/70 transition-colors hover:bg-[#FEF3C7]/40">
                    <Td className="whitespace-nowrap">{formatData(d.data)}</Td>
                    <Td>
                      <div className="font-semibold text-[#1C1D21]">{d.descricao}</div>
                      {d.notas && <div className="text-xs text-zinc-500">{d.notas}</div>}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {d.horasPagas ? formatHoras(Number(d.horasPagas.toString())) : "—"}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="font-medium text-[#1C1D21]">{NOMES_METODO[d.metodo]}</div>
                      {d.referencia && <div className="text-xs text-zinc-500">Ref.: {d.referencia}</div>}
                    </Td>
                    <Td className="text-right font-bold whitespace-nowrap text-[#1E6332]">
                      {formatKz(d.valor)}
                    </Td>
                  </tr>
                ))}
              </TbodyProgressivo>
            </Tabela>
          )}
        </Card>

        {/* Resumo de Avaliações Pedagógicas */}
        {medias.total > 0 && (
          <Card>
            <CardHeader
              titulo="Desempenho Pedagógico"
              descricao={`Média de ${medias.total} avaliação(ões) realizada(s) pela coordenação pedagógica e formandos.`}
              acoes={<Badge cor="azul">{formatNota(medias.geral)} / 5.0 ★</Badge>}
            />
            <div className="space-y-3 p-6">
              {CRITERIOS.map((c, idx) => {
                const v = medias.porCriterio[c.campo] ?? 0;
                const pct = Math.max(8, Math.round((v / 5) * 100));
                return (
                  <div key={c.campo} className="space-y-1.5">
                    <div className="flex items-baseline text-xs">
                      <span className="font-medium text-zinc-600">{c.nome}</span>
                      <span className="leader-dots" />
                      <span className="font-bold text-[#1C1D21] tabular-nums">
                        {formatNota(medias.porCriterio[c.campo])} / 5.0
                      </span>
                    </div>
                    <div className="h-5 w-full overflow-hidden rounded-full bg-[#ECEAE2] p-0.5">
                      <div
                        style={{ width: `${pct}%` }}
                        className={
                          idx % 2 === 0
                            ? "flex h-full items-center justify-end rounded-full bg-[#FBD34D] px-2.5 text-[10px] font-bold text-[#1C1D21]"
                            : "flex h-full items-center justify-end rounded-full bg-[#1C1D21] px-2.5 text-[10px] font-bold text-white"
                        }
                      >
                        {pct}%
                      </div>
                    </div>
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
