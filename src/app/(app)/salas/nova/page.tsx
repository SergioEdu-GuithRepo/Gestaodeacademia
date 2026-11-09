import { ArrowLeft } from "lucide-react";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { guardarSala } from "../actions";
import { SalaForm } from "../sala-form";

export const metadata = { title: "Nova sala" };

export default async function NovaSalaPage() {
  await exigir("formacoes:editar");
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        titulo="Nova sala"
        descricao="Registar novo espaço físico ou laboratório para agendamento de aulas."
        acoes={
          <LinkButton href="/salas" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar às salas
          </LinkButton>
        }
      />
      <Card>
        <SalaForm acao={guardarSala.bind(null, null)} />
      </Card>
    </div>
  );
}
