"use client";

import { Check, Copy, KeyRound, Plus, Sparkles } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Input, Select } from "@/components/ui";
import { gerarSlugCentro } from "@/lib/superadmin-cliente";
import type { EstadoForm } from "@/lib/utils";
import type { CredenciaisCentroCriado, EstadoCriarCentro } from "./actions";

type Acao = (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;
type AcaoCriarCentro = (prev: EstadoCriarCentro, fd: FormData) => Promise<EstadoCriarCentro>;

function gerarPasswordSugerida(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 10; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

export function LoginSuperAdminForm({ acao }: { acao: Acao }) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4 p-6">
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      <Field label="Chave mestra da plataforma" htmlFor="sa-chave">
        <Input
          id="sa-chave"
          name="chave"
          type="password"
          required
          autoFocus
          placeholder="Introduza a chave Super-Admin"
        />
      </Field>
      <Button type="submit" disabled={pendente} className="w-full">
        <KeyRound className="size-4 text-[#FBD34D]" aria-hidden />
        {pendente ? "A verificar…" : "Entrar no Painel da Plataforma"}
      </Button>
    </form>
  );
}

function CartaoCredenciais({ cred, urlBaseApp }: { cred: CredenciaisCentroCriado; urlBaseApp: string }) {
  const [copiado, setCopiado] = useState(false);
  const linkLogin = `${urlBaseApp}/login`;
  const linkPublico = `${urlBaseApp}/p/${cred.slug}`;
  const mensagemWhatsapp = [
    `Olá, *${cred.nomeAdmin}*! Bem-vindo(a) à plataforma de gestão do centro *${cred.nomeCentro}*.`,
    ``,
    `🔐 *Acesso ao Sistema (Gestão):*`,
    `Link: ${linkLogin}`,
    `Email: ${cred.emailAdmin}`,
    `Palavra-passe inicial: ${cred.passwordInicial}`,
    ``,
    `🌐 *Página Pública de Inscrições (Captação de Leads):*`,
    `${linkPublico}`,
    ``,
    `Assim que entrar, pode criar os restantes utilizadores da sua equipa em *Equipa* e associar o WhatsApp do centro por QR Code em *Configurações*.`,
  ].join("\n");

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[#1C1D21]">
          Credenciais prontas para entregar — {cred.nomeCentro}
        </h4>
        <Button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(mensagemWhatsapp);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2500);
            } catch {
              /* fallback */
            }
          }}
        >
          {copiado ? <Check className="size-4 text-[#FBD34D]" aria-hidden /> : <Copy className="size-4 text-[#FBD34D]" aria-hidden />}
          {copiado ? "Copiado para o WhatsApp!" : "Copiar mensagem com credenciais"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-2xl border border-zinc-200/80 bg-white p-4 font-mono text-xs whitespace-pre-wrap text-zinc-800">
        {mensagemWhatsapp}
      </pre>
    </div>
  );
}

