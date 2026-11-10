"use client";

import { Check, Copy, QrCode, RotateCcw } from "lucide-react";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { BolhaWhatsapp } from "@/components/bolha-whatsapp";
import { useFormAcao } from "@/components/form-acao";
import { ModalConfirmacao } from "@/components/modal-confirmacao";
import { Alerta, Badge, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { VALORES_EXEMPLO } from "@/lib/configuracoes";
import { renderizar } from "@/lib/mensagens/modelos";
import type { EstadoForm } from "@/lib/utils";
import type { EstadoQrWhatsapp } from "./actions";

type Acao = (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;

function Mensagens({ estado }: { estado: EstadoForm }) {
  return (
    <>
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      {estado?.aviso && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] px-4 py-3 text-sm text-[#1C1D21]"
        >
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#FBD34D]" aria-hidden />
          <span>{estado.aviso}</span>
        </div>
      )}
      {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
    </>
  );
}

function Interruptor({ name, defaultChecked, rotulo, ajuda }: { name: string; defaultChecked: boolean; rotulo: string; ajuda?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-3.5 transition-colors hover:bg-zinc-100/70 has-checked:border-[#1C1D21] has-checked:bg-[#FBD34D]/20">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-5 shrink-0 accent-[#1C1D21]" />
      <span>
        <span className="block text-sm font-semibold text-zinc-900">{rotulo}</span>
        {ajuda && <span className="block text-xs text-zinc-500">{ajuda}</span>}
      </span>
    </label>
  );
}

// ── Botão de ação com resultado (testar, regenerar, …) ───────────────────────

export function BotaoAcao({
  acao,
  rotulo,
  pendenteRotulo,
  confirmar,
  variante = "secundario",
}: {
  acao: Acao;
  rotulo: string;
  pendenteRotulo?: string;
  confirmar?: string;
  variante?: "primario" | "secundario" | "perigo" | "fantasma";
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const [modalAberto, setModalAberto] = useState(false);

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-2">
      <Button
        type={confirmar ? "button" : "submit"}
        variante={variante}
        disabled={pendente}
        onClick={() => {
          if (confirmar) setModalAberto(true);
        }}
      >
        {pendente ? (pendenteRotulo ?? "A processar…") : rotulo}
      </Button>
      {confirmar && (
        <ModalConfirmacao
          aberto={modalAberto}
          titulo="Confirmar ação"
          mensagem={confirmar}
          rotuloConfirmar={rotulo}
          pendente={pendente}
          aoCancelar={() => setModalAberto(false)}
          aoConfirmar={() => {
            setModalAberto(false);
            ref.current?.requestSubmit();
          }}
        />
      )}
      <Mensagens estado={estado} />
    </form>
  );
}

export function Copiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variante="secundario"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          /* sem permissão para a área de transferência */
        }
      }}
      aria-label="Copiar"
    >
      {copiado ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copiado ? "Copiado" : "Copiar"}
    </Button>
  );
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────

export type ValoresWhatsapp = {
  whatsappModo: "DESATIVADO" | "SIMULACAO" | "EVOLUTION";
  intervaloEnvioSegundos: number;
};

export function WhatsappForm({ acao, valores }: { acao: Acao; valores: ValoresWhatsapp }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const [modo, setModo] = useState(valores.whatsappModo);
  const e = estado?.erros ?? {};

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-5 p-6">
      <Mensagens estado={estado} />
      <fieldset className="space-y-2.5">
        <legend className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Modo de funcionamento</legend>
        {(
          [
            ["DESATIVADO", "Desativado", "Não envia nem agenda mensagens automáticas."],
            ["SIMULACAO", "Modo de Teste (Interno)", "Regista as mensagens no histórico para validação sem enviar para telemóveis reais."],
            ["EVOLUTION", "WhatsApp Ativo", "Envia mensagens reais pelo número de WhatsApp associado ao centro."],
          ] as const
        ).map(([v, nome, desc]) => (
          <label
            key={v}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-3.5 transition-colors hover:bg-zinc-100/70 has-checked:border-[#1C1D21] has-checked:bg-[#FBD34D]/25"
          >
            <input
              type="radio"
              name="whatsappModo"
              value={v}
              checked={modo === v}
              onChange={() => setModo(v)}
              className="mt-0.5 size-4 accent-[#1C1D21]"
            />
            <span>
              <span className="block text-sm font-bold text-zinc-900">{nome}</span>
              <span className="block text-xs text-zinc-500">{desc}</span>
            </span>
          </label>
        ))}
        {e.whatsappModo && <p className="text-xs text-red-600">{e.whatsappModo}</p>}
      </fieldset>

      <Field
        label="Intervalo entre envios (segundos)"
        htmlFor="wa-int"
        erro={e.intervaloEnvioSegundos}
        ajuda="Pausa mínima entre mensagens do centro (1–120). Reduz o risco de bloqueio do número."
        className="max-w-xs"
      >
        <Input id="wa-int" name="intervaloEnvioSegundos" type="number" min={1} max={120} required defaultValue={valores.intervaloEnvioSegundos} />
      </Field>

      <Button type="submit" disabled={pendente}>
        {pendente ? "A guardar…" : "Guardar modo"}
      </Button>
    </form>
  );
}

