import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "./cn";

export interface Coluna<T> {
  id: string;
  titulo: string;
  render: (linha: T) => ReactNode;
  ordenavel?: boolean;
  alinhamento?: "esquerda" | "direita" | "centro";
  largura?: string;
  className?: string;
}

interface Props<T> {
  colunas: Coluna<T>[];
  linhas: T[];
  chave: (l: T) => string;
  ordenacao?: { coluna: string; direcao: "asc" | "desc" };
  onOrdenar?: (coluna: string) => void;
  onLinha?: (l: T) => void;
  vazio?: ReactNode;
  carregando?: boolean;
  densa?: boolean;
  /** Classe de largura mínima (ex.: "min-w-[1200px]") para tabelas extensas com rolagem horizontal. */
  minLargura?: string;
}

/** Tabela padrão: cabeçalho fixo, ordenação, linhas clicáveis, números tabulares. */
export function Tabela<T>({ colunas, linhas, chave, ordenacao, onOrdenar, onLinha, vazio, carregando, densa, minLargura }: Props<T>) {
  const alinh = (a?: Coluna<T>["alinhamento"]) => (a === "direita" ? "text-right" : a === "centro" ? "text-center" : "text-left");
  return (
    <div className="relative overflow-x-auto">
      <table className={cn("w-full border-collapse", densa ? "text-[13px]" : "text-sm", minLargura)}>
        <thead className="sticky top-0 z-10 bg-fundo">
          <tr>
            {colunas.map((c) => {
              const ativa = ordenacao?.coluna === c.id;
              return (
                <th key={c.id} style={{ width: c.largura }} className={cn("border-b border-borda py-2", densa ? "px-2" : "px-3", " text-xs font-semibold tracking-wide text-texto-suave uppercase", alinh(c.alinhamento))}>
                  {c.ordenavel && onOrdenar ? (
                    <button onClick={() => onOrdenar(c.id)} className={cn("inline-flex items-center gap-1 uppercase hover:text-texto", ativa && "text-primaria-800")}>
                      {c.titulo}
                      {ativa ? ordenacao!.direcao === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} className="opacity-40" />}
                    </button>
                  ) : (
                    c.titulo
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className={cn(carregando && "opacity-50")}>
          {linhas.map((l) => (
            <tr key={chave(l)} onClick={onLinha ? () => onLinha(l) : undefined} className={cn("border-b border-borda last:border-0", onLinha && "cursor-pointer hover:bg-primaria-50/50")}>
              {colunas.map((c) => (
                <td key={c.id} className={cn("align-middle", densa ? "px-2 py-1.5" : "px-3 py-2.5", alinh(c.alinhamento), c.className)}>
                  {c.render(l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!carregando && linhas.length === 0 && <div className="py-12 text-center text-sm text-texto-suave">{vazio ?? "Nenhum registro encontrado."}</div>}
    </div>
  );
}

export function Paginacao({ pagina, total, tamanho, onPagina }: { pagina: number; total: number; tamanho: number; onPagina: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  const de = total === 0 ? 0 : pagina * tamanho + 1;
  const ate = Math.min(total, (pagina + 1) * tamanho);
  return (
    <div className="flex items-center justify-between border-t border-borda px-4 py-2.5 text-xs text-texto-suave">
      <span className="tabular">
        {de}–{ate} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button disabled={pagina === 0} onClick={() => onPagina(pagina - 1)} className="rounded px-2 py-1 hover:bg-fundo disabled:opacity-40">
          Anterior
        </button>
        <span className="px-2 tabular">
          {pagina + 1} / {paginas}
        </span>
        <button disabled={pagina >= paginas - 1} onClick={() => onPagina(pagina + 1)} className="rounded px-2 py-1 hover:bg-fundo disabled:opacity-40">
          Próxima
        </button>
      </div>
    </div>
  );
}
