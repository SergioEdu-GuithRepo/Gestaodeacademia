"use client";

import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CRITERIOS } from "@/lib/avaliacoes";
import type { EstadoForm } from "@/lib/utils";
import type { Opcao } from "./formador-form";

type Acao = (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;

function Mensagens({ estado }: { estado: EstadoForm }) {
  return (
    <>
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
    </>
  );
}

// ── Nova área ────────────────────────────────────────────────────────────────

export function AreaForm({ acao }: { acao: Acao }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao, { limparAoGuardar: true });
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3">
      <Mensagens estado={estado} />
      <Field label="Nova área" htmlFor="area-nome" erro={estado?.erros?.nome}>
        <div className="flex gap-2">
          <Input id="area-nome" name="nome" required maxLength={100} placeholder="ex.: Liderança" />
          <Button type="submit" variante="secundario" disabled={pendente}>
            Criar
          </Button>
        </div>
      </Field>
    </form>
  );
}

// ── Nova competência ─────────────────────────────────────────────────────────

export function CompetenciaForm({ acao, areas }: { acao: Acao; areas: Opcao[] }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao, { limparAoGuardar: true });
  const e = estado?.erros ?? {};
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3">
      <Mensagens estado={estado} />
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field label="Nova competência" htmlFor="comp-nome" erro={e.nome}>
          <Input id="comp-nome" name="nome" required maxLength={100} placeholder="ex.: Excel avançado" />
        </Field>
        <Field label="Área" htmlFor="comp-area" erro={e.areaId}>
          <Select id="comp-area" name="areaId" defaultValue="">
            <option value="">Sem área</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variante="secundario" disabled={pendente}>
          Criar
        </Button>
      </div>
    </form>
  );
}

// ── Preço por formação ───────────────────────────────────────────────────────

export function PrecoForm({ acao, formacoes }: { acao: Acao; formacoes: (Opcao & { categoria: string })[] }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao, { limparAoGuardar: true });
  const e = estado?.erros ?? {};
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3 border-t border-slate-100 p-4">
      <Mensagens estado={estado} />
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field label="Formação" htmlFor="preco-formacao" erro={e.formacaoId}>
          <Select id="preco-formacao" name="formacaoId" defaultValue="" required>
            <option value="" disabled>
              Escolher…
            </option>
            {formacoes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} ({f.categoria})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor/hora (Kz)" htmlFor="preco-valor" erro={e.precoHora}>
          <Input id="preco-valor" name="precoHora" inputMode="decimal" required placeholder="18 000,00" />
        </Field>
        <Button type="submit" disabled={pendente}>
          {pendente ? "A guardar…" : "Guardar preço"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">Se a formação já tiver um preço específico, o valor é substituído.</p>
    </form>
  );
}

// ── Avaliação ────────────────────────────────────────────────────────────────

export function AvaliacaoForm({ acao, turmas, avaliador }: { acao: Acao; turmas: Opcao[]; avaliador: string }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao, { limparAoGuardar: true });
  const e = estado?.erros ?? {};
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4 border-t border-slate-100 p-4">
      <h3 className="font-medium text-slate-900">Nova avaliação</h3>
      <Mensagens estado={estado} />
      {estado?.erros && <Alerta>Corrija os campos assinalados.</Alerta>}

      <div className="space-y-3">
        {CRITERIOS.map((c) => (
          <fieldset key={c.campo}>
            <legend className="mb-1 text-sm font-medium text-zinc-700">{c.nome}</legend>
            <div className="flex gap-1.5" role="radiogroup">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className="inline-flex size-10 cursor-pointer items-center justify-center rounded-xl border border-zinc-200 bg-[#FAF9F5] text-sm font-bold text-zinc-700 select-none has-checked:border-[#1C1D21] has-checked:bg-[#1C1D21] has-checked:text-[#FBD34D] has-focus-visible:ring-2 has-focus-visible:ring-[#FBD34D]"
                >
                  <input type="radio" name={c.campo} value={n} required className="sr-only" />
                  {n}
                </label>
              ))}
            </div>
            {e[c.campo] && <p className="mt-1 text-xs text-red-600">{e[c.campo]}</p>}
          </fieldset>
        ))}
        <p className="text-xs text-zinc-500">1 = Insuficiente · 5 = Excelente</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Turma (opcional)" htmlFor="av-turma" erro={e.turmaId}>
          <Select id="av-turma" name="turmaId" defaultValue="">
            <option value="">—</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Avaliado por" htmlFor="av-por" erro={e.avaliadoPor}>
          <Input id="av-por" name="avaliadoPor" defaultValue={avaliador} maxLength={150} />
        </Field>
      </div>
      <Field label="Comentário" htmlFor="av-comentario" erro={e.comentario}>
        <Textarea id="av-comentario" name="comentario" rows={3} />
      </Field>
      <Button type="submit" disabled={pendente}>
        {pendente ? "A registar…" : "Registar avaliação"}
      </Button>
    </form>
  );
}
