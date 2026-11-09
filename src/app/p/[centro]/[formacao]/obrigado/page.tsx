import { ArrowLeft, CheckCircle2, MessageCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";
import { prisma } from "@/lib/db";

export const metadata = { title: "Pré-cadastro recebido" };

export default async function ObrigadoLeadPage({
  params,
}: {
  params: Promise<{ centro: string; formacao: string }>;
}) {
  const { centro, formacao } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug: centro }, select: { id: true, nome: true, slug: true } });
  if (!tenant) notFound();
  const f = await prisma.formacao.findFirst({
    where: { tenantId: tenant.id, slug: formacao },
    select: { nome: true },
  });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#F5F4EF] px-4 py-12 text-[#1C1D21]">
      <Card className="anim-enter max-w-lg p-7 text-center sm:p-9">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#1C1D21] text-[#FBD34D] shadow-sm">
          <CheckCircle2 className="size-7" aria-hidden />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#1C1D21]">Pré-cadastro confirmado!</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-zinc-600">
          Obrigado pelo seu interesse{f ? ` na formação ${f.nome}` : ""} em <strong className="text-[#1C1D21]">{tenant.nome}</strong>.
        </p>

        <div className="mt-5 rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] p-4 text-left text-xs leading-relaxed text-zinc-600">
          <div className="flex items-center gap-2 font-semibold text-[#1E6332]">
            <MessageCircle className="size-4" aria-hidden /> Próximo passo no seu WhatsApp
          </div>
          <p className="mt-1">
            A nossa equipa comercial já recebeu os seus dados e entrará em contacto consigo pelo WhatsApp para finalizar a sua matrícula.
          </p>
        </div>

        <div className="mt-6">
          <LinkButton href={`/p/${tenant.slug}`} variante="primario">
            <ArrowLeft className="size-4 text-[#FBD34D]" aria-hidden /> Voltar ao catálogo de formações
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}
