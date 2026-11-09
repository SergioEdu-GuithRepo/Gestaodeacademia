import { ArrowRight, BookOpen, CalendarDays, Clock, GraduationCap } from "lucide-react";
import type { Metadata } from "next";
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
    title: `${tenant.nome} — Formações com inscrições abertas`,
    description: desc,
    openGraph: {
      title: `${tenant.nome} — Formações`,
      description: desc,
    },
  };
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
          },
        },
      },
    }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Cabeçalho / Hero */}
      <header className="bg-gradient-to-br from-slate-900 via-marca-900 to-marca-700 text-white">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-marca-100 backdrop-blur">
            <GraduationCap className="size-4" aria-hidden /> Inscrições abertas
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{tenant.nome}</h1>
          <p className="mt-3 max-w-2xl text-base text-slate-200 sm:text-lg">
            {cfg.apresentacaoPublica ||
              "Escolha a formação ideal para o seu desenvolvimento profissional, consulte as datas e o investimento e faça o seu pré-cadastro."}
          </p>
        </div>
      </header>

      {/* Catálogo público */}
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Formações disponíveis</h2>
          <span className="text-sm text-slate-500">{formacoes.length} formação(ões)</span>
        </div>

        {formacoes.length === 0 ? (
          <Card className="p-8 text-center text-slate-600">
            <BookOpen className="mx-auto mb-3 size-8 text-slate-400" aria-hidden />
            <p className="font-medium text-slate-800">De momento não existem turmas com inscrições abertas.</p>
            <p className="mt-1 text-sm text-slate-500">Volte a consultar esta página em breve.</p>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {formacoes.map((f) => {
              const { precoMinimo, aPartirDe } = rotuloPrecoFormacao(
                f.preco,
                f.turmas.map((t) => t.preco),
              );
              const todasSessoes = f.turmas.flatMap((t) => t.sessoes);
              const datas = resumoDatasTurma(todasSessoes);
              const proximaSessao = [...todasSessoes].sort((a, b) => a.inicio.getTime() - b.inicio.getTime())[0];

              return (
                <Card
                  key={f.id}
                  className="flex flex-col justify-between p-5 transition-shadow hover:shadow-md"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge cor={f.categoria === "COMPORTAMENTAL" ? "amarelo" : "azul"}>
                        {NOMES_CATEGORIA[f.categoria]}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                        <Clock className="size-3.5" aria-hidden /> {f.cargaHoraria} h
                      </span>
                    </div>

                    <h3 className="mt-3 text-lg font-semibold text-slate-900">{f.nome}</h3>
                    {f.descricao && (
                      <p className="mt-1.5 line-clamp-3 text-sm text-slate-600">{f.descricao}</p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
                      {proximaSessao && (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="size-3.5 text-marca-600" aria-hidden />
                          Próxima turma: <strong>{formatData(dataSimples(diaLocal(proximaSessao.inicio)))}</strong>
                        </span>
                      )}
                      {datas && f.turmas.length === 1 && (
                        <span className="text-slate-500">({datas.textoDatas})</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex items-end justify-between border-t border-slate-100 pt-4">
                    <div>
                      <span className="block text-xs text-slate-500">
                        {aPartirDe ? "Investimento a partir de" : "Investimento"}
                      </span>
                      <span className="text-lg font-bold text-slate-900">{formatKz(precoMinimo)}</span>
                    </div>
                    <Link
                      href={`/p/${tenant.slug}/${f.slug}${sufixoUtm}`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-marca-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-700"
                    >
                      Ver datas e inscrever <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
