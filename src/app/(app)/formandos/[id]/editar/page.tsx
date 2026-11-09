import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { dataSimplesIso } from "@/lib/datas";
import { editarFormando } from "../../actions";
import { FormandoForm } from "../../formando-form";

export const metadata = { title: "Editar formando" };

export default async function EditarFormandoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await exigir("formandos:editar");
  const [f, indicadores] = await Promise.all([
    db.formando.findFirst({ where: { id } }),
    db.formando.findMany({
      where: { id: { not: id } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, whatsapp: true },
    }),
  ]);
  if (!f) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader titulo="Editar formando" descricao={f.nome} />
      <Card>
        <FormandoForm
          acao={editarFormando.bind(null, f.id)}
          indicadores={indicadores}
          cancelarHref={`/formandos/${f.id}`}
          textoSubmeter="Guardar alterações"
          valores={{
            nome: f.nome,
            profissao: f.profissao ?? "",
            whatsapp: f.whatsapp,
            email: f.email ?? "",
            dataNascimento: dataSimplesIso(f.dataNascimento),
            intencaoCompra: f.intencaoCompra,
            formaPagamentoPreferida: f.formaPagamentoPreferida ?? "",
            avaliacaoEquipa: f.avaliacaoEquipa ? String(f.avaliacaoEquipa) : "",
            indicadoPorId: f.indicadoPorId ?? "",
            notas: f.notas ?? "",
          }}
        />
      </Card>
    </div>
  );
}
