"use client";

import {
  Award,
  Check,
  ChevronDown,
  Copy,
  Send,
  ShieldCheck,
  Star,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alerta, Badge, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CRITERIOS, type CampoCriterio } from "@/lib/avaliacoes";
import { cn } from "@/lib/utils";
import {
  comunicarPagamentoPortalAction,
  emitirCertificadoPortalAction,
  submeterAvaliacaoAnonimaPortalAction,
} from "./actions";

export function BotaoCopiarDado({
  valor,
  rotulo = "Copiar",
}: {
  valor: string;
  rotulo?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Ignora caso o navegador bloqueie área de transferência em contexto inseguro
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className={cn(
        "inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all active:scale-[0.98]",
        copiado
          ? "border-[#288042]/30 bg-[#E7F4E8] text-[#1E6332]"
          : "border-zinc-200/90 bg-white text-[#1C1D21] shadow-2xs hover:-translate-y-0.5 hover:border-[#FBD34D] hover:bg-[#FBD34D]",
      )}
    >
      {copiado ? (
        <>
          <Check className="size-3.5" aria-hidden /> Copiado
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden /> {rotulo}
        </>
      )}
    </button>
  );
}

export type ParcelaAbertaOpcao = {
  id: string;
  numero: number;
  faltaFormatada: string;
  vencimentoFormatado: string;
};

