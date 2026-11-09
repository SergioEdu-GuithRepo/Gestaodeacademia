import { ArrowLeft, CalendarDays, Clock, GraduationCap, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
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
      const horarios = t.sessoes.slice(0, 6).map((s) => `${formatDiaSemana(s.inicio)} · ${formatHora(s.inicio)}–${formatHora(s.fim)}`);
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-gradient-to-br from-slate-900 via-marca-900 to-marca-700 text-white">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <Link
            href={`/p/${tenant.slug}${sufixoUtm}`}
            className="inline-flex items-center gap-1.5 text-sm text-marca-100 hover:text-white"
          >
            <ArrowLeft className="size-4" aria-hidden /> {tenant.nome} · Todas as formações
          </Link>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge cor="azul">{NOMES_CATEGORIA[formacao.categoria]}</Badge>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-marca-100">
              <Clock className="size-3.5" aria-hidden /> Carga horária: {formacao.cargaHoraria} horas
            </span>
          </div>

          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{formacao.nome}</h1>
          {formacao.descricao && (
            <p className="mt-3 max-w-2xl text-base text-slate-200">{formacao.descricao}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {opcoesTurmas.length === 0 ? (
          <Card className="p-8 text-center">
            <CalendarDays className="mx-auto mb-3 size-8 text-slate-400" aria-hidden />
            <h2 className="text-lg font-semibold text-slate-900">Sem turmas abertas de momento</h2>
            <p className="mt-1 text-sm text-slate-600">
              Esta formação não tem turmas com vagas abertas neste momento. Consulte as outras formações disponíveis.
            </p>
            <Link
              href={`/p/${tenant.slug}${sufixoUtm}`}
              className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700"
            >
              Ver outras formações
            </Link>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="space-y-4">
              <Card className="p-5">
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  <GraduationCap className="size-5 text-marca-600" aria-hidden /> Sobre a inscrição
                </h2>
                <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                    <span>
                      <strong>Transparência total:</strong> apresentamos desde já o valor da formação e o calendário das sessões.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                    <span>
                      <strong>Atendimento rápido:</strong> após confirmar o seu interesse, a nossa equipa comercial contacta-o pelo WhatsApp para concluir a matrícula e indicar os dados de pagamento.
                    </span>
                  </li>
                </ul>
              </Card>
            </div>

            <Card className="p-5 sm:p-6">
              <h2 className="text-xl font-semibold text-slate-900">Pré-cadastro</h2>
              <p className="mt-1 mb-5 text-sm text-slate-600">
                Preencha os seus dados e confirme o valor e as datas da turma pretendida.
              </p>
              <PreCadastroForm
                acao={submeterPreCadastro.bind(null, tenant.slug, formacao.slug)}
                turmas={opcoesTurmas}
                utms={utms}
              />
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