export function NovoCentroForm({ acao, urlBaseApp }: { acao: AcaoCriarCentro; urlBaseApp: string }) {
  const [estado, submeter, pendente] = useActionState(acao, undefined);
  const [nomeCentro, setNomeCentro] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [passwordAdmin, setPasswordAdmin] = useState(() => gerarPasswordSugerida());

  const e = estado?.erros ?? {};

  return (
    <div className="space-y-4 p-6">
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      {estado?.credenciais && <CartaoCredenciais cred={estado.credenciais} urlBaseApp={urlBaseApp} />}

      <form action={submeter} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do Centro de Formação" htmlFor="nc-nome" erro={e.nomeCentro}>
            <Input
              id="nc-nome"
              name="nomeCentro"
              required
              value={nomeCentro}
              onChange={(ev) => {
                const v = ev.target.value;
                setNomeCentro(v);
                if (!slugEditado) setSlug(gerarSlugCentro(v));
              }}
              placeholder="Ex.: Centro Formar Mais Luanda"
            />
          </Field>

          <Field
            label="Identificador público (endereço /p/...)"
            htmlFor="nc-slug"
            erro={e.slug}
            ajuda={`Página pública: ${urlBaseApp}/p/${slug || "slug-do-centro"}`}
          >
            <Input
              id="nc-slug"
              name="slug"
              required
              value={slug}
              onChange={(ev) => {
                setSlugEditado(true);
                setSlug(gerarSlugCentro(ev.target.value));
              }}
              placeholder="formarmais"
              className="font-mono"
            />
          </Field>

          <Field label="Nome do Administrador do centro" htmlFor="nc-admin" erro={e.nomeAdmin}>
            <Input
              id="nc-admin"
              name="nomeAdmin"
              required
              placeholder="Ex.: Direção Formar Mais"
            />
          </Field>

          <Field label="Email de login do Administrador" htmlFor="nc-email" erro={e.emailAdmin}>
            <Input
              id="nc-email"
              name="emailAdmin"
              type="email"
              required
              placeholder="direcao@formarmais.ao"
            />
          </Field>

          <Field
            label="Palavra-passe inicial"
            htmlFor="nc-pass"
            erro={e.passwordAdmin}
            ajuda="Será mostrada no cartão de credenciais para enviar ao cliente."
          >
            <div className="flex gap-2">
              <Input
                id="nc-pass"
                name="passwordAdmin"
                type="text"
                required
                minLength={8}
                value={passwordAdmin}
                onChange={(ev) => setPasswordAdmin(ev.target.value)}
                className="font-mono"
              />
              <Button
                type="button"
                variante="secundario"
                onClick={() => setPasswordAdmin(gerarPasswordSugerida())}
                title="Gerar outra palavra-passe"
              >
                <Sparkles className="size-4" aria-hidden /> Gerar
              </Button>
            </div>
          </Field>

          <Field
            label="Modo inicial do WhatsApp"
            htmlFor="nc-wa"
            ajuda="Pode mudar para WhatsApp Ativo assim que o centro associar o telemóvel."
          >
            <Select id="nc-wa" name="whatsappModo" defaultValue="SIMULACAO">
              <option value="SIMULACAO">Modo de Teste (recomendado para começar)</option>
              <option value="EVOLUTION">WhatsApp Ativo</option>
              <option value="DESATIVADO">Desativado</option>
            </Select>
          </Field>
        </div>

        <Button type="submit" disabled={pendente}>
          <Plus className="size-4 text-[#FBD34D]" aria-hidden />
          {pendente ? "A criar centro…" : "Criar centro e gerar credenciais"}
        </Button>
      </form>
    </div>
  );
}

