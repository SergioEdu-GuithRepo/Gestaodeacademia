"use client";

import { Alerta, Button, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { useFormAcao } from "@/components/form-acao";
import type { EstadoForm } from "@/lib/utils";

export type ValoresFormando = {
  nome: string;
  profissao: string;
  whatsapp: string;
  email: string;
  dataNascimento: string;
  intencaoCompra: boolean;
  formaPagamentoPreferida: string;
  avaliacaoEquipa: string;
  indicadoPorId?: string;
  notas: string;
};

export type IndicadorOpcao = {
  id: string;
  nome: string;
  whatsapp: string;
};

export function FormandoForm({
  acao,
  valores,
  indicadores = [],
  cancelarHref,
  textoSubmeter,
}: {
  acao: (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  valores?: ValoresFormando;
  indicadores?: IndicadorOpcao[];
  cancelarHref: string;
  textoSubmeter: string;
}) {
  const { estado, onSubmit, pendente } = useFormAcao(acao);
  const e = estado?.erros ?? {};

  return (
    <form onSubmit={onSubmit} className="space-y-5 p-4 sm:p-6" noValidate>
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo *" htmlFor="nome" erro={e.nome} className="sm:col-span-2">
          <Input id="nome" name="nome" defaultValue={valores?.nome} required autoComplete="off" />
        </Field>
        <Field
          label="WhatsApp *"
          htmlFor="whatsapp"
          erro={e.whatsapp}
          ajuda="Ex.: 923 000 000 (assume +244) ou número internacional."
        >
          <Input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" defaultValue={valores?.whatsapp} required />
        </Field>
        <Field label="Email" htmlFor="email" erro={e.email}>
          <Input id="email" name="email" type="email" defaultValue={valores?.email} />
        </Field>
        <Field label="Profissão" htmlFor="profissao" erro={e.profissao}>
          <Input id="profissao" name="profissao" defaultValue={valores?.profissao} />
        </Field>
        <Field label="Data de aniversário" htmlFor="dataNascimento" erro={e.dataNascimento}>
          <Input id="dataNascimento" name="dataNascimento" type="date" defaultValue={valores?.dataNascimento} />
        </Field>
        <Field label="Forma de pagamento preferida" htmlFor="formaPagamentoPreferida" erro={e.formaPagamentoPreferida}>
          <Select
            id="formaPagamentoPreferida"
            name="formaPagamentoPreferida"
            defaultValue={valores?.formaPagamentoPreferida ?? ""}
          >
            <option value="">—</option>
            <option value="PRONTO">A pronto</option>
            <option value="PARCELADO">Parcelado</option>
          </Select>
        </Field>
        <Field
          label="Avaliação da equipa"
          htmlFor="avaliacaoEquipa"
          erro={e.avaliacaoEquipa}
          ajuda="1 = pouco provável voltar a comprar · 5 = muito provável"
        >
          <Select id="avaliacaoEquipa" name="avaliacaoEquipa" defaultValue={valores?.avaliacaoEquipa ?? ""}>
            <option value="">Sem avaliação</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)} ({n})
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Indicado por (opcional)"
          htmlFor="indicadoPorId"
          erro={e.indicadoPorId}
          ajuda="Formando que recomendou o centro. Receberá pontos de indicação quando este formando se matricular."
          className="sm:col-span-2"
        >
          <Select id="indicadoPorId" name="indicadoPorId" defaultValue={valores?.indicadoPorId ?? ""}>
            <option value="">— Nenhum (inscrição direta) —</option>
            {indicadores.map((ind) => (
              <option key={ind.id} value={ind.id}>
                {ind.nome} · {ind.whatsapp}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex min-h-10 items-center gap-3 rounded-lg border border-slate-200 px-3 sm:col-span-2">
          <input
            type="checkbox"
            name="intencaoCompra"
            defaultChecked={valores?.intencaoCompra}
            className="size-4 rounded border-slate-300 accent-marca-600"
          />
          <span className="text-sm text-slate-700">Manifestou intenção de comprar uma formação</span>
        </label>
        <Field label="Notas" htmlFor="notas" erro={e.notas} className="sm:col-span-2">
          <Textarea id="notas" name="notas" rows={3} defaultValue={valores?.notas} />
        </Field>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <LinkButton href={cancelarHref} variante="secundario">
          Cancelar
        </LinkButton>
        <Button type="submit" disabled={pendente}>
          {pendente ? "A guardar…" : textoSubmeter}
        </Button>
      </div>
    </form>
  );
}
