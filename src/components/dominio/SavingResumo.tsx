import { composicaoSaving, savingPercentual } from "@/domain/rules/saving";
import { formatarMoeda, formatarPercentual } from "@/domain/formatacao";
import type { Saving } from "@/domain/types";
import { Valor, GradeValores } from "@/components/ui/Campos";
import { Aviso } from "@/components/ui/Diversos";

/** Resultado de Suprimentos: baseline, negociado, saving anual e composição por origem. */
export function SavingResumo({ saving, compacto }: { saving?: Saving; compacto?: boolean }) {
  if (!saving) return <p className="text-sm text-texto-suave">Sem saving registrado para este contrato.</p>;
  const c = composicaoSaving(saving);
  const max = Math.max(...c.itens.map((i) => i.valor), 1);
  return (
    <div className="space-y-4">
      <GradeValores colunas={compacto ? 2 : 4}>
        <Valor rotulo={`Baseline (${saving.tipoBaseline.toLowerCase()})`} origem={saving.tipoBaseline === "Contrato anterior" ? "herdado" : undefined}>
          {formatarMoeda(saving.baselineAnual)}
        </Valor>
        <Valor rotulo="Valor negociado anual">{formatarMoeda(saving.valorNegociadoAnual)}</Valor>
        <Valor rotulo="Saving anual" origem="calculado">
          <span className={c.total >= 0 ? "text-sucesso-600" : "text-critico-600"}>
            {formatarMoeda(c.total)} <span className="text-xs font-normal">({formatarPercentual(savingPercentual(saving))})</span>
          </span>
        </Valor>
        <Valor rotulo="Origem da oportunidade">{saving.origemOportunidade}</Valor>
      </GradeValores>
      {saving.evidenciaBaseline && (
        <p className="text-xs text-texto-suave">
          <span className="font-medium">Evidência do baseline:</span> {saving.evidenciaBaseline}
        </p>
      )}
      {c.itens.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-texto-suave">Composição do saving anual</p>
          <ul className="space-y-1.5">
            {c.itens.map((i) => (
              <li key={i.origem} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate">{i.origem}</span>
                <span className="h-2 rounded-full bg-fundo">
                  <span className="block h-2 rounded-full bg-primaria-600" style={{ width: `${Math.max(2, (i.valor / max) * 100)}%` }} />
                </span>
                <span className="text-right font-medium tabular">{formatarMoeda(i.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {Math.abs(c.naoAlocado) >= 0.01 && c.total > 0 && (
        <Aviso tom="alerta">{formatarMoeda(c.naoAlocado)} do saving ainda não foi atribuído a uma origem.</Aviso>
      )}
    </div>
  );
}
