import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, LinkButton } from "@/components/ui";
import { NOMES_CATEGORIA } from "@/lib/catalogo";
import { formatDiaSemana, formatHora } from "@/lib/datas";
import { dbTenant, prisma } from "@/lib/db";
import { extrairUtms, querystringUtm, resumoDatasTurma } from "@/lib/leads";
import { formatKz } from "@/lib/money";
import { submeterPreCadastro } from "./actions";
import { PreCadastroForm, type OpcaoTurmaPublica } from "./pre-cadastro-form";

type Props = {
  params: Promise<{ centro: string; formacao: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { centro, formacao } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug: centro }, select: { id: true, nome: true } });
  if (!tenant) return { title: "Formação não encontrada" };
  const f = await prisma.formacao.findFirst({
    where: { tenantId: tenant.id, slug: formacao, ativa: true },
    select: { nome: true, descricao: true, preco: true, cargaHoraria: true },
  });
  if (!f) return { title: "Formação não encontrada" };
  const desc = f.descricao || `${f.nome} (${f.cargaHoraria} h) — investimento ${formatKz(f.preco)} em ${tenant.nome}.`;
  return {
    title: `${f.nome} — ${tenant.nome}`,
    description: desc,
    openGraph: {
      title: `${f.nome} · ${tenant.nome}`,
      description: desc,
    },
  };
}

