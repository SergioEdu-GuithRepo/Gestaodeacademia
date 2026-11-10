import type { EstadoAvisoPagamento } from "@prisma/client";
import {
  ArrowUpRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Gift,
  GraduationCap,
  Landmark,
  Lock,
  MapPin,
  MessageCircle,
  ShieldCheck,
  UserCheck,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GrelhaProgressiva, TbodyProgressivo } from "@/components/lista-progressiva";
import { Alerta, Badge, Card, CardHeader, Tabela, Td, Th, Vazio } from "@/components/ui";
import { chaveAvaliacaoAnonima, verificarElegibilidadeCertificado } from "@/lib/certificados";
import { dataSimples, diaLocal, formatData, formatDiaSemana, formatHora, hojeLocal } from "@/lib/datas";
import { dbTenant, prisma } from "@/lib/db";
import {
  CORES_ESTADO_PARCELA,
  NOMES_ESTADO_MATRICULA,
  NOMES_ESTADO_PARCELA,
  NOMES_METODO,
} from "@/lib/formandos";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { centimosParaInput, formatKz } from "@/lib/money";
import { comPago, estadoParcela, resumirParcelas } from "@/lib/parcelas";
import {
  calcularAssiduidade,
  CORES_ESTADO_PRESENCA,
  NOMES_ESTADO_PRESENCA,
  type SessaoComPresenca,
} from "@/lib/presencas";
import { calcularSaldoPontos } from "@/lib/retencao";
import {
  AvaliarFormadorPortalForm,
  BotaoCopiarDado,
  BotaoEmitirCertificadoPortal,
  ComunicarPagamentoForm,
} from "./forms";

type Props = {
  params: Promise<{ token: string }>;
};

const NOMES_ESTADO_AVISO: Record<EstadoAvisoPagamento, string> = {
  PENDENTE: "Pendente de validação",
  CONFIRMADO: "Confirmado",
  REJEITADO: "Rejeitado",
};

const CORES_ESTADO_AVISO: Record<EstadoAvisoPagamento, "amarelo" | "verde" | "vermelho"> = {
  PENDENTE: "amarelo",
  CONFIRMADO: "verde",
  REJEITADO: "vermelho",
};

