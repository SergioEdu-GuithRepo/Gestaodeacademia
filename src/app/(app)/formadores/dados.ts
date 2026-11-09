import type { DbTenant } from "@/lib/db";
import type { GrupoCompetencias, Opcao } from "./formador-form";

/** Áreas e competências do centro (competências agrupadas por área). */
export async function carregarAreasCompetencias(db: DbTenant): Promise<{ areas: Opcao[]; grupos: GrupoCompetencias[] }> {
  const [areas, competencias] = await Promise.all([
    db.area.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.competencia.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, areaId: true },
    }),
  ]);
  const grupos: GrupoCompetencias[] = areas
    .map((a) => ({
      area: a.nome,
      competencias: competencias.filter((c) => c.areaId === a.id).map(({ id, nome }) => ({ id, nome })),
    }))
    .filter((g) => g.competencias.length > 0);
  const semArea = competencias.filter((c) => !c.areaId).map(({ id, nome }) => ({ id, nome }));
  if (semArea.length > 0) grupos.push({ area: "Sem área", competencias: semArea });
  return { areas, grupos };
}