export function EmparelharWhatsapp({
  gerarQr,
  testar,
  desligar,
}: {
  gerarQr: () => Promise<EstadoQrWhatsapp>;
  testar: Acao;
  desligar: Acao;
}) {
  const [estadoQr, setEstadoQr] = useState<EstadoQrWhatsapp | null>(null);
  const [aCarregarQr, iniciarQr] = useTransition();

  function pedirQr() {
    iniciarQr(async () => {
      const res = await gerarQr();
      setEstadoQr(res);
    });
  }

  return (
    <div className="space-y-4 p-6">
      <p className="text-sm text-zinc-600">
        Associe o telemóvel do centro lendo o código QR diretamente no WhatsApp (<strong>Dispositivos associados → Associar um dispositivo</strong>).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={pedirQr} disabled={aCarregarQr}>
          <QrCode className="size-4 text-[#FBD34D]" aria-hidden />
          {aCarregarQr ? "A gerar QR Code…" : "Ligar WhatsApp (Gerar QR Code)"}
        </Button>
      </div>

      {estadoQr?.erro && <Alerta>{estadoQr.erro}</Alerta>}
      {estadoQr?.aviso && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] px-4 py-3 text-sm text-[#1C1D21]"
        >
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#FBD34D]" aria-hidden />
          <span>{estadoQr.aviso}</span>
        </div>
      )}
      {estadoQr?.ok && <Alerta tipo="sucesso">{estadoQr.ok}</Alerta>}

      {estadoQr?.qrCodeBase64 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-[#FAF9F5] p-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={estadoQr.qrCodeBase64}
            alt="QR Code para associar o WhatsApp do centro"
            className="size-56 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xs"
          />
          {estadoQr.pairingCode && (
            <p className="text-xs text-zinc-600">
              Código de emparelhamento alternativo: <code className="font-mono font-bold text-zinc-900">{estadoQr.pairingCode}</code>
            </p>
          )}
          <ol className="list-decimal space-y-1 pl-5 text-left text-xs text-zinc-600">
            <li>Abra o WhatsApp no telemóvel do centro.</li>
            <li>Toque no menu (⋮ ou Definições) e escolha <strong>Dispositivos associados</strong>.</li>
            <li>Toque em <strong>Associar um dispositivo</strong> e aponte a câmara para o QR Code acima.</li>
          </ol>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3 border-t border-zinc-100 pt-4">
        <BotaoAcao acao={testar} rotulo="Verificar estado da ligação" pendenteRotulo="A verificar…" />
        <BotaoAcao
          acao={desligar}
          rotulo="Desassociar telemóvel"
          pendenteRotulo="A desligar…"
          variante="fantasma"
          confirmar="Desassociar o número de WhatsApp atual deste centro?"
        />
      </div>
    </div>
  );
}

export function EnviarTesteForm({ acao }: { acao: Acao }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Número de destino" htmlFor="teste-num" erro={estado?.erros?.numero}>
          <Input id="teste-num" name="numero" type="tel" inputMode="tel" required placeholder="923 000 000" autoComplete="off" />
        </Field>
        <Button type="submit" variante="secundario" disabled={pendente}>
          {pendente ? "A enviar…" : "Enviar mensagem de teste"}
        </Button>
      </div>
      <Mensagens estado={estado} />
    </form>
  );
}

// ── Automações ───────────────────────────────────────────────────────────────

export type ValoresAutomacoes = {
  lembretesAtivos: boolean;
  diasAntesVencimento: number;
  diasAposAtraso: string;
  confirmacoesAtivas: boolean;
  aniversariosAtivos: boolean;
  horaEnvio: number;
  numerosEquipaComercial: string;
  apresentacaoPublica: string;
};

