import { Prisma } from "@prisma/client";
import { AlertTriangle, ArrowLeft, Award, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { Alerta, Card, CardHeader, LinkButton } from "@/components/ui";
import { exigir } from "@/lib/auth";
import {
  gerarCodigoCertificado,
  gerarQrCodeSvg,
  verificarElegibilidadeCertificado,
} from "@/lib/certificados";
import { dataSimples, diaLocal, formatData, hojeLocal } from "@/lib/datas";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { formatKz } from "@/lib/money";
import { comPago, resumirParcelas } from "@/lib/parcelas";
import { calcularAssiduidade } from "@/lib/presencas";
import { pode } from "@/lib/rbac";

export const metadata = { title: "Certificado de Conclusão A4" };

export default async function CertificadoInternoPage({
  params,
}: {
  params: Promise<{ id: string; matriculaId: string }>;
}) {
  const { user, db } = await exigir("formandos:ver");
  const podeGerirCertificados = pode(user.perfil, "certificados:gerir");
  const { id, matriculaId } = await params;

  const [matricula, cfg] = await Promise.all([
    db.matricula.findFirst({
      where: { id: matriculaId, formandoId: id },
      include: {
        formando: true,
        certificado: { include: { emitidoPor: { select: { nome: true } } } },
        parcelas: { include: { alocacoes: { select: { valor: true } } } },
        turma: {
          include: {
            formacao: true,
            sessoes: {
              where: { estado: { not: "CANCELADA" } },
              orderBy: { inicio: "asc" },
              include: {
                formador: { select: { nome: true } },
                presencas: { select: { matriculaId: true, estado: true } },
              },
            },
          },
        },
      },
    }),
    obterConfiguracao(comoCliente(db), user.tenantId),
  ]);

  if (!matricula) notFound();

  const hoje = dataSimples(hojeLocal());
  const resumo = resumirParcelas(matricula.parcelas.map(comPago), hoje);

  let estadoMatricula = matricula.estado;
  if (
    estadoMatricula === "ATIVA" &&
    matricula.turma.estado === "CONCLUIDA" &&
    resumo.divida <= 0n &&
    podeGerirCertificados
  ) {
    await db.matricula.update({
      where: { id: matricula.id },
      data: { estado: "CONCLUIDA" },
    });
    estadoMatricula = "CONCLUIDA";
  }

  const assiduidade = calcularAssiduidade(
    matricula.turma.sessoes.map((s) => ({
      id: s.id,
      inicio: s.inicio,
      estado: s.estado,
      temChamadaLancada: s.presencas.length > 0,
      estadoAluno: s.presencas.find((p) => p.matriculaId === matricula.id)?.estado ?? null,
    })),
  );

  const elegibilidade = verificarElegibilidadeCertificado({
    estadoMatricula,
    dividaCentimos: resumo.divida,
    assiduidadePct: assiduidade.assiduidadePct,
    minAssiduidadePct: cfg.minAssiduidadeCertificadoPct,
    revogado: Boolean(matricula.certificado?.revogadoEm),
  });

  let certificado = matricula.certificado;

  // Emissão automática quando o utilizador tem permissão e a matrícula cumpre todos os requisitos
  if (!certificado && elegibilidade.elegivel && podeGerirCertificados) {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const codigo = gerarCodigoCertificado();
      try {
        certificado = await db.certificado.create({
          data: {
            tenantId: user.tenantId,
            matriculaId: matricula.id,
            codigo,
            cargaHoraria: matricula.turma.formacao.cargaHoraria,
            assiduidadePct: assiduidade.assiduidadePct,
            emitidoPorId: user.id,
          },
          include: { emitidoPor: { select: { nome: true } } },
        });
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const existente = await db.certificado.findFirst({
            where: { matriculaId: matricula.id },
            include: { emitidoPor: { select: { nome: true } } },
          });
          if (existente) {
            certificado = existente;
            break;
          }
          if (tentativa < 4) continue;
        }
        throw e;
      }
    }
  }

  const certificadoValido = certificado && !certificado.revogadoEm ? certificado : null;

  // Caso não exista certificado válido (bloqueado por critérios ou aguarda emissão pedagógica)
  if (!certificadoValido) {
    const concluidaOk = estadoMatricula === "CONCLUIDA";
    const financeiroOk = resumo.divida <= 0n;
    const assiduidadeOk = assiduidade.assiduidadePct >= cfg.minAssiduidadeCertificadoPct;

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LinkButton href={`/formandos/${matricula.formandoId}`} variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar à ficha do formando
          </LinkButton>
          <LinkButton href={`/turmas/${matricula.turmaId}`} variante="secundario">
            Ver Turma {matricula.turma.codigo}
          </LinkButton>
        </div>

        <Card>
          <CardHeader
            titulo="Verificação de Elegibilidade para Certificado"
            descricao={`${matricula.formando.nome} · ${matricula.turma.formacao.nome} (${matricula.turma.codigo})`}
          />
          <div className="space-y-5 p-6">
            {elegibilidade.motivosBloqueio.length > 0 ? (
              <Alerta tipo="aviso">
                <div className="space-y-1.5">
                  <div className="font-semibold">
                    O Certificado de Conclusão ainda não pode ser emitido pelos seguintes motivos:
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-xs">
                    {elegibilidade.motivosBloqueio.map((motivo, idx) => (
                      <li key={idx}>{motivo}</li>
                    ))}
                  </ul>
                </div>
              </Alerta>
            ) : (
              <Alerta tipo="aviso">
                O formando cumpre todos os requisitos académicos e financeiros. Aguarda emissão formal pela Coordenação
                Pedagógica ou Administração.
              </Alerta>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#E5E3DC] bg-[#FAF9F5] p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-500">1. Fecho Pedagógico</span>
                  {concluidaOk ? (
                    <CheckCircle2 className="size-4 text-[#1E6332]" aria-hidden />
                  ) : (
                    <AlertTriangle className="size-4 text-[#D97706]" aria-hidden />
                  )}
                </div>
                <div className="mt-2 text-sm font-bold text-[#1C1D21]">
                  {concluidaOk ? "Matrícula Concluída" : `Estado: ${estadoMatricula}`}
                </div>
              </div>

              <div className="rounded-2xl border border-[#E5E3DC] bg-[#FAF9F5] p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-500">2. Quitação Financeira</span>
                  {financeiroOk ? (
                    <CheckCircle2 className="size-4 text-[#1E6332]" aria-hidden />
                  ) : (
                    <XCircle className="size-4 text-[#B42318]" aria-hidden />
                  )}
                </div>
                <div className="mt-2 text-sm font-bold text-[#1C1D21]">
                  {financeiroOk ? "100% Liquidado" : `Em dívida: ${formatKz(resumo.divida)}`}
                </div>
              </div>

              <div className="rounded-2xl border border-[#E5E3DC] bg-[#FAF9F5] p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-500">3. Assiduidade Mínima</span>
                  {assiduidadeOk ? (
                    <CheckCircle2 className="size-4 text-[#1E6332]" aria-hidden />
                  ) : (
                    <XCircle className="size-4 text-[#B42318]" aria-hidden />
                  )}
                </div>
                <div className="mt-2 text-sm font-bold text-[#1C1D21]">
                  {assiduidade.assiduidadePct}% (mín. {cfg.minAssiduidadeCertificadoPct}%)
                </div>
              </div>
            </div>

            {!financeiroOk && pode(user.perfil, "pagamentos:registar") && estadoMatricula === "ATIVA" && (
              <div className="flex justify-end pt-2">
                <Link
                  href={`/formandos/${matricula.formandoId}/pagamento?matriculaId=${matricula.id}`}
                  className="inline-flex h-10 items-center rounded-full bg-[#1C1D21] px-4 text-xs font-semibold text-white hover:bg-zinc-800"
                >
                  Liquidar saldo pendente →
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Geração do QR Code vetorial apontando para /verificar/${certificado.codigo}
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const baseUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "") || (host ? `${proto}://${host}` : "");
  const caminhoVerificacao = `/verificar/${certificadoValido.codigo}`;
  const urlVerificacao = `${baseUrl}${caminhoVerificacao}`;
  const qrSvg = await gerarQrCodeSvg(urlVerificacao);

  const sessoesTurma = matricula.turma.sessoes;
  const primeiraSessao = sessoesTurma[0];
  const ultimaSessao = sessoesTurma[sessoesTurma.length - 1];
  const formadoresNomes = Array.from(new Set(sessoesTurma.map((s) => s.formador.nome)));

  return (
    <div className="space-y-6">
      {/* Barra superior (oculta na impressão) */}
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <LinkButton href={`/formandos/${matricula.formandoId}`} variante="secundario">
          <ArrowLeft className="size-4" aria-hidden /> Voltar à ficha do formando
        </LinkButton>
        <BotaoImprimir rotulo="Imprimir Diploma / Certificado (A4)" />
      </div>

      {/* Diploma A4 Editorial com Moldura Dupla */}
      <article className="mx-auto max-w-4xl rounded-3xl bg-white p-4 shadow-[0_6px_32px_-8px_rgba(28,29,33,0.12)] sm:p-6 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="border-2 border-[#1C1D21] p-2 sm:p-3">
          <div className="border border-[#FBD34D] bg-[#FAF9F5] px-6 py-10 text-[#1C1D21] sm:px-14 sm:py-14 print:bg-white">
            {/* Cabeçalho Solene */}
            <header className="text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#1C1D21] text-[#FBD34D] shadow-sm">
                <Award className="size-7" aria-hidden />
              </div>
              <div className="mt-3 text-xs font-extrabold tracking-[0.22em] text-zinc-500 uppercase">
                {user.tenant.nome}
              </div>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#1C1D21] uppercase sm:text-3xl">
                Certificado de Conclusão
              </h1>
              <div className="mx-auto mt-3 h-1 w-24 rounded-full bg-[#FBD34D]" />
            </header>

            {/* Corpo Diplomático */}
            <section className="mx-auto mt-10 max-w-2xl text-center leading-relaxed">
              <p className="text-sm text-zinc-600">Certifica-se, para os devidos efeitos, que</p>
              <div className="my-4 border-b border-dotted border-zinc-300 pb-3 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-4xl">
                {matricula.formando.nome}
              </div>
              <p className="text-sm text-zinc-700 sm:text-base">
                concluiu com aproveitamento a ação de formação profissional em{" "}
                <strong className="font-extrabold text-[#1C1D21]">{matricula.turma.formacao.nome}</strong>{" "}
                (Turma <span className="font-mono font-semibold">{matricula.turma.codigo}</span>), com a carga
                horária total de{" "}
                <strong className="text-[#1C1D21]">{certificadoValido.cargaHoraria} horas</strong> e assiduidade
                registada de <strong className="text-[#1C1D21]">{certificadoValido.assiduidadePct}%</strong>
                {primeiraSessao && ultimaSessao ? (
                  <>
                    , realizada de{" "}
                    <strong>{formatData(dataSimples(diaLocal(primeiraSessao.inicio)))}</strong> a{" "}
                    <strong>{formatData(dataSimples(diaLocal(ultimaSessao.inicio)))}</strong>
                  </>
                ) : null}
                .
              </p>
            </section>

            {/* Assinaturas e Código QR de Autenticidade */}
            <footer className="mt-12 grid items-end gap-8 border-t border-dotted border-zinc-300 pt-8 sm:grid-cols-[1fr_1fr_auto]">
              <div className="pt-8 text-center">
                <div className="mx-auto max-w-[210px] border-t border-[#1C1D21] pt-2 text-xs font-bold text-[#1C1D21]">
                  O(A) Formador(a)
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {formadoresNomes.length > 0 ? formadoresNomes.join(" / ") : "Corpo Docente"}
                </div>
              </div>

              <div className="pt-8 text-center">
                <div className="mx-auto max-w-[210px] border-t border-[#1C1D21] pt-2 text-xs font-bold text-[#1C1D21]">
                  A Direção / Coordenação Pedagógica
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  Emitido em {formatData(dataSimples(diaLocal(certificadoValido.emitidoEm)))}
                </div>
              </div>

              {/* Selo de Verificação QR Code */}
              <div className="flex flex-col items-center rounded-2xl border border-zinc-200/90 bg-white p-3 text-center shadow-2xs">
                <div
                  className="size-[116px] [&>svg]:size-full"
                  aria-label={`QR Code de verificação ${certificadoValido.codigo}`}
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <div className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] font-extrabold text-[#1C1D21]">
                  <ShieldCheck className="size-3.5 text-[#1E6332]" aria-hidden />
                  {certificadoValido.codigo}
                </div>
                <div className="mt-0.5 font-mono text-[9px] text-zinc-500">{caminhoVerificacao}</div>
              </div>
            </footer>
          </div>
        </div>
      </article>
    </div>
  );
}