function iniciaisNome(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "GA";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

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
        certificado: true,
        turma: {
          include: {
            formacao: { select: { id: true, nome: true, cargaHoraria: true, categoria: true } },
            sessoes: {
              where: { estado: { not: "CANCELADA" } },
              orderBy: { inicio: "asc" },
              include: {
                sala: { select: { nome: true } },
                formador: { select: { id: true, nome: true } },
                presencas: { select: { matriculaId: true, estado: true } },
              },
            },
          },
        },
        parcelas: {
          orderBy: { numero: "asc" },
          include: { alocacoes: { select: { valor: true } } },
        },
        pagamentos: {
          orderBy: [{ dataPagamento: "desc" }, { createdAt: "desc" }],
          include: {
            alocacoes: {
              include: {
                parcela: { select: { numero: true } },
              },
            },
          },
        },
        avisosPagamento: {
          orderBy: { createdAt: "desc" },
          include: {
            parcela: { select: { numero: true } },
          },
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

  const hojeIso = hojeLocal();
  const hoje = dataSimples(hojeIso);
  const agora = new Date();

  const matriculasValidas = matriculas.filter((m) => m.estado !== "CANCELADA");
  const todasParcelasValidas = matriculasValidas.flatMap((m) => m.parcelas.map(comPago));
  const resumoGeral = resumirParcelas(todasParcelasValidas, hoje);

  // Formadores distintos por matrícula e verificação única de avaliações anónimas já submetidas
  const formadoresPorMatricula = new Map<string, { id: string; nome: string }[]>();
  const chavesCandidatas: string[] = [];

  for (const mat of matriculasValidas) {
    const mapaInst = new Map<string, string>();
    for (const s of mat.turma.sessoes) {
      if (!mapaInst.has(s.formador.id)) {
        mapaInst.set(s.formador.id, s.formador.nome);
      }
    }
    const listaInst = Array.from(mapaInst.entries()).map(([id, nome]) => ({ id, nome }));
    formadoresPorMatricula.set(mat.id, listaInst);
    for (const inst of listaInst) {
      chavesCandidatas.push(chaveAvaliacaoAnonima(mat.id, inst.id));
    }
  }

  const avaliacoesExistentes =
    chavesCandidatas.length > 0
      ? await db.avaliacaoFormador.findMany({
          where: { chaveAnonima: { in: chavesCandidatas } },
          select: { chaveAnonima: true },
        })
      : [];
  const chavesJaAvaliadas = new Set(
    avaliacoesExistentes.map((a) => a.chaveAnonima).filter((c): c is string => Boolean(c)),
  );

  // Cálculo de assiduidade por matrícula e global
  const assiduidadePorMatricula = new Map(
    matriculasValidas.map((mat) => {
      const sessoesAluno: SessaoComPresenca[] = mat.turma.sessoes.map((s) => ({
        id: s.id,
        inicio: s.inicio,
        estado: s.estado,
        temChamadaLancada: s.presencas.length > 0,
        estadoAluno: s.presencas.find((p) => p.matriculaId === mat.id)?.estado ?? null,
      }));
      return [mat.id, calcularAssiduidade(sessoesAluno)];
    }),
  );

  const todasSessoesFormando: SessaoComPresenca[] = matriculasValidas.flatMap((mat) =>
    mat.turma.sessoes.map((s) => ({
      id: `${mat.id}:${s.id}`,
      inicio: s.inicio,
      estado: s.estado,
      temChamadaLancada: s.presencas.length > 0,
      estadoAluno: s.presencas.find((p) => p.matriculaId === mat.id)?.estado ?? null,
    })),
  );
  const assiduidadeGeral = calcularAssiduidade(todasSessoesFormando);

  const saldoPontos = calcularSaldoPontos(movimentosPontos, agora);
  const descontoPontosPct = Math.min(
    cfg.limiteDescontoIndicacaoPct,
    saldoPontos.saldoDisponivel * cfg.percentagemPorPonto,
  );
  const elegivelFidelizacao = matriculasValidas.length >= 1 && cfg.descontoFidelizacaoPct > 0;

  const temDadosBancarios = Boolean(
    cfg.iban?.trim() || cfg.multicaixaExpress?.trim() || cfg.bancoNome?.trim(),
  );

  const textoConviteWhatsapp = `Olá! Recomendo as formações de ${formando.tenant.nome}. Consulta o catálogo em /p/${formando.tenant.slug} e, no momento da matrícula, indica o meu nome (${formando.nome})!`;
  const urlConviteWhatsapp = `https://wa.me/?text=${encodeURIComponent(textoConviteWhatsapp)}`;

  const iniciais = iniciaisNome(formando.nome);
  const iniciaisCentro = iniciaisNome(formando.tenant.nome);
  const pctLiquidado =
    resumoGeral.total > 0n
      ? Math.min(100, Math.round((Number(resumoGeral.pago) / Number(resumoGeral.total)) * 100))
      : 100;

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
                {formando.tenant.nome}
              </div>
              <div className="text-[11px] font-medium text-zinc-500">Portal Pessoal do Formando</div>
            </div>
          </div>

          <Link
            href={`/p/${formando.tenant.slug}`}
            className="inline-flex min-h-9.5 items-center gap-1.5 rounded-full bg-[#1C1D21] px-4 text-xs font-semibold text-white shadow-2xs transition-all hover:-translate-y-0.5 hover:bg-zinc-800"
          >
            Explorar Novas Formações <ArrowUpRight className="size-3.5 text-[#FBD34D]" aria-hidden />
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {/* Hero do Formando */}
        <section className="anim-enter rounded-[2rem] border border-zinc-900/15 bg-[#1C1D21] p-6 text-white shadow-xl sm:p-8">
          <div className="grid items-center gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#FBD34D] text-lg font-extrabold text-[#1C1D21] shadow-sm">
                  {iniciais}
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-0.5 text-[11px] font-semibold text-[#FBD34D]">
                    <GraduationCap className="size-3.5" aria-hidden /> Área Pessoal do Formando
                  </div>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    {formando.nome}
                  </h1>
                  <p className="mt-0.5 text-xs text-zinc-300 sm:text-sm">
                    {[formando.whatsapp, formando.email, formando.profissao].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            </div>

            {/* Cartão lateral de Progresso Financeiro */}
            <div className="rounded-3xl border border-white/15 bg-[#FAF9F5] p-5 text-[#1C1D21] shadow-lg">
              <div className="mb-3 flex items-center justify-between border-b border-dotted border-zinc-300 pb-2">
                <span className="text-xs font-bold tracking-wider text-zinc-600 uppercase">
                  Resumo Financeiro
                </span>
                <span className="text-xs font-extrabold text-[#1C1D21]">{pctLiquidado}% liquidado</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Valor total contratado</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">{formatKz(resumoGeral.total)}</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Total já pago</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1E6332]">{formatKz(resumoGeral.pago)}</span>
                </div>
              </div>

              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[#ECEAE2] p-0.5">
                <div
                  style={{ width: `${Math.max(6, pctLiquidado)}%` }}
                  className="h-full rounded-full bg-[#FBD34D] transition-all duration-500"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Cartões de KPI */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Formações Inscritas</span>
              <span className="flex size-9 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D]">
                <BookOpen className="size-4" aria-hidden />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
              {matriculasValidas.length}
            </div>
            <div className="mt-1 text-xs text-zinc-500">Matrícula(s) ativa(s) / concluída(s)</div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Total Liquidado</span>
              <span className="flex size-9 items-center justify-center rounded-full bg-[#E7F4E8] text-[#1E6332]">
                <CheckCircle2 className="size-4" aria-hidden />
              </span>
            </div>
            <div className="mt-3 text-lg font-bold tracking-tight text-[#1E6332] sm:text-xl">
              {formatKz(resumoGeral.pago)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Contratado: {formatKz(resumoGeral.total)}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Valor em Aberto</span>
              <span className="flex size-9 items-center justify-center rounded-full bg-[#FBD34D] text-[#1C1D21]">
                <Wallet className="size-4" aria-hidden />
              </span>
            </div>
            <div
              className={`mt-3 text-lg font-bold tracking-tight sm:text-xl ${
                resumoGeral.parcelasEmAtraso > 0 ? "text-[#B42318]" : "text-[#1C1D21]"
              }`}
            >
              {formatKz(resumoGeral.divida)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {resumoGeral.parcelasEmAtraso > 0 ? (
                <span className="font-semibold text-[#B42318]">
                  {resumoGeral.parcelasEmAtraso} parcela(s) em atraso
                </span>
              ) : resumoGeral.parcelasEmFalta > 0 ? (
                `${resumoGeral.parcelasEmFalta} parcela(s) a vencer`
              ) : (
                "Sem valores pendentes"
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Assiduidade Média</span>
              <span
                className={`flex size-9 items-center justify-center rounded-full ${
                  assiduidadeGeral.assiduidadePct >= cfg.minAssiduidadeCertificadoPct
                    ? "bg-[#E7F4E8] text-[#1E6332]"
                    : "bg-[#FEF3C7] text-[#92400E]"
                }`}
              >
                <UserCheck className="size-4" aria-hidden />
              </span>
            </div>
            <div
              className={`mt-3 text-2xl font-bold tracking-tight sm:text-3xl ${
                matriculasValidas.length > 0 &&
                assiduidadeGeral.assiduidadePct < cfg.minAssiduidadeCertificadoPct
                  ? "text-[#B42318]"
                  : "text-[#1C1D21]"
              }`}
            >
              {matriculasValidas.length > 0 ? `${assiduidadeGeral.assiduidadePct}%` : "—"}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Meta certificado:{" "}
              <strong className="text-[#1C1D21]">{cfg.minAssiduidadeCertificadoPct}%</strong>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Pontos de Indicação</span>
              <span className="flex size-9 items-center justify-center rounded-full bg-[#F5F4EF] text-[#1C1D21]">
                <Gift className="size-4" aria-hidden />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
              {saldoPontos.saldoDisponivel} pts
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Equivale a <strong className="text-[#1C1D21]">{descontoPontosPct}%</strong> de desconto
            </div>
          </Card>
        </div>

        {/* Cartão Editorial de Dados Bancários para Pagamento (quando existe dívida em aberto) */}
        {resumoGeral.divida > 0n && temDadosBancarios && (
          <Card className="overflow-hidden border-[#FBD34D]/60">
            <CardHeader
              titulo="Dados Bancários para Pagamento (IBAN / Multicaixa Express)"
              descricao="Utilize as coordenadas oficiais abaixo para liquidar as suas parcelas e comunique o comprovativo diretamente na matrícula correspondente."
              acoes={
                <Badge cor="amarelo">Saldo em aberto: {formatKz(resumoGeral.divida)}</Badge>
              }
            />
            <div className="grid gap-3 p-6 sm:grid-cols-2">
              {(cfg.bancoNome || cfg.titularConta) && (
                <div className="flex flex-col justify-between gap-2 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-zinc-500 uppercase">
                      <Landmark className="size-3.5 text-[#1C1D21]" aria-hidden />
                      Instituição Bancária & Titular
                    </div>
                    {cfg.bancoNome && (
                      <div className="mt-1.5 text-sm font-bold text-[#1C1D21]">{cfg.bancoNome}</div>
                    )}
                    {cfg.titularConta && (
                      <div className="mt-0.5 text-xs text-zinc-600">
                        Titular: <strong className="text-[#1C1D21]">{cfg.titularConta}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {cfg.iban && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold tracking-wider text-zinc-500 uppercase">
                      IBAN Oficial (Transferência Bancária)
                    </div>
                    <div className="mt-1 font-mono text-sm font-bold tracking-wide break-all text-[#1C1D21]">
                      {cfg.iban}
                    </div>
                  </div>
                  <BotaoCopiarDado valor={cfg.iban} rotulo="Copiar IBAN" />
                </div>
              )}

              {cfg.multicaixaExpress && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold tracking-wider text-zinc-500 uppercase">
                      Multicaixa Express
                    </div>
                    <div className="mt-1 font-mono text-sm font-bold tracking-wide text-[#1C1D21]">
                      {cfg.multicaixaExpress}
                    </div>
                  </div>
                  <BotaoCopiarDado valor={cfg.multicaixaExpress} rotulo="Copiar N.º" />
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Secção Dedicada: Certificados de Conclusão */}
        {matriculasValidas.length > 0 && (
          <Card>
            <CardHeader
              titulo="Certificados de Conclusão"
              descricao={`Os certificados digitais verificáveis por QR Code são disponibilizados após conclusão da turma, liquidação integral do plano financeiro e assiduidade mínima de ${cfg.minAssiduidadeCertificadoPct}%.`}
              acoes={
                <Badge cor="azul">
                  <Award className="mr-1 inline size-3.5" aria-hidden /> Validação QR Pública
                </Badge>
              }
            />
            <div className="grid gap-4 p-6 md:grid-cols-2">
              {matriculasValidas.map((mat) => {
                const parcelas = mat.parcelas.map(comPago);
                const resumo = resumirParcelas(parcelas, hoje);
                const assid = assiduidadePorMatricula.get(mat.id) ?? {
                  sessoesRealizadas: 0,
                  sessoesComChamada: 0,
                  presencas: 0,
                  justificadas: 0,
                  faltas: 0,
                  assiduidadePct: 100,
                  faltasSeguidas: 0,
                  alertaFaltasSeguidas: false,
                };

                const certificadoAtivo =
                  mat.certificado && !mat.certificado.revogadoEm && resumo.divida === 0n
                    ? mat.certificado
                    : null;

                if (certificadoAtivo) {
                  return (
                    <div
                      key={mat.id}
                      className="flex flex-col justify-between gap-4 rounded-3xl border border-[#FBD34D]/40 bg-[#1C1D21] p-6 text-white shadow-lg"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBD34D] px-3 py-1 text-[11px] font-extrabold tracking-wider text-[#1C1D21] uppercase">
                            <Award className="size-3.5" aria-hidden /> Diploma Emitido
                          </span>
                          <span className="font-mono text-xs font-semibold text-[#FBD34D]">
                            {certificadoAtivo.codigo}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-lg font-bold tracking-tight text-white">
                            {mat.turma.formacao.nome}
                          </h3>
                          <p className="mt-0.5 text-xs text-zinc-300">
                            Turma {mat.turma.codigo} · Carga horária: {certificadoAtivo.cargaHoraria} h ·
                            Assiduidade: {certificadoAtivo.assiduidadePct}%
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4">
                        <span className="text-[11px] text-zinc-400">
                          Emitido em {formatData(dataSimples(diaLocal(certificadoAtivo.emitidoEm)))}
                        </span>
                        <Link
                          href={`/portal/formando/${token}/certificado/${mat.id}`}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#FBD34D] px-4 py-2 text-xs font-bold text-[#1C1D21] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-amber-300"
                        >
                          Abrir / Descarregar Certificado A4 <ArrowUpRight className="size-4" aria-hidden />
                        </Link>
                      </div>
                    </div>
                  );
                }

                const elegibilidade = verificarElegibilidadeCertificado({
                  estadoMatricula: mat.estado,
                  dividaCentimos: resumo.divida,
                  assiduidadePct: assid.assiduidadePct,
                  minAssiduidadePct: cfg.minAssiduidadeCertificadoPct,
                  revogado: Boolean(mat.certificado?.revogadoEm),
                });

                if (elegibilidade.elegivel) {
                  return (
                    <div
                      key={mat.id}
                      className="flex flex-col justify-between gap-4 rounded-3xl border border-[#288042]/30 bg-[#FAF9F5] p-6"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge cor="verde">Elegível para Emissão Imediata</Badge>
                          <span className="text-xs font-semibold text-zinc-500">
                            Assiduidade: {assid.assiduidadePct}%
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-[#1C1D21]">
                          {mat.turma.formacao.nome} · Turma {mat.turma.codigo}
                        </h3>
                        <p className="text-xs text-zinc-600">
                          Parabéns! Concluiu a formação com assiduidade aprovada e plano financeiro 100%
                          liquidado. Pode emitir já o seu certificado digital A4 com código QR.
                        </p>
                      </div>

                      <div className="border-t border-dotted border-zinc-200 pt-3">
                        <BotaoEmitirCertificadoPortal portalToken={token} matriculaId={mat.id} />
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={mat.id}
                    className="flex flex-col justify-between gap-3 rounded-3xl border border-zinc-200/90 bg-[#FAF9F5] p-6"
                  >
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-200/80 px-3 py-1 text-xs font-semibold text-zinc-700">
                          <Lock className="size-3.5" aria-hidden /> Certificado bloqueado
                        </span>
                        <span className="text-xs text-zinc-500">Turma {mat.turma.codigo}</span>
                      </div>

                      <h3 className="text-base font-bold text-[#1C1D21]">{mat.turma.formacao.nome}</h3>

                      <ul className="space-y-1.5 pt-1 text-xs text-zinc-700">
                        {elegibilidade.motivosBloqueio.map((motivo, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span
                              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#D97706]"
                              aria-hidden
                            />
                            <span>
                              {motivo}
                              {motivo.includes("valores financeiros") && resumo.divida > 0n
                                ? ` (Saldo pendente: ${formatKz(resumo.divida)})`
                                : ""}
                              {motivo.includes("revogado") && mat.certificado?.motivoRevogacao
                                ? ` Motivo: ${mat.certificado.motivoRevogacao}`
                                : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Secção 1: As Minhas Formações, Assiduidade, Avaliações e Plano de Parcelas */}
        <section className="space-y-5">
          {matriculasValidas.length === 0 ? (
            <Card>
              <Vazio>
                Ainda não tem matrículas ativas neste centro.{" "}
                <Link href={`/p/${formando.tenant.slug}`} className="font-semibold text-[#1C1D21] underline">
                  Ver catálogo de formações disponíveis ↗
                </Link>
              </Vazio>
            </Card>
          ) : (
            matriculasValidas.map((mat) => {
              const parcelas = mat.parcelas.map(comPago);
              const resumo = resumirParcelas(parcelas, hoje);
              const assid = assiduidadePorMatricula.get(mat.id) ?? {
                sessoesRealizadas: 0,
                sessoesComChamada: 0,
                presencas: 0,
                justificadas: 0,
                faltas: 0,
                assiduidadePct: 100,
                faltasSeguidas: 0,
                alertaFaltasSeguidas: false,
              };

              const parcelasAbertas = parcelas
                .filter((p) => p.valor > p.pago)
                .map((p) => ({
                  id: p.id,
                  numero: p.numero,
                  faltaCentimos: p.valor - p.pago,
                  faltaFormatada: formatKz(p.valor - p.pago),
                  vencimentoFormatado: formatData(p.vencimento),
                }));

              const valorSugerido = centimosParaInput(
                parcelasAbertas[0]?.faltaCentimos ?? resumo.divida,
              );

              const formadoresTurma = formadoresPorMatricula.get(mat.id) ?? [];

              return (
                <Card key={mat.id} className="overflow-hidden">
                  <CardHeader
                    titulo={`${mat.turma.formacao.nome} · Turma ${mat.turma.codigo}`}
                    descricao={`Carga horária: ${mat.turma.formacao.cargaHoraria} h · Inscrito em ${formatData(dataSimples(diaLocal(mat.createdAt)))}${mat.campanha ? ` · Campanha ${mat.campanha.nome} (-${mat.campanha.descontoPct}%)` : ""}${mat.pontosResgatados > 0 ? ` · ${mat.pontosResgatados} pts resgatados` : ""}`}
                    acoes={
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge cor={mat.estado === "ATIVA" ? "azul" : "verde"}>
                          {NOMES_ESTADO_MATRICULA[mat.estado]}
                        </Badge>
                        {resumo.divida === 0n ? (
                          <Badge cor="verde">Plano totalmente liquidado</Badge>
                        ) : resumo.parcelasEmAtraso > 0 ? (
                          <Badge cor="vermelho">{resumo.parcelasEmAtraso} parcela(s) em atraso</Badge>
                        ) : (
                          <Badge cor="amarelo">{resumo.parcelasEmFalta} parcela(s) em aberto</Badge>
                        )}
                      </div>
                    }
                  />

                  <div className="space-y-6 p-6">
                    {/* Resumo financeiro pontilhado da matrícula */}
                    <div className="grid gap-3 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <span className="text-zinc-500">Valor contratado</span>
                        <div className="text-base font-bold text-[#1C1D21]">{formatKz(mat.valorTotal)}</div>
                        {mat.desconto > 0n && (
                          <div className="text-[11px] font-medium text-[#1E6332]">
                            Desconto aplicado: {formatKz(mat.desconto)}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <span className="text-zinc-500">Valor liquidado</span>
                        <div className="text-base font-bold text-[#1E6332]">{formatKz(resumo.pago)}</div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-zinc-500">Saldo em falta</span>
                        <div
                          className={`text-base font-bold ${
                            resumo.parcelasEmAtraso > 0 ? "text-[#B42318]" : "text-[#1C1D21]"
                          }`}
                        >
                          {formatKz(resumo.divida)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-zinc-500">Modalidade</span>
                        <div className="text-base font-bold text-[#1C1D21]">{parcelas.length} parcela(s)</div>
                      </div>
                    </div>

                    {/* Barra de Assiduidade Nominal e Progresso Pedagógico */}
                    <div className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold tracking-wider text-zinc-600 uppercase">
                            Assiduidade Nominal na Turma
                          </span>
                          <Badge
                            cor={
                              assid.assiduidadePct >= cfg.minAssiduidadeCertificadoPct
                                ? "verde"
                                : "vermelho"
                            }
                          >
                            {assid.assiduidadePct}% de presenças
                          </Badge>
                        </div>
                        <span className="text-zinc-500">
                          Meta mínima certificado:{" "}
                          <strong className="text-[#1C1D21]">{cfg.minAssiduidadeCertificadoPct}%</strong>
                        </span>
                      </div>

                      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[#ECEAE2] p-0.5">
                        <div
                          style={{ width: `${Math.max(4, assid.assiduidadePct)}%` }}
                          className={`h-full rounded-full transition-all duration-500 ${
                            assid.assiduidadePct >= cfg.minAssiduidadeCertificadoPct
                              ? "bg-[#288042]"
                              : "bg-[#D92D20]"
                          }`}
                        />
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
                        <span>
                          {assid.sessoesComChamada > 0 ? (
                            <>
                              <strong className="text-[#1E6332]">{assid.presencas}</strong> presença(s) ·{" "}
                              <strong className="text-[#92400E]">{assid.justificadas}</strong> justificada(s) ·{" "}
                              <strong className="text-[#B42318]">{assid.faltas}</strong> falta(s) em{" "}
                              {assid.sessoesComChamada} aula(s) com chamada
                            </>
                          ) : (
                            <>
                              {assid.sessoesRealizadas} aula(s) realizada(s) · Sem faltas registadas
                            </>
                          )}
                        </span>
                        {assid.alertaFaltasSeguidas && (
                          <span className="font-semibold text-[#B42318]">
                            Atenção: {assid.faltasSeguidas} faltas consecutivas registadas
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Calendário de sessões da turma com estado individual de presença */}
                    <div>
                      <h4 className="mb-3 text-xs font-bold tracking-wider text-zinc-500 uppercase">
                        Calendário de sessões e presenças ({mat.turma.sessoes.length} sessão(ões))
                      </h4>
                      {mat.turma.sessoes.length === 0 ? (
                        <p className="text-xs text-zinc-500">Horário de sessões a anunciar brevemente.</p>
                      ) : (
                        <GrelhaProgressiva
                          className="grid gap-3 sm:grid-cols-2"
                          passo={6}
                          labelItem="sessões"
                        >
                          {mat.turma.sessoes.map((s) => {
                            const temChamada = s.presencas.length > 0;
                            const estadoAluno =
                              s.presencas.find((p) => p.matriculaId === mat.id)?.estado ?? "PRESENTE";

                            return (
                              <div
                                key={s.id}
                                className="flex items-start justify-between gap-2.5 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-3.5 text-xs"
                              >
                                <div>
                                  <div className="font-bold text-[#1C1D21]">
                                    {formatDiaSemana(s.inicio)} ({formatData(dataSimples(diaLocal(s.inicio)))})
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-600">
                                    <span className="inline-flex items-center gap-1">
                                      <Clock className="size-3.5 text-zinc-400" aria-hidden />
                                      {formatHora(s.inicio)}–{formatHora(s.fim)}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="size-3.5 text-zinc-400" aria-hidden />
                                      {s.sala.nome}
                                    </span>
                                    <span>Formador: {s.formador.nome}</span>
                                  </div>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1.5">
                                  <Badge cor={s.estado === "REALIZADA" ? "verde" : "azul"}>
                                    {s.estado === "REALIZADA" ? "Realizada" : "Agendada"}
                                  </Badge>
                                  {temChamada && (
                                    <Badge cor={CORES_ESTADO_PRESENCA[estadoAluno]}>
                                      {NOMES_ESTADO_PRESENCA[estadoAluno]}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </GrelhaProgressiva>
                      )}
                    </div>

                    {/* Avaliação Anónima de Formadores */}
                    {formadoresTurma.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                            Avaliação Pedagógica dos Formadores (100% Anónima)
                          </h4>
                          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                            <ShieldCheck className="size-3.5 text-[#1E6332]" aria-hidden /> Respostas protegidas
                            por chave criptográfica anónima
                          </span>
                        </div>

                        <div className="space-y-2">
                          {formadoresTurma.map((inst) => {
                            const jaAvaliou = chavesJaAvaliadas.has(
                              chaveAvaliacaoAnonima(mat.id, inst.id),
                            );
                            if (jaAvaliou) {
                              return (
                                <div
                                  key={inst.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#288042]/25 bg-[#E7F4E8]/45 px-4 py-3 text-xs"
                                >
                                  <span className="font-semibold text-[#1C1D21]">{inst.nome}</span>
                                  <Badge cor="verde">✔ Avaliação anónima submetida</Badge>
                                </div>
                              );
                            }
                            return (
                              <AvaliarFormadorPortalForm
                                key={inst.id}
                                portalToken={token}
                                matriculaId={mat.id}
                                formadorId={inst.id}
                                formadorNome={inst.nome}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Tabela de parcelas */}
                    <div>
                      <h4 className="mb-2 text-xs font-bold tracking-wider text-zinc-500 uppercase">
                        Plano de Parcelas
                      </h4>
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
                        <TbodyProgressivo colSpan={6}>
                          {parcelas.map((p) => {
                            const e = estadoParcela(p, hoje);
                            const falta = p.valor > p.pago ? p.valor - p.pago : 0n;
                            return (
                              <tr
                                key={p.id}
                                className="bg-[#FAF9F5]/70 transition-colors hover:bg-[#FEF3C7]/40"
                              >
                                <Td className="font-semibold text-[#1C1D21]">{p.numero}.ª parcela</Td>
                                <Td className="whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1.5">
                                    <CalendarDays className="size-3.5 text-zinc-400" aria-hidden />
                                    {formatData(p.vencimento)}
                                  </span>
                                </Td>
                                <Td className="text-right whitespace-nowrap">{formatKz(p.valor)}</Td>
                                <Td className="text-right font-semibold whitespace-nowrap text-[#1E6332]">
                                  {formatKz(p.pago)}
                                </Td>
                                <Td className="text-right font-semibold whitespace-nowrap text-[#1C1D21]">
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
                        </TbodyProgressivo>
                      </Tabela>
                    </div>

                    {/* Comunicar Pagamento + Histórico de Avisos Submetidos */}
                    {(resumo.divida > 0n || mat.avisosPagamento.length > 0) && (
                      <div className="space-y-3 border-t border-dotted border-zinc-200 pt-4">
                        {resumo.divida > 0n && (
                          <ComunicarPagamentoForm
                            portalToken={token}
                            matriculaId={mat.id}
                            valorSugerido={valorSugerido}
                            hojeIso={hojeIso}
                            parcelasAbertas={parcelasAbertas}
                          />
                        )}

                        {mat.avisosPagamento.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                              Comunicações de Pagamento Enviadas ({mat.avisosPagamento.length})
                            </h5>
                            <div className="space-y-2">
                              {mat.avisosPagamento.map((av) => (
                                <div
                                  key={av.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] px-4 py-2.5 text-xs"
                                >
                                  <div className="space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-bold text-[#1C1D21]">{formatKz(av.valor)}</span>
                                      <span className="text-zinc-500">·</span>
                                      <span className="font-medium text-zinc-700">
                                        {NOMES_METODO[av.metodo]}
                                      </span>
                                      {av.parcela && (
                                        <span className="text-zinc-500">
                                          ({av.parcela.numero}.ª parcela)
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-zinc-500">
                                      Ref.: {av.referencia} · Data: {formatData(av.dataTransferencia)}
                                      {av.notas ? ` · ${av.notas}` : ""}
                                    </div>
                                  </div>
                                  <Badge cor={CORES_ESTADO_AVISO[av.estado]}>
                                    {NOMES_ESTADO_AVISO[av.estado]}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pagamentos Confirmados desta Matrícula com Comprovativo A4 */}
                    {mat.pagamentos.length > 0 && (
                      <div className="space-y-2.5 border-t border-dotted border-zinc-200 pt-4">
                        <h4 className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                          Pagamentos Confirmados e Comprovativos A4 ({mat.pagamentos.length})
                        </h4>
                        <div className="space-y-2">
                          {mat.pagamentos.map((pg) => {
                            const parcelasLiquidadas = pg.alocacoes
                              .map((a) => `${a.parcela.numero}.ª`)
                              .join(", ");
                            return (
                              <div
                                key={pg.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] px-4 py-3 text-xs"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-bold text-[#1E6332]">
                                      {formatKz(pg.valor)}
                                    </span>
                                    <span className="font-medium text-[#1C1D21]">
                                      {NOMES_METODO[pg.metodo]}
                                    </span>
                                    <span className="text-zinc-500">
                                      · {formatData(pg.dataPagamento)}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-zinc-500">
                                    {[
                                      parcelasLiquidadas ? `Parcela(s): ${parcelasLiquidadas}` : null,
                                      pg.referencia ? `Ref.: ${pg.referencia}` : null,
                                      pg.referenciaRecibo ? `Recibo AGT: ${pg.referenciaRecibo}` : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </div>
                                </div>

                                <Link
                                  href={`/portal/formando/${token}/recibo/${pg.id}`}
                                  className="inline-flex min-h-8.5 items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#1C1D21] shadow-2xs transition-all hover:-translate-y-0.5 hover:border-[#FBD34D] hover:bg-[#FBD34D]"
                                >
                                  <FileText className="size-3.5" aria-hidden />
                                  Comprovativo A4 ↗
                                </Link>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#1C1D21] px-4 py-2 text-xs font-semibold text-white shadow-2xs transition-all hover:-translate-y-0.5 hover:bg-zinc-800"
              >
                <MessageCircle className="size-4 text-[#FBD34D]" aria-hidden /> Convidar Amigo no WhatsApp
              </a>
            }
          />

          <div className="space-y-5 p-6">
            {elegivelFidelizacao && (
              <Alerta tipo="sucesso">
                <strong>Benefício de Ex-Formando Ativo:</strong> Tem direito a{" "}
                <strong>{cfg.descontoFidelizacaoPct}% de Desconto de Fidelização</strong> na sua próxima
                formação!
              </Alerta>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4">
                <div className="text-xs font-medium text-zinc-500">Pontos disponíveis</div>
                <div className="mt-1.5 text-xl font-bold text-[#1C1D21]">
                  {saldoPontos.saldoDisponivel} pts
                </div>
                <div className="mt-0.5 text-xs font-semibold text-[#1E6332]">
                  = {descontoPontosPct}% de desconto
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4">
                <div className="text-xs font-medium text-zinc-500">Total ganhos</div>
                <div className="mt-1.5 text-xl font-bold text-[#1E6332]">
                  +{saldoPontos.totalGanhos} pts
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">{indicados.length} amigo(s) indicado(s)</div>
              </div>
              <div className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4">
                <div className="text-xs font-medium text-zinc-500">Pontos usados</div>
                <div className="mt-1.5 text-xl font-bold text-[#1C1D21]">
                  {saldoPontos.totalResgatados} pts
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">Convertidos em desconto</div>
              </div>
              <div className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4">
                <div className="text-xs font-medium text-zinc-500">Validade dos pontos</div>
                <div className="mt-1.5 text-xl font-bold text-[#1C1D21]">
                  {cfg.validadePontosMeses} meses
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {saldoPontos.totalExpirados} pts expirados
                </div>
              </div>
            </div>
          </div>

          <div className="grid divide-y divide-dotted divide-zinc-200 border-t border-dotted border-zinc-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            {/* Amigos indicados */}
            <div className="p-4">
              <div className="px-2 pb-2 text-xs font-bold tracking-wider text-zinc-500 uppercase">
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
                  <TbodyProgressivo colSpan={3}>
                    {indicados.map((ind) => (
                      <tr
                        key={ind.id}
                        className="bg-[#FAF9F5]/70 transition-colors hover:bg-[#FEF3C7]/40"
                      >
                        <Td className="font-semibold text-[#1C1D21]">
                          <span className="inline-flex items-center gap-1.5">
                            <UserCheck className="size-3.5 text-[#1C1D21]" aria-hidden />
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
                  </TbodyProgressivo>
                </Tabela>
              )}
            </div>

            {/* Extrato de pontos */}
            <div className="p-4">
              <div className="px-2 pb-2 text-xs font-bold tracking-wider text-zinc-500 uppercase">
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
                  <TbodyProgressivo colSpan={3}>
                    {movimentosPontos.map((mov) => (
                      <tr
                        key={mov.id}
                        className="bg-[#FAF9F5]/70 transition-colors hover:bg-[#FEF3C7]/40"
                      >
                        <Td className="whitespace-nowrap">
                          {formatData(dataSimples(diaLocal(mov.createdAt)))}
                        </Td>
                        <Td>
                          <div className="font-medium text-[#1C1D21]">{mov.motivo}</div>
                          {mov.expiraEm && mov.pontos > 0 && (
                            <div className="text-xs text-zinc-500">
                              Válido até {formatData(dataSimples(diaLocal(mov.expiraEm)))}
                            </div>
                          )}
                        </Td>
                        <Td className="text-right font-bold whitespace-nowrap">
                          <span className={mov.pontos > 0 ? "text-[#1E6332]" : "text-[#1C1D21]"}>
                            {mov.pontos > 0 ? `+${mov.pontos}` : mov.pontos}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </TbodyProgressivo>
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
                  <Th className="text-right">Comprovativo</Th>
                </tr>
              </thead>
              <TbodyProgressivo colSpan={6}>
                {pagamentos.map((p) => (
                  <tr key={p.id} className="bg-[#FAF9F5]/70 transition-colors hover:bg-[#FEF3C7]/40">
                    <Td className="whitespace-nowrap">{formatData(p.dataPagamento)}</Td>
                    <Td>
                      <div className="font-semibold text-[#1C1D21]">
                        {p.matricula.turma.formacao.nome}
                      </div>
                      <div className="text-xs text-zinc-500">Turma {p.matricula.turma.codigo}</div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#1C1D21]">
                        <CreditCard className="size-3.5 text-zinc-400" aria-hidden />
                        {NOMES_METODO[p.metodo]}
                      </span>
                    </Td>
                    <Td className="text-xs text-zinc-600">
                      {[
                        p.referencia ? `Ref.: ${p.referencia}` : null,
                        p.referenciaRecibo ? `Recibo AGT: ${p.referenciaRecibo}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </Td>
                    <Td className="text-right font-bold whitespace-nowrap text-[#1E6332]">
                      {formatKz(p.valor)}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <Link
                        href={`/portal/formando/${token}/recibo/${p.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-zinc-200/90 bg-white px-3 py-1 text-xs font-semibold text-[#1C1D21] shadow-2xs transition-all hover:border-[#FBD34D] hover:bg-[#FBD34D]"
                      >
                        Comprovativo A4 ↗
                      </Link>
                    </Td>
                  </tr>
                ))}
              </TbodyProgressivo>
            </Tabela>
          )}
        </Card>
      </main>
    </div>
  );
}
