import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { NOMES_CATEGORIA } from "@/lib/catalogo";
import { dataSimples, diaLocal, formatData } from "@/lib/datas";
import { dbTenant, prisma } from "@/lib/db";
import { extrairUtms, querystringUtm, resumoDatasTurma, rotuloPrecoFormacao } from "@/lib/leads";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { formatKz } from "@/lib/money";

type Props = {
  params: Promise<{ centro: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { centro } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug: centro }, select: { id: true, nome: true } });
  if (!tenant) return { title: "Centro não encontrado" };
  const cfg = await prisma.configuracaoCentro.findUnique({
    where: { tenantId: tenant.id },
    select: { apresentacaoPublica: true },
  });
  const desc = cfg?.apresentacaoPublica || `Catálogo de formações com inscrições abertas em ${tenant.nome}.`;
  return {
    title: `${tenant.nome} — Catálogo de Formações`,
    description: desc,
    openGraph: {
      title: `${tenant.nome} — Formações`,
      description: desc,
    },
  };
}

function iniciaisCentro(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "GA";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export default async function LandingCentroPage({ params, searchParams }: Props) {
  const { centro } = await params;
  const sp = await searchParams;
  const utms = extrairUtms(sp);
  const sufixoUtm = querystringUtm(utms);

  const tenant = await prisma.tenant.findUnique({ where: { slug: centro }, select: { id: true, nome: true, slug: true } });
  if (!tenant) notFound();

  const db = dbTenant({ tenantId: tenant.id });
  const [cfg, formacoes] = await Promise.all([
    obterConfiguracao(comoCliente(db), tenant.id),
    db.formacao.findMany({
      where: {
        ativa: true,
        turmas: {
          some: {
            estado: { in: ["PLANEADA", "EM_CURSO"] },
            sessoes: { some: { estado: { not: "CANCELADA" } } },
          },
        },
      },
      orderBy: { nome: "asc" },
      include: {
        turmas: {
          where: {
            estado: { in: ["PLANEADA", "EM_CURSO"] },
            sessoes: { some: { estado: { not: "CANCELADA" } } },
          },
          include: {
            sessoes: {
              where: { estado: { not: "CANCELADA" } },
              orderBy: { inicio: "asc" },
              select: { inicio: true, fim: true },
            },
            _count: { select: { matriculas: { where: { estado: { not: "CANCELADA" } } } } },
          },
        },
      },
    }),
  ]);

  const totalTurmasAbertas = formacoes.reduce((s, f) => s + f.turmas.length, 0);
  const iniciais = iniciaisCentro(tenant.nome);

  return (
    <div className="min-h-dvh bg-[#F5F4EF] text-[#1C1D21]">
      {/* Barra superior editorial */}
      <nav className="sticky top-0 z-30 border-b border-zinc-200/70 bg-[#F5F4EF]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-[#1C1D21] text-xs font-extrabold tracking-wider text-[#FBD34D] shadow-2xs">
              {iniciais}
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-tight text-[#1C1D21] uppercase">{tenant.nome}</div>
              <div className="text-[11px] font-medium text-zinc-500">Catálogo Oficial de Formações</div>
            </div>
          </div>

          <a
            href="#catalogo"
            className="inline-flex min-h-9.5 items-center gap-1.5 rounded-full bg-[#1C1D21] px-4 text-xs font-semibold text-white shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-800"
          >
            Ver Cursos Disponíveis <ArrowUpRight className="size-3.5 text-[#FBD34D]" aria-hidden />
          </a>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-6 sm:px-8 sm:py-10">
        {/* Hero Editorial com fotografia e cartões de confiança */}
        <section className="anim-enter relative overflow-hidden rounded-[2rem] border border-zinc-900/15 bg-[#1C1D21] p-6 text-white shadow-xl sm:p-10 lg:p-12">
          <Image
            src="/login-editorial.jpg"
            alt={`Formações profissionais em ${tenant.nome}`}
            fill
            priority
            sizes="(min-width: 1200px) 1152px, 100vw"
            className="pointer-events-none object-cover object-center opacity-40 select-none"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#111215]/95 via-[#1C1D21]/85 to-[#1C1D21]/45"
            aria-hidden
          />

          <div className="relative z-10 grid items-end gap-8 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-[#FBD34D] backdrop-blur-md">
                <Sparkles className="size-3.5" aria-hidden /> Inscrições Abertas · Turmas Presenciais
              </div>

              <h1 className="text-3xl leading-tight font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Evolua na sua carreira com formação prática em {tenant.nome}.
              </h1>

              <p className="max-w-2xl text-sm leading-relaxed text-zinc-200 sm:text-base">
                {cfg.apresentacaoPublica ||
                  "Consulte em total transparência a carga horária, o calendário de sessões e o investimento de cada curso. Faça o seu pré-cadastro online e receba atendimento direto no seu WhatsApp."}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <a
                  href="#catalogo"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#FBD34D] px-6 text-sm font-bold text-[#1C1D21] shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-300"
                >
                  Escolher Formação <ArrowUpRight className="size-4" aria-hidden />
                </a>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#1C1D21]/65 px-4 py-2 text-xs font-medium text-zinc-200 backdrop-blur-md">
                  <CheckCircle2 className="size-4 text-[#FBD34D]" aria-hidden />
                  Confirmação imediata via WhatsApp
                </div>
              </div>
            </div>

            {/* Cartão resumo lateral no Hero */}
            <div className="rounded-3xl border border-white/15 bg-[#FAF9F5]/95 p-5 text-[#1C1D21] shadow-xl backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between border-b border-dotted border-zinc-300 pb-2.5">
                <span className="text-xs font-bold tracking-wider text-zinc-600 uppercase">Resumo do Catálogo</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F4E8] px-2.5 py-0.5 text-[11px] font-semibold text-[#1E6332]">
                  <span className="size-1.5 rounded-full bg-[#288042]" aria-hidden /> Vagas abertas
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Formações disponíveis</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">{formacoes.length} curso(s)</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Edições / turmas ativas</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">{totalTurmasAbertas} turma(s)</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-zinc-500">Modalidade de pagamento</span>
                  <span className="leader-dots" />
                  <span className="font-bold text-[#1C1D21]">A pronto ou parcelado</span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-[#1C1D21] px-3.5 py-2.5 text-[11px] leading-relaxed text-zinc-200">
                <strong className="text-[#FBD34D]">Como funciona:</strong> selecione o curso, confirme a turma e os horários e a nossa equipa contacta-o pelo WhatsApp.
              </div>
            </div>
          </div>
        </section>

        {/* 3 Pilares de Confiança */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Card className="flex items-start gap-3.5 p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#1C1D21] text-[#FBD34D]">
              <CalendarDays className="size-4.5" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#1C1D21]">Datas e Preços Transparentes</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Consulte antecipadamente os dias de aula, horários e valor total antes de realizar o pré-cadastro.
              </p>
            </div>
          </Card>

          <Card className="flex items-start gap-3.5 p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#FBD34D] text-[#1C1D21]">
              <GraduationCap className="size-4.5" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#1C1D21]">Formadores Certificados</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Aulas práticas acompanhadas por especialistas avaliados continuamente em qualidade pedagógica.
              </p>
            </div>
          </Card>

          <Card className="flex items-start gap-3.5 p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#E7F4E8] text-[#1E6332]">
              <ShieldCheck className="size-4.5" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#1C1D21]">Acompanhamento no Telemóvel</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Após a matrícula, aceda ao seu Portal Pessoal com horários, estado de parcelas e pontos de indicação.
              </p>
            </div>
          </Card>
        </section>

        {/* Catálogo de Formações */}
        <section id="catalogo" className="scroll-mt-24 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Catálogo de Cursos</p>
              <h2 className="mt-0.5 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
                Formações com Inscrições Abertas
              </h2>
            </div>
            <Badge cor="azul">{formacoes.length} formação(ões) ativa(s)</Badge>
          </div>

          {formacoes.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-[#FAF9F5] text-zinc-500">
                <BookOpen className="size-6" aria-hidden />
              </div>
              <p className="text-base font-semibold text-[#1C1D21]">
                De momento não existem turmas com inscrições abertas.
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Novas edições estão a ser planeadas. Volte a consultar esta página em breve.
              </p>
            </Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {formacoes.map((f) => {
                const { precoMinimo, aPartirDe } = rotuloPrecoFormacao(
                  f.preco,
                  f.turmas.map((t) => t.preco),
                );
                const todasSessoes = f.turmas.flatMap((t) => t.sessoes);
                const datas = resumoDatasTurma(todasSessoes);
                const proximaSessao = [...todasSessoes].sort((a, b) => a.inicio.getTime() - b.inicio.getTime())[0];

                return (
                  <Card key={f.id} className="flex flex-col justify-between overflow-hidden">
                    <div className="p-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge cor={f.categoria === "COMPORTAMENTAL" ? "amarelo" : "azul"}>
                          {NOMES_CATEGORIA[f.categoria]}
                        </Badge>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF9F5] px-3 py-1 text-xs font-semibold text-[#1C1D21] ring-1 ring-zinc-200/80">
                          <Clock className="size-3.5 text-zinc-500" aria-hidden /> {f.cargaHoraria} horas
                        </span>
                      </div>

                      <h3 className="mt-4 text-xl font-bold tracking-tight text-[#1C1D21]">{f.nome}</h3>
                      {f.descricao && (
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600">{f.descricao}</p>
                      )}

                      {/* Ficha técnica pontilhada da formação */}
                      <div className="mt-5 space-y-2 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 text-xs">
                        {proximaSessao && (
                          <div className="flex items-baseline">
                            <span className="inline-flex items-center gap-1.5 text-zinc-500">
                              <CalendarDays className="size-3.5 text-[#1C1D21]" aria-hidden /> Início da próxima turma
                            </span>
                            <span className="leader-dots" />
                            <span className="font-bold text-[#1C1D21]">
                              {formatData(dataSimples(diaLocal(proximaSessao.inicio)))}
                            </span>
                          </div>
                        )}
                        <div className="flex items-baseline">
                          <span className="inline-flex items-center gap-1.5 text-zinc-500">
                            <UsersRound className="size-3.5 text-[#1C1D21]" aria-hidden /> Turmas abertas
                          </span>
                          <span className="leader-dots" />
                          <span className="font-bold text-[#1C1D21]">
                            {f.turmas.length} edição(ões) {datas && f.turmas.length === 1 ? `(${datas.textoDatas})` : ""}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-dotted border-zinc-200 bg-[#FAF9F5] px-6 py-4">
                      <div>
                        <span className="block text-[11px] font-medium text-zinc-500">
                          {aPartirDe ? "Investimento a partir de" : "Investimento total"}
                        </span>
                        <span className="text-xl font-extrabold tracking-tight text-[#1C1D21]">
                          {formatKz(precoMinimo)}
                        </span>
                      </div>

                      <Link
                        href={`/p/${tenant.slug}/${f.slug}${sufixoUtm}`}
                        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#1C1D21] px-5 py-2 text-xs font-semibold text-white shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-800 hover:shadow-md active:scale-[0.98]"
                      >
                        Ver datas e pré-cadastrar <ArrowUpRight className="size-4 text-[#FBD34D]" aria-hidden />
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Rodapé discreto */}
        <footer className="border-t border-dotted border-zinc-300/80 pt-6 pb-8 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} {tenant.nome} · Todos os direitos reservados
        </footer>
      </div>
    </div>
  );
}
