import { AlertTriangle } from "lucide-react";
import type { OrigemDado, Prioridade, StatusContrato, StatusProcesso } from "@/domain/types";
import { Badge, type Tom } from "./Badge";

/** Mapeamento ÚNICO status -> tom visual. */
const TOM_STATUS: Record<string, Tom> = {
  Vigente: "sucesso",
  Suspenso: "alerta",
  Encerrado: "neutro",
  Rescindido: "critico",
  Rascunho: "neutro",
  "Validação de Suprimentos": "info",
  "Em cotação": "info",
  "Em negociação": "primario",
  "Aguardando aprovação comercial": "alerta",
  "Em análise jurídica": "primario",
  "Aguardando assinatura": "alerta",
  Concluído: "sucesso",
  Cancelado: "neutro",
  "Em renovação": "info",
  "Em substituição": "info",
  "Em renegociação": "info",
  "Em aditivo": "primario",
};

export function StatusBadge({ status }: { status: StatusContrato | StatusProcesso | string }) {
  return <Badge tom={TOM_STATUS[status] ?? "neutro"}>{status}</Badge>;
}

const TOM_PRIORIDADE: Record<Prioridade, Tom> = {
  Normal: "neutro",
  Atenção: "alerta",
  "Ação necessária": "acao",
  Crítico: "critico",
};

export function PrioridadeBadge({ prioridade }: { prioridade: Prioridade }) {
  return (
    <Badge tom={TOM_PRIORIDADE[prioridade]} icone={prioridade === "Crítico" ? <AlertTriangle size={12} /> : undefined}>
      {prioridade}
    </Badge>
  );
}

export function RiscoRenovacaoBadge() {
  return (
    <Badge tom="critico" icone={<AlertTriangle size={12} />}>
      Renovação automática em risco
    </Badge>
  );
}

const ROTULO_ORIGEM: Record<OrigemDado, string> = {
  importado: "Importado",
  validado: "Validado",
  herdado: "Herdado",
  calculado: "Calculado",
  manual: "Manual",
};
const TOM_ORIGEM: Record<OrigemDado, string> = {
  importado: "text-info-600 bg-info-50",
  validado: "text-sucesso-600 bg-sucesso-50",
  herdado: "text-primaria-700 bg-primaria-50",
  calculado: "text-texto-suave bg-fundo",
  manual: "text-texto-fraco bg-fundo",
};

/** Etiqueta discreta da origem do dado (princípio: o sistema mostra o que já sabe). */
export function OrigemTag({ origem }: { origem?: OrigemDado }) {
  if (!origem || origem === "manual") return null;
  return (
    <span title={`Dado ${ROTULO_ORIGEM[origem].toLowerCase()}`} className={`ml-1.5 rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wide ${TOM_ORIGEM[origem]}`}>
      {ROTULO_ORIGEM[origem]}
    </span>
  );
}
