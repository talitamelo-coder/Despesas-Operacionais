import type { ReactNode } from "react";
import { cn } from "./cn";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-[var(--radius-cartao)] border border-borda bg-superficie shadow-[var(--shadow-cartao)]", className)}>{children}</section>;
}

export function CardHeader({ titulo, subtitulo, acoes, icone }: { titulo: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode; icone?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-borda px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {icone && <span className="text-primaria-700">{icone}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-texto">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-texto-suave">{subtitulo}</p>}
        </div>
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </header>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("p-4", className)}>{children}</div>;
}
