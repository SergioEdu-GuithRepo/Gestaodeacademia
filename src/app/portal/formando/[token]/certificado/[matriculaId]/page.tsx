import { Prisma } from "@prisma/client";
import { ArrowLeft, ArrowUpRight, Award, Lock, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { Badge, Card, LinkButton } from "@/components/ui";
import { NOMES_CATEGORIA } from "@/lib/catalogo";
import {
  gerarCodigoCertificado,
  gerarQrCodeSvg,
  verificarElegibilidadeCertificado,
} from "@/lib/certificados";
import { urlBase } from "@/lib/configuracoes";
import { dataSimples, diaLocal, formatData, hojeLocal } from "@/lib/datas";
import { dbTenant, prisma } from "@/lib/db";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { formatKz } from "@/lib/money";
import { comPago, resumirParcelas } from "@/lib/parcelas";
import { calcularAssiduidade } from "@/lib/presencas";

type Props = {
  params: Promise<{ token: string; matriculaId: string }>;
};

function iniciaisCentro(nome: string) {
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
    return { title: "Certificado de Conclusão" };
  }
  return {
    title: `Certificado de Conclusão — ${formando.nome} · ${formando.tenant.nome}`,
  };
}

export default async function CertificadoA4Page({ params }: Props) {
  const { token, matriculaId } = await params;

  const formando = await prisma.formando.findUnique({
    where: { portalToken: token },
    include: { tenant: true },
  });
  if (!formando) {
    notFound();
  }

  const db = dbTenant({ tenantId: formando.tenantId });

  const [matricula, cfg] = await Promise.all([
    db.matricula.findFirst({
      where: {
        id: matriculaId,
        formandoId: formando.id,
      },
      include: {
        certificado: true,
        turma: {
          include: {
            formacao: true,
            sessoes: {
              where: { estado: { not: "CANCELADA" } },
              orderBy: { inicio: "asc" },
              include: {
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
      },
    }),
    obterConfiguracao(comoCliente(db), formando.tenantId),
  ]);

  if (!matricula) {
    notFound();
  }

  const hoje = dataSimples(hojeLocal());
  const resumo = resumirParcelas(matricula.parcelas.map(comPago), hoje);
  const assid = calcularAssiduidade(
    matricula.turma.sessoes.map((s) => ({
      id: s.id,
      inicio: s.inicio,
      estado: s.estado,
      temChamadaLancada: s.presencas.length > 0,
      estadoAluno: s.presencas.find((p) => p.matriculaId === matricula.id)?.estado ?? null,
    })),
  );

  const elegibilidade = verificarElegibilidadeCertificado({
    estadoMatricula: matricula.estado,
    dividaCentimos: resumo.divida,
    assiduidadePct: assid.assiduidadePct,
    minAssiduidadePct: cfg.minAssiduidadeCertificadoPct,
    revogado: Boolean(matricula.certificado?.revogadoEm),
  });

  if (!elegibilidade.elegivel) {
    return (
      <div className="min-h-dvh bg-[#F5F4EF] px-4 py-10 text-[#1C1D21] sm:px-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <Link
            href={`/portal/formando/${token}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:text-[#1C1D21]"
          >
            <ArrowLeft className="size-4" aria-hidden /> Voltar ao Portal do Formando
          </Link>

          <Card className="overflow-hidden p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-[#FBD34D]">
                <Lock className="size-6" aria-hidden />
              </span>
              <div className="space-y-1">
                <Badge cor="amarelo">Emissão / Transferência Bloqueada</Badge>
                <h1 className="pt-1 text-xl font-bold tracking-tight text-[#1C1D21] sm:text-2xl">
                  Certificado ainda não disponível
                </h1>
                <p className="text-xs text-zinc-500 sm:text-sm">
                  {matricula.turma.formacao.nome} · Turma {matricula.turma.codigo}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-5">
              <div className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                Requisitos pendentes para libertação do diploma
              </div>
              <ul className="mt-3 space-y-2 text-xs text-[#1C1D21] sm:text-sm">
                {elegibilidade.motivosBloqueio.map((motivo, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-[#D92D20]"
                      aria-hidden
                    />
                    <span>
                      {motivo}
                      {motivo.includes("valores financeiros") && resumo.divida > 0n
                        ? ` Saldo pendente: ${formatKz(resumo.divida)}.`
                        : ""}
                      {motivo.includes("revogado") && matricula.certificado?.motivoRevogacao
                        ? ` Motivo registado: ${matricula.certificado.motivoRevogacao}.`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-dotted border-zinc-200 pt-5">
              <span className="text-xs text-zinc-500">
                Regularize os pontos acima no seu portal ou junto da secretaria de {formando.tenant.nome}.
              </span>
              <LinkButton href={`/portal/formando/${token}`}>
                <ArrowLeft className="size-4 text-[#FBD34D]" aria-hidden /> Voltar ao Portal
              </LinkButton>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Se elegível e ainda sem registo Certificado na BD, cria automaticamente
  let certificado = matricula.certificado;
  if (!certificado) {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const codigo = gerarCodigoCertificado();
      try {
        certificado = await db.certificado.create({
          data: {
            tenantId: formando.tenantId,
            matriculaId: matricula.id,
            codigo,
            cargaHoraria: matricula.turma.formacao.cargaHoraria,
            assiduidadePct: assid.assiduidadePct,
          },
        });
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const existente = await db.certificado.findUnique({
            where: { matriculaId: matricula.id },
          });
          if (existente) {
            certificado = existente;
            break;
          }
          continue;
        }
        throw e;
      }
    }
  }

  if (!certificado) {
    notFound();
  }

  const h = await headers();
  const base = urlBase(
    process.env.APP_URL,
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto"),
  );
  const urlVerificacao = `${base}/verificar/${certificado.codigo}`;
  const svgQr = await gerarQrCodeSvg(urlVerificacao);

  const sessoesRealizadas = matricula.turma.sessoes.filter((s) => s.estado === "REALIZADA");
  const dataInicioTurma =
    sessoesRealizadas[0]?.inicio ?? matricula.turma.sessoes[0]?.inicio ?? null;
  const dataFimTurma =
    sessoesRealizadas[sessoesRealizadas.length - 1]?.inicio ??
    matricula.turma.sessoes[matricula.turma.sessoes.length - 1]?.inicio ??
    null;

  const nomesFormadores = Array.from(
    new Set(matricula.turma.sessoes.map((s) => s.formador.nome)),
  );
  const rotuloFormador =
    nomesFormadores.length === 1 ? nomesFormadores[0] : "Coordenação Pedagógica";

  return (
    <div className="min-h-dvh bg-[#F5F4EF] px-4 py-6 text-[#1C1D21] sm:px-8 sm:py-10 print:min-h-0 print:bg-white print:p-0">
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } }`}</style>

      {/* Barra de ações (oculta na impressão) */}
      <div className="mx-auto mb-6 flex max-w-[1050px] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/portal/formando/${token}`}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-zinc-200/90 bg-white px-4 text-xs font-semibold text-[#1C1D21] shadow-2xs transition-all hover:-translate-y-0.5 hover:bg-[#FAF9F5]"
        >
          <ArrowLeft className="size-4" aria-hidden /> Voltar ao Portal do Formando
        </Link>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/verificar/${certificado.codigo}`}
            target="_blank"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white px-4 text-xs font-semibold text-[#1C1D21] shadow-2xs transition-all hover:-translate-y-0.5 hover:bg-[#FAF9F5]"
          >
            <ShieldCheck className="size-4 text-[#1E6332]" aria-hidden />
            Página de Verificação Pública <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
          <BotaoImprimir rotulo="Imprimir / Guardar PDF (A4)" />
        </div>
      </div>

      {/* Folha institucional A4 */}
      <article className="mx-auto max-w-[1050px] border-[6px] border-[#1C1D21] bg-white p-10 shadow-2xl outline outline-2 -outline-offset-8 outline-[#FBD34D] sm:p-14 print:shadow-none">
        {/* Cabeçalho Institucional */}
        <header className="flex flex-col items-center text-center">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#1C1D21] text-sm font-extrabold tracking-widest text-[#FBD34D]">
              {iniciaisCentro(formando.tenant.nome)}
            </div>
            <div className="text-left">
              <div className="text-base font-extrabold tracking-[0.18em] text-[#1C1D21] uppercase sm:text-lg">
                {formando.tenant.nome}
              </div>
              <div className="text-[11px] font-medium tracking-widest text-zinc-500 uppercase">
                Certificação de Formação Profissional · Angola
              </div>
            </div>
          </div>

          <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#FBD34D] bg-[#FAF9F5] px-4 py-1 text-[11px] font-bold tracking-[0.24em] text-[#1C1D21] uppercase">
            <Award className="size-3.5 text-[#D97706]" aria-hidden /> Diploma Oficial
          </div>

          <h1 className="mt-3 font-serif text-3xl font-bold tracking-[0.12em] text-[#1C1D21] uppercase sm:text-4xl">
            Certificado de Conclusão
          </h1>
        </header>

        {/* Corpo do Diploma */}
        <section className="my-9 space-y-5 text-center sm:my-11">
          <p className="text-xs font-medium tracking-[0.2em] text-zinc-500 uppercase">
            Certifica-se para os devidos efeitos que
          </p>

          <div className="mx-auto max-w-3xl border-b-2 border-[#FBD34D] pb-3">
            <div className="font-serif text-3xl font-bold tracking-tight text-[#1C1D21] sm:text-5xl">
              {formando.nome}
            </div>
          </div>

          <p className="mx-auto max-w-3xl text-sm leading-relaxed text-zinc-700 sm:text-base">
            concluiu com aproveitamento a ação de formação profissional em
          </p>

          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold tracking-tight text-[#1C1D21] sm:text-3xl">
              {matricula.turma.formacao.nome}
            </h2>
            <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
              Área {NOMES_CATEGORIA[matricula.turma.formacao.categoria]} · Edição / Turma{" "}
              {matricula.turma.codigo}
            </p>
          </div>

          {/* Indicadores Pedagógicos */}
          <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-3 rounded-2xl border border-zinc-200 bg-[#FAF9F5] p-4 text-xs sm:grid-cols-3">
            <div>
              <div className="font-medium text-zinc-500">Carga Horária Total</div>
              <div className="mt-0.5 text-base font-extrabold text-[#1C1D21]">
                {certificado.cargaHoraria} h
              </div>
            </div>
            <div className="border-y border-dotted border-zinc-300 py-2 sm:border-x sm:border-y-0 sm:py-0">
              <div className="font-medium text-zinc-500">Assiduidade Registada</div>
              <div className="mt-0.5 text-base font-extrabold text-[#1E6332]">
                {certificado.assiduidadePct}%
              </div>
            </div>
            <div>
              <div className="font-medium text-zinc-500">Data de Emissão</div>
              <div className="mt-0.5 text-base font-extrabold text-[#1C1D21]">
                {formatData(dataSimples(diaLocal(certificado.emitidoEm)))}
              </div>
            </div>
          </div>

          {dataInicioTurma && dataFimTurma && (
            <p className="text-xs text-zinc-500">
              Período letivo registado:{" "}
              <strong className="text-[#1C1D21]">
                {formatData(dataSimples(diaLocal(dataInicioTurma)))}
              </strong>{" "}
              a{" "}
              <strong className="text-[#1C1D21]">
                {formatData(dataSimples(diaLocal(dataFimTurma)))}
              </strong>
              .
            </p>
          )}
        </section>

        {/* Rodapé com Assinaturas e Código QR de Autenticidade */}
        <footer className="mt-10 grid items-end gap-8 border-t border-dotted border-zinc-300 pt-8 md:grid-cols-[1fr_1fr_auto]">
          <div className="pt-6 text-center">
            <div className="mx-auto w-56 border-t border-[#1C1D21] pt-2">
              <div className="text-xs font-bold text-[#1C1D21]">{formando.tenant.nome}</div>
              <div className="text-[11px] text-zinc-500">A Direção Geral</div>
            </div>
          </div>

          <div className="pt-6 text-center">
            <div className="mx-auto w-56 border-t border-[#1C1D21] pt-2">
              <div className="text-xs font-bold text-[#1C1D21]">{rotuloFormador}</div>
              <div className="text-[11px] text-zinc-500">
                {nomesFormadores.length === 1 ? "Formador(a) Responsável" : "Coordenação Pedagógica"}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3.5 rounded-2xl border border-zinc-200 bg-[#FAF9F5] p-3 text-left">
            <div
              className="size-[96px] shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: svgQr }}
            />
            <div className="max-w-[190px] space-y-1">
              <div className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider text-[#1E6332] uppercase">
                <ShieldCheck className="size-3.5" aria-hidden /> Verificação QR
              </div>
              <div className="font-mono text-xs font-extrabold text-[#1C1D21]">
                {certificado.codigo}
              </div>
              <div className="text-[10px] leading-snug break-all text-zinc-500">
                Valide a autenticidade em:{" "}
                <span className="font-medium text-[#1C1D21]">{urlVerificacao}</span>
              </div>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
