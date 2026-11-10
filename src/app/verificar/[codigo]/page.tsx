import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardHeader, LinkButton } from "@/components/ui";
import { NOMES_CATEGORIA } from "@/lib/catalogo";
import { dataSimples, diaLocal, formatData } from "@/lib/datas";
import { prisma } from "@/lib/db";

type Props = {
  params: Promise<{ codigo: string }>;
};

function iniciaisNome(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "GA";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

async function procurarCertificado(codigoBruto: string) {
  const limpo = decodeURIComponent(codigoBruto).trim();
  if (!limpo) return null;

  const exato = await prisma.certificado.findUnique({
    where: { codigo: limpo },
    include: {
      tenant: true,
      matricula: {
        include: {
          formando: true,
          turma: {
            include: {
              formacao: true,
            },
          },
        },
      },
    },
  });
  if (exato) return exato;

  const maiusculo = limpo.toUpperCase();
  if (maiusculo === limpo) return null;

  return prisma.certificado.findUnique({
    where: { codigo: maiusculo },
    include: {
      tenant: true,
      matricula: {
        include: {
          formando: true,
          turma: {
            include: {
              formacao: true,
            },
          },
        },
      },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  const cert = await procurarCertificado(codigo);
  if (!cert) {
    return {
      title: "Verificação Pública de Certificado",
    };
  }
  return {
    title: `${cert.revogadoEm ? "Certificado Revogado" : "Certificado Autêntico"} (${cert.codigo}) — ${cert.tenant.nome}`,
    description: `Verificação oficial do certificado ${cert.codigo} emitido por ${cert.tenant.nome} em nome de ${cert.matricula.formando.nome}.`,
  };
}

export default async function VerificarCertificadoPage({ params }: Props) {
  const { codigo } = await params;
  const codigoApresentado = decodeURIComponent(codigo).trim();
  const certificado = await procurarCertificado(codigo);

  if (!certificado) {
    return (
      <div className="min-h-dvh bg-[#F5F4EF] px-4 py-12 text-[#1C1D21] sm:px-8">
        <main className="mx-auto max-w-2xl space-y-6">
          <Card className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#FDECEB] text-[#B42318] ring-1 ring-[#D92D20]/20">
                <AlertTriangle className="size-6" aria-hidden />
              </span>
              <div className="space-y-1">
                <Badge cor="vermelho">Registo Não Localizado</Badge>
                <h1 className="pt-1 text-xl font-bold tracking-tight text-[#1C1D21] sm:text-2xl">
                  Código de certificado não encontrado
                </h1>
                <p className="text-xs text-zinc-600 sm:text-sm">
                  Não existe nenhum certificado oficial emitido com o código{" "}
                  <strong className="font-mono text-[#1C1D21]">{codigoApresentado || "—"}</strong>.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 text-xs leading-relaxed text-zinc-600">
              Confirme se o código alfanumérico (ex.: <span className="font-mono">CERT-2026-XXXXXXXX</span>)
              foi introduzido exatamente como consta no rodapé do documento ou utilize a câmara do telemóvel
              para ler diretamente o QR Code impresso no certificado.
            </div>
          </Card>
        </main>
      </div>
    );
  }

  const revogado = Boolean(certificado.revogadoEm);
  const { tenant, matricula } = certificado;
  const { formando, turma } = matricula;
  const { formacao } = turma;

  return (
    <div className="min-h-dvh bg-[#F5F4EF] text-[#1C1D21]">
      {/* Barra superior pública */}
      <nav className="border-b border-zinc-200/70 bg-[#F5F4EF]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-[#1C1D21] text-xs font-extrabold tracking-wider text-[#FBD34D] shadow-2xs">
              {iniciaisNome(tenant.nome)}
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-tight text-[#1C1D21] uppercase">
                {tenant.nome}
              </div>
              <div className="text-[11px] font-medium text-zinc-500">
                Portal Público de Verificação de Certificados
              </div>
            </div>
          </div>

          <Link
            href={`/p/${tenant.slug}`}
            className="inline-flex min-h-9.5 items-center gap-1.5 rounded-full bg-[#1C1D21] px-4 text-xs font-semibold text-white shadow-2xs transition-all hover:-translate-y-0.5 hover:bg-zinc-800"
          >
            Catálogo do Centro <ArrowUpRight className="size-3.5 text-[#FBD34D]" aria-hidden />
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-8 sm:py-10">
        {/* Banner de Estado de Autenticidade */}
        {revogado ? (
          <section className="anim-enter rounded-[2rem] border border-[#D92D20]/30 bg-[#FDECEB] p-6 text-[#1C1D21] shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#B42318] text-white shadow-xs">
                  <ShieldAlert className="size-7" aria-hidden />
                </span>
                <div className="space-y-1.5">
                  <Badge cor="vermelho">Certificado Revogado / Sem Validade</Badge>
                  <h1 className="text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
                    Este certificado foi revogado
                  </h1>
                  <p className="text-xs text-zinc-700 sm:text-sm">
                    Revogado oficialmente por <strong>{tenant.nome}</strong> em{" "}
                    <strong>
                      {certificado.revogadoEm
                        ? formatData(dataSimples(diaLocal(certificado.revogadoEm)))
                        : "—"}
                    </strong>
                    .
                  </p>
                  {certificado.motivoRevogacao && (
                    <p className="mt-2 rounded-xl bg-white/80 px-3.5 py-2 text-xs font-medium text-[#B42318] ring-1 ring-[#D92D20]/20">
                      Motivo registado: {certificado.motivoRevogacao}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white px-4 py-2.5 font-mono text-xs font-bold text-[#B42318] ring-1 ring-[#D92D20]/25">
                {certificado.codigo}
              </div>
            </div>
          </section>
        ) : (
          <section className="anim-enter rounded-[2rem] border border-zinc-900/15 bg-[#1C1D21] p-6 text-white shadow-xl sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#E7F4E8] text-[#1E6332] shadow-sm">
                  <ShieldCheck className="size-7" aria-hidden />
                </span>
                <div className="space-y-1.5">
                  <Badge cor="verde">Certificado Autêntico e Verificado</Badge>
                  <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    Diploma Oficial Válido
                  </h1>
                  <p className="text-xs text-zinc-300 sm:text-sm">
                    Registo criptográfico confirmado em tempo real junto da base de dados de{" "}
                    <strong className="text-[#FBD34D]">{tenant.nome}</strong>.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#FBD34D]/40 bg-white/10 px-4 py-2.5 text-right">
                <div className="text-[10px] font-semibold tracking-wider text-zinc-300 uppercase">
                  Código Único
                </div>
                <div className="font-mono text-sm font-extrabold text-[#FBD34D]">
                  {certificado.codigo}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Ficha Completa de Metadados do Diploma */}
        <Card>
          <CardHeader
            titulo="Dados Oficiais do Certificado"
            descricao="Informação fidedigna constante no registo académico da instituição formadora."
            acoes={
              revogado ? (
                <Badge cor="vermelho">Revogado</Badge>
              ) : (
                <Badge cor="verde">
                  <CheckCircle2 className="mr-1 inline size-3.5" aria-hidden /> Em vigor
                </Badge>
              )
            }
          />

          <div className="space-y-6 p-6">
            {/* Destaque do Titular e Curso */}
            <div className="grid gap-4 rounded-3xl border border-zinc-200/80 bg-[#FAF9F5] p-5 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-zinc-500 uppercase">
                  <GraduationCap className="size-3.5 text-[#1C1D21]" aria-hidden /> Titular Certificado
                </div>
                <div className="text-xl font-bold text-[#1C1D21]">{formando.nome}</div>
              </div>

              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-zinc-500 uppercase">
                  <Award className="size-3.5 text-[#1C1D21]" aria-hidden /> Formação Concluída
                </div>
                <div className="text-xl font-bold text-[#1C1D21]">{formacao.nome}</div>
                <div className="text-xs text-zinc-500">
                  {NOMES_CATEGORIA[formacao.categoria]} · Turma {turma.codigo}
                </div>
              </div>
            </div>

            {/* Linhas editoriais com leader-dots */}
            <div className="space-y-3 text-xs sm:text-sm">
              <div className="flex items-baseline">
                <span className="text-zinc-500">Código Público de Verificação</span>
                <span className="leader-dots" />
                <span className="font-mono font-bold text-[#1C1D21]">{certificado.codigo}</span>
              </div>

              <div className="flex items-baseline">
                <span className="text-zinc-500">Entidade Formadora</span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{tenant.nome}</span>
              </div>

              <div className="flex items-baseline">
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <Clock className="size-3.5 text-zinc-400" aria-hidden /> Carga Horária Certificada
                </span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">{certificado.cargaHoraria} horas</span>
              </div>

              <div className="flex items-baseline">
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <UserCheck className="size-3.5 text-zinc-400" aria-hidden /> Assiduidade Registada
                </span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1E6332]">{certificado.assiduidadePct}%</span>
              </div>

              <div className="flex items-baseline">
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <CalendarDays className="size-3.5 text-zinc-400" aria-hidden /> Data de Emissão
                </span>
                <span className="leader-dots" />
                <span className="font-bold text-[#1C1D21]">
                  {formatData(dataSimples(diaLocal(certificado.emitidoEm)))}
                </span>
              </div>

              <div className="flex items-baseline">
                <span className="text-zinc-500">Situação Regimental</span>
                <span className="leader-dots" />
                <span className={`font-bold ${revogado ? "text-[#B42318]" : "text-[#1E6332]"}`}>
                  {revogado ? "Revogado pela coordenação" : "Válido e Autêntico"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4">
              <div>
                <div className="text-xs font-bold text-[#1C1D21]">
                  Pretende conhecer os próximos cursos de {tenant.nome}?
                </div>
                <div className="text-xs text-zinc-500">
                  Consulte o catálogo público com calendário de turmas e inscrições abertas.
                </div>
              </div>
              <LinkButton href={`/p/${tenant.slug}`}>
                Ver Catálogo de Formações <ArrowUpRight className="size-4 text-[#FBD34D]" aria-hidden />
              </LinkButton>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