export function RedefinirAdminForm({
  acao,
  emailPadrao,
  nomePadrao,
}: {
  acao: Acao;
  emailPadrao: string;
  nomePadrao: string;
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);
  const [senha, setSenha] = useState(() => gerarPasswordSugerida());

  return (
    <details className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-[#1C1D21] select-none">
        Redefinir palavra-passe ou criar Administrador
      </summary>
      <form ref={ref} onSubmit={onSubmit} className="mt-3 space-y-3 border-t border-dotted border-zinc-200 pt-3">
        {estado?.erro && <Alerta>{estado.erro}</Alerta>}
        {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nome" htmlFor={`ra-nome-${emailPadrao}`}>
            <Input id={`ra-nome-${emailPadrao}`} name="nome" defaultValue={nomePadrao || "Administrador"} required />
          </Field>
          <Field label="Email do Admin" htmlFor={`ra-email-${emailPadrao}`} erro={estado?.erros?.email}>
            <Input id={`ra-email-${emailPadrao}`} name="email" type="email" defaultValue={emailPadrao} required />
          </Field>
          <Field label="Nova palavra-passe" htmlFor={`ra-pass-${emailPadrao}`} erro={estado?.erros?.password}>
            <div className="flex gap-1.5">
              <Input
                id={`ra-pass-${emailPadrao}`}
                name="password"
                type="text"
                required
                minLength={8}
                value={senha}
                onChange={(ev) => setSenha(ev.target.value)}
                className="font-mono"
              />
              <Button type="button" variante="secundario" onClick={() => setSenha(gerarPasswordSugerida())}>
                Gerar
              </Button>
            </div>
          </Field>
        </div>
        <Button type="submit" variante="secundario" disabled={pendente}>
          {pendente ? "A guardar…" : "Guardar credenciais do Admin"}
        </Button>
      </form>
    </details>
  );
}

export function ConfigWhatsappCentroSuperAdminForm({
  acao,
  modoAtual,
  instanciaAtual,
  urlAtual,
  chaveMascarada,
  temGlobal,
  urlWebhook,
}: {
  acao: Acao;
  modoAtual: "DESATIVADO" | "SIMULACAO" | "EVOLUTION";
  instanciaAtual: string;
  urlAtual: string;
  chaveMascarada: string;
  temGlobal: boolean;
  urlWebhook?: string;
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao(acao);

  return (
    <details className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-[#1C1D21] select-none">
        Configuração do Canal WhatsApp deste centro
      </summary>
      <form ref={ref} onSubmit={onSubmit} className="mt-3 space-y-3 border-t border-dotted border-zinc-200 pt-3">
        {estado?.erro && <Alerta>{estado.erro}</Alerta>}
        {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Modo WhatsApp" htmlFor={`wa-modo-${instanciaAtual}`}>
            <Select id={`wa-modo-${instanciaAtual}`} name="whatsappModo" defaultValue={modoAtual}>
              <option value="SIMULACAO">Modo de Teste</option>
              <option value="EVOLUTION">WhatsApp Ativo</option>
              <option value="DESATIVADO">Desativado</option>
            </Select>
          </Field>
          <Field label="Identificador de sessão" htmlFor={`wa-inst-${instanciaAtual}`}>
            <Input
              id={`wa-inst-${instanciaAtual}`}
              name="evolutionInstancia"
              defaultValue={instanciaAtual}
              className="font-mono"
            />
          </Field>
          <Field
            label="URL próprio do serviço (opcional)"
            htmlFor={`wa-url-${instanciaAtual}`}
            ajuda={temGlobal ? "Em branco = usa o serviço global da plataforma." : "Indique o endereço do servidor de envio."}
          >
            <Input
              id={`wa-url-${instanciaAtual}`}
              name="evolutionUrl"
              type="url"
              defaultValue={urlAtual}
              placeholder={temGlobal ? "Global da plataforma" : "https://..."}
            />
          </Field>
          <Field
            label="Chave de acesso própria (opcional)"
            htmlFor={`wa-key-${instanciaAtual}`}
            ajuda={chaveMascarada ? `Chave própria guardada (${chaveMascarada}).` : "Em branco = usa a chave global."}
          >
            <Input
              id={`wa-key-${instanciaAtual}`}
              name="evolutionApiKey"
              type="password"
              placeholder={chaveMascarada || "Usar chave global"}
            />
          </Field>
        </div>
        {chaveMascarada && (
          <label className="flex items-center gap-2 text-xs text-zinc-700">
            <input type="checkbox" name="removerApiKey" className="size-4 accent-[#1C1D21]" /> Remover chave própria e usar a global
          </label>
        )}
        {urlWebhook && (
          <div className="rounded-xl border border-zinc-200/80 bg-white p-2.5 text-xs text-zinc-600">
            <span className="font-medium text-[#1C1D21]">Webhook automático deste centro:</span>{" "}
            <code className="font-mono break-all text-zinc-800">{urlWebhook}</code>
          </div>
        )}
        <Button type="submit" variante="secundario" disabled={pendente}>
          {pendente ? "A guardar…" : "Guardar configuração WhatsApp"}
        </Button>
      </form>
    </details>
  );
}
