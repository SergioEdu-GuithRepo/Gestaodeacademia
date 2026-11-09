import { LinkButton } from "@/components/ui";

export default function SemPermissao() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Sem permissão</h1>
      <p className="max-w-sm text-sm text-slate-500">
        O seu perfil não tem acesso a esta área. Se precisar de acesso, fale com o administrador do centro.
      </p>
      <LinkButton href="/painel" variante="secundario">
        Voltar ao painel
      </LinkButton>
    </main>
  );
}
