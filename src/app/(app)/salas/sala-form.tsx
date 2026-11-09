"use client";

import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Input, LinkButton } from "@/components/ui";
import type { EstadoForm } from "@/lib/utils";

export type DadosSala = { nome: string; capacidade: number | null; ativa: boolean };

export function SalaForm({
  acao,
  inicial,
}: {
  acao: (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  inicial?: DadosSala;
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const e = estado?.erros ?? {};
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4 p-4">
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      <Field label="Nome" htmlFor="nome" erro={e.nome}>
        <Input id="nome" name="nome" defaultValue={inicial?.nome} required maxLength={100} autoFocus={!inicial} />
      </Field>
      <Field label="Capacidade" htmlFor="capacidade" erro={e.capacidade} ajuda="Número máximo de formandos (opcional).">
        <Input
          id="capacidade"
          name="capacidade"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={inicial?.capacidade ?? ""}
        />
      </Field>
      <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-800">
        <input type="checkbox" name="ativa" defaultChecked={inicial?.ativa ?? true} className="size-4 accent-[#1C1D21]" />
        Sala ativa (disponível para agendamento)
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? "A guardar…" : "Guardar"}
        </Button>
        <LinkButton href="/salas" variante="secundario">
          Cancelar
        </LinkButton>
      </div>
    </form>
  );
}
