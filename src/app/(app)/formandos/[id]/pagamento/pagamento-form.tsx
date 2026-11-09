"use client";

import { useState } from "react";
import { Alerta, Button, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { useFormAcao } from "@/components/form-acao";
import { parseKz } from "@/lib/money";
import type { EstadoForm } from "@/lib/utils";

const METODOS: [string, string][] = [
  ["MULTICAIXA", "Multicaixa Express"],
  ["REFERENCIA", "Pagamento por referência"],
  ["TRANSFERENCIA", "Transferência bancária"],
  ["NUMERARIO", "Numerário"],
  ["TPA", "TPA"],
  ["OUTRO", "Outro"],
];

export function PagamentoForm({
  acao,
  matriculaId,
  valorSugerido,
  dividaTexto,
  dividaCentimos,
  hoje,
  cancelarHref,
}: {
  acao: (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  matriculaId: string;
  valorSugerido: string;
  dividaTexto: string;
  dividaCentimos: string;
  hoje: string;
  cancelarHref: string;
}) {
  const { estado, onSubmit, pendente } = useFormAcao(acao);
  const e = estado?.erros ?? {};
  const [valor, setValor] = useState(valorSugerido);
  const v = parseKz(valor);
  const avisoValor =
    valor.trim() === ""
      ? undefined
      : v === null
        ? "Valor inválido."
        : v > BigInt(dividaCentimos)
          ? `O valor excede a dívida (${dividaTexto}).`
          : undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-5 p-4 sm:p-6" noValidate>
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      <input type="hidden" name="matriculaId" value={matriculaId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor (Kz) *" htmlFor="valor" erro={e.valor ?? avisoValor} ajuda={`Em dívida: ${dividaTexto}`}>
          <Input
            id="valor"
            name="valor"
            inputMode="decimal"
            value={valor}
            onChange={(ev) => setValor(ev.target.value)}
            required
          />
        </Field>
        <Field label="Data do pagamento *" htmlFor="dataPagamento" erro={e.dataPagamento}>
          <Input id="dataPagamento" name="dataPagamento" type="date" defaultValue={hoje} max={hoje} required />
        </Field>
        <Field label="Método *" htmlFor="metodo" erro={e.metodo}>
          <Select id="metodo" name="metodo" defaultValue="MULTICAIXA">
            {METODOS.map(([val, l]) => (
              <option key={val} value={val}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Referência do pagamento" htmlFor="referencia" erro={e.referencia}>
          <Input id="referencia" name="referencia" placeholder="Ex.: n.º da transação" />
        </Field>
        <Field
          label="Referência do recibo (AGT)"
          htmlFor="referenciaRecibo"
          erro={e.referenciaRecibo}
          ajuda="Recibo emitido no software de faturação certificado."
          className="sm:col-span-2"
        >
          <Input id="referenciaRecibo" name="referenciaRecibo" />
        </Field>
        <Field label="Notas" htmlFor="notas" erro={e.notas} className="sm:col-span-2">
          <Textarea id="notas" name="notas" rows={2} />
        </Field>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <LinkButton href={cancelarHref} variante="secundario">
          Cancelar
        </LinkButton>
        <Button type="submit" disabled={pendente || Boolean(avisoValor)}>
          {pendente ? "A registar…" : "Registar pagamento"}
        </Button>
      </div>
    </form>
  );
}
