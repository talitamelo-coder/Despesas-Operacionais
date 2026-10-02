import { addDias, diffDias, hoje } from "../datas";
import { decisaoRegistrada, cicloResolvido, dataAberturaAvaliacao, dataLimiteManifestacao, REGRAS_ALERTA_PADRAO } from "./prazos";
import type { Alerta, Contrato, ISODate, RegrasAlerta } from "../types";

/**
 * Alertas de renovação (simulados no MVP — canal principal futuro: e-mail; também no sistema).
 * Destinatários: Gestor + Suprimentos.
 *
 * - Lembretes de DECISÃO DO GESTOR são interrompidos quando o gestor responde a avaliação.
 * - Alertas CONTRATUAIS CRÍTICOS (renovação automática em risco) nunca são removidos para Suprimentos.
 */
export function gerarAlertas(
  c: Contrato,
  regras: RegrasAlerta = REGRAS_ALERTA_PADRAO,
  referencia: ISODate = hoje(),
): Alerta[] {
  if (c.vigencia.tipoVigencia === "Prazo indeterminado") return [];
  if (c.status === "Encerrado" || c.status === "Rescindido") return [];

  const limite = dataLimiteManifestacao(c.vigencia);
  const abertura = dataAberturaAvaliacao(c.vigencia);
  const respondido = decisaoRegistrada(c);
  const resolvido = cicloResolvido(c);
  const gestorESuprimentos = [c.gestorId, c.analistaId];

  const status = (data: ISODate): Alerta["status"] => (diffDias(data, referencia) >= 0 ? "Enviado" : "Programado");

  const decisao = (tipo: Alerta["tipo"], data: ISODate): Alerta => {
    const interrompido = (respondido || resolvido) && diffDias(data, referencia) < 0;
    return {
      id: `${c.contrato_id}:${tipo}`,
      contrato_id: c.contrato_id,
      tipo,
      categoria: "Decisão do gestor",
      dataPrevista: data,
      status: interrompido ? "Interrompido" : status(data),
      destinatarios: gestorESuprimentos,
      motivoInterrupcao: interrompido ? (resolvido ? "Ciclo contratual resolvido" : "Gestor respondeu a avaliação") : undefined,
    };
  };

  const alertas: Alerta[] = [decisao("Abertura da avaliação", abertura)];
  for (const dias of regras.lembretesDias) {
    const tipo = dias === 60 ? "60 dias para data limite" : dias === 30 ? "30 dias para data limite" : undefined;
    if (tipo) alertas.push(decisao(tipo, addDias(limite, -dias)));
  }

  if (c.vigencia.renovacaoAutomatica) {
    const data = addDias(limite, -regras.diasRiscoRenovacaoAutomatica);
    alertas.push({
      id: `${c.contrato_id}:Renovação automática em risco`,
      contrato_id: c.contrato_id,
      tipo: "Renovação automática em risco",
      categoria: "Contratual crítico",
      dataPrevista: data,
      status: resolvido && diffDias(data, referencia) < 0 ? "Interrompido" : status(data),
      // Após a resposta do gestor, o crítico segue apenas para Suprimentos.
      destinatarios: respondido ? [c.analistaId] : gestorESuprimentos,
      motivoInterrupcao: resolvido && diffDias(data, referencia) < 0 ? "Ciclo contratual resolvido" : undefined,
    });
  }

  return alertas.sort((a, b) => diffDias(b.dataPrevista, a.dataPrevista));
}
