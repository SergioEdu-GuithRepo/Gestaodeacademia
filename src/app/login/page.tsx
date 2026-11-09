import { redirect } from "next/navigation";
import { LoginShowcase } from "@/components/login-showcase";
import { Card } from "@/components/ui";
import { utilizadorAtual } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await utilizadorAtual()) redirect("/painel");
  return (
    <main className="grid min-h-dvh bg-[#F5F4EF] p-4 sm:p-6 lg:grid-cols-[1.12fr_0.88fr] lg:gap-8 lg:p-6">
      <div className="order-2 lg:order-1">
        <LoginShowcase />
      </div>

      <div className="order-1 flex items-center justify-center py-8 lg:order-2 lg:py-0">
        <div className="anim-enter w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-3.5 flex size-13 items-center justify-center rounded-2xl bg-[#1C1D21] text-base font-extrabold tracking-wider text-[#FBD34D] shadow-sm">
              GA
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1C1D21]">Gestão de Academia</h1>
          </div>

          <Card className="p-6">
            <LoginForm />
          </Card>
        </div>
      </div>
    </main>
  );
}
