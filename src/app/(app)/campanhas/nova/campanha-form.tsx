"use client";

import { useMemo, useRef, useState } from "react";
import { BolhaWhatsapp } from "@/components/bolha-whatsapp";
import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { renderizar } from "@/lib/mensagens/modelos";
import { formatKz, parseKz } from "@/lib/money";
import { NOMES_MESES, validarCampanhaSazonal, validarOrcamentoCampanha } from "@/lib/retencao";
import { criarCampanha } from "../actions";
import { TEXTO_CAMPANHA_PADRAO, VARIAVEIS_CAMPANHA } from "../segmento";

export type FormacaoOpcaoCampanha = {
  id: string;
  nome: string;
};

export function CampanhaForm({
  formacoes,
  mesAtual,
  anoAtual,
  sobraOperacional,
  centro,
}: {
  formacoes: FormacaoOpcaoCampanha[];
  mesAtual: number;
  anoAtual: number;
  /** Cêntimos em string */
  sobraOperacional: string;
  centro: string;
}) {
  const { estado, onSubmit, pendente } = useFormAcao(criarCampanha);
  const e = estado?.erros ?? {};

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"SAZONAL" | "FIDELIZACAO" | "SEGMENTADA">("SAZONAL");
  const [descontoPct, setDescontoPct] = useState(10);
  const [mesValidade, setMesValidade] = useState<string>(String(mesAtual));
  const [anoValidade, setAnoValidade] = useState<string>(String(anoAtual));
  const [orcamentoTxt, setOrcamentoTxt] = useState("");
  const [formacaoId, setFormacaoId] = useState("");
  const [filtroMinFormacoes, setFiltroMinFormacoes] = useState("");
  const [mensagemTexto, setMensagemTexto] = useState(TEXTO_CAMPANHA_PADRAO);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const sobraBigInt = BigInt(sobraOperacional || "0");
  const orcamentoParsed = orcamentoTxt.trim() ? parseKz(orcamentoTxt) : null;

  const validacaoSazonal = useMemo(() => {
    return validarCampanhaSazonal({
      tipo,
      descontoPct,
      mesValidade: mesValidade ? Number(mesValidade) : null,
      anoValidade: anoValidade ? Number(anoValidade) : null,
    });
  }, [tipo, descontoPct, mesValidade, anoValidade]);

  const validacaoOrcamento = useMemo(() => {
    return validarOrcamentoCampanha({
      orcamentoMax: orcamentoParsed,
      sobraOperacionalDisponivel: sobraBigInt,
    });
  }, [orcamentoParsed, sobraBigInt]);

  const formacaoSelecionada = formacoes.find((f) => f.id === formacaoId);
  const mesNome = mesValidade && NOMES_MESES[Number(mesValidade)] ? NOMES_MESES[Number(mesValidade)] : NOMES_MESES[mesAtual] ?? "";

  const textoPreview = useMemo(() => {
    return renderizar(mensagemTexto, {
      primeiroNome: "Ana",
      nome: "Ana Manuela Domingos",
      campanha: nome.trim() || "Campanha Especial",
      desconto: `${descontoPct}%`,
      formacao: formacaoSelecionada?.nome ?? "Excel Avançado",
      mes: mesNome,
      centro,
    });
  }, [mensagemTexto, nome, descontoPct, formacaoSelecionada, mesNome, centro]);

  function inserirVariavel(v: string) {
    const el = areaRef.current;
    const marca = `{{${v}}}`;
    if (!el) {
      setMensagemTexto((t) => t + marca);
      return;
    }
    const ini = el.selectionStart ?? mensagemTexto.length;
    const fim = el.selectionEnd ?? mensagemTexto.length;
    const novo = mensagemTexto.slice(0, ini) + marca + mensagemTexto.slice(fim);
    setMensagemTexto(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  function aoMudarTipo(novoTipo: "SAZONAL" | "FIDELIZACAO" | "SEGMENTADA") {
    setTipo(novoTipo);
    if (novoTipo === "SAZONAL" && descontoPct > 20) {
      setDescontoPct(20);
    }
    if (novoTipo === "FIDELIZACAO" && !filtroMinFormacoes) {
      setFiltroMinFormacoes("1");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 p-4 sm:p-6" noValidate>
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}

      {/* Identificação e Regras de Desconto */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">1. Identificação e Regras da Campanha</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nome da campanha *"
            htmlFor="nome"
            erro={e.nome}
            ajuda='Ex.: "Campanha Cacimbo — Liderança" ou "Regresso às Aulas".'
            className="sm:col-span-2"
          >
            <Input
              id="nome"
              name="nome"
              required
              maxLength={150}
              placeholder="Campanha Cacimbo — Liderança"
              value={nome}
              onChange={(ev) => setNome(ev.target.value)}
            />
          </Field>

          <Field
            label="Tipo de campanha *"
            htmlFor="tipo"
            erro={e.tipo}
            ajuda="As campanhas sazonais têm desconto até 20% e validade mensal."
          >
            <Select
              id="tipo"
              name="tipo"
              value={tipo}
              onChange={(ev) => aoMudarTipo(ev.target.value as "SAZONAL" | "FIDELIZACAO" | "SEGMENTADA")}
            >
              <option value="SAZONAL">Sazonal (até 20% no mês)</option>
              <option value="FIDELIZACAO">Fidelização (formandos recorrentes)</option>
              <option value="SEGMENTADA">Segmentada por WhatsApp</option>
            </Select>
          </Field>

          <Field
            label={`Desconto (%) * ${tipo === "SAZONAL" ? "(0–20%)" : "(0–50%)"}`}
            htmlFor="descontoPct"
            erro={e.descontoPct ?? (!validacaoSazonal.ok ? validacaoSazonal.erro : undefined)}
            ajuda={
              tipo === "SAZONAL"
                ? "Limite máximo de 20% de desconto nas campanhas sazonais."
                : "Percentagem de desconto aplicada nas matrículas associadas."
            }
          >
            <Input
              id="descontoPct"
              name="descontoPct"
              type="number"
              min={0}
              max={tipo === "SAZONAL" ? 20 : 50}
              required
              value={descontoPct}
              onChange={(ev) => setDescontoPct(Number(ev.target.value) || 0)}
            />
          </Field>

          <Field
            label={tipo === "SAZONAL" ? "Mês de validade *" : "Mês de validade (opcional)"}
            htmlFor="mesValidade"
            erro={e.mesValidade}
            ajuda="As campanhas sazonais são válidas apenas no mês escolhido e podem repetir-se noutro mês do mesmo ano."
          >
            <Select id="mesValidade" name="mesValidade" value={mesValidade} onChange={(ev) => setMesValidade(ev.target.value)}>
              {tipo !== "SAZONAL" && <option value="">— Qualquer mês —</option>}
              {Object.entries(NOMES_MESES).map(([m, label]) => (
                <option key={m} value={m}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={tipo === "SAZONAL" ? "Ano de validade *" : "Ano de validade (opcional)"}
            htmlFor="anoValidade"
            erro={e.anoValidade}
          >
            <Input
              id="anoValidade"
              name="anoValidade"
              type="number"
              min={2024}
              max={2100}
              required={tipo === "SAZONAL"}
              value={anoValidade}
              onChange={(ev) => setAnoValidade(ev.target.value)}
            />
          </Field>

          <Field
            label="Formação alvo (opcional)"
            htmlFor="formacaoId"
            erro={e.formacaoId}
            ajuda="Restrinja o desconto a uma formação específica ou deixe em Todas."
          >
            <Select id="formacaoId" name="formacaoId" value={formacaoId} onChange={(ev) => setFormacaoId(ev.target.value)}>
              <option value="">Todas as formações</option>
              {formacoes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Orçamento máximo de descontos (Kz, opcional)"
            htmlFor="orcamentoMax"
            erro={e.orcamentoMax}
            ajuda={`Sobra operacional do mês atual: ${formatKz(sobraBigInt)}.`}
          >
            <Input
              id="orcamentoMax"
              name="orcamentoMax"
              inputMode="decimal"
              placeholder="Ex.: 250 000"
              value={orcamentoTxt}
              onChange={(ev) => setOrcamentoTxt(ev.target.value)}
            />
          </Field>
        </div>

        {validacaoOrcamento.aviso && <Alerta tipo="aviso">{validacaoOrcamento.aviso}</Alerta>}
      </fieldset>

      {/* Segmentação de Destinatários */}
      <fieldset className="space-y-4 border-t border-slate-100 pt-5">
        <div>
          <legend className="text-sm font-semibold text-slate-900">2. Segmentação de Formandos (para disparo WhatsApp)</legend>
          <p className="text-xs text-slate-500">
            Defina que formandos devem receber esta campanha por WhatsApp. Deixe em branco para abranger todos os formandos.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nível de interesse" htmlFor="filtroNivelInteresse" erro={e.filtroNivelInteresse}>
            <Select id="filtroNivelInteresse" name="filtroNivelInteresse" defaultValue="">
              <option value="">Todos os níveis</option>
              <option value="MUITO">Muito interesse</option>
              <option value="POUCO">Pouco interesse</option>
            </Select>
          </Field>

          <Field
            label="Mín. de formações anteriores"
            htmlFor="filtroMinFormacoes"
            erro={e.filtroMinFormacoes}
            ajuda="Ex.: 1 para formandos recorrentes."
          >
            <Input
              id="filtroMinFormacoes"
              name="filtroMinFormacoes"
              type="number"
              min={0}
              max={100}
              placeholder="Qualquer"
              value={filtroMinFormacoes}
              onChange={(ev) => setFiltroMinFormacoes(ev.target.value)}
            />
          </Field>

          <Field
            label="Máx. de formações anteriores"
            htmlFor="filtroMaxFormacoes"
            erro={e.filtroMaxFormacoes}
            ajuda="Ex.: 0 para quem nunca se matriculou."
          >
            <Input id="filtroMaxFormacoes" name="filtroMaxFormacoes" type="number" min={0} max={100} placeholder="Qualquer" />
          </Field>

          <Field label="Profissão contém" htmlFor="filtroProfissao" erro={e.filtroProfissao}>
            <Input id="filtroProfissao" name="filtroProfissao" maxLength={100} placeholder="Ex.: Contabilista, Gestor…" />
          </Field>

          <Field label="Intenção de compra" htmlFor="filtroIntencaoCompra" erro={e.filtroIntencaoCompra}>
            <Select id="filtroIntencaoCompra" name="filtroIntencaoCompra" defaultValue="">
              <option value="">Indiferente</option>
              <option value="sim">Com intenção de comprar</option>
              <option value="nao">Sem intenção assinalada</option>
            </Select>
          </Field>
        </div>
      </fieldset>

      {/* Mensagem WhatsApp */}
      <fieldset className="space-y-4 border-t border-slate-100 pt-5">
        <legend className="text-sm font-semibold text-slate-900">3. Mensagem de WhatsApp da Campanha</legend>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-slate-500">Variáveis disponíveis (clique para inserir):</p>
              <div className="flex flex-wrap gap-1.5">
                {VARIAVEIS_CAMPANHA.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => inserirVariavel(v)}
                    className="min-h-8 rounded-full border border-slate-300 bg-white px-2.5 font-mono text-xs text-slate-700 hover:border-marca-400 hover:bg-marca-50"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            <Field
              label="Texto da mensagem *"
              htmlFor="mensagemTexto"
              erro={e.mensagemTexto}
              ajuda="Formatação WhatsApp: *negrito*, _itálico_, ~riscado~."
            >
              <Textarea
                id="mensagemTexto"
                ref={areaRef}
                name="mensagemTexto"
                rows={8}
                maxLength={4000}
                required
                value={mensagemTexto}
                onChange={(ev) => setMensagemTexto(ev.target.value)}
                className="font-mono text-sm"
              />
            </Field>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Pré-visualização no WhatsApp</p>
            <BolhaWhatsapp texto={textoPreview} hora="09:00" />
            <p className="mt-1 text-xs text-slate-500">
              A campanha ficará imediatamente <strong>Ativa</strong> após guardar e poderá ser disparada por WhatsApp na página seguinte.
            </p>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <LinkButton href="/campanhas" variante="secundario">
          Cancelar
        </LinkButton>
        <Button type="submit" disabled={pendente || !validacaoSazonal.ok}>
          {pendente ? "A criar campanha…" : "Criar campanha"}
        </Button>
      </div>
    </form>
  );
}
