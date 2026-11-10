"use client";

import type { CategoriaDespesa } from "@prisma/client";
import { CheckCircle2, Plus, Printer, Trash2, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { useFormAcao } from "@/components/form-acao";
import { ModalConfirmacao } from "@/components/modal-confirmacao";
import { Alerta, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { NOMES_CATEGORIA_DESPESA } from "@/lib/financeiro";
import { centimosParaInput, formatKz } from "@/lib/money";
import {
  apagarDespesaAction,
  confirmarAvisoPagamentoAction,
  liquidarFormadorAction,
  registarDespesaAction,
  rejeitarAvisoPagamentoAction,
} from "./actions";

export function BotaoImprimirRelatorio() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-zinc-200/90 bg-white px-4 text-xs font-medium text-[#1C1D21] shadow-2xs transition-colors hover:bg-zinc-50 print:hidden"
    >
      <Printer className="size-3.5 text-zinc-500" aria-hidden /> Guardar PDF
    </button>
  );
}

export function FormNovaDespesa({
  hojeIso,
  formacoes,
  turmas,
  formadores,
  abertoInicial = false,
}: {
  hojeIso: string;
  formacoes: { id: string; nome: string }[];
  turmas: { id: string; codigo: string; formacaoId: string }[];
  formadores: { id: string; nome: string }[];
  abertoInicial?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [categoria, setCategoria] = useState<CategoriaDespesa>("INSTALACOES");
  const { estado, pendente, ref, onSubmit } = useFormAcao(registarDespesaAction, {
    limparAoGuardar: true,
  });

  return (
    <div
      id="nova-despesa"
      className="rounded-3xl border border-zinc-200/70 bg-white p-5 shadow-[0_2px_20px_-4px_rgba(28,29,33,0.05)] print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#FBD34D] text-[#1C1D21]">
            <Plus className="size-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#1C1D21]">Registar saída ou despesa operacional</h3>
            <p className="text-xs text-zinc-500">
              Custos com formadores, salários da equipa, consumíveis por formação, manutenção ou instalações.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className={
            aberto
              ? "inline-flex h-10 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              : "inline-flex h-10 items-center gap-2 rounded-full bg-[#1C1D21] px-4 text-xs font-medium text-white shadow-xs hover:bg-zinc-800"
          }
        >
          <Plus className="size-3.5" aria-hidden /> {aberto ? "Fechar formulário" : "Nova despesa"}
        </button>
      </div>

      {estado?.ok && (
        <div className="mt-4">
          <Alerta tipo="sucesso">{estado.ok}</Alerta>
        </div>
      )}
      {estado?.erro && (
        <div className="mt-4">
          <Alerta tipo="erro">{estado.erro}</Alerta>
        </div>
      )}

      {aberto && (
        <form
          ref={ref}
          onSubmit={onSubmit}
          className="mt-5 grid gap-4 border-t border-dotted border-zinc-200 pt-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="Categoria *" erro={estado?.erros?.categoria}>
            <Select
              name="categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaDespesa)}
              required
            >
              {(Object.keys(NOMES_CATEGORIA_DESPESA) as CategoriaDespesa[]).map((cat) => (
                <option key={cat} value={cat}>
                  {NOMES_CATEGORIA_DESPESA[cat]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Valor (Kz) *" erro={estado?.erros?.valor}>
            <Input name="valor" placeholder="Ex.: 45000" inputMode="decimal" required />
          </Field>

          <Field label="Data da despesa *" erro={estado?.erros?.data}>
            <Input type="date" name="data" defaultValue={hojeIso} required />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Descrição *" erro={estado?.erros?.descricao}>
              <Input
                name="descricao"
                placeholder="Ex.: Apostilas e kits de laboratório / Renda mensal / Honorários"
                required
              />
            </Field>
          </div>

          <Field label="Fornecedor / Beneficiário" erro={estado?.erros?.fornecedor}>
            <Input name="fornecedor" placeholder="Opcional" />
          </Field>

          <Field label="Método de pagamento" erro={estado?.erros?.metodo}>
            <Select name="metodo" defaultValue="TRANSFERENCIA">
              <option value="TRANSFERENCIA">Transferência bancária</option>
              <option value="MULTICAIXA">Multicaixa Express</option>
              <option value="REFERENCIA">Referência Multicaixa</option>
              <option value="TPA">TPA</option>
              <option value="NUMERARIO">Numerário</option>
              <option value="OUTRO">Outro</option>
            </Select>
          </Field>

          <Field label="Referência / Comprovativo" erro={estado?.erros?.referencia}>
            <Input name="referencia" placeholder="N.º de operação ou fatura" />
          </Field>

          <Field label="Formação associada (opcional)" ajuda="Permite apurar a rentabilidade dessa formação.">
            <Select name="formacaoId" defaultValue="">
              <option value="">— Geral do centro —</option>
              {formacoes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Turma associada (opcional)">
            <Select name="turmaId" defaultValue="">
              <option value="">— Nenhuma —</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo}
                </option>
              ))}
            </Select>
          </Field>

          {categoria === "FORMADOR" && (
            <>
              <Field label="Formador" erro={estado?.erros?.formadorId}>
                <Select name="formadorId" defaultValue="">
                  <option value="">— Selecionar formador —</option>
                  {formadores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Horas pagas" erro={estado?.erros?.horasPagas}>
                <Input name="horasPagas" placeholder="Ex.: 12" inputMode="decimal" />
              </Field>
            </>
          )}

          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Notas adicionais" erro={estado?.erros?.notas}>
              <Textarea name="notas" rows={2} placeholder="Observações internas (opcional)" />
            </Field>
          </div>

          <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="button" variante="fantasma" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? "A guardar…" : "Guardar despesa"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function FormLiquidarFormador({
  formadorId,
  formadorNome,
  horasLecionadas,
  emFalta,
  hojeIso,
}: {
  formadorId: string;
  formadorNome: string;
  horasLecionadas: number;
  emFalta: bigint;
  hojeIso: string;
}) {
  const [aberto, setAberto] = useState(false);
  const { estado, pendente, ref, onSubmit } = useFormAcao(liquidarFormadorAction, {
    limparAoGuardar: false,
  });

  if (emFalta <= 0n) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
        <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden /> Liquidado
      </span>
    );
  }

  return (
    <div className="print:hidden">
      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#FBD34D] px-3.5 text-xs font-semibold text-[#1C1D21] shadow-2xs transition-colors hover:bg-[#f5c82e]"
        >
          Liquidar {formatKz(emFalta)}
        </button>
      ) : (
        <form
          ref={ref}
          onSubmit={onSubmit}
          className="mt-2 space-y-2.5 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-3.5 text-left shadow-xs"
        >
          <input type="hidden" name="formadorId" value={formadorId} />
          <input type="hidden" name="horasPagas" value={String(horasLecionadas)} />
          <input type="hidden" name="data" value={hojeIso} />
          <div className="text-xs font-semibold text-[#1C1D21]">Liquidar honorários — {formadorNome}</div>
          {estado?.erro && <Alerta tipo="erro">{estado.erro}</Alerta>}
          {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Valor a pagar (Kz) *">
              <Input name="valor" defaultValue={centimosParaInput(emFalta)} required />
            </Field>
            <Field label="Método">
              <Select name="metodo" defaultValue="TRANSFERENCIA">
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="MULTICAIXA">Multicaixa Express</option>
                <option value="NUMERARIO">Numerário</option>
              </Select>
            </Field>
          </div>
          <Field label="Referência / Comprovativo">
            <Input name="referencia" placeholder="N.º de transferência (opcional)" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variante="fantasma" onClick={() => setAberto(false)} className="min-h-8 px-3 text-xs">
              Fechar
            </Button>
            <Button type="submit" disabled={pendente} className="min-h-8 px-3.5 text-xs">
              {pendente ? "A registar…" : "Confirmar"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function BotaoApagarDespesa({ despesaId }: { despesaId: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pendente}
        onClick={() => setConfirmar(true)}
        className="inline-flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 print:hidden"
        title="Eliminar despesa"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
      <ModalConfirmacao
        aberto={confirmar}
        titulo="Eliminar registo de despesa"
        mensagem="Tem a certeza que deseja eliminar este registo de despesa? Esta ação atualiza imediatamente o fluxo de caixa do centro."
        rotuloConfirmar="Eliminar despesa"
        perigo
        pendente={pendente}
        aoCancelar={() => setConfirmar(false)}
        aoConfirmar={() => {
          iniciar(async () => {
            await apagarDespesaAction(despesaId);
            setConfirmar(false);
          });
        }}
      />
    </>
  );
}

export function BotoesValidarAvisoPagamento({
  avisoId,
  formandoNome,
  valorFormatado,
}: {
  avisoId: string;
  formandoNome: string;
  valorFormatado: string;
}) {
  const [pendente, iniciar] = useTransition();
  const [confirmarRejeicao, setConfirmarRejeicao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [reciboAgt, setReciboAgt] = useState("");

  return (
    <div className="flex flex-col items-end gap-2 print:hidden">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <input
          type="text"
          value={reciboAgt}
          onChange={(e) => setReciboAgt(e.target.value)}
          placeholder="N.º recibo AGT (opc.)"
          aria-label={`Referência AGT para ${formandoNome}`}
          disabled={pendente}
          className="h-8 w-36 rounded-full border border-zinc-200/90 bg-[#FAF9F5] px-3 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-[#1C1D21] focus:bg-white focus:outline-none"
        />
        <Button
          type="button"
          variante="primario"
          disabled={pendente}
          carregando={pendente}
          onClick={() => {
            setErro(null);
            iniciar(async () => {
              const res = await confirmarAvisoPagamentoAction(avisoId, reciboAgt || null);
              if (res?.erro) setErro(res.erro);
            });
          }}
          className="min-h-8 px-3.5 text-xs"
        >
          <CheckCircle2 className="size-3.5 text-[#FBD34D]" aria-hidden /> Confirmar e Liquidar
        </Button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => setConfirmarRejeicao(true)}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-red-200 bg-white px-3 text-xs font-semibold text-[#B42318] transition-colors hover:bg-[#FDECEB] disabled:opacity-50"
        >
          <XCircle className="size-3.5" aria-hidden /> Rejeitar
        </button>
      </div>

      {erro && <div className="max-w-xs text-right text-xs font-medium text-[#B42318]">{erro}</div>}

      <ModalConfirmacao
        aberto={confirmarRejeicao}
        titulo="Rejeitar comunicação de pagamento"
        mensagem={`Deseja rejeitar a comunicação de ${valorFormatado} submetida por ${formandoNome}? Nenhum pagamento será lançado no plano de parcelas.`}
        rotuloConfirmar="Rejeitar comunicação"
        perigo
        pendente={pendente}
        aoCancelar={() => setConfirmarRejeicao(false)}
        aoConfirmar={() => {
          setErro(null);
          iniciar(async () => {
            const res = await rejeitarAvisoPagamentoAction(avisoId);
            if (res?.erro) setErro(res.erro);
            setConfirmarRejeicao(false);
          });
        }}
      />
    </div>
  );
}
