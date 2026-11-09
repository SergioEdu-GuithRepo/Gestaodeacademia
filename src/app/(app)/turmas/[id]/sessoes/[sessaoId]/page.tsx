import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { diaLocal, formatHora } from "@/lib/datas";
import { SessaoForm } from "../../../forms";

export const metadata = { title: "Editar sessão" };

export default async function EditarSessaoPage({ params }: { params: Promise<{ id: string; sessaoId: string }> }) {
  const { db } = await exigir("agenda:editar");
  const { id, sessaoId } = await params;
  const [sessao, formadores, salas] = await Promise.all([
    db.sessao.findFirst({ where: { id: sessaoId, turmaId: id }, include: { turma: { select: { codigo: true } } } }),
    db.formador.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.sala.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, capacidade: true } }),
  ]);
  if (!sessao) notFound();
  return (
    <>
      <PageHeader titulo={`Editar sessão · ${sessao.turma.codigo}`} descricao="As alterações são validadas contra conflitos de turma, formador e sala" />
      <Card className="max-w-2xl p-4 sm:p-6">
        <SessaoForm
          turmaId={id}
          formadores={formadores}
          salas={salas}
          sessao={{
            id: sessao.id,
            data: diaLocal(sessao.inicio),
            horaInicio: formatHora(sessao.inicio),
            horaFim: formatHora(sessao.fim),
            formadorId: sessao.formadorId,
            salaId: sessao.salaId,
          }}
        />
      </Card>
    </>
  );
}
