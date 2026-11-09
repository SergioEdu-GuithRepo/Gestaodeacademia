import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Gift,
  GraduationCap,
  MapPin,
  MessageCircle,
  UserCheck,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, Tabela, Td, Th, Vazio } from "@/components/ui";
import { dataSimples, diaLocal, formatData, formatDiaSemana, formatHora, hojeLocal } from "@/lib/datas";
import { dbTenant, prisma } from "@/lib/db";
import {
  CORES_ESTADO_PARCELA,
  NOMES_ESTADO_MATRICULA,
  NOMES_ESTADO_PARCELA,
  NOMES_METODO,
} from "@/lib/formandos";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { formatKz } from "@/lib/money";
import { comPago, estadoParcela, resumirParcelas } from "@/lib/parcelas";
import { calcularSaldoPontos } from "@/lib/retencao";

type Props = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const formando = await prisma.formando.findUnique({
    where: { portalToken: token },
    select: { nome: true, tenant: { select: { nome: true } } },
  });
  if (!formando) {
    return { title: "Portal do Formando" };
  }
  return {
    title: `${formando.nome} — Portal do Formando · ${formando.tenant.nome}`,
  };
}

export default async function PortalFormandoPage({ params }: Props) {
  const { token } = await params;

  const formando = await prisma.formando.findUnique({
    where: { portalToken: token },
    include: { tenant: true },
  });

  if (!formando) {
    notFound();
  }

  const db = dbTenant({ tenantId: formando.tenantId });

  const [matriculas, pagamentos, movimentosPontos, indicados, cfg] = await Promise.all([
    db.matricula.findMany({
      where: { formandoId: formando.id },
      orderBy: { createdAt: "desc" },
      include: {
        campanha: { select: { id: true, nome: true, descontoPct: true } },
        turma: {
          include: {
            formacao: { select: { id: true, nome: true, cargaHoraria: true, categoria: true } },
            sessoes: {
              where: { estado: { not: "CANCELADA" } },
              orderBy: { inicio: "asc" },
              include: {
                sala: { select: { nome: true } },
                formador: { select: { nome: true } },
              },
            },
          },
        },
        parcelas: {
          orderBy: { numero: "asc" },
          include: { alocacoes: { select: { valor: true } } },
        },
      },
    }),
    db.pagamento.findMany({
      where: { formandoId: formando.id },
      orderBy: [{ dataPagamento: "desc" }, { createdAt: "desc" }],
      include: {
        matricula: {
          select: {
            turma: {
              select: {
                codigo: true,
                formacao: { select: { nome: true } },
              },
            },
          },
        },
      },
    }),
    db.movimentoPontos.findMany({
      where: { formandoId: formando.id },
      orderBy: { createdAt: "desc" },
      include: {
        indicado: { select: { nome: true } },
      },
    }),
    db.formando.findMany({
      where: { indicadoPorId: formando.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nome: true,
        createdAt: true,
        matriculas: {
          where: { estado: { not: "CANCELADA" } },
          select: { id: true },
        },
      },
    }),
    obterConfiguracao(comoCliente(db), formando.tenantId),
  ]);

  const hoje = dataSimples(hojeLocal());
  const agora = new Date();

  const matriculasValidas = matriculas.filter((m) => m.estado !== "CANCELADA");
  const todasParcelasValidas = matriculasValidas.flatMap((m) => m.parcelas.map(comPago));
  const resumoGeral = resumirParcelas(todasParcelasValidas, hoje);

  const saldoPontos = calcularSaldoPontos(movimentosPontos, agora);
  const descontoPontosPct = Math.min(
    cfg.limiteDescontoIndicacaoPct,
    saldoPontos.saldoDisponivel * cfg.percentagemPorPonto,
  );
  const elegivelFidelizacao = matriculasValidas.length >= 1 && cfg.descontoFidelizacaoPct > 0;

  const textoConviteWhatsapp = `Olá! Recomendo as formações de ${formando.tenant.nome}. Consulta o catálogo em /p/${formando.tenant.slug} e, no momento da matrícula, indica o meu nome (${formando.nome})!`;
  const urlConviteWhatsapp = `https://wa.me/?text=${encodeURIComponent(textoConviteWhatsapp)}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Cabeçalho do Portal do Formando */}
      <header className="bg-gradient-to-br from-slate-900 via-marca-950 to-marca-800 text-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-marca-100 backdrop-blur">
              <GraduationCap className="size-4" aria-hidden />
              <span>{formando.tenant.nome}</span>
              <span className="opacity-60">·</span>
              <span>Portal do Formando</span>
            </div>
            <Link
              href={`/p/${formando.tenant.slug}`}
              className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              Explorar novas formações ↗
            </Link>
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{formando.nome}</h1>
          <p className="mt-1 text-sm text-slate-300">
            {[formando.whatsapp, formando.email, formando.profissao].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        {/* 4 Cartões de KPI */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between text-xs font-medium tracking-wide text-slate-500 uppercase">
              <span>Formações inscritas</span>
              <BookOpen className="size-4 text-marca-600" aria-hidden />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{matriculasValidas.length}</div>
            <div className="mt-0.5 text-xs text-slate-500">Matrícula(s) ativa(s) / concluída(s)</div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between text-xs font-medium tracking-wide text-slate-500 uppercase">
              <span>Total pago</span>
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
            </div>
            <div className="mt-2 text-xl font-bold text-emerald-700">{formatKz(resumoGeral.pago)}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              Total contratado: {formatKz(resumoGeral.total)}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between text-xs font-medium tracking-wide text-slate-500 uppercase">
              <span>Valor em aberto</span>
              <Wallet className="size-4 text-amber-600" aria-hidden />
            </div>
            <div
              className={`mt-2 text-xl font-bold ${
                resumoGeral.parcelasEmAtraso > 0 ? "text-red-600" : "text-slate-900"
              }`}
            >
              {formatKz(resumoGeral.divida)}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {resumoGeral.parcelasEmAtraso > 0 ? (
                <span className="font-medium text-red-600">
                  {resumoGeral.parcelasEmAtraso} parcela(s) em atraso
                </span>
              ) : resumoGeral.parcelasEmFalta > 0 ? (
                `${resumoGeral.parcelasEmFalta} parcela(s) a vencer`
              ) : (
                "Sem valores pendentes"
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between text-xs font-medium tracking-wide text-slate-500 uppercase">
              <span>Pontos de indicação</span>
              <Gift className="size-4 text-marca-600" aria-hidden />
            </div>
            <div className="mt-2 text-2xl font-bold text-marca-800">{saldoPontos.saldoDisponivel} pts</div>
            <div className="mt-0.5 text-xs text-slate-500">
              Equivale a <strong>{descontoPontosPct}%</strong> de desconto
            </div>
          </Card>
        </div>

        {/* Secção 1: As Minhas Formações, Próximas Aulas e Plano de Parcelas */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              As Minhas Formações, Horários e Plano de Parcelas
            </h2>
          </div>

          {matriculasValidas.length === 0 ? (
            <Card>
              <Vazio>
                Ainda não tem matrículas ativas neste centro.{" "}
                <Link href={`/p/${formando.tenant.slug}`} className="font-medium text-marca-700 hover:underline">
                  Ver catálogo de formações disponíveis ↗
                </Link>
              </Vazio>
            </Card>
          ) : (
            matriculasValidas.map((mat) => {
              const parcelas = mat.parcelas.map(comPago);
              const resumo = resumirParcelas(parcelas, hoje);
              const proximasSessoes = mat.turma.sessoes.filter(
                (s) => s.estado === "AGENDADA" || s.inicio.getTime() >= agora.getTime(),
              );
              const sessoesMostrar =
                proximasSessoes.length > 0 ? proximasSessoes.slice(0, 6) : mat.turma.sessoes.slice(-4);

              return (
                <Card key={mat.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">
                          {mat.turma.formacao.nome}
                        </h3>
                        <Badge cor="azul">Turma {mat.turma.codigo}</Badge>
                        <Badge cor={mat.estado === "ATIVA" ? "azul" : "verde"}>
                          {NOMES_ESTADO_MATRICULA[mat.estado]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Carga horária: {mat.turma.formacao.cargaHoraria} h · Inscrito em{" "}
                        {formatData(dataSimples(diaLocal(mat.createdAt)))}
                        {mat.campanha && ` · Campanha ${mat.campanha.nome} (-${mat.campanha.descontoPct}%)`}
                        {mat.pontosResgatados > 0 && ` · ${mat.pontosResgatados} pts resgatados`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {resumo.divida === 0n ? (
                        <Badge cor="verde">Plano totalmente liquidado</Badge>
                      ) : resumo.parcelasEmAtraso > 0 ? (
                        <Badge cor="vermelho">{resumo.parcelasEmAtraso} parcela(s) em atraso</Badge>
                      ) : (
                        <Badge cor="amarelo">{resumo.parcelasEmFalta} parcela(s) em aberto</Badge>
                      )}
                    </div>
                  </div>

                  {/* Resumo financeiro da matrícula */}
                  <dl className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs font-medium text-slate-500 uppercase">Valor contratado</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {formatKz(mat.valorTotal)}
                        {mat.desconto > 0n && (
                          <span className="block text-xs font-normal text-emerald-700">
                            Poupança/desconto: {formatKz(mat.desconto)}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500 uppercase">Valor pago</dt>
                      <dd className="mt-0.5 font-semibold text-emerald-700">{formatKz(resumo.pago)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500 uppercase">Em falta</dt>
                      <dd
                        className={`mt-0.5 font-semibold ${
                          resumo.parcelasEmAtraso > 0 ? "text-red-600" : "text-slate-900"
                        }`}
                      >
                        {formatKz(resumo.divida)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500 uppercase">Plano</dt>
                      <dd className="mt-0.5 text-slate-800">
                        {parcelas.length} parcela(s)
                      </dd>
                    </div>
                  </dl>

                  {/* Próximas sessões / calendário da turma */}
                  <div className="border-b border-slate-100 p-4">
                    <h4 className="mb-2.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Calendário de sessões da turma ({mat.turma.sessoes.length} sessão(ões))
                    </h4>
                    {sessoesMostrar.length === 0 ? (
                      <p className="text-xs text-slate-500">Horário de sessões a anunciar brevemente.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {sessoesMostrar.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                          >
                            <div>
                              <div className="font-medium text-slate-900">
                                {formatDiaSemana(s.inicio)} ({formatData(dataSimples(diaLocal(s.inicio)))})
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-600">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="size-3 text-slate-400" aria-hidden />
                                  {formatHora(s.inicio)}–{formatHora(s.fim)}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="size-3 text-slate-400" aria-hidden />
                                  {s.sala.nome}
                                </span>
                                <span>Formador: {s.formador.nome}</span>
                              </div>
                            </div>
                            <Badge cor={s.estado === "REALIZADA" ? "verde" : "azul"}>
                              {s.estado === "REALIZADA" ? "Realizada" : "Agendada"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tabela de parcelas */}
                  <div>
                    <div className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Plano de Parcelas
                    </div>
                    <Tabela>
                      <thead>
                        <tr>
                          <Th>Parcela</Th>
                          <Th>Vencimento</Th>
                          <Th className="text-right">Valor</Th>
                          <Th className="text-right">Pago</Th>
                          <Th className="text-right">Em falta</Th>
                          <Th>Estado</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parcelas.map((p) => {
                          const e = estadoParcela(p, hoje);
                          const falta = p.valor > p.pago ? p.valor - p.pago : 0n;
                          return (
                            <tr key={p.id}>
                              <Td className="font-medium">{p.numero}.ª parcela</Td>
                              <Td className="whitespace-nowrap">
                                <span className="inline-flex items-center gap-1">
                                  <CalendarDays className="size-3.5 text-slate-400" aria-hidden />
                                  {formatData(p.vencimento)}
                                </span>
                              </Td>
                              <Td className="text-right whitespace-nowrap">{formatKz(p.valor)}</Td>
                              <Td className="text-right whitespace-nowrap text-emerald-700">
                                {formatKz(p.pago)}
                              </Td>
                              <Td className="text-right font-medium whitespace-nowrap">
                                {formatKz(falta)}
                              </Td>
                              <Td>
                                <Badge cor={CORES_ESTADO_PARCELA[e]}>
                                  {NOMES_ESTADO_PARCELA[e]}
                                </Badge>
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Tabela>
                  </div>
                </Card>
              );
            })
          )}
        </section>

        {/* Secção 2: Fidelização e Programa "Indique um Amigo" */}
        <Card>
          <CardHeader
            titulo='Fidelização e Programa "Indique um Amigo"'
            descricao={`Por cada amigo que se inscrever indicado por si, ganha ${cfg.pontosPorIndicacao} pontos (${cfg.pontosPorIndicacao * cfg.percentagemPorPonto}% de desconto acumulável até ${cfg.limiteDescontoIndicacaoPct}%).`}
            acoes={
              <a
                href={urlConviteWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
              >
                <MessageCircle className="size-4" aria-hidden /> Convidar Amigo no WhatsApp
              </a>
            }
          />

          <div className="space-y-4 p-4">
            {elegivelFidelizacao && (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <Gift className="size-5 shrink-0 text-emerald-600" aria-hidden />
                <div>
                  <strong>Benefício de Ex-Formando Ativo:</strong> Tem direito a{" "}
                  <strong>{cfg.descontoFidelizacaoPct}% de Desconto de Fidelização</strong> na sua próxima formação!
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-marca-50/70 p-3">
                <div className="text-xs font-medium text-marca-800 uppercase">Pontos disponíveis</div>
                <div className="mt-1 text-xl font-bold text-marca-900">{saldoPontos.saldoDisponivel} pts</div>
                <div className="text-xs text-marca-700">= {descontoPontosPct}% de desconto</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500 uppercase">Total ganhos</div>
                <div className="mt-1 text-xl font-semibold text-emerald-700">+{saldoPontos.totalGanhos} pts</div>
                <div className="text-xs text-slate-500">{indicados.length} amigo(s) indicado(s)</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500 uppercase">Pontos usados</div>
                <div className="mt-1 text-xl font-semibold text-slate-800">{saldoPontos.totalResgatados} pts</div>
                <div className="text-xs text-slate-500">Convertidos em desconto</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500 uppercase">Validade dos pontos</div>
                <div className="mt-1 text-xl font-semibold text-slate-800">{cfg.validadePontosMeses} meses</div>
                <div className="text-xs text-slate-500">{saldoPontos.totalExpirados} pts expirados</div>
              </div>
            </div>
          </div>

          <div className="grid divide-y divide-slate-100 border-t border-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            {/* Amigos indicados */}
            <div>
              <div className="px-4 py-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Amigos indicados por si ({indicados.length})
              </div>
              {indicados.length === 0 ? (
                <Vazio>Ainda não tem amigos registados com a sua indicação.</Vazio>
              ) : (
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Nome</Th>
                      <Th>Data</Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {indicados.map((ind) => (
                      <tr key={ind.id}>
                        <Td className="font-medium text-slate-900">
                          <span className="inline-flex items-center gap-1.5">
                            <UserCheck className="size-3.5 text-marca-600" aria-hidden />
                            {ind.nome}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap">
                          {formatData(dataSimples(diaLocal(ind.createdAt)))}
                        </Td>
                        <Td>
                          {ind.matriculas.length > 0 ? (
                            <Badge cor="verde">Inscrito</Badge>
                          ) : (
                            <Badge cor="amarelo">Registo pendente</Badge>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabela>
              )}
            </div>

            {/* Extrato de pontos */}
            <div>
              <div className="px-4 py-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Extrato de Pontos ({movimentosPontos.length})
              </div>
              {movimentosPontos.length === 0 ? (
                <Vazio>Sem movimentos de pontos até ao momento.</Vazio>
              ) : (
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Data</Th>
                      <Th>Descrição</Th>
                      <Th className="text-right">Pontos</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movimentosPontos.map((mov) => (
                      <tr key={mov.id}>
                        <Td className="whitespace-nowrap">
                          {formatData(dataSimples(diaLocal(mov.createdAt)))}
                        </Td>
                        <Td>
                          <div className="text-slate-800">{mov.motivo}</div>
                          {mov.expiraEm && mov.pontos > 0 && (
                            <div className="text-xs text-slate-500">
                              Válido até {formatData(dataSimples(diaLocal(mov.expiraEm)))}
                            </div>
                          )}
                        </Td>
                        <Td className="text-right font-semibold whitespace-nowrap">
                          <span className={mov.pontos > 0 ? "text-emerald-700" : "text-marca-700"}>
                            {mov.pontos > 0 ? `+${mov.pontos}` : mov.pontos}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabela>
              )}
            </div>
          </div>
        </Card>

        {/* Secção 3: Histórico de Pagamentos Efetuados */}
        <Card>
          <CardHeader
            titulo="Histórico de Pagamentos Efetuados"
            descricao={`${pagamentos.length} pagamento(s) registado(s)`}
          />
          {pagamentos.length === 0 ? (
            <Vazio>Ainda não existem pagamentos registados.</Vazio>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Formação / Turma</Th>
                  <Th>Método</Th>
                  <Th>Referência / Recibo AGT</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagamentos.map((p) => (
                  <tr key={p.id}>
                    <Td className="whitespace-nowrap">{formatData(p.dataPagamento)}</Td>
                    <Td>
                      <div className="font-medium text-slate-900">
                        {p.matricula.turma.formacao.nome}
                      </div>
                      <div className="text-xs text-slate-500">Turma {p.matricula.turma.codigo}</div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <CreditCard className="size-3.5 text-slate-400" aria-hidden />
                        {NOMES_METODO[p.metodo]}
                      </span>
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {[
                        p.referencia ? `Ref.: ${p.referencia}` : null,
                        p.referenciaRecibo ? `Recibo AGT: ${p.referenciaRecibo}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </Td>
                    <Td className="text-right font-semibold whitespace-nowrap text-emerald-700">
                      {formatKz(p.valor)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Card>
      </main>
    </div>
  );
}
