import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <Card className="max-w-lg p-6 text-center sm:p-8">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="size-8" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Pré-cadastro recebido!</h1>
        <p className="mt-2 text-sm text-slate-600">
          Obrigado pelo seu interesse{f ? ` na formação ${f.nome}` : ""} em <strong>{tenant.nome}</strong>. A nossa
          equipa comercial já foi notificada e entrará em contacto consigo pelo <strong>WhatsApp</strong> para concluir a
          sua matrícula.
        </p>
        <div className="mt-6">
          <Link
            href={`/p/${tenant.slug}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700"
          >
            <ArrowLeft className="size-4" aria-hidden /> Ver todas as formações
          </Link>
        </div>
      </Card>
    </div>
  );
}
