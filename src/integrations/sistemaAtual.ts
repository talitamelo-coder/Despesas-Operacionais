import type { ExecucaoFinanceira, Fornecedor } from "@/domain/types";

/**
 * Gateway do sistema atual (ERP interno) — fonte oficial futura de fornecedor, pedido,
 * saldo contratual, NF, aprovação de pagamento e contas a pagar.
 * Este módulo NÃO duplica o financeiro: apenas consulta. MVP: dados simulados no próprio contrato.
 */
export interface SistemaAtualGateway {
  obterFornecedor(fornecedor_id: string): Promise<Fornecedor | undefined>;
  obterExecucaoFinanceira(contrato_id: string, pedido_id?: string): Promise<ExecucaoFinanceira>;
}
