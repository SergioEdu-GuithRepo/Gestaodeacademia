"use client";

import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Input, Select } from "@/components/ui";
import { guardarSessao, guardarTurma, type EstadoSessaoForm } from "./actions";

type Opcao = { id: string; nome: string };

export function TurmaForm({
  formacoes,
  turma,
}: {
  formacoes: Opcao[];
  turma?: { id: string; formacaoId: string; codigo: string; vagas: number | null; preco: string; estado: string };
}) {
  const { estado, pendente, onSubmit } = useFormAcao(guardarTurma);
  const e = estado?.erros ?? {};
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {turma && <input type="hidden" name="id" value={turma.id} />}
      {estado?.erro && <div className="sm:col-span-2"><Alerta>{estado.erro}</Alerta></div>}
      <Field label="Formação" htmlFor="formacaoId" erro={e.formacaoId} className="sm:col-span-2">
        <Select id="formacaoId" name="formacaoId" defaultValue={turma?.formacaoId ?? ""} required>
          <option value="" disabled>Escolher…</option>
          {formacoes.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </Select>
      </Field>
      <Field label="Código da turma" htmlFor="codigo" erro={e.codigo} ajuda="Identificador curto e único, ex.: LID-02">
        <Input id="codigo" name="codigo" defaultValue={turma?.codigo} required maxLength={30} className="uppercase" />
      </Field>
      <Field label="Vagas" htmlFor="vagas" erro={e.vagas}>
        <Input id="vagas" name="vagas" type="number" min={1} max={500} defaultValue={turma?.vagas ?? ""} inputMode="numeric" />
      </Field>
      <Field label="Preço desta turma (Kz)" htmlFor="preco" erro={e.preco} ajuda="Deixe vazio para usar o preço da formação">
        <Input id="preco" name="preco" defaultValue={turma?.preco} inputMode="decimal" placeholder="ex.: 150 000" />
      </Field>
      <Field label="Estado" htmlFor="estado">
        <Select id="estado" name="estado" defaultValue={turma?.estado ?? "PLANEADA"}>
          <option value="PLANEADA">Planeada</option>
          <option value="EM_CURSO">Em curso</option>
          <option value="CONCLUIDA">Concluída</option>
          <option value="CANCELADA">Cancelada</option>
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pendente}>{pendente ? "A gravar…" : "Gravar turma"}</Button>
      </div>
    </form>
  );
}

export function SessaoForm({
  turmaId,
  formadores,
  salas,
  sessao,
}: {
  turmaId: string;
  formadores: Opcao[];
  salas: (Opcao & { capacidade: number | null })[];
  sessao?: { id: string; data: string; horaInicio: string; horaFim: string; formadorId: string; salaId: string };
}) {
  const { estado, pendente, ref, onSubmit } = useFormAcao<EstadoSessaoForm>(guardarSessao, { limparAoGuardar: !sessao });
  const e = estado?.erros ?? {};

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="turmaId" value={turmaId} />
      {sessao && <input type="hidden" name="sessaoId" value={sessao.id} />}

      {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      {estado?.erro && (
        <Alerta tipo="erro">
          <div className="font-semibold">{estado.erro}</div>
          {estado.conflitos && estado.conflitos.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-zinc-600">
              {estado.conflitos.map((c, i) => (
                <li key={i}>
                  <span className="font-semibold text-[#1C1D21]">{rotulo(c.tipo)}:</span> {c.mensagem}
                </li>
              ))}
            </ul>
          )}
        </Alerta>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Data" htmlFor="data" erro={e.data} className="col-span-2 sm:col-span-1">
          <Input id="data" name="data" type="date" required defaultValue={sessao?.data} />
        </Field>
        <Field label="Início" htmlFor="horaInicio" erro={e.horaInicio}>
          <Input id="horaInicio" name="horaInicio" type="time" required step={300} defaultValue={sessao?.horaInicio ?? "18:00"} />
        </Field>
        <Field label="Fim" htmlFor="horaFim" erro={e.horaFim}>
          <Input id="horaFim" name="horaFim" type="time" required step={300} defaultValue={sessao?.horaFim ?? "21:00"} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Formador" htmlFor="formadorId" erro={e.formadorId}>
          <Select id="formadorId" name="formadorId" required defaultValue={sessao?.formadorId ?? ""}>
            <option value="" disabled>Escolher…</option>
            {formadores.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sala" htmlFor="salaId" erro={e.salaId}>
          <Select id="salaId" name="salaId" required defaultValue={sessao?.salaId ?? ""}>
            <option value="" disabled>Escolher…</option>
            {salas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
                {s.capacidade ? ` (${s.capacidade} lugares)` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {!sessao && (
        <Field label="Repetir semanalmente" htmlFor="repetirSemanas" ajuda="Cria a mesma sessão durante N semanas seguidas. Se alguma estiver em conflito, nenhuma é criada.">
          <Select id="repetirSemanas" name="repetirSemanas" defaultValue="1">
            <option value="1">Só esta sessão</option>
            {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>{n} semanas</option>
            ))}
          </Select>
        </Field>
      )}
      <Button type="submit" disabled={pendente}>
        {pendente ? "A validar agenda…" : sessao ? "Gravar alterações" : "Agendar sessão"}
      </Button>
    </form>
  );
}

function rotulo(tipo: string) {
  return tipo === "TURMA" ? "Turma" : tipo === "FORMADOR" ? "Formador" : "Sala";
}
