import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Equipo de agentes · Orquestador, Develop y Testing",
    template: "%s · Equipo de agentes",
  },
  description:
    "Tres agentes de IA trabajan juntos sobre una web: el Orquestador reparte tareas, Develop las programa y Testing las comprueba hasta que todo pasa.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-zinc-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-zinc-500 sm:px-6">
            Next.js · Vercel Workflows · Neon Postgres · Claude. Construido con Claude Code.
          </div>
        </footer>
      </body>
    </html>
  );
}
