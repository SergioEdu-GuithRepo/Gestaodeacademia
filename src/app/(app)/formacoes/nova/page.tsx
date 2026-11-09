import { ArrowLeft } from "lucide-react";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { guardarFormacao } from "../actions";
import { FormacaoForm } from "../formacao-form";

export const metadata = { title: "Nova formação" };

export default async function NovaFormacaoPage() {
  await exigir("formacoes:editar");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        titulo="Nova formação"
        descricao="Registar novo curso no catálogo da academia com carga horária e preço base."
        acoes={
          <LinkButton href="/formacoes" variante="secundario">
            <ArrowLeft className="size-4" aria-hidden /> Voltar ao catálogo
          </LinkButton>
        }
      />
      <Card>
        <FormacaoForm acao={guardarFormacao.bind(null, null)} />
      </Card>
    </div>
  );
}
