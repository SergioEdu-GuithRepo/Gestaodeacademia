"use client";

import { Check, Copy, Database, FileText, Mail, MessageCircle, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Select } from "@/components/ui";
import { cn, type EstadoForm } from "@/lib/utils";

type Acao = (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;

export function GeradorRelatorioIaForm({
  acao,
  formacoes,
  formadores,
  canalPadrao,
  podeFinanceiro,
  podeComercial,
}: {
  acao: Acao;
  formacoes: { id: string; nome: string }[];
  formadores: { id: string; nome: string }[];
  canalPadrao: string;
  podeFinanceiro: boolean;
  podeComercial: boolean;
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const [tipo, setTipo] = useState<string>(
    podeComercial ? "SEMANAL_COMERCIAL" : podeFinanceiro ? "MENSAL_FINANCEIRO" : "POR_FORMACAO",
  );

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4 p-6">
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Tipo de Relatório Inteligente" htmlFor="gen-tipo">
          <Select id="gen-tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {podeComercial && (
              <option value="SEMANAL_COMERCIAL">Semanal Comercial &amp; CRM</option>
            )}
            {podeFinanceiro && (
              <option value="MENSAL_FINANCEIRO">Mensal Financeiro (Receita vs. Custos)</option>
            )}
            <option value="POR_FORMACAO">Por Formação (Qualidade, Ocupação e Recompra)</option>
            <option value="POR_FORMADOR">Por Formador (5 Critérios e Assiduidade)</option>
            <option value="ALERTA_IMEDIATO">Diagnóstico de Alertas Imediatos</option>
          </Select>
        </Field>

        {tipo === "POR_FORMACAO" && (
          <Field label="Escolher Formação" htmlFor="gen-formacao" erro={estado?.erros?.formacaoId}>
            <Select id="gen-formacao" name="formacaoId" defaultValue={formacoes[0]?.id ?? ""}>
              {formacoes.length === 0 && <option value="">Sem formações registadas</option>}
              {formacoes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {tipo === "POR_FORMADOR" && (
          <Field label="Escolher Formador" htmlFor="gen-formador" erro={estado?.erros?.formadorId}>
            <Select id="gen-formador" name="formadorId" defaultValue={formadores[0]?.id ?? ""}>
              {formadores.length === 0 && <option value="">Sem formadores registados</option>}
              {formadores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Formatação e Entrega" htmlFor="gen-canal">
          <Select id="gen-canal" name="canal" defaultValue={canalPadrao}>
            <option value="APENAS_SISTEMA">Guardar no Sistema (PDF / A4)</option>
            <option value="WHATSAPP">Enviar para WhatsApp + Guardar</option>
            <option value="EMAIL">Enviar por E-mail + Guardar</option>
            <option value="AMBOS">WhatsApp + E-mail + Guardar</option>
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dotted border-zinc-200 pt-4">
        <p className="text-xs text-zinc-500">
          Os indicadores são calculados por SQL na BD deste centro e enviados ao Claude apenas para interpretação nas 4
          secções fixas.
        </p>
        <Button type="submit" disabled={pendente}>
          <Sparkles className="size-4 text-[#FBD34D]" aria-hidden />
          {pendente ? "A apurar SQL e gerar análise…" : "Gerar Relatório Agora"}
        </Button>
      </div>
    </form>
  );
}

function BotaoReenvio({ acao, rotulo }: { acao: Acao; rotulo: string }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  return (
    <form ref={ref} onSubmit={onSubmit} className="inline-flex flex-col gap-1">
      <Button type="submit" variante="secundario" disabled={pendente}>
        <Send className="size-3.5" aria-hidden />
        {pendente ? "A enviar…" : rotulo}
      </Button>
      {estado?.ok && <span className="text-[11px] font-medium text-emerald-700">{estado.ok}</span>}
      {estado?.aviso && <span className="text-[11px] font-medium text-amber-700">{estado.aviso}</span>}
      {estado?.erro && <span className="text-[11px] font-medium text-red-600">{estado.erro}</span>}
    </form>
  );
}

export function FormatosAdicionaisRelatorio({
  mensagemWhatsapp,
  corpoEmailHtml,
  metricasJson,
  acaoEnviarWhatsapp,
  acaoEnviarEmail,
}: {
  mensagemWhatsapp: string;
  corpoEmailHtml: string;
  metricasJson: string;
  acaoEnviarWhatsapp: Acao;
  acaoEnviarEmail: Acao;
}) {
  const [aba, setAba] = useState<"pdf" | "whatsapp" | "email" | "sql">("pdf");
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="space-y-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-zinc-200/80 bg-white p-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAba("pdf")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors",
              aba === "pdf" ? "bg-[#1C1D21] text-white" : "text-zinc-600 hover:bg-[#FAF9F5]",
            )}
          >
            <FileText className="size-3.5 text-[#FBD34D]" aria-hidden /> Documento PDF / A4
          </button>
          <button
            type="button"
            onClick={() => setAba("whatsapp")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors",
              aba === "whatsapp" ? "bg-[#1C1D21] text-white" : "text-zinc-600 hover:bg-[#FAF9F5]",
            )}
          >
            <MessageCircle className="size-3.5 text-[#FBD34D]" aria-hidden /> Mensagem Curta WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setAba("email")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors",
              aba === "email" ? "bg-[#1C1D21] text-white" : "text-zinc-600 hover:bg-[#FAF9F5]",
            )}
          >
            <Mail className="size-3.5 text-[#FBD34D]" aria-hidden /> E-mail Formatado
          </button>
          <button
            type="button"
            onClick={() => setAba("sql")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors",
              aba === "sql" ? "bg-[#1C1D21] text-white" : "text-zinc-600 hover:bg-[#FAF9F5]",
            )}
          >
            <Database className="size-3.5 text-[#FBD34D]" aria-hidden /> Dados SQL Exatos
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BotaoImprimir rotulo="Exportar PDF / Imprimir A4" />
        </div>
      </div>

      {aba === "whatsapp" && (
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#1C1D21]">Versão Curta para WhatsApp (Evolution API)</h3>
              <p className="text-xs text-zinc-500">
                Texto formatado para entrega rápida no telemóvel do gestor.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variante="secundario"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(mensagemWhatsapp);
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 2000);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {copiado ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                {copiado ? "Copiado" : "Copiar texto"}
              </Button>
              <BotaoReenvio acao={acaoEnviarWhatsapp} rotulo="Enviar por WhatsApp agora" />
            </div>
          </div>
          <pre className="whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-[#FAF9F5] p-4 font-sans text-sm leading-relaxed text-[#1C1D21]">
            {mensagemWhatsapp}
          </pre>
        </div>
      )}

      {aba === "email" && (
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#1C1D21]">Pré-visualização do E-mail Executivo</h3>
              <p className="text-xs text-zinc-500">
                Layout HTML enviado automaticamente aos destinatários de e-mail configurados.
              </p>
            </div>
            <BotaoReenvio acao={acaoEnviarEmail} rotulo="Enviar por E-mail agora" />
          </div>
          <iframe
            title="Pré-visualização de e-mail"
            sandbox=""
            srcDoc={corpoEmailHtml}
            className="h-[520px] w-full rounded-2xl border border-zinc-200 bg-[#F5F4EF]"
          />
        </div>
      )}

      {aba === "sql" && (
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-2xs space-y-3">
          <div>
            <h3 className="text-sm font-bold text-[#1C1D21]">
              Snapshot Auditável de Indicadores SQL (`metricasSql`)
            </h3>
            <p className="text-xs text-zinc-500">
              Estes são os valores exatos apurados na base de dados PostgreSQL deste centro e entregues ao modelo. A IA
              não altera nem recalcula nenhum número.
            </p>
          </div>
          <pre className="max-h-[460px] overflow-auto rounded-2xl bg-[#1C1D21] p-4 font-mono text-xs text-zinc-100">
            {metricasJson}
          </pre>
        </div>
      )}
    </div>
  );
}
