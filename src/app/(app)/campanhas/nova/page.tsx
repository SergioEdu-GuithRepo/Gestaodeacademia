import { Card, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { obterSobraOperacionalMesAtual } from "../segmento";
import { CampanhaForm } from "./campanha-form";

export const metadata = { title: "Nova campanha" };

export default async function NovaCampanhaPage() {
  const { user, db } = await exigir("campanhas:editar");

  const [formacoes, margemMes] = await Promise.all([
    db.formacao.findMany({
      where: { ativa: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    obterSobraOperacionalMesAtual(db),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        titulo="Nova campanha"
        descricao="Crie uma campanha sazonal, de fidelização ou segmentada para atrair e reter formandos."
      />
      <Card>
        <CampanhaForm
          formacoes={formacoes}
          mesAtual={margemMes.mesAtual}
          anoAtual={margemMes.anoAtual}
          sobraOperacional={String(margemMes.sobraOperacional)}
          centro={user.tenant.nome}
        />
      </Card>
    </div>
  );
}