export function AutomacoesForm({ acao, valores }: { acao: Acao; valores: ValoresAutomacoes }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const e = estado?.erros ?? {};
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-6 p-6">
      <Mensagens estado={estado} />

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-900">Parcelas e Cobranças</h3>
        <Interruptor
          name="lembretesAtivos"
          defaultChecked={valores.lembretesAtivos}
          rotulo="Lembretes de vencimento e avisos de atraso"
          ajuda="Envia lembretes antes do vencimento e avisos nos dias indicados após o vencimento."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dias antes do vencimento" htmlFor="au-antes" erro={e.diasAntesVencimento} ajuda="0 = no próprio dia (0–30).">
            <Input id="au-antes" name="diasAntesVencimento" type="number" min={0} max={30} required defaultValue={valores.diasAntesVencimento} />
          </Field>
          <Field label="Dias após o vencimento" htmlFor="au-apos" erro={e.diasAposAtraso} ajuda="Separados por vírgulas (ex.: 1, 7, 15).">
            <Input id="au-apos" name="diasAposAtraso" defaultValue={valores.diasAposAtraso} placeholder="1, 7" inputMode="numeric" />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-900">Confirmações e Relacionamento</h3>
        <Interruptor
          name="confirmacoesAtivas"
          defaultChecked={valores.confirmacoesAtivas}
          rotulo="Confirmação de pagamento"
          ajuda="Ao registar um pagamento (e quando o plano fica totalmente pago)."
        />
        <Interruptor
          name="aniversariosAtivos"
          defaultChecked={valores.aniversariosAtivos}
          rotulo="Mensagem de aniversário"
          ajuda="No dia de aniversário do formando."
        />
        <Field label="Hora de envio" htmlFor="au-hora" erro={e.horaEnvio} ajuda="Hora de Luanda a partir da qual se enviam as mensagens agendadas (0–23)." className="max-w-xs">
          <Select id="au-hora" name="horaEnvio" defaultValue={String(valores.horaEnvio)}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </Select>
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-900">Captação de Leads e Catálogo Público</h3>
        <Field
          label="Números da equipa comercial"
          htmlFor="au-equipa"
          erro={e.numerosEquipaComercial}
          ajuda="Um número por linha. Recebem por WhatsApp cada novo lead qualificado."
        >
          <Textarea id="au-equipa" name="numerosEquipaComercial" rows={3} defaultValue={valores.numerosEquipaComercial} placeholder={"923 000 000\n+244 912 345 678"} />
        </Field>
        <Field
          label="Apresentação pública"
          htmlFor="au-apres"
          erro={e.apresentacaoPublica}
          ajuda="Texto de apresentação do centro nas páginas públicas das formações."
        >
          <Textarea id="au-apres" name="apresentacaoPublica" rows={4} maxLength={3000} defaultValue={valores.apresentacaoPublica} />
        </Field>
      </section>

      <Button type="submit" disabled={pendente}>
        {pendente ? "A guardar…" : "Guardar automações"}
      </Button>
    </form>
  );
}

// ── Fidelização e Indicação ──────────────────────────────────────────────────

export type ValoresFidelizacao = {
  descontoFidelizacaoPct: number;
  pontosPorIndicacao: number;
  percentagemPorPonto: number;
  limiteDescontoIndicacaoPct: number;
  validadePontosMeses: number;
};

