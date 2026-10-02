import { formatarData } from "../datas";
import { formatarMoeda } from "../formatacao";
import type { Moeda, TipoAlerta } from "../types";

/**
 * Templates de comunicação por e-mail (MVP: pré-visualização/simulação).
 * O gestor responde DENTRO do sistema — o e-mail só leva o botão "Avaliar contrato".
 */

export interface DadosEmailAvaliacao {
  tipo: TipoAlerta;
  codigo: string;
  fornecedor: string;
  objeto: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  valorAnual: number;
  moeda: Moeda;
  renovacaoAutomatica: boolean;
  dataLimite: string;
  prazoResposta: string;
  destinatario: string;
  linkAvaliacao: string;
}

export interface EmailRenderizado {
  assunto: string;
  html: string;
  texto: string;
}

const ASSUNTO: Record<TipoAlerta, (d: DadosEmailAvaliacao) => string> = {
  "Abertura da avaliação": (d) => `Avaliação de renovação - ${d.codigo} - ${d.fornecedor}`,
  "60 dias para data limite": (d) => `Lembrete: 60 dias para a data limite - ${d.codigo} - ${d.fornecedor}`,
  "30 dias para data limite": (d) => `Lembrete: 30 dias para a data limite - ${d.codigo} - ${d.fornecedor}`,
  "Renovação automática em risco": (d) => `[CRÍTICO] Renovação automática em risco - ${d.codigo} - ${d.fornecedor}`,
};

const INTRO: Record<TipoAlerta, string> = {
  "Abertura da avaliação": "A avaliação de renovação do contrato abaixo está aberta. Precisamos da sua decisão dentro do prazo.",
  "60 dias para data limite": "Faltam 60 dias para a data limite de manifestação deste contrato e a avaliação ainda não foi respondida.",
  "30 dias para data limite": "Faltam 30 dias para a data limite de manifestação deste contrato e a avaliação ainda não foi respondida.",
  "Renovação automática em risco":
    "Este contrato possui renovação automática e a data limite de manifestação está próxima. Sem posição formal, ele poderá ser renovado automaticamente.",
};

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function renderizarEmailAvaliacao(d: DadosEmailAvaliacao): EmailRenderizado {
  const linhas: [string, string][] = [
    ["Contrato", d.codigo],
    ["Fornecedor", d.fornecedor],
    ["Objeto", d.objeto],
    ["Vigência", `${formatarData(d.vigenciaInicio)} a ${formatarData(d.vigenciaFim)}`],
    ["Valor anual", formatarMoeda(d.valorAnual, d.moeda)],
    ["Renovação automática", d.renovacaoAutomatica ? "Sim" : "Não"],
    ["Data limite", formatarData(d.dataLimite)],
    ["Prazo para resposta", formatarData(d.prazoResposta)],
  ];
  const assunto = ASSUNTO[d.tipo](d);
  const tabela = linhas
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;color:#5b6472;font-size:13px">${escapar(k)}</td><td style="padding:6px 12px;font-size:13px;font-weight:600;color:#1f2733">${escapar(v)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e3e7ee;border-radius:8px;overflow:hidden">
  <div style="background:#0b3d91;color:#fff;padding:16px 20px;font-size:15px;font-weight:600">Akross Atende · Gestão de Contratos</div>
  <div style="padding:20px">
    <p style="margin:0 0 12px;font-size:14px;color:#1f2733">Olá, ${escapar(d.destinatario)}.</p>
    <p style="margin:0 0 16px;font-size:14px;color:#1f2733">${escapar(INTRO[d.tipo])}</p>
    <table style="border-collapse:collapse;width:100%;background:#f7f9fc;border-radius:6px">${tabela}</table>
    <p style="margin:20px 0"><a href="${escapar(d.linkAvaliacao)}" style="background:#0b3d91;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600">Avaliar contrato</a></p>
    <p style="margin:0;font-size:12px;color:#5b6472">A resposta deve ser registrada no sistema. Respostas por e-mail não são consideradas.</p>
  </div>
</div>`;
  const texto = [
    `Olá, ${d.destinatario}.`,
    "",
    INTRO[d.tipo],
    "",
    ...linhas.map(([k, v]) => `${k}: ${v}`),
    "",
    `Avaliar contrato: ${d.linkAvaliacao}`,
    "A resposta deve ser registrada no sistema.",
  ].join("\n");
  return { assunto, html, texto };
}
