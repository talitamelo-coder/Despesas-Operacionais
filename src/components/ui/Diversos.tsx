import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";
import { Card } from "./Card";

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-texto-suave">
      <Loader2 size={16} className="animate-spin" /> {texto}
    </div>
  );
}

export function Vazio({ titulo, descricao, acao, icone }: { titulo: string; descricao?: string; acao?: ReactNode; icone?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icone && <div className="text-texto-fraco">{icone}</div>}
      <p className="text-sm font-medium text-texto">{titulo}</p>
      {descricao && <p className="max-w-md text-xs text-texto-suave">{descricao}</p>}
      {acao}
    </div>
  );
}

export function Kpi({ rotulo, valor, detalhe, icone, tom = "neutro", onClick }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; icone?: ReactNode; tom?: "neutro" | "alerta" | "critico" | "sucesso"; onClick?: () => void }) {
  const cor = { neutro: "text-primaria-800 bg-primaria-50", alerta: "text-alerta-600 bg-alerta-50", critico: "text-critico-600 bg-critico-50", sucesso: "text-sucesso-600 bg-sucesso-50" }[tom];
  return (
    <Card className={cn("p-4", onClick && "cursor-pointer transition-shadow hover:shadow-md")}>
      <div onClick={onClick} className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-texto-suave">{rotulo}</p>
          <p className="mt-1.5 text-2xl font-semibold text-texto tabular">{valor}</p>
          {detalhe && <p className="mt-1 text-xs text-texto-suave">{detalhe}</p>}
        </div>
        {icone && <span className={cn("rounded-lg p-2", cor)}>{icone}</span>}
      </div>
    </Card>
  );
}

export function Aviso({ tom = "info", titulo, children, icone }: { tom?: "info" | "alerta" | "critico" | "sucesso"; titulo?: string; children?: ReactNode; icone?: ReactNode }) {
  const cls = { info: "bg-info-50 text-info-600 border-info-50", alerta: "bg-alerta-50 text-alerta-600 border-alerta-50", critico: "bg-critico-50 text-critico-600 border-critico-50", sucesso: "bg-sucesso-50 text-sucesso-600 border-sucesso-50" }[tom];
  return (
    <div className={cn("flex gap-2.5 rounded-md border px-3 py-2.5 text-sm", cls)}>
      {icone && <span className="mt-0.5 shrink-0">{icone}</span>}
      <div className="min-w-0">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className="text-[13px] opacity-90">{children}</div>}
      </div>
    </div>
  );
}

/** Linha do tempo vertical. */
export function Timeline({ itens }: { itens: { id: string; titulo: ReactNode; quando: string; quem?: string }[] }) {
  return (
    <ol className="relative ml-2 border-l border-borda">
      {itens.map((i) => (
        <li key={i.id} className="mb-4 ml-4 last:mb-0">
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-superficie bg-primaria-500" />
          <p className="text-sm text-texto">{i.titulo}</p>
          <p className="text-xs text-texto-fraco">
            {i.quando}
            {i.quem && ` · ${i.quem}`}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Indicador de etapas do processo. */
export function Etapas({ etapas, atual, suspenso }: { etapas: string[]; atual: number; suspenso?: boolean }) {
  return (
    <ol className="flex w-full items-start overflow-x-auto pb-1">
      {etapas.map((e, i) => {
        const feita = i < atual;
        const ativa = i === atual;
        return (
          <li key={e} className="flex min-w-[96px] flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : feita || ativa ? "bg-primaria-500" : "bg-borda")} />
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  feita && "bg-primaria-500 text-white",
                  ativa && (suspenso ? "bg-alerta-600 text-white" : "bg-primaria-800 text-white ring-4 ring-primaria-100"),
                  !feita && !ativa && "bg-fundo text-texto-fraco border border-borda",
                )}
              >
                {i + 1}
              </span>
              <span className={cn("h-0.5 flex-1", i === etapas.length - 1 ? "bg-transparent" : feita ? "bg-primaria-500" : "bg-borda")} />
            </div>
            <span className={cn("mt-1.5 px-1 text-[11px] leading-tight", ativa ? "font-semibold text-texto" : "text-texto-suave")}>{e}</span>
          </li>
        );
      })}
    </ol>
  );
}
