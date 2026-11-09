"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";

type Opcao = { id: string; nome: string };

/** Filtros da agenda: vista (geral / formador / sala / turma) e entidade. Atualiza o URL. */
export function AgendaFiltros({
  formadores,
  salas,
  turmas,
}: {
  formadores: Opcao[];
  salas: Opcao[];
  turmas: Opcao[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const vista = sp.get("vista") ?? "geral";
  const id = sp.get("id") ?? "";
  const opcoes = vista === "formador" ? formadores : vista === "sala" ? salas : vista === "turma" ? turmas : [];

  function ir(params: Record<string, string | null>) {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    router.push(`${pathname}?${n.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select aria-label="Vista" value={vista} onChange={(e) => ir({ vista: e.target.value === "geral" ? null : e.target.value, id: null })} className="w-auto">
        <option value="geral">Todas as sessões</option>
        <option value="formador">Por formador</option>
        <option value="sala">Por sala</option>
        <option value="turma">Por turma</option>
      </Select>
      {vista !== "geral" && (
        <Select aria-label="Filtrar" value={id} onChange={(e) => ir({ id: e.target.value || null })} className="w-auto max-w-64">
          <option value="">{vista === "formador" ? "Todos os formadores" : vista === "sala" ? "Todas as salas" : "Todas as turmas"}</option>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>{o.nome}</option>
          ))}
        </Select>
      )}
    </div>
  );
}
