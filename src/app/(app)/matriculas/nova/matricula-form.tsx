"use client";

import { useMemo, useState } from "react";
import { Alerta, Badge, Button, Field, Input, LinkButton, Select, Tabela, Td, Th } from "@/components/ui";
import { useFormAcao } from "@/components/form-acao";
import { dataSimples, formatData } from "@/lib/datas";
import { formatKz, parseKz } from "@/lib/money";
import { gerarParcelas } from "@/lib/parcelas";
import {
  NOMES_MESES,
  REGRAS_RETENCAO_PADRAO,
  calcularDescontoFidelizacao,
  calcularDescontoPontos,
  consolidarDescontosMatricula,
  type RegrasRetencao,
} from "@/lib/retencao";
import { criarMatricula } from "../actions";

export type FormandoOpcao = {
  id: string;
  nome: string;
  whatsapp: string;
  formacoesAnteriores?: number;
  saldoPontos?: number;
};

export type TurmaOpcao = {
  id: string;
  codigo: string;
  formacaoId?: string;
  formacao: string;
  estado: string;
  /** Cêntimos, em string (bigint não é serializável para o cliente). */
  preco: string;
  vagas: number | null;
  ocupadas: number;
};

export type CampanhaOpcao = {
  id: string;
  nome: string;
  tipo: string;
  descontoPct: number;
  mesValidade: number | null;
  anoValidade: number | null;
  formacaoId: string | null;
  orcamentoMax: string | null;
  descontoConsumido: string;
};

const METODOS: [string, string][] = [
  ["MULTICAIXA", "Multicaixa Express"],
  ["REFERENCIA", "Pagamento por referência"],
  ["TRANSFERENCIA", "Transferência bancária"],
  ["NUMERARIO", "Numerário"],
  ["TPA", "TPA"],
  ["OUTRO", "Outro"],
];

