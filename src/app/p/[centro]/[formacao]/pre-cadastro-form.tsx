"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormAcao } from "@/components/form-acao";
import { Alerta, Badge, Button, Field, Input } from "@/components/ui";
import type { ParametrosUtm } from "@/lib/leads";
import type { EstadoForm } from "@/lib/utils";

export type OpcaoTurmaPublica = {
  id: string;
  codigo: string;
  precoFormatado: string;
  textoDatas: string;
  horariosResumo: string[];
  vagasRestantes: number | null;
};

export function PreCadastroForm({
  acao,
  turmas,
  utms,
}: {
  acao: (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  turmas: OpcaoTurmaPublica[];
  utms: ParametrosUtm;
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const [turmaId, setTurmaId] = useState(turmas[0]?.id ?? "");
  const [referrer, setReferrer] = useState("");

  useEffect(() => {
    if (typeof document !== "undefined" && document.referrer) {
      setReferrer(document.referrer.slice(0, 300));
    }
  }, []);

  const turma = turmas.find((t) => t.id === turmaId) ?? turmas[0];
  const e = estado?.erros ?? {};

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-5">
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}

      {/* Honeypot invisível para bots */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="hp-website">Não preencher</label>
        <input id="hp-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {/* Campos ocultos de campanha (UTM / fbclid / referrer) */}
      {utms.utm_source && <input type="hidden" name="utm_source" value={utms.utm_source} />}
      {utms.utm_medium && <input type="hidden" name="utm_medium" value={utms.utm_medium} />}
      {utms.utm_campaign && <input type="hidden" name="utm_campaign" value={utms.utm_campaign} />}
      {utms.utm_content && <input type="hidden" name="utm_content" value={utms.utm_content} />}
      {utms.utm_term && <input type="hidden" name="utm_term" value={utms.utm_term} />}
      {utms.fbclid && <input type="hidden" name="fbclid" value={utms.fbclid} />}
      {referrer && <input type="hidden" name="referrer" value={referrer} />}

      {/* Escolha da turma */}
      <fieldset className="space-y-2.5">
        <legend className="text-sm font-semibold text-slate-800">
          {turmas.length > 1 ? "1. Escolha a turma e as datas" : "Turma e calendário"}
        </legend>
        {turmas.map((t) => (
          <label
            key={t.id}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-marca-300 has-checked:border-marca-600 has-checked:bg-marca-50/50"
          >
            <input
              type="radio"
              name="turmaId"
              value={t.id}
              checked={turma?.id === t.id}
              onChange={() => setTurmaId(t.id)}
              className="mt-1 size-4 shrink-0 accent-marca-600"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  Turma {t.codigo} · {t.textoDatas}
                </span>
                <span className="font-bold text-marca-700">{t.precoFormatado}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-600">
                {t.horariosResumo.map((h, i) => (
                  <span key={i} className="rounded bg-slate-100 px-2 py-0.5">
                    {h}
                  </span>
                ))}
                {t.vagasRestantes !== null && (
                  <Badge cor={t.vagasRestantes > 0 ? "verde" : "amarelo"}>
                    {t.vagasRestantes > 0 ? `${t.vagasRestantes} vaga(s)` : "Últimas vagas"}
                  </Badge>
                )}
              </div>
            </div>
          </label>
        ))}
        {e.turmaId && <p className="text-xs text-red-600">{e.turmaId}</p>}
      </fieldset>

      {/* Dados do candidato */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo *" htmlFor="lead-nome" erro={e.nome} className="sm:col-span-2">
          <Input id="lead-nome" name="nome" required maxLength={120} placeholder="Ex.: Maria João Silva" />
        </Field>
        <Field
          label="WhatsApp *"
          htmlFor="lead-wa"
          erro={e.whatsapp}
          ajuda="Número pelo qual a equipa comercial entrará em contacto."
        >
          <Input id="lead-wa" name="whatsapp" type="tel" inputMode="tel" required placeholder="923 000 000" />
        </Field>
        <Field label="Profissão / área" htmlFor="lead-prof" erro={e.profissao}>
          <Input id="lead-prof" name="profissao" maxLength={100} placeholder="Opcional" />
        </Field>
        <Field label="Email" htmlFor="lead-email" erro={e.email} className="sm:col-span-2">
          <Input id="lead-email" name="email" type="email" maxLength={120} placeholder="Opcional" />
        </Field>
      </div>

      {/* Qualificação obrigatória: aceitação explícita de preço e datas */}
      {turma && (
        <div className="space-y-3 rounded-xl border border-marca-200 bg-marca-50/40 p-4">
          <p className="text-xs font-semibold tracking-wide text-marca-800 uppercase">
            Confirmação obrigatória para pré-cadastro
          </p>

          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
            <input
              type="checkbox"
              name="aceitouPreco"
              required
              className="mt-0.5 size-5 shrink-0 accent-marca-600"
            />
            <span>
              Aceito o preço de <strong>{turma.precoFormatado}</strong> desta formação.
              {e.aceitouPreco && <span className="block text-xs text-red-600">{e.aceitouPreco}</span>}
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
            <input
              type="checkbox"
              name="aceitouDatas"
              required
              className="mt-0.5 size-5 shrink-0 accent-marca-600"
            />
            <span>
              Aceito as datas da turma (<strong>{turma.textoDatas}</strong>) e tenho disponibilidade nos horários indicados.
              {e.aceitouDatas && <span className="block text-xs text-red-600">{e.aceitouDatas}</span>}
            </span>
          </label>
        </div>
      )}

      <Button type="submit" disabled={pendente} className="w-full py-3 text-base">
        <CheckCircle2 className="size-5" aria-hidden />
        {pendente ? "A enviar pré-cadastro…" : "Confirmar interesse e receber contacto no WhatsApp"}
      </Button>
    </form>
  );
}
