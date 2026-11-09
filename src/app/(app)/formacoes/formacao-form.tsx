"use client";

import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import type { EstadoForm } from "@/lib/utils";

export type DadosFormacao = {
  nome: string;
  slug: string;
  descricao: string;
  cargaHoraria: number;
  /** Preço em formato editável ("150000,50") */
  preco: string;
  categoria: "COMPORTAMENTAL" | "TECNICA";
  ativa: boolean;
};

export function FormacaoForm({
  acao,
  inicial,
}: {
  acao: (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  inicial?: DadosFormacao;
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const e = estado?.erros ?? {};
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4 p-4">
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      {estado?.erros && <Alerta>Corrija os campos assinalados.</Alerta>}

      <Field label="Nome" htmlFor="nome" erro={e.nome}>
        <Input id="nome" name="nome" defaultValue={inicial?.nome} required maxLength={150} autoFocus={!inicial} />
      </Field>
      <Field
        label="Slug (identificador no endereço)"
        htmlFor="slug"
        erro={e.slug}
        ajuda="Deixe vazio para gerar automaticamente a partir do nome."
      >
        <Input id="slug" name="slug" defaultValue={inicial?.slug} maxLength={80} placeholder="ex.: excel-avancado" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Categoria" htmlFor="categoria" erro={e.categoria}>
          <Select id="categoria" name="categoria" defaultValue={inicial?.categoria ?? ""} required>
            <option value="" disabled>
              Escolher…
            </option>
            <option value="COMPORTAMENTAL">Comportamental</option>
            <option value="TECNICA">Técnica</option>
          </Select>
        </Field>
        <Field label="Carga horária (h)" htmlFor="cargaHoraria" erro={e.cargaHoraria}>
          <Input
            id="cargaHoraria"
            name="cargaHoraria"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={inicial?.cargaHoraria}
            required
          />
        </Field>
        <Field label="Preço (Kz)" htmlFor="preco" erro={e.preco}>
          <Input id="preco" name="preco" inputMode="decimal" defaultValue={inicial?.preco} placeholder="150 000,00" required />
        </Field>
      </div>
      <Field label="Descrição" htmlFor="descricao" erro={e.descricao}>
        <Textarea id="descricao" name="descricao" rows={4} defaultValue={inicial?.descricao} />
      </Field>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" name="ativa" defaultChecked={inicial?.ativa ?? true} className="size-4 accent-marca-600" />
        Formação ativa (disponível para novas turmas)
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? "A guardar…" : "Guardar"}
        </Button>
        <LinkButton href="/formacoes" variante="secundario">
          {inicial ? "Voltar" : "Cancelar"}
        </LinkButton>
      </div>
    </form>
  );
}