export function FidelizacaoForm({ acao, valores }: { acao: Acao; valores: ValoresFidelizacao }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const e = estado?.erros ?? {};

  const [descontoFidelizacaoPct, setDescontoFidelizacaoPct] = useState(valores.descontoFidelizacaoPct);
  const [pontosPorIndicacao, setPontosPorIndicacao] = useState(valores.pontosPorIndicacao);
  const [percentagemPorPonto, setPercentagemPorPonto] = useState(valores.percentagemPorPonto);
  const [limiteDescontoIndicacaoPct, setLimiteDescontoIndicacaoPct] = useState(valores.limiteDescontoIndicacaoPct);
  const [validadePontosMeses, setValidadePontosMeses] = useState(valores.validadePontosMeses);

  const maxPontosResgate = percentagemPorPonto > 0 ? Math.floor(limiteDescontoIndicacaoPct / percentagemPorPonto) : 0;

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-6 p-6">
      <Mensagens estado={estado} />

      <div className="space-y-2 rounded-2xl bg-[#FAF9F5] p-4 text-sm text-zinc-800 ring-1 ring-zinc-200/80">
        <div className="font-bold text-zinc-900">Como funcionam estas regras na prática</div>
        <p className="text-xs leading-relaxed text-zinc-600">
          • <strong>Fidelização:</strong> Qualquer formando com pelo menos 1 formação anterior no centro tem direito a{" "}
          <strong className="text-zinc-900">{descontoFidelizacaoPct}% de desconto</strong> na inscrição seguinte.
        </p>
        <p className="text-xs leading-relaxed text-zinc-600">
          • <strong>Programa de indicação:</strong> Cada formando indicado que se inscreva gera{" "}
          <strong className="text-zinc-900">{pontosPorIndicacao} pontos</strong> (válidos por{" "}
          <strong className="text-zinc-900">
            {validadePontosMeses} {validadePontosMeses === 1 ? "mês" : "meses"}
          </strong>
          ). Cada ponto vale <strong className="text-zinc-900">{percentagemPorPonto}% de desconto</strong>, até ao limite de{" "}
          <strong className="text-zinc-900">{limiteDescontoIndicacaoPct}% por matrícula</strong> (máximo de {maxPontosResgate} pontos por matrícula).
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-900">Desconto de Fidelização</h3>
        <Field
          label="Desconto para formandos recorrentes (%)"
          htmlFor="fid-desc"
          erro={e.descontoFidelizacaoPct}
          ajuda="0 a 50% (padrão: 5%). Aplicado a quem já fez pelo menos 1 formação anterior."
          className="max-w-xs"
        >
          <Input
            id="fid-desc"
            name="descontoFidelizacaoPct"
            type="number"
            min={0}
            max={50}
            required
            value={descontoFidelizacaoPct}
            onChange={(ev) => setDescontoFidelizacaoPct(Number(ev.target.value) || 0)}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-900">Programa de Indicação (Pontos)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Pontos ganhos por cada indicado matriculado"
            htmlFor="fid-pts"
            erro={e.pontosPorIndicacao}
            ajuda="1 a 100 pontos (padrão: 5 pontos por cada indicado que se matricule)."
          >
            <Input
              id="fid-pts"
              name="pontosPorIndicacao"
              type="number"
              min={1}
              max={100}
              required
              value={pontosPorIndicacao}
              onChange={(ev) => setPontosPorIndicacao(Number(ev.target.value) || 0)}
            />
          </Field>
          <Field
            label="Desconto por ponto (%)"
            htmlFor="fid-pct-pt"
            erro={e.percentagemPorPonto}
            ajuda="1 a 20% por ponto (padrão: 1% por ponto)."
          >
            <Input
              id="fid-pct-pt"
              name="percentagemPorPonto"
              type="number"
              min={1}
              max={20}
              required
              value={percentagemPorPonto}
              onChange={(ev) => setPercentagemPorPonto(Number(ev.target.value) || 0)}
            />
          </Field>
          <Field
            label="Limite máximo de desconto por pontos numa matrícula (%)"
            htmlFor="fid-lim"
            erro={e.limiteDescontoIndicacaoPct}
            ajuda="1 a 50% (padrão: 20% de desconto máximo por resgate numa matrícula)."
          >
            <Input
              id="fid-lim"
              name="limiteDescontoIndicacaoPct"
              type="number"
              min={1}
              max={50}
              required
              value={limiteDescontoIndicacaoPct}
              onChange={(ev) => setLimiteDescontoIndicacaoPct(Number(ev.target.value) || 0)}
            />
          </Field>
          <Field
            label="Validade dos pontos (meses)"
            htmlFor="fid-val"
            erro={e.validadePontosMeses}
            ajuda="1 a 60 meses (padrão: 12 meses a contar da matrícula do indicado)."
          >
            <Input
              id="fid-val"
              name="validadePontosMeses"
              type="number"
              min={1}
              max={60}
              required
              value={validadePontosMeses}
              onChange={(ev) => setValidadePontosMeses(Number(ev.target.value) || 0)}
            />
          </Field>
        </div>
      </section>

      <Button type="submit" disabled={pendente}>
        {pendente ? "A guardar…" : "Guardar regras de fidelização"}
      </Button>
    </form>
  );
}

// ── Modelos de mensagem ──────────────────────────────────────────────────────

