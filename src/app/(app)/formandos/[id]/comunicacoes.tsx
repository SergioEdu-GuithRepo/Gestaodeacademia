"use client";

import { Send } from "lucide-react";
import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Textarea } from "@/components/ui";
import type { EstadoForm } from "@/lib/utils";

export function EnviarMensagemForm({
  acao,
  whatsapp,
}: {
  acao: (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  whatsapp: string;
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao, { limparAoGuardar: true });

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3 border-t border-slate-100 p-4">
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      <Field
        label={`Enviar mensagem para ${whatsapp}`}
        htmlFor="msg-manual"
        erro={estado?.erros?.texto}
        ajuda="Enfileirada para envio pelo WhatsApp. Formatação: *negrito*, _itálico_."
      >
        <Textarea
          id="msg-manual"
          name="texto"
          rows={3}
          required
          maxLength={2000}
          placeholder="Escreva a mensagem…"
        />
      </Field>
      <Button type="submit" variante="secundario" disabled={pendente}>
        <Send className="size-4" aria-hidden /> {pendente ? "A enfileirar…" : "Enviar mensagem"}
      </Button>
    </form>
  );
}
