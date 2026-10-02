import { Plus, Trash2 } from "lucide-react";
import { useOpcoes } from "@/app/contexto";
import { Button } from "@/components/ui/Button";
import { InputNumero, Select, Textarea, Valor } from "@/components/ui/Campos";
import { Aviso } from "@/components/ui/Diversos";
import { baselineAjustado, composicaoSaving, savingAnual, validarSaving } from "@/domain/rules/saving";
import { formatarMoeda } from "@/domain/formatacao";
import type { OrigemOportunidade, OrigemSaving, Saving, TipoBaseline } from "@/domain/types";

/** Editor de saving — só habilitado para Suprimentos/Administrador (validado também no serviço). */
export function SavingEditor({
  saving,
  onChange,
  valorAnterior,
  reajustePrevisto,
  bloqueado,
}: {
  saving: Saving;
  onChange: (s: Saving) => void;
  valorAnterior?: number;
  reajustePrevisto?: number;
  bloqueado?: boolean;
}) {
  const op = useOpcoes();
  const erros = validarSaving(saving);
  const comp = composicaoSaving(saving);
  const set = (p: Partial<Saving>) => onChange({ ...saving, ...p });
  const usadas = new Set(saving.componentes.map((c) => c.origem));

  return (
    <div className="space-y-4">
      {bloqueado && <Aviso tom="info">Saving e baseline só podem ser alterados por Suprimentos ou Administrador.</Aviso>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Select
          rotulo="Tipo de baseline"
          disabled={bloqueado}
          value={saving.tipoBaseline}
          vazio={false}
          opcoes={(["Contrato anterior", "Baseline ajustado", "Proposta inicial"] as TipoBaseline[]).map((t) => ({ valor: t, rotulo: t }))}
          onChange={(e) => {
            const tipo = e.target.value as TipoBaseline;
            const base =
              tipo === "Contrato anterior" && valorAnterior !== undefined
                ? valorAnterior
                : tipo === "Baseline ajustado" && valorAnterior !== undefined && reajustePrevisto
                  ? baselineAjustado(valorAnterior, reajustePrevisto)
                  : saving.baselineAnual;
            set({ tipoBaseline: tipo, baselineAnual: base });
          }}
        />
        <InputNumero rotulo="Baseline anual (BRL)" disabled={bloqueado} valor={saving.baselineAnual} onValor={(v) => set({ baselineAnual: v ?? 0 })} origem={saving.tipoBaseline === "Contrato anterior" ? "herdado" : "manual"} />
        <InputNumero rotulo="Valor negociado anual (BRL)" disabled={bloqueado} valor={saving.valorNegociadoAnual} onValor={(v) => set({ valorNegociadoAnual: v ?? 0 })} />
        <Valor rotulo="Saving anual" origem="calculado">
          <span className={savingAnual(saving) >= 0 ? "text-sucesso-600" : "text-critico-600"}>{formatarMoeda(savingAnual(saving))}</span>
        </Valor>
      </div>
      {saving.tipoBaseline === "Baseline ajustado" && (
        <Textarea
          rotulo="Evidência objetiva do baseline ajustado"
          obrigatorio
          disabled={bloqueado}
          value={saving.evidenciaBaseline ?? ""}
          onChange={(e) => set({ evidenciaBaseline: e.target.value })}
          ajuda={valorAnterior !== undefined && reajustePrevisto ? `Sugestão: ${formatarMoeda(valorAnterior)} + reajuste previsto de ${reajustePrevisto}% = ${formatarMoeda(baselineAjustado(valorAnterior, reajustePrevisto))}` : undefined}
        />
      )}
      <Select
        rotulo="Origem da oportunidade"
        obrigatorio
        className="md:w-1/3"
        disabled={bloqueado}
        value={saving.origemOportunidade}
        opcoes={op.origensOportunidade}
        onChange={(e) => set({ origemOportunidade: e.target.value as OrigemOportunidade })}
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-texto-suave">Origens do saving (sem dupla contagem)</p>
          {!bloqueado && (
            <Button
              variante="fantasma"
              tamanho="sm"
              icone={<Plus size={14} />}
              disabled={usadas.size >= op.origensSaving.length}
              onClick={() => {
                const livre = op.origensSaving.find((o) => !usadas.has(o.valor as OrigemSaving));
                if (livre) set({ componentes: [...saving.componentes, { origem: livre.valor as OrigemSaving, valorAnual: Math.max(0, comp.naoAlocado) }] });
              }}
            >
              Adicionar origem
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {saving.componentes.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_180px_1fr_auto] items-end gap-2">
              <Select
                rotulo="Origem"
                disabled={bloqueado}
                vazio={false}
                value={c.origem}
                opcoes={op.origensSaving.filter((o) => o.valor === c.origem || !usadas.has(o.valor as OrigemSaving))}
                onChange={(e) => set({ componentes: saving.componentes.map((x, j) => (j === i ? { ...x, origem: e.target.value as OrigemSaving } : x)) })}
              />
              <InputNumero rotulo="Valor anual (BRL)" disabled={bloqueado} valor={c.valorAnual} onValor={(v) => set({ componentes: saving.componentes.map((x, j) => (j === i ? { ...x, valorAnual: v ?? 0 } : x)) })} />
              <div>
                <label className="mb-1 block text-xs font-medium text-texto-suave">Descrição</label>
                <input disabled={bloqueado} value={c.descricao ?? ""} onChange={(e) => set({ componentes: saving.componentes.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)) })} className="h-9 w-full rounded-md border border-borda-forte px-3 text-sm disabled:bg-fundo" />
              </div>
              {!bloqueado && (
                <button onClick={() => set({ componentes: saving.componentes.filter((_, j) => j !== i) })} className="mb-1 rounded p-2 text-texto-suave hover:bg-critico-50 hover:text-critico-600" aria-label="Remover origem">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-texto-suave tabular">
          Alocado {formatarMoeda(comp.alocado)} de {formatarMoeda(comp.total)} · não alocado {formatarMoeda(comp.naoAlocado)}
        </p>
      </div>
      {erros.length > 0 && (
        <Aviso tom="alerta" titulo="Ajustes necessários no saving">
          <ul className="list-disc pl-4">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Aviso>
      )}
    </div>
  );
}
