"use client";

import { Check, Copy, UserPlus } from "lucide-react";
import { useState } from "react";
import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Textarea } from "@/components/ui";
import type { EstadoForm } from "@/lib/utils";

type Acao = (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;

export function CopiarUrlLanding({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variante="secundario"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          /* sem permissão */
        }
      }}
    >
      {copiado ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copiado ? "Copiado" : "Copiar link"}
    </Button>
  );
}

export function BotaoAcaoLead({
  acao,
  rotulo,
  pendenteRotulo = "A guardar…",
  variante = "secundario",
}: {
  acao: Acao;
  rotulo: string;
  pendenteRotulo?: string;
  variante?: "primario" | "secundario" | "perigo" | "fantasma";
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  return (
    <form ref={ref} onSubmit={onSubmit} className="inline-flex flex-col gap-1">
      <Button type="submit" variante={variante} disabled={pendente}>
        {pendente ? pendenteRotulo : rotulo}
      </Button>
      {estado?.erro && <span className="text-xs text-red-600">{estado.erro}</span>}
    </form>
  );
}

export function BotaoConverterLead({ acao }: { acao: Acao }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  return (
    <form ref={ref} onSubmit={onSubmit} className="inline-flex flex-col gap-1">
      <Button type="submit" disabled={pendente}>
        <UserPlus className="size-4" aria-hidden />
        {pendente ? "A converter…" : "Converter em formando e matricular"}
      </Button>
      {estado?.erro && <span className="text-xs text-red-600">{estado.erro}</span>}
    </form>
  );
}

export function NotasLeadForm({ acao, notasIniciais }: { acao: Acao; notasIniciais: string }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3 p-4">
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      <Field label="Notas comerciais" htmlFor="lead-notas" erro={estado?.erros?.notas}>
        <Textarea
          id="lead-notas"
          name="notas"
          rows={4}
          maxLength={2000}
          defaultValue={notasIniciais}
          placeholder="Registe observações do contacto com o candidato…"
        />
      </Field>
      <Button type="submit" variante="secundario" disabled={pendente}>
        {pendente ? "A guardar…" : "Guardar notas"}
      </Button>
    </form>
  );
}