export function MatriculaForm({
  formandos,
  turmas,
  campanhas = [],
  regras = REGRAS_RETENCAO_PADRAO,
  formandoInicial,
  turmaInicial,
  hoje,
  voltarPara,
  cancelarHref,
}: {
  formandos: FormandoOpcao[];
  turmas: TurmaOpcao[];
  campanhas?: CampanhaOpcao[];
  regras?: RegrasRetencao;
  formandoInicial: string;
  turmaInicial: string;
  hoje: string;
  voltarPara: string;
  cancelarHref: string;
}) {
  const { estado, onSubmit, pendente } = useFormAcao(criarMatricula);
  const e = estado?.erros ?? {};

  const formandoIniObj = formandos.find((f) => f.id === formandoInicial);
  const [formandoId, setFormandoId] = useState(formandoInicial);
  const [pesquisa, setPesquisa] = useState("");
  const [turmaId, setTurmaId] = useState(turmaInicial);
  const [aplicarFidelizacao, setAplicarFidelizacao] = useState((formandoIniObj?.formacoesAnteriores ?? 0) >= 1);
  const [campanhaId, setCampanhaId] = useState("");
  const [pontosResgatados, setPontosResgatados] = useState(0);
  const [desconto, setDesconto] = useState("");
  const [numParcelas, setNumParcelas] = useState(1);
  const [dataPrimeira, setDataPrimeira] = useState(hoje);
  const [pagarJa, setPagarJa] = useState(false);

  const formandosFiltrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase();
    const digitos = q.replace(/\D/g, "");
    const lista = q
      ? formandos.filter((f) => f.nome.toLowerCase().includes(q) || (digitos.length >= 3 && f.whatsapp.includes(digitos)))
      : formandos;
    const selecionado = formandos.find((f) => f.id === formandoId);
    return selecionado && !lista.includes(selecionado) ? [selecionado, ...lista] : lista;
  }, [formandos, pesquisa, formandoId]);

  const formando = formandos.find((f) => f.id === formandoId);
  const turma = turmas.find((t) => t.id === turmaId);
  const preco = turma ? BigInt(turma.preco) : null;

  const campanhasCompativeis = useMemo(() => {
    if (!turma) return campanhas;
    return campanhas.filter((c) => !c.formacaoId || c.formacaoId === turma.formacaoId);
  }, [campanhas, turma]);

  const campanhaSelecionada = campanhasCompativeis.find((c) => c.id === campanhaId) ?? null;

  const formacoesAnteriores = formando?.formacoesAnteriores ?? 0;
  const saldoPontos = formando?.saldoPontos ?? 0;
  const maxPontosPeloLimite =
    regras.percentagemPorPonto > 0 ? Math.floor(regras.limiteDescontoIndicacaoPct / regras.percentagemPorPonto) : 0;
  const maxPontosResgataveis = Math.min(saldoPontos, maxPontosPeloLimite);

  const descFidelizacao = useMemo(() => {
    if (!preco || !aplicarFidelizacao) return { elegivel: false, percentagem: 0, valorDesconto: 0n };
    return calcularDescontoFidelizacao({
      precoBase: preco,
      formacoesAnteriores,
      descontoFidelizacaoPct: regras.descontoFidelizacaoPct,
    });
  }, [preco, aplicarFidelizacao, formacoesAnteriores, regras.descontoFidelizacaoPct]);

  const descCampanha = useMemo(() => {
    if (!preco || !campanhaSelecionada || campanhaSelecionada.descontoPct <= 0) {
      return { percentagem: 0, valorDesconto: 0n };
    }
    const pct = Math.min(100, Math.max(0, campanhaSelecionada.descontoPct));
    return {
      percentagem: pct,
      valorDesconto: (preco * BigInt(pct)) / 100n,
    };
  }, [preco, campanhaSelecionada]);

  const descPontos = useMemo(() => {
    if (!preco) return { pontosUsados: 0, percentagem: 0, valorDesconto: 0n };
    return calcularDescontoPontos({
      precoBase: preco,
      saldoPontos,
      pontosSolicitados: pontosResgatados,
      percentagemPorPonto: regras.percentagemPorPonto,
      limiteDescontoIndicacaoPct: regras.limiteDescontoIndicacaoPct,
    });
  }, [preco, saldoPontos, pontosResgatados, regras.percentagemPorPonto, regras.limiteDescontoIndicacaoPct]);

  const valorDescontoManual = desconto.trim() ? parseKz(desconto) : 0n;

  const consolidado = useMemo(() => {
    if (preco === null || valorDescontoManual === null) return null;
    return consolidarDescontosMatricula({
      precoBase: preco,
      descontoFidelizacao: descFidelizacao.valorDesconto,
      descontoCampanha: descCampanha.valorDesconto,
      descontoPontos: descPontos.valorDesconto,
      descontoManual: valorDescontoManual,
    });
  }, [preco, descFidelizacao.valorDesconto, descCampanha.valorDesconto, descPontos.valorDesconto, valorDescontoManual]);

  const total = consolidado?.valorFinal ?? null;
  const descontoTotal = consolidado?.descontoTotal ?? 0n;
  const lotada = turma && turma.vagas !== null && turma.ocupadas >= turma.vagas;

  const orcamentoCampanhaExcedido = useMemo(() => {
    if (!campanhaSelecionada || !campanhaSelecionada.orcamentoMax || !consolidado) return false;
    const max = BigInt(campanhaSelecionada.orcamentoMax);
    const consumido = BigInt(campanhaSelecionada.descontoConsumido || "0");
    return consumido + consolidado.descontoTotal > max;
  }, [campanhaSelecionada, consolidado]);

  const plano = useMemo(() => {
    if (total === null || total <= 0n) return null;
    try {
      return gerarParcelas(total, numParcelas, dataSimples(dataPrimeira));
    } catch {
      return null;
    }
  }, [total, numParcelas, dataPrimeira]);

  const erroDesconto =
    e.desconto ??
    (valorDescontoManual === null
      ? "Valor inválido."
      : preco !== null && total !== null && total <= 0n
        ? "O desconto total tem de ser inferior ao preço da formação."
        : undefined);

  function aoMudarFormando(novoId: string) {
    setFormandoId(novoId);
    const f = formandos.find((item) => item.id === novoId);
    setAplicarFidelizacao((f?.formacoesAnteriores ?? 0) >= 1);
    setPontosResgatados(0);
  }

  function aoMudarTurma(novoId: string) {
    setTurmaId(novoId);
    const t = turmas.find((item) => item.id === novoId);
    if (t && campanhaId) {
      const c = campanhas.find((item) => item.id === campanhaId);
      if (c && c.formacaoId && c.formacaoId !== t.formacaoId) {
        setCampanhaId("");
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 p-4 sm:p-6" noValidate>
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      <input type="hidden" name="voltarPara" value={voltarPara} />

      {/* Formando */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">Formando</legend>
        {!formandoInicial && (
          <Input
            type="search"
            value={pesquisa}
            onChange={(ev) => setPesquisa(ev.target.value)}
            placeholder="Filtrar por nome ou WhatsApp…"
            aria-label="Filtrar formandos"
          />
        )}
        <Field label="Formando *" htmlFor="formandoId" erro={e.formandoId}>
          <Select id="formandoId" name="formandoId" value={formandoId} onChange={(ev) => aoMudarFormando(ev.target.value)} required>
            <option value="">Escolha o formando…</option>
            {formandosFiltrados.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} · {f.whatsapp}
                {(f.formacoesAnteriores ?? 0) >= 1 ? ` · ${f.formacoesAnteriores} form. ant.` : ""}
                {(f.saldoPontos ?? 0) > 0 ? ` · ${f.saldoPontos} pts` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      {/* Turma */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">Turma</legend>
        <Field label="Turma *" htmlFor="turmaId" erro={e.turmaId}>
          <Select id="turmaId" name="turmaId" value={turmaId} onChange={(ev) => aoMudarTurma(ev.target.value)} required>
            <option value="">Escolha a turma…</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.formacao} · {t.codigo} · {formatKz(BigInt(t.preco))}
                {t.vagas !== null ? ` · ${t.ocupadas}/${t.vagas} vagas` : ""}
              </option>
            ))}
          </Select>
        </Field>
        {turmas.length === 0 && <Alerta tipo="aviso">Não há turmas planeadas ou em curso.</Alerta>}
        {turma && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <div className="font-medium">{turma.formacao}</div>
            <div>
              Turma {turma.codigo} · {turma.estado === "EM_CURSO" ? "Em curso" : "Planeada"} · Preço base{" "}
              <strong>{formatKz(BigInt(turma.preco))}</strong>
              {turma.vagas !== null && ` · ${turma.ocupadas} de ${turma.vagas} vagas ocupadas`}
            </div>
          </div>
        )}
        {lotada && (
          <Alerta tipo="aviso">
            <p>Esta turma já tem todas as vagas preenchidas.</p>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" name="ignorarVagas" className="size-4 accent-marca-600" />
              Matricular mesmo assim (excede as vagas)
            </label>
          </Alerta>
        )}
      </fieldset>

      {/* Benefícios e Descontos */}
      <fieldset className="space-y-4 rounded-xl border border-marca-200 bg-marca-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-semibold text-slate-900">Benefícios e Descontos</legend>
          {formando && (
            <div className="flex flex-wrap gap-1.5">
              {formacoesAnteriores >= 1 && (
                <Badge cor="verde">Fidelização elegível ({formacoesAnteriores} formação anterior)</Badge>
              )}
              {saldoPontos > 0 && <Badge cor="azul">{saldoPontos} pontos de indicação disponíveis</Badge>}
            </div>
          )}
        </div>

        {/* 1. Fidelização */}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <input
            type="checkbox"
            name="aplicarFidelizacao"
            checked={aplicarFidelizacao && formacoesAnteriores >= 1}
            disabled={formacoesAnteriores < 1}
            onChange={(ev) => setAplicarFidelizacao(ev.target.checked)}
            className="mt-0.5 size-4 accent-marca-600 disabled:opacity-50"
          />
          <span className="flex-1 text-sm">
            <span className="font-medium text-slate-800">
              Desconto de fidelização (-{regras.descontoFidelizacaoPct}%)
            </span>
            {descFidelizacao.valorDesconto > 0n && (
              <span className="ml-2 font-semibold text-emerald-700">
                -{formatKz(descFidelizacao.valorDesconto)}
              </span>
            )}
            <span className="block text-xs text-slate-500">
              {formacoesAnteriores >= 1
                ? `O formando já realizou ${formacoesAnteriores} formação(ões) neste centro.`
                : "Disponível para formandos com pelo menos 1 formação anterior no centro."}
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* 2. Campanha sazonal / promocional */}
          <Field
            label="Campanha (opcional)"
            htmlFor="campanhaId"
            erro={e.campanhaId}
            ajuda="Campanhas vigentes para esta formação no mês atual."
          >
            <Select id="campanhaId" name="campanhaId" value={campanhaId} onChange={(ev) => setCampanhaId(ev.target.value)}>
              <option value="">— Nenhuma campanha —</option>
              {campanhasCompativeis.map((c) => {
                const validade =
                  c.mesValidade && c.anoValidade ? ` · ${NOMES_MESES[c.mesValidade] ?? c.mesValidade}/${c.anoValidade}` : "";
                return (
                  <option key={c.id} value={c.id}>
                    {c.nome} (-{c.descontoPct}%){validade}
                  </option>
                );
              })}
            </Select>
          </Field>

          {/* 3. Resgate de pontos de indicação */}
          <Field
            label={`Resgatar pontos (saldo: ${saldoPontos})`}
            htmlFor="pontosResgatados"
            erro={e.pontosResgatados}
            ajuda={
              saldoPontos > 0
                ? `Máx. ${maxPontosResgataveis} pts (-${maxPontosResgataveis * regras.percentagemPorPonto}%).`
                : "Este formando não tem pontos disponíveis."
            }
          >
            <Input
              id="pontosResgatados"
              name="pontosResgatados"
              type="number"
              min={0}
              max={maxPontosResgataveis}
              disabled={saldoPontos <= 0}
              value={pontosResgatados}
              onChange={(ev) => {
                const n = Math.max(0, Math.min(maxPontosResgataveis, Math.floor(Number(ev.target.value) || 0)));
                setPontosResgatados(n);
              }}
            />
          </Field>

          {/* 4. Desconto manual extra */}
          <Field label="Desconto comercial extra (Kz)" htmlFor="desconto" erro={erroDesconto} ajuda="Ajuste comercial adicional.">
            <Input
              id="desconto"
              name="desconto"
              inputMode="decimal"
              placeholder="0"
              value={desconto}
              onChange={(ev) => setDesconto(ev.target.value)}
            />
          </Field>
        </div>

        {orcamentoCampanhaExcedido && (
          <Alerta tipo="aviso">
            O desconto total desta matrícula ultrapassa o orçamento máximo disponível da campanha selecionada.
          </Alerta>
        )}

        {/* Resumo consolidado de descontos */}
        {preco !== null && consolidado !== null && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <span>Preço base da formação</span>
              <span className="font-medium text-slate-900">{formatKz(preco)}</span>
            </div>
            {descFidelizacao.valorDesconto > 0n && (
              <div className="flex justify-between text-emerald-700">
                <span>Desconto de fidelização (-{descFidelizacao.percentagem}%)</span>
                <span>-{formatKz(descFidelizacao.valorDesconto)}</span>
              </div>
            )}
            {descCampanha.valorDesconto > 0n && campanhaSelecionada && (
              <div className="flex justify-between text-emerald-700">
                <span>
                  Campanha {campanhaSelecionada.nome} (-{descCampanha.percentagem}%)
                </span>
                <span>-{formatKz(descCampanha.valorDesconto)}</span>
              </div>
            )}
            {descPontos.valorDesconto > 0n && (
              <div className="flex justify-between text-emerald-700">
                <span>
                  Resgate de {descPontos.pontosUsados} ponto(s) (-{descPontos.percentagem}%)
                </span>
                <span>-{formatKz(descPontos.valorDesconto)}</span>
              </div>
            )}
            {valorDescontoManual && valorDescontoManual > 0n && (
              <div className="flex justify-between text-emerald-700">
                <span>Desconto comercial manual</span>
                <span>-{formatKz(valorDescontoManual)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-1.5 font-semibold text-slate-900">
              <span>Valor final da matrícula {descontoTotal > 0n ? `(poupança: ${formatKz(descontoTotal)})` : ""}</span>
              <span>{formatKz(consolidado.valorFinal)}</span>
            </div>
          </div>
        )}
      </fieldset>

      {/* Plano */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">Plano de pagamento</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plano" htmlFor="numParcelas" erro={e.numParcelas}>
            <Select
              id="numParcelas"
              name="numParcelas"
              value={numParcelas}
              onChange={(ev) => setNumParcelas(Number(ev.target.value))}
            >
              <option value={1}>À vista (1 pagamento)</option>
              {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n} parcelas mensais
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={numParcelas === 1 ? "Data de pagamento" : "Data da 1.ª parcela"}
            htmlFor="dataPrimeira"
            erro={e.dataPrimeira}
          >
            <Input
              id="dataPrimeira"
              name="dataPrimeira"
              type="date"
              value={dataPrimeira}
              onChange={(ev) => setDataPrimeira(ev.target.value)}
              required
            />
          </Field>
        </div>

        {plano && total !== null && (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="flex flex-wrap justify-between gap-2 bg-slate-50 px-4 py-2 text-sm">
              <span className="text-slate-600">Pré-visualização do plano</span>
              <span>
                Total: <strong>{formatKz(total)}</strong>
              </span>
            </div>
            <Tabela>
              <thead>
                <tr>
                  <Th>Parcela</Th>
                  <Th>Vencimento</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plano.map((p) => (
                  <tr key={p.numero}>
                    <Td>{p.numero}</Td>
                    <Td>{formatData(p.vencimento)}</Td>
                    <Td className="text-right">{formatKz(p.valor)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </fieldset>

      {/* Pagamento imediato */}
      <fieldset className="space-y-3">
        <label className="flex min-h-10 items-center gap-3 rounded-lg border border-slate-200 px-3">
          <input
            type="checkbox"
            name="pagarJa"
            checked={pagarJa}
            onChange={(ev) => setPagarJa(ev.target.checked)}
            className="size-4 accent-marca-600"
          />
          <span className="text-sm text-slate-700">
            Registar já o pagamento da 1.ª parcela
            {plano && <strong> ({formatKz(plano[0].valor)})</strong>}
          </span>
        </label>
        {pagarJa && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Método *" htmlFor="metodo" erro={e.metodo}>
              <Select id="metodo" name="metodo" defaultValue="MULTICAIXA">
                {METODOS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Referência" htmlFor="referencia" erro={e.referencia}>
              <Input id="referencia" name="referencia" placeholder="N.º da transação" />
            </Field>
            <Field label="Recibo AGT" htmlFor="referenciaRecibo" erro={e.referenciaRecibo}>
              <Input id="referenciaRecibo" name="referenciaRecibo" placeholder="Ref. do recibo" />
            </Field>
          </div>
        )}
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <LinkButton href={cancelarHref} variante="secundario">
          Cancelar
        </LinkButton>
        <Button type="submit" disabled={pendente || !plano || !formandoId}>
          {pendente ? "A matricular…" : "Confirmar matrícula"}
        </Button>
      </div>
    </form>
  );
}
