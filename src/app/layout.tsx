import type { Metadata, Viewport } from "next";
import { BarraProgressoNavegacao } from "@/components/barra-progresso";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Gestão de Formação", template: "%s · Gestão de Formação" },
  description: "Plataforma de gestão para centros de formação",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1c1d21",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-AO">
      <body className="min-h-dvh font-sans">
        <BarraProgressoNavegacao />
        {children}
      </body>
    </html>
  );
}