export default async function LandingFormacaoPage({ params, searchParams }: Props) {
  const { centro, formacao: formacaoSlug } = await params;
  const sp = await searchParams;
  const utms = extrairUtms(sp);
  const sufixoUtm = querystringUtm(utms);

  const tenant = await prisma.tenant.findUnique({ where: { slug: centro }, select: { id: true, nome: true, slug: true } });
  if (!tenant) notFound();

  const db = dbTenant({ tenantId: tenant.id });
  const formacao = await db.formacao.findFirst({
    where: { slug: formacaoSlug, ativa: true },
    include: {
      turmas: {
        where: { estado: { in: ["PLANEADA", "EM_CURSO"] } },
        orderBy: { createdAt: "asc" },
        include: {
          sessoes: {
            where: { estado: { not: "CANCELADA" } },
            orderBy: { inicio: "asc" },
            select: { id: true, inicio: true, fim: true },
          },
          _count: { select: { matriculas: { where: { estado: { not: "CANCELADA" } } } } },
        },
      },
    },
  });
  if (!formacao) notFound();

  const opcoesTurmas: OpcaoTurmaPublica[] = formacao.turmas
    .filter((t) => t.sessoes.length > 0)
    .map((t) => {
      const preco = t.preco ?? formacao.preco;
      const datas = resumoDatasTurma(t.sessoes);
      const horarios = t.sessoes
        .slice(0, 6)
        .map((s) => `${formatDiaSemana(s.inicio)} · ${formatHora(s.inicio)}–${formatHora(s.fim)}`);
      if (t.sessoes.length > 6) horarios.push(`+${t.sessoes.length - 6} sessão(ões)`);
      const vagasRestantes = t.vagas !== null ? Math.max(0, t.vagas - t._count.matriculas) : null;
      return {
        id: t.id,
        codigo: t.codigo,
        precoFormatado: formatKz(preco),
        textoDatas: datas?.textoDatas ?? "Datas a confirmar",
        horariosResumo: horarios,
        vagasRestantes,
      };
    });

  return (
    <div className="min-h-dvh bg-[#F5F4EF] text-[#1C1D21]">
      {/* Barra superior limpa */}
      <nav className="sticky top-0 z-30 border-b border-zinc-200/70 bg-[#F5F4EF]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
          <Link
            href={`/p/${tenant.slug}${sufixoUtm}`}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#1C1D21] shadow-2xs ring-1 ring-zinc-200/80 transition-all hover:-translate-y-0.5 hover:bg-[#FAF9F5]"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> Voltar ao catálogo de {tenant.nome}
          </Link>
          <Badge cor="azul">{NOMES_CATEGORIA[formacao.categoria]}</Badge>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
        {/* Cabeçalho Hero da Formação */}
        <section className="anim-enter rounded-[2rem] border border-zinc-900/15 bg-[#1C1D21] p-6 text-white shadow-xl sm:p-10">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBD34D] px-3 py-1 text-xs font-bold text-[#1C1D21]">
              <Sparkles className="size-3.5" aria-hidden /> {NOMES_CATEGORIA[formacao.categoria]}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-zinc-200">
              <Clock className="size-3.5 text-[#FBD34D]" aria-hidden /> Carga horária: {formacao.cargaHoraria} horas
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-zinc-200">
              <GraduationCap className="size-3.5 text-[#FBD34D]" aria-hidden /> {tenant.nome}
            </span>
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">{formacao.nome}</h1>
          {formacao.descricao && (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">{formacao.descricao}</p>
          )}
        </section>

        {opcoesTurmas.length === 0 ? (
          <Card className="p-10 text-center">
            <CalendarDays className="mx-auto mb-3 size-8 text-zinc-400" aria-hidden />
            <h2 className="text-lg font-semibold text-[#1C1D21]">Sem turmas abertas de momento</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Esta formação não tem turmas com vagas abertas neste momento. Consulte as outras formações disponíveis.
            </p>
            <div className="mt-5">
              <LinkButton href={`/p/${tenant.slug}${sufixoUtm}`} variante="primario">
                Ver outras formações
              </LinkButton>
            </div>
          </Card>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
            {/* Coluna esquerda: Garantias e etapas */}
            <div className="space-y-4">
              <Card>
                <CardHeader
                  titulo="Como funciona a sua inscrição"
                  descricao="Processo rápido e transparente em 3 etapas."
                />
                <div className="space-y-3.5 p-6 text-xs leading-relaxed text-zinc-600">
                  <div className="flex items-start gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-xs font-bold text-[#FBD34D]">
                      01
                    </span>
                    <div>
                      <strong className="block text-[#1C1D21]">Escolha a turma e horário</strong>
                      Selecione a edição com as datas e horários mais convenientes para a sua agenda.
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#FBD34D] text-xs font-bold text-[#1C1D21]">
                      02
                    </span>
                    <div>
                      <strong className="block text-[#1C1D21]">Confirme os seus dados</strong>
                      Indique o seu nome e número de WhatsApp e valide o investimento da formação.
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#E7F4E8] text-xs font-bold text-[#1E6332]">
                      03
                    </span>
                    <div>
                      <strong className="block text-[#1C1D21]">Atendimento direto via WhatsApp</strong>
                      A equipa de {tenant.nome} entra em contacto consigo para concluir a matrícula (a pronto ou parcelado).
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="bg-[#FAF9F5] p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-[#FBD34D]">
                    <ShieldCheck className="size-4.5" aria-hidden />
                  </span>
                  <div className="text-xs leading-relaxed text-zinc-600">
                    <strong className="block text-sm text-[#1C1D21]">Garantia de Transparência</strong>
                    Sem taxas ocultas: o valor apresentado inclui toda a carga horária de {formacao.cargaHoraria} horas.
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-dotted border-zinc-200 pt-3 text-xs font-medium text-[#1E6332]">
                  <MessageCircle className="size-4" aria-hidden />
                  Receberá confirmação automática no seu WhatsApp.
                </div>
              </Card>
            </div>

            {/* Coluna direita: Formulário de Pré-Cadastro */}
            <Card>
              <CardHeader
                titulo="Ficha de Pré-Cadastro"
                descricao="Selecione a turma pretendida e preencha os seus dados de contacto."
                acoes={
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F4E8] px-2.5 py-1 text-[11px] font-semibold text-[#1E6332]">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Vagas disponíveis
                  </span>
                }
              />
              <div className="p-6">
                <PreCadastroForm
                  acao={submeterPreCadastro.bind(null, tenant.slug, formacao.slug)}
                  turmas={opcoesTurmas}
                  utms={utms}
                />
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
