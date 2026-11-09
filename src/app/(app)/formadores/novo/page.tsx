import { ArrowLeft } from "lucide-react";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { guardarFormador } from "../actions";
import { carregarAreasCompetencias } from "../dados";
import { FormadorForm } from "../formador-form";

export const metadata = { title: "Novo formador" };

export default async function NovoFormadorPage() {
  const { db } = await exigir("formadores:editar");
  const { areas, grupos } = await carregarAreasCompetencias(db);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        titulo="Novo formador"
        descricao="Registar docente, áreas de especialidade e valores/hora base."
        acoes={
          <LinkButton href="/formadores" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar aos formadores
          </LinkButton>
        }
      />
      <Card>
        <FormadorForm acao={guardarFormador.bind(null, null)} areas={areas} grupos={grupos} />
      </Card>
    </div>
  );
}
