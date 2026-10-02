import { cn } from "./cn";

export interface Aba<T extends string> {
  id: T;
  rotulo: string;
  contador?: number;
}

export function Tabs<T extends string>({ abas, ativa, onChange, className }: { abas: Aba<T>[]; ativa: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-borda", className)}>
      {abas.map((a) => (
        <button
          key={a.id}
          role="tab"
          aria-selected={a.id === ativa}
          onClick={() => onChange(a.id)}
          className={cn(
            "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
            a.id === ativa ? "border-primaria-800 font-semibold text-primaria-800" : "border-transparent text-texto-suave hover:text-texto",
          )}
        >
          {a.rotulo}
          {a.contador !== undefined && (
            <span className={cn("rounded-full px-1.5 text-[11px] tabular", a.id === ativa ? "bg-primaria-100 text-primaria-800" : "bg-fundo text-texto-suave")}>{a.contador}</span>
          )}
        </button>
      ))}
    </div>
  );
}
