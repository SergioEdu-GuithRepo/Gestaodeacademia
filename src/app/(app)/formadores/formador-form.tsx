"use client";

import Link from "next/link";
import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Input, LinkButton, Textarea } from "@/components/ui";
import type { EstadoForm } from "@/lib/utils";

export type DadosFormador = {
  nome: string;
  email: string;
  telefone: string;
  notas: string;
  ativo: boolean;
  /** Valores editáveis ("15000,50") */
  precoHoraComportamental: string;
  precoHoraTecnica: string;
  areas: string[];
  competencias: string[];
};

export type Opcao = { id: string; nome: string };
export type GrupoCompetencias = { area: string; competencias: Opcao[] };

export function FormadorForm({
  acao,
  inicial,
  areas,
  grupos,
}: {
  acao: (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  inicial?: DadosFormador;
  areas: Opcao[];
  grupos: GrupoCompetencias[];
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const e = estado?.erros ?? {};
  const areasSel = new Set(inicial?.areas ?? []);
  const compSel = new Set(inicial?.competencias ?? []);

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-5 p-4">
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      {estado?.erros && <Alerta>Corrija os campos assinalados.</Alerta>}

      <Field label="Nome" htmlFor="nome" erro={e.nome}>
        <Input id="nome" name="nome" defaultValue={inicial?.nome} required maxLength={150} autoFocus={!inicial} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" erro={e.email}>
          <Input id="email" name="email" type="email" defaultValue={inicial?.email} autoComplete="off" />
        </Field>
        <Field label="Telefone" htmlFor="telefone" erro={e.telefone}>
          <Input id="telefone" name="telefone" type="tel" inputMode="tel" defaultValue={inicial?.telefone} placeholder="+244 9XX XXX XXX" />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Valor/hora por categoria (Kz)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Comportamental" htmlFor="precoHoraComportamental" erro={e.precoHoraComportamental}>
            <Input
              id="precoHoraComportamental"
              name="precoHoraComportamental"
              inputMode="decimal"
              defaultValue={inicial?.precoHoraComportamental}
              placeholder="ex.: 15 000,00"
            />
          </Field>
          <Field label="Técnica" htmlFor="precoHoraTecnica" erro={e.precoHoraTecnica}>
            <Input
              id="precoHoraTecnica"
              name="precoHoraTecnica"
              inputMode="decimal"
              defaultValue={inicial?.precoHoraTecnica}
              placeholder="ex.: 18 000,00"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Áreas</legend>
        {areas.length === 0 ? (
          <SemOpcoes />
        ) : (
          <div className="flex flex-wrap gap-2">
            {areas.map((a) => (
              <Chip key={a.id} name="areas" value={a.id} defaultChecked={areasSel.has(a.id)}>
                {a.nome}
              </Chip>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-700">Competências</legend>
        {grupos.length === 0 ? (
          <SemOpcoes />
        ) : (
          grupos.map((g) => (
            <div key={g.area}>
              <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{g.area}</div>
              <div className="flex flex-wrap gap-2">
                {g.competencias.map((c) => (
                  <Chip key={c.id} name="competencias" value={c.id} defaultChecked={compSel.has(c.id)}>
                    {c.nome}
                  </Chip>
                ))}
              </div>
            </div>
          ))
        )}
      </fieldset>

      <Field label="Notas" htmlFor="notas" erro={e.notas}>
        <Textarea id="notas" name="notas" rows={3} defaultValue={inicial?.notas} />
      </Field>
      <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-800">
        <input type="checkbox" name="ativo" defaultChecked={inicial?.ativo ?? true} className="size-4 accent-[#1C1D21]" />
        Formador ativo
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? "A guardar…" : "Guardar"}
        </Button>
        <LinkButton href="/formadores" variante="secundario">
          {inicial ? "Voltar" : "Cancelar"}
        </LinkButton>
      </div>
    </form>
  );
}

function Chip({
  name,
  value,
  defaultChecked,
  children,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 bg-[#FAF9F5] px-3 text-sm text-zinc-700 select-none has-checked:border-[#1C1D21] has-checked:bg-[#FBD34D]/35 has-checked:font-semibold has-checked:text-[#1C1D21]">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="size-4 accent-[#1C1D21]" />
      {children}
    </label>
  );
}

function SemOpcoes() {
  return (
    <p className="text-sm text-zinc-500">
      Nenhuma definida.{" "}
      <Link href="/formadores#areas-competencias" className="font-semibold text-zinc-900 underline">
        Criar áreas e competências
      </Link>
    </p>
  );
}