export function ComunicarPagamentoForm({
  portalToken,
  matriculaId,
  valorSugerido,
  hojeIso,
  parcelasAbertas,
}: {
  portalToken: string;
  matriculaId: string;
  valorSugerido: string;
  hojeIso: string;
  parcelasAbertas: ParcelaAbertaOpcao[];
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [feedback, setFeedback] = useState<{ ok?: string; erro?: string } | null>(null);

  function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setFeedback(null);
    iniciar(async () => {
      const res = await comunicarPagamentoPortalAction(portalToken, matriculaId, fd);
      setFeedback(res);
      if (res.ok) {
        form.reset();
        setAberto(false);
      }
    });
  }

  return (
    <div className="space-y-2.5">
      {feedback?.ok && !aberto && <Alerta tipo="sucesso">{feedback.ok}</Alerta>}

      <details
        open={aberto}
        onToggle={(e) => setAberto((e.currentTarget as HTMLDetailsElement).open)}
        className="group rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] transition-colors open:bg-white"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-bold text-[#1C1D21] select-none sm:text-sm [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D]">
              <Send className="size-3.5" aria-hidden />
            </span>
            Comunicar Pagamento Efetuado (IBAN / Multicaixa Express)
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200/80 transition-colors group-open:bg-[#1C1D21] group-open:text-[#FBD34D]">
            <span>{aberto ? "Fechar" : "Enviar comprovativo"}</span>
            <ChevronDown
              className={cn("size-3.5 transition-transform duration-200", aberto && "rotate-180")}
              aria-hidden
            />
          </span>
        </summary>

        <form
          onSubmit={submeter}
          className="space-y-3.5 border-t border-dotted border-zinc-200 px-4 pt-3.5 pb-4"
        >
          {feedback?.erro && <Alerta tipo="erro">{feedback.erro}</Alerta>}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Valor transferido / pago (Kz) *" ajuda="Ex.: 25 000,00">
              <Input
                name="valor"
                type="text"
                inputMode="decimal"
                defaultValue={valorSugerido}
                placeholder="Ex.: 25 000,00"
                required
              />
            </Field>

            <Field label="Método utilizado *">
              <Select name="metodo" defaultValue="TRANSFERENCIA">
                <option value="TRANSFERENCIA">Transferência bancária (IBAN)</option>
                <option value="MULTICAIXA">Multicaixa Express</option>
                <option value="REFERENCIA">Pagamento por referência</option>
                <option value="TPA">TPA</option>
                <option value="NUMERARIO">Depósito / Numerário</option>
                <option value="OUTRO">Outro</option>
              </Select>
            </Field>

            <Field label="Data da operação *">
              <Input name="dataTransferencia" type="date" defaultValue={hojeIso} required />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="N.º de transação / comprovativo *"
              ajuda="Código da operação bancária ou referência Multicaixa"
            >
              <Input
                name="referencia"
                type="text"
                maxLength={150}
                placeholder="Ex.: TRF-90823412 / MCX-88219"
                required
              />
            </Field>

            <Field label="Parcela de referência (opcional)">
              <Select name="parcelaId" defaultValue={parcelasAbertas[0]?.id ?? ""}>
                <option value="">Imputação automática (parcela mais antiga)</option>
                {parcelasAbertas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.numero}.ª parcela — Em falta: {p.faltaFormatada} (venc. {p.vencimentoFormatado})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Observações adicionais (opcional)">
            <Textarea
              name="notas"
              rows={2}
              maxLength={1000}
              placeholder="Ex.: Transferência realizada a partir de conta empresarial / titular terceiro."
            />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dotted border-zinc-200 pt-3">
            <p className="text-[11px] text-zinc-500">
              Após validação da tesouraria, o recibo A4 ficará disponível automaticamente nesta página.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variante="secundario"
                onClick={() => setAberto(false)}
                className="min-h-9 px-3.5 text-xs"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente} className="min-h-9 px-4 text-xs">
                {pendente ? "A enviar…" : "Comunicar pagamento"}
              </Button>
            </div>
          </div>
        </form>
      </details>
    </div>
  );
}

export function AvaliarFormadorPortalForm({
  portalToken,
  matriculaId,
  formadorId,
  formadorNome,
}: {
  portalToken: string;
  matriculaId: string;
  formadorId: string;
  formadorNome: string;
}) {
  const [submetido, setSubmetido] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [notas, setNotas] = useState<Partial<Record<CampoCriterio, number>>>({});

  if (submetido) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#288042]/25 bg-[#E7F4E8]/45 px-4 py-3 text-xs">
        <span className="font-semibold text-[#1C1D21]">{formadorNome}</span>
        <Badge cor="verde">✔ Avaliação anónima submetida</Badge>
      </div>
    );
  }

  function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    iniciar(async () => {
      const res = await submeterAvaliacaoAnonimaPortalAction(
        portalToken,
        matriculaId,
        formadorId,
        fd,
      );
      if (res.erro) {
        setErro(res.erro);
      } else {
        setSubmetido(true);
      }
    });
  }

  return (
    <details className="group rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] transition-colors open:bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs select-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-[#1C1D21]">{formadorNome}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-200/80">
            <ShieldCheck className="size-3 text-[#1E6332]" aria-hidden /> Avaliar formador (100% anónimo)
          </span>
        </div>
        <span className="inline-flex items-center gap-1 font-semibold text-[#1C1D21] group-open:text-zinc-500">
          Avaliar <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>

      <form
        onSubmit={submeter}
        className="space-y-3.5 border-t border-dotted border-zinc-200 px-4 pt-3.5 pb-4"
      >
        <p className="text-xs text-zinc-500">
          A sua identidade nunca é associada às respostas. Classifique cada critério de{" "}
          <strong className="text-[#1C1D21]">1 (Insuficiente)</strong> a{" "}
          <strong className="text-[#1C1D21]">5 (Excelente)</strong>.
        </p>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="divide-y divide-dotted divide-zinc-200 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] px-3.5 py-1">
          {CRITERIOS.map((c) => {
            const atual = notas[c.campo] ?? 0;
            return (
              <div
                key={c.campo}
                className="flex flex-wrap items-center justify-between gap-2.5 py-2.5 text-xs"
              >
                <span className="font-medium text-[#1C1D21]">{c.nome}</span>
                <div
                  role="radiogroup"
                  aria-label={c.nome}
                  className="inline-flex items-center gap-1"
                >
                  {[1, 2, 3, 4, 5].map((n) => {
                    const selecionado = atual === n;
                    const preenchido = n <= atual;
                    return (
                      <label
                        key={n}
                        className={cn(
                          "inline-flex size-8 cursor-pointer items-center justify-center gap-0.5 rounded-full border text-xs font-bold transition-all select-none",
                          selecionado
                            ? "border-[#1C1D21] bg-[#1C1D21] text-[#FBD34D] shadow-2xs"
                            : preenchido
                              ? "border-[#FBD34D] bg-[#FBD34D]/45 text-[#1C1D21]"
                              : "border-zinc-200 bg-white text-zinc-600 hover:border-[#FBD34D] hover:text-[#1C1D21]",
                        )}
                      >
                        <input
                          type="radio"
                          name={c.campo}
                          value={String(n)}
                          checked={selecionado}
                          onChange={() => setNotas((ant) => ({ ...ant, [c.campo]: n }))}
                          className="sr-only"
                        />
                        {n}
                        <Star className="size-2.5 fill-current" aria-hidden />
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <Field label="Comentário pedagógico ou sugestão (opcional)">
          <Textarea
            name="comentario"
            rows={2}
            maxLength={2000}
            placeholder="Partilhe o que correu melhor ou pontos de melhoria para futuras edições…"
          />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" disabled={pendente} className="min-h-9 px-4 text-xs">
            {pendente ? "A submeter…" : "Submeter avaliação anónima"}
          </Button>
        </div>
      </form>
    </details>
  );
}

export function BotaoEmitirCertificadoPortal({
  portalToken,
  matriculaId,
}: {
  portalToken: string;
  matriculaId: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function emitir() {
    setErro(null);
    iniciar(async () => {
      const res = await emitirCertificadoPortalAction(portalToken, matriculaId);
      if (res.erro) {
        setErro(res.erro);
        return;
      }
      if (res.url) {
        router.push(res.url);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <Button type="button" onClick={emitir} disabled={pendente} className="min-h-10 px-4 text-xs font-semibold">
        <Award className="size-4 text-[#FBD34D]" aria-hidden />
        {pendente ? "A emitir certificado…" : "Emitir o Meu Certificado Digital"}
      </Button>
    </div>
  );
}
