import type { DemandaJira } from "@/domain/types";

/**
 * Gateway JIRA — origina demandas de compra. Os dados chegam como PRÉ-CADASTRO
 * e só se tornam oficiais após validação de Suprimentos.
 * MVP: implementação simulada. Futuro: chamada à API do backend (que fala com o JIRA).
 */
export interface JiraGateway {
  buscarDemanda(jira_key: string): Promise<DemandaJira | undefined>;
}

const DEMANDAS: Record<string, Omit<DemandaJira, "jira_key">> = {
  "COMP-1287": {
    solicitante: "Tatiane Ribeiro",
    empresa: "Exemplo Serviços Ltda",
    area: "Atendimento",
    gestor: "Fernanda Rocha",
    descricao: "Plataforma de URA e discador para a central de atendimento (120 posições).",
    justificativa: "Contrato atual não suporta omnichannel e há meta de redução de TMA em 15%.",
    quantidade: 120,
    valorEstimado: 480000,
    fornecedoresIndicados: ["Nexo Contact Center Ltda", "Fala Mais Tecnologia"],
    anexos: ["escopo-ura.pdf", "volumetria-2026.xlsx"],
    criadoEm: "2026-09-15T13:20:00Z",
  },
  "COMP-1301": {
    solicitante: "Marcos Teixeira",
    empresa: "Exemplo Holding S.A.",
    area: "Tecnologia",
    gestor: "Carlos Mendes",
    descricao: "Ferramenta de observabilidade (APM e logs) para os sistemas críticos.",
    justificativa: "Incidentes sem rastreabilidade; exigência de auditoria interna.",
    quantidade: 40,
    valorEstimado: 260000,
    fornecedoresIndicados: ["Orbital Software Brasil Ltda"],
    anexos: ["requisitos-observabilidade.docx"],
    criadoEm: "2026-09-22T10:05:00Z",
  },
  "COMP-1320": {
    solicitante: "Aline Cardoso",
    empresa: "Exemplo Telecom Ltda",
    area: "Engenharia",
    gestor: "Paulo Sérgio Lima",
    descricao: "Manutenção preventiva de geradores em 14 sites.",
    justificativa: "Fim da garantia do fabricante em novembro.",
    quantidade: 14,
    valorEstimado: 336000,
    fornecedoresIndicados: [],
    anexos: [],
    criadoEm: "2026-09-29T17:40:00Z",
  },
};

export const jiraSimulado: JiraGateway = {
  async buscarDemanda(jira_key) {
    const k = jira_key.trim().toUpperCase();
    const d = DEMANDAS[k];
    return d ? { jira_key: k, ...d } : undefined;
  },
};

export const CHAVES_JIRA_DEMONSTRACAO = Object.keys(DEMANDAS);
