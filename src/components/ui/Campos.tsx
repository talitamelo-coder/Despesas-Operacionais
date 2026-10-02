import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { OrigemDado } from "@/domain/types";
import { cn } from "./cn";
import { OrigemTag } from "./status";

const BASE =
  "w-full rounded-md border border-borda-forte bg-superficie px-3 text-sm text-texto placeholder:text-texto-fraco focus:border-primaria-500 focus:outline-none focus:ring-2 focus:ring-primaria-100 disabled:bg-fundo disabled:text-texto-suave";

interface CampoBase {
  rotulo: string;
  obrigatorio?: boolean;
  ajuda?: ReactNode;
  erro?: string;
  origem?: OrigemDado;
  className?: string;
}

export function Rotulo({ htmlFor, rotulo, obrigatorio, origem }: { htmlFor?: string; rotulo: string; obrigatorio?: boolean; origem?: OrigemDado }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex flex-wrap items-center gap-y-0.5 text-xs font-medium text-texto-suave">
      {rotulo}
      {obrigatorio && <span className="ml-0.5 text-critico-600">*</span>}
      <OrigemTag origem={origem} />
    </label>
  );
}

function Rodape({ ajuda, erro }: { ajuda?: ReactNode; erro?: string }) {
  if (erro) return <p className="mt-1 text-xs text-critico-600">{erro}</p>;
  if (ajuda) return <p className="mt-1 text-xs text-texto-fraco">{ajuda}</p>;
  return null;
}

export function Input({ rotulo, obrigatorio, ajuda, erro, origem, className, ...rest }: CampoBase & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      <Rotulo htmlFor={id} rotulo={rotulo} obrigatorio={obrigatorio} origem={origem} />
      <input id={id} className={cn(BASE, "h-9", erro && "border-critico-600")} {...rest} />
      <Rodape ajuda={ajuda} erro={erro} />
    </div>
  );
}

/** Campo numérico que aceita vazio (undefined). */
export function InputNumero({
  valor,
  onValor,
  ...rest
}: CampoBase & { valor?: number; onValor: (v: number | undefined) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <Input type="number" step="any" value={valor ?? ""} onChange={(e) => onValor(e.target.value === "" ? undefined : Number(e.target.value))} {...rest} />;
}

export interface OpcaoSelect {
  valor: string;
  rotulo: string;
}

export function Select({
  rotulo,
  obrigatorio,
  ajuda,
  erro,
  origem,
  className,
  opcoes,
  vazio = "Selecione…",
  ...rest
}: CampoBase & SelectHTMLAttributes<HTMLSelectElement> & { opcoes: OpcaoSelect[]; vazio?: string | false }) {
  const id = useId();
  return (
    <div className={className}>
      <Rotulo htmlFor={id} rotulo={rotulo} obrigatorio={obrigatorio} origem={origem} />
      <select id={id} className={cn(BASE, "h-9 pr-8", erro && "border-critico-600")} {...rest}>
        {vazio !== false && <option value="">{vazio}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <Rodape ajuda={ajuda} erro={erro} />
    </div>
  );
}

export function Textarea({ rotulo, obrigatorio, ajuda, erro, origem, className, ...rest }: CampoBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className={className}>
      <Rotulo htmlFor={id} rotulo={rotulo} obrigatorio={obrigatorio} origem={origem} />
      <textarea id={id} rows={3} className={cn(BASE, "py-2", erro && "border-critico-600")} {...rest} />
      <Rodape ajuda={ajuda} erro={erro} />
    </div>
  );
}

export function Toggle({ rotulo, checked, onChange, disabled, ajuda }: { rotulo: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; ajuda?: string }) {
  return (
    <label className={cn("flex items-start gap-2.5 text-sm", disabled ? "opacity-60" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-primaria-800" : "bg-borda-forte")}
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <span>
        <span className="text-texto">{rotulo}</span>
        {ajuda && <span className="block text-xs text-texto-fraco">{ajuda}</span>}
      </span>
    </label>
  );
}

/** Valor somente leitura (calculado/herdado) — não oferece campo para digitar o que o sistema já sabe. */
export function Valor({ rotulo, children, origem, className }: { rotulo: string; children: ReactNode; origem?: OrigemDado; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-0.5 flex flex-wrap items-center gap-y-0.5 text-xs text-texto-suave">
        {rotulo}
        <OrigemTag origem={origem} />
      </div>
      <div className="text-sm font-medium text-texto tabular">{children ?? "—"}</div>
    </div>
  );
}

export function GradeValores({ children, colunas = 3 }: { children: ReactNode; colunas?: 2 | 3 | 4 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[colunas];
  return <div className={cn("grid grid-cols-1 gap-x-6 gap-y-4", c)}>{children}</div>;
}