export function ModeloEditor({
  tipo,
  acao,
  repor,
  nome,
  descricao,
  variaveis,
  texto: textoInicial,
  padrao,
  ativo,
  personalizado,
  centro,
}: {
  tipo: string;
  acao: Acao;
  repor: Acao;
  nome: string;
  descricao: string;
  variaveis: string[];
  texto: string;
  padrao: string;
  ativo: boolean;
  personalizado: boolean;
  centro: string;
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const [texto, setTexto] = useState(textoInicial);
  const [estadoRepor, setEstadoRepor] = useState<EstadoForm>(undefined);
  const [confirmarRepor, setConfirmarRepor] = useState(false);
  const [aRepor, iniciarRepor] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const exemplo = renderizar(texto, { ...VALORES_EXEMPLO, centro: centro || "Centro de Formação" });

  function inserir(v: string) {
    const el = area.current;
    const marca = `{{${v}}}`;
    if (!el) return setTexto((t) => t + marca);
    const ini = el.selectionStart ?? texto.length;
    const fim = el.selectionEnd ?? texto.length;
    const novo = texto.slice(0, ini) + marca + texto.slice(fim);
    setTexto(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  function reporPadrao() {
    iniciarRepor(async () => {
      const r = await repor(undefined, new FormData());
      setEstadoRepor(r);
      if (r?.ok) setTexto(padrao);
      setConfirmarRepor(false);
    });
  }

  function submeter(ev: FormEvent<HTMLFormElement>) {
    setEstadoRepor(undefined);
    onSubmit(ev);
  }

  return (
    <form ref={ref} onSubmit={submeter} className="grid gap-6 p-6 lg:grid-cols-2">
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 font-bold text-zinc-900">
              <span>{nome}</span>
              {personalizado ? <Badge cor="azul">Personalizado</Badge> : <Badge cor="cinza">Padrão</Badge>}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">{descricao}</p>
          </div>
          <label className="flex items-center gap-2 rounded-full bg-[#FAF9F5] px-3 py-1.5 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200/80">
            <input type="checkbox" name="ativo" defaultChecked={ativo} className="size-4 accent-[#1C1D21]" /> Ativo
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-500">Variáveis dinâmicas (clique para inserir):</p>
          <div className="flex flex-wrap gap-1.5">
            {variaveis.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => inserir(v)}
                className="min-h-8 rounded-full border border-zinc-200 bg-[#FAF9F5] px-2.5 font-mono text-xs font-medium text-zinc-800 transition-colors hover:border-[#1C1D21] hover:bg-[#FBD34D]/35"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>

        <Field label="Texto da mensagem" htmlFor={`modelo-${tipo}`} erro={estado?.erros?.texto} ajuda="Formatação WhatsApp: *negrito*, _itálico_, ~riscado~.">
          <Textarea
            id={`modelo-${tipo}`}
            ref={area}
            name="texto"
            rows={8}
            maxLength={4000}
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            className="font-mono text-xs"
          />
        </Field>

        <Mensagens estado={estado} />
        <Mensagens estado={estadoRepor} />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pendente}>
            {pendente ? "A guardar…" : "Guardar modelo"}
          </Button>
          {(personalizado || texto !== padrao) && (
            <>
              <Button type="button" variante="fantasma" onClick={() => setConfirmarRepor(true)} disabled={aRepor}>
                <RotateCcw className="size-4" aria-hidden /> {aRepor ? "A repor…" : "Repor texto padrão"}
              </Button>
              <ModalConfirmacao
                aberto={confirmarRepor}
                titulo="Repor texto padrão"
                mensagem={`Deseja repor o texto padrão de "${nome}"? O texto personalizado será substituído pelo modelo original.`}
                rotuloConfirmar="Repor texto padrão"
                pendente={aRepor}
                aoCancelar={() => setConfirmarRepor(false)}
                aoConfirmar={reporPadrao}
              />
            </>
          )}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-zinc-600">Pré-visualização no telemóvel</p>
        <BolhaWhatsapp texto={exemplo} hora="09:00" />
        <p className="mt-1.5 text-xs text-zinc-400">Exemplo ilustrativo com dados fictícios.</p>
      </div>
    </form>
  );
}

// ── Utilizadores ─────────────────────────────────────────────────────────────

type OpcaoPerfil = { valor: string; nome: string };

export function NovoUtilizadorForm({ acao, perfis }: { acao: Acao; perfis: OpcaoPerfil[] }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao, { limparAoGuardar: true });
  const e = estado?.erros ?? {};
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4 p-6">
      <Mensagens estado={estado} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="u-nome" erro={e.nome}>
          <Input id="u-nome" name="nome" required maxLength={150} autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor="u-email" erro={e.email}>
          <Input id="u-email" name="email" type="email" required maxLength={150} autoComplete="off" />
        </Field>
        <Field label="Perfil" htmlFor="u-perfil" erro={e.perfil}>
          <Select id="u-perfil" name="perfil" required defaultValue="">
            <option value="" disabled>
              Escolher…
            </option>
            {perfis.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Palavra-passe inicial" htmlFor="u-pass" erro={e.password} ajuda="Mínimo de 8 caracteres.">
          <Input id="u-pass" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? "A criar…" : "Criar utilizador"}
      </Button>
    </form>
  );
}

