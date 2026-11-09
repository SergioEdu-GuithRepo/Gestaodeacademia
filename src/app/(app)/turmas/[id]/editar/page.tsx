import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { centimosParaInput } from "@/lib/money";
import { TurmaForm } from "../../forms";

export const metadata = { title: "Editar turma" };

export default async function EditarTurmaPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await exigir("agenda:editar");
  const { id } = await params;
  const [turma, formacoes] = await Promise.all([
    db.turma.findFirst({ where: { id } }),
    db.formacao.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  if (!turma) notFound();
  return (
    <>
      <PageHeader titulo={`Editar turma ${turma.codigo}`} />
      <Card className="max-w-2xl p-4 sm:p-6">
        <TurmaForm
          formacoes={formacoes}
          turma={{
            id: turma.id,
            formacaoId: turma.formacaoId,
            codigo: turma.codigo,
            vagas: turma.vagas,
            preco: centimosParaInput(turma.preco),
            estado: turma.estado,
          }}
        />
      </Card>
    </>
  );
}
