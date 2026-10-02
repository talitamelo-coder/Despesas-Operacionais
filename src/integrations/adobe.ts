/**
 * Gateway Adobe (assinatura eletrônica / documentos) — SOMENTE CONTRATO DE INTERFACE.
 * Não há assinatura eletrônica própria no MVP. O `envelope_id` e o `external_id` de
 * documentos já estão reservados no modelo para esta integração.
 */
export interface AssinaturaGateway {
  enviarParaAssinatura(processo_id: string, documento_id: string, signatarios: string[]): Promise<{ envelope_id: string }>;
  consultarStatus(envelope_id: string): Promise<"Enviado" | "Assinado" | "Recusado" | "Expirado">;
}