export function PerfilForm({ acao, perfil, perfis }: { acao: Acao; perfil: string; perfis: OpcaoPerfil[] }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-1">
      <div className="flex gap-2">
        <Select name="perfil" defaultValue={perfil} aria-label="Perfil" className="min-w-40">
          {perfis.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.nome}
            </option>
          ))}
        </Select>
        <Button type="submit" variante="secundario" disabled={pendente}>
          {pendente ? "…" : "Alterar"}
        </Button>
      </div>
      {estado?.erro && <p className="text-xs text-red-600">{estado.erro}</p>}
      {estado?.ok && <p className="text-xs text-emerald-700">{estado.ok}</p>}
    </form>
  );
}

export function PasswordForm({ acao, nome }: { acao: Acao; nome: string }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao, { limparAoGuardar: true });
  return (
    <details className="group">
      <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:underline">
        Redefinir palavra-passe
      </summary>
      <form ref={ref} onSubmit={onSubmit} className="mt-2 space-y-2 rounded-2xl bg-[#FAF9F5] p-3 ring-1 ring-zinc-200/80">
        <Field label={`Nova palavra-passe de ${nome}`} htmlFor={`pw-${nome}`} erro={estado?.erros?.password}>
          <div className="flex gap-2">
            <Input id={`pw-${nome}`} name="password" type="password" required minLength={8} autoComplete="new-password" />
            <Button type="submit" variante="secundario" disabled={pendente}>
              {pendente ? "…" : "Definir"}
            </Button>
          </div>
        </Field>
        {estado?.erro && <p className="text-xs text-red-600">{estado.erro}</p>}
        {estado?.ok && <p className="text-xs text-emerald-700">{estado.ok}</p>}
      </form>
    </details>
  );
}

// ── Dados Bancários e Regra de Certificados ──────────────────────────────────

export function BancariosCertificadosForm({
  acao,
  valores,
}: {
  acao: Acao;
  valores: {
    bancoNome: string;
    iban: string;
    titularConta: string;
    multicaixaExpress: string;
    minAssiduidadeCertificadoPct: number;
  };
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const e = estado?.erros ?? {};

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-6 p-6">
      <Mensagens estado={estado} />

      <section className="space-y-4">
        <h3 className="text-sm font-bold text-zinc-900">
          1. Coordenadas Bancárias e Multicaixa Express (Portal do Formando)
        </h3>
        <p className="text-xs text-zinc-500">
          Estes dados aparecem no Portal do Formando junto das parcelas em aberto para facilitar transferências e envio
          do comprovativo/referência à tesouraria.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Banco" htmlFor="bc-banco" erro={e.bancoNome}>
            <Input
              id="bc-banco"
              name="bancoNome"
              defaultValue={valores.bancoNome}
              placeholder="Ex.: Banco BAI / BFA / Atlântico"
            />
          </Field>
          <Field label="Titular da Conta" htmlFor="bc-titular" erro={e.titularConta}>
            <Input
              id="bc-titular"
              name="titularConta"
              defaultValue={valores.titularConta}
              placeholder="Ex.: Academia Demo Luanda, Lda."
            />
          </Field>
          <Field label="IBAN" htmlFor="bc-iban" erro={e.iban}>
            <Input
              id="bc-iban"
              name="iban"
              defaultValue={valores.iban}
              placeholder="AO06 0040 0000 0000 0000 0000 0"
            />
          </Field>
          <Field
            label="Número Multicaixa Express"
            htmlFor="bc-express"
            erro={e.multicaixaExpress}
            ajuda="Número associado a transferências por telemóvel no Express."
          >
            <Input
              id="bc-express"
              name="multicaixaExpress"
              defaultValue={valores.multicaixaExpress}
              placeholder="+244 923 000 000"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-dotted border-zinc-200 pt-6">
        <h3 className="text-sm font-bold text-zinc-900">
          2. Critério de Emissão de Certificados com QR Code
        </h3>
        <div className="max-w-sm">
          <Field
            label="Assiduidade mínima obrigatória (%)"
            htmlFor="bc-assid"
            erro={e.minAssiduidadeCertificadoPct}
            ajuda="O certificado só é libertado quando a matrícula está Concluída, sem dívida (100% paga) e com assiduidade igual ou superior a esta meta."
          >
            <Input
              id="bc-assid"
              name="minAssiduidadeCertificadoPct"
              type="number"
              min={0}
              max={100}
              required
              defaultValue={valores.minAssiduidadeCertificadoPct}
            />
          </Field>
        </div>
      </section>

      <Button type="submit" disabled={pendente}>
        {pendente ? "A guardar…" : "Guardar dados bancários e certificados"}
      </Button>
    </form>
  );
}

// ── Relatórios Automáticos IA (Claude) ───────────────────────────────────────

