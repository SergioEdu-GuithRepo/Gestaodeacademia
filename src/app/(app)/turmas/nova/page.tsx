import { ArrowLeft } from "lucide-react";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { TurmaForm } from "../forms";

export const metadata = { title: "Nova turma" };

export default async function NovaTurmaPage({ searchParams }: { searchParams: Promise<{ formacaoId?: string }> }) {
  const { db } = await exigir("agenda:editar");
  const { formacaoId } = await searchParams;
  const formacoes = await db.formacao.findMany({
    where: { ativa: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, slug: true },
  });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        titulo="Nova turma"
        descricao="Criar uma nova edição de formação. Em seguida poderá agendar as sessões em grelha."
        acoes={
          <LinkButton href="/turmas" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar às turmas
          </LinkButton>
        }
      />
      <Card className="p-5 sm:p-6">
        <TurmaForm
          formacoes={formacoes}
          turma={formacaoId ? { id: "", formacaoId, codigo: "", vagas: null, preco: "", estado: "PLANEADA" } : undefined}
        />
      </Card>
    </div>
  );
}
