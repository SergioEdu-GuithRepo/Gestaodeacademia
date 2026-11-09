import { Card, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { criarFormando } from "../actions";
import { FormandoForm } from "../formando-form";

export const metadata = { title: "Novo formando" };

export default async function NovoFormandoPage() {
  const { db } = await exigir("formandos:editar");
  const indicadores = await db.formando.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, whatsapp: true },
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader titulo="Novo formando" descricao="Registe os dados do formando. O WhatsApp é obrigatório." />
      <Card>
        <FormandoForm acao={criarFormando} indicadores={indicadores} cancelarHref="/formandos" textoSubmeter="Criar formando" />
      </Card>
    </div>
  );
}