export function RelatoriosIaConfigForm({
  acao,
  valores,
}: {
  acao: Acao;
  valores: {
    iaAtiva: boolean;
    temChaveClaudePropria: boolean;
    chaveClaudeMascarada: string;
    temChaveClaudeGlobal: boolean;
    modeloClaude: string;
    relatorioSemanalAtivo: boolean;
    diaSemanaRelatorio: number;
    relatorioMensalAtivo: boolean;
    diaMesRelatorio: number;
    horaRelatorio: number;
    alertasImediatosAtivos: boolean;
    limiarInadimplenciaPct: number;
    canalRelatorio: string;
    destinatariosWhatsappRelatorio: string;
    destinatariosEmailRelatorio: string;
    temChaveEmailPropria: boolean;
    chaveEmailMascarada: string;
    emailRemetente: string;
  };
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const e = estado?.erros ?? {};

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-6 p-6">
      <Mensagens estado={estado} />

      <div className="rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] p-4 text-xs text-zinc-600">
        <strong className="text-[#1C1D21]">Regra de rigor analítico:</strong> Todos os indicadores financeiros,
        conversão, inadimplência, ocupação e risco de desistência são calculados por{" "}
        <strong className="text-[#1C1D21]">SQL na base de dados</strong> isolada deste centro. A IA do Claude recebe os
        valores já calculados apenas para interpretar variações, apontar riscos e recomendar ações nas 4 secções fixas.
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-900">1. Agendamento e Frequência</h3>
          <label className="flex items-center gap-2 rounded-full bg-[#FAF9F5] px-3.5 py-1.5 text-xs font-semibold text-[#1C1D21] ring-1 ring-zinc-200">
            <input
              type="checkbox"
              name="iaAtiva"
              defaultChecked={valores.iaAtiva}
              className="size-4 accent-[#1C1D21]"
            />
            Motor automático ativo
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 space-y-3">
            <label className="flex items-center gap-2 text-xs font-bold text-[#1C1D21]">
              <input
                type="checkbox"
                name="relatorioSemanalAtivo"
                defaultChecked={valores.relatorioSemanalAtivo}
                className="size-4 accent-[#1C1D21]"
              />
              Semanal Comercial &amp; CRM
            </label>
            <Field label="Dia da semana" htmlFor="ia-diasem" erro={e.diaSemanaRelatorio}>
              <Select id="ia-diasem" name="diaSemanaRelatorio" defaultValue={String(valores.diaSemanaRelatorio)}>
                <option value="1">Segunda-feira</option>
                <option value="2">Terça-feira</option>
                <option value="3">Quarta-feira</option>
                <option value="4">Quinta-feira</option>
                <option value="5">Sexta-feira</option>
                <option value="6">Sábado</option>
                <option value="0">Domingo</option>
              </Select>
            </Field>
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 space-y-3">
            <label className="flex items-center gap-2 text-xs font-bold text-[#1C1D21]">
              <input
                type="checkbox"
                name="relatorioMensalAtivo"
                defaultChecked={valores.relatorioMensalAtivo}
                className="size-4 accent-[#1C1D21]"
              />
              Mensal Financeiro
            </label>
            <Field label="Dia do mês (1–28)" htmlFor="ia-diames" erro={e.diaMesRelatorio}>
              <Input
                id="ia-diames"
                name="diaMesRelatorio"
                type="number"
                min={1}
                max={28}
                defaultValue={valores.diaMesRelatorio}
              />
            </Field>
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 space-y-3">
            <label className="flex items-center gap-2 text-xs font-bold text-[#1C1D21]">
              <input
                type="checkbox"
                name="alertasImediatosAtivos"
                defaultChecked={valores.alertasImediatosAtivos}
                className="size-4 accent-[#1C1D21]"
              />
              Alertas Imediatos de Anomalia
            </label>
            <Field
              label="Disparar se inadimplência ≥ (%)"
              htmlFor="ia-limiar"
              erro={e.limiarInadimplenciaPct}
            >
              <Input
                id="ia-limiar"
                name="limiarInadimplenciaPct"
                type="number"
                min={1}
                max={100}
                defaultValue={valores.limiarInadimplenciaPct}
              />
            </Field>
          </div>
        </div>

        <div className="max-w-xs">
          <Field label="Hora preferencial de disparo (Luanda, 0–23h)" htmlFor="ia-hora" erro={e.horaRelatorio}>
            <Input id="ia-hora" name="horaRelatorio" type="number" min={0} max={23} defaultValue={valores.horaRelatorio} />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-dotted border-zinc-200 pt-6">
        <h3 className="text-sm font-bold text-zinc-900">2. Canal de Entrega e Destinatários</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Canal padrão de entrega" htmlFor="ia-canal" erro={e.canalRelatorio}>
            <Select id="ia-canal" name="canalRelatorio" defaultValue={valores.canalRelatorio}>
              <option value="WHATSAPP">WhatsApp (Evolution API) + Guardar no Sistema</option>
              <option value="EMAIL">E-mail HTML + Guardar no Sistema</option>
              <option value="AMBOS">WhatsApp + E-mail + Guardar no Sistema</option>
              <option value="APENAS_SISTEMA">Apenas guardar no Histórico do Sistema</option>
            </Select>
          </Field>
          <Field
            label="Remetente de E-mail (opcional)"
            htmlFor="ia-rem"
            erro={e.emailRemetente}
            ajuda="Ex.: Relatórios Academia <relatorios@seudominio.ao>"
          >
            <Input
              id="ia-rem"
              name="emailRemetente"
              defaultValue={valores.emailRemetente}
              placeholder="Relatórios <onboarding@resend.dev>"
            />
          </Field>
          <Field
            label="Destinatários WhatsApp (um por linha)"
            htmlFor="ia-wa"
            erro={e.destinatariosWhatsappRelatorio}
            ajuda="Se ficar vazio, usa os números da equipa comercial configurados em Automações."
          >
            <Textarea
              id="ia-wa"
              name="destinatariosWhatsappRelatorio"
              rows={3}
              defaultValue={valores.destinatariosWhatsappRelatorio}
              placeholder="+244 923 000 000"
            />
          </Field>
          <Field
            label="Destinatários de E-mail (um por linha)"
            htmlFor="ia-em"
            erro={e.destinatariosEmailRelatorio}
            ajuda="Endereços dos gestores que recebem o relatório formatado."
          >
            <Textarea
              id="ia-em"
              name="destinatariosEmailRelatorio"
              rows={3}
              defaultValue={valores.destinatariosEmailRelatorio}
              placeholder="direcao@academia.ao"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-dotted border-zinc-200 pt-6">
        <h3 className="text-sm font-bold text-zinc-900">3. Credenciais API do Claude (Anthropic) e E-mail (Resend)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Chave API do Claude (Anthropic)"
            htmlFor="ia-claude-key"
            erro={e.anthropicApiKey}
            ajuda={
              valores.temChaveClaudePropria
                ? `Chave cifrada ativa (${valores.chaveClaudeMascarada}). Deixe em branco para manter.`
                : valores.temChaveClaudeGlobal
                  ? "A usar ANTHROPIC_API_KEY global do servidor. Preencha apenas se quiser chave própria."
                  : "Opcional: sem chave API, o sistema usa o motor analítico determinístico estruturado."
            }
          >
            <Input
              id="ia-claude-key"
              name="anthropicApiKey"
              type="password"
              autoComplete="new-password"
              placeholder="sk-ant-api03-..."
            />
            {valores.temChaveClaudePropria && (
              <label className="mt-1.5 flex items-center gap-2 text-xs text-zinc-600">
                <input type="checkbox" name="removerAnthropicApiKey" className="size-3.5 accent-[#1C1D21]" />
                Remover chave própria guardada
              </label>
            )}
          </Field>

          <Field label="Modelo Claude" htmlFor="ia-modelo" erro={e.modeloClaude}>
            <Select id="ia-modelo" name="modeloClaude" defaultValue={valores.modeloClaude}>
              <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Recomendado)</option>
              <option value="claude-3-7-sonnet-latest">Claude 3.7 Sonnet</option>
              <option value="claude-3-5-haiku-latest">Claude 3.5 Haiku (Rápido / Económico)</option>
            </Select>
          </Field>

          <Field
            label="Chave API Resend (para envio por E-mail)"
            htmlFor="ia-resend-key"
            erro={e.resendApiKey}
            ajuda={
              valores.temChaveEmailPropria
                ? `Chave cifrada ativa (${valores.chaveEmailMascarada}). Deixe em branco para manter.`
                : "Opcional se RESEND_API_KEY já estiver definida na Vercel ou se usar apenas WhatsApp."
            }
          >
            <Input
              id="ia-resend-key"
              name="resendApiKey"
              type="password"
              autoComplete="new-password"
              placeholder="re_..."
            />
            {valores.temChaveEmailPropria && (
              <label className="mt-1.5 flex items-center gap-2 text-xs text-zinc-600">
                <input type="checkbox" name="removerResendApiKey" className="size-3.5 accent-[#1C1D21]" />
                Remover chave de e-mail guardada
              </label>
            )}
          </Field>
        </div>
      </section>

      <Button type="submit" disabled={pendente}>
        {pendente ? "A guardar…" : "Guardar configurações de Relatórios IA"}
      </Button>
    </form>
  );
}
