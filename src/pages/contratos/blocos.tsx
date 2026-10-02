import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useApp } from "@/app/contexto";
import { GradeValores, Valor } from "@/components/ui/Campos";
import { Aviso } from "@/components/ui/Diversos";
import { Badge } from "@/components/ui/Badge";
import { RiscoRenovacaoBadge, StatusBadge } from "@/components/ui/status";
import { cenarioDe, decomporVariacao, valorAnualBRL } from "@/domain/rules/cambio";
import { prazosDoContrato } from "@/domain/rules/prazos";
import { datasReajuste, proximoReajuste } from "@/domain/rules/reajuste";
import { formatarData } from "@/domain/datas";
import { formatarCnpj, formatarMoeda, formatarNumero, formatarPercentual } from "@/domain/formatacao";
import type { Alerta, Contrato } from "@/domain/types";

/** Blocos da Capa do Contrato — cada bloco é independente e reaproveitável. */

export function BlocoInformacoesGerais({ c }: { c: Contrato }) {
  const { nomeEmpresa, fornecedor, nomeTipo } = useApp();
  const f = fornecedor(c.fornecedorId);
  return (
    <GradeValores>
      <Valor rotulo="Empresa" origem={c.origens.empresaId}>{nomeEmpresa(c.empresaId)}</Valor>
      <Valor rotulo="Fornecedor" origem={c.origens.fornecedorId}>{f?.razaoSocial}</Valor>
      <Valor rotulo="CNPJ">{formatarCnpj(f?.cnpj)}</Valor>
      <Valor rotulo="Código do fornecedor">{f?.codigoFornecedor ?? "—"}</Valor>
      <Valor rotulo="Cidade/UF">{f?.cidade ? `${f.cidade}/${f.uf}` : "—"}</Valor>
      <Valor rotulo="Status cadastral">{f ? <Badge tom={f.statusCadastral === "Ativo" ? "sucesso" : "alerta"}>{f.statusCadastral}</Badge> : "—"}</Valor>
      <Valor rotulo="Tipo de contrato" origem={c.origens.tipoContratoId}>{nomeTipo(c.tipoContratoId)}</Valor>
      <Valor rotulo="Centro de custo" origem={c.origens.centroCusto}>{c.centroCusto ?? "—"}</Valor>
      <Valor rotulo="Projeto" origem={c.origens.projeto}>{c.projeto ?? "—"}</Valor>
      <Valor rotulo="Objeto" className="sm:col-span-2 lg:col-span-3" origem={c.origens.objeto}>{c.objeto}</Valor>
      {c.jira_key && <Valor rotulo="JIRA de origem" origem="importado">{c.jira_key}</Valor>}
      {c.external_id && <Valor rotulo="Código na planilha legada" origem="importado">{c.external_id}</Valor>}
    </GradeValores>
  );
}

export function BlocoResponsaveis({ c }: { c: Contrato }) {
  const { nomeUsuario } = useApp();
  return (
    <GradeValores colunas={2}>
      <Valor rotulo="Gestor do contrato" origem={c.origens.gestorId}>{nomeUsuario(c.gestorId)}</Valor>
      <Valor rotulo="Analista de Suprimentos">{nomeUsuario(c.analistaId)}</Valor>
      <Valor rotulo="Diretor (ciência)">{nomeUsuario(c.diretorId)}</Valor>
    </GradeValores>
  );
}

export function BlocoCondicoesComerciais({ c }: { c: Contrato }) {
  const cc = c.condicoes;
  return (
    <GradeValores>
      <Valor rotulo="Moeda">{cc.moeda}</Valor>
      <Valor rotulo={`Valor anual (${cc.moeda})`}>{formatarMoeda(cc.valorAnual, cc.moeda)}</Valor>
      <Valor rotulo="Valor anual em BRL" origem={cc.moeda !== "BRL" ? "calculado" : undefined}>{formatarMoeda(valorAnualBRL(cc))}</Valor>
      <Valor rotulo="Quantidade">{cc.quantidade ? `${formatarNumero(cc.quantidade)} ${cc.unidade ?? ""}` : "—"}</Valor>
      <Valor rotulo="Preço unitário anual">{cc.precoUnitario ? formatarMoeda(cc.precoUnitario, cc.moeda) : "—"}</Valor>
      <Valor rotulo="Periodicidade de pagamento">{cc.periodicidadePagamento}</Valor>
      <Valor rotulo="Condição de pagamento" className="sm:col-span-2">{cc.condicaoPagamento || "—"}</Valor>
    </GradeValores>
  );
}

export function BlocoCambio({ c }: { c: Contrato }) {
  const cot = c.condicoes.cotacao;
  if (c.condicoes.moeda === "BRL") return <p className="text-sm text-texto-suave">Contrato em BRL — sem conversão cambial.</p>;
  if (!cot) return <Aviso tom="alerta">Contrato em {c.condicoes.moeda} sem cotação informada. Valores em BRL não podem ser calculados.</Aviso>;
  return (
    <GradeValores colunas={4}>
      <Valor rotulo="Cotação">{formatarNumero(cot.valor, 4)}</Valor>
      <Valor rotulo="Data da cotação">{formatarData(cot.data)}</Valor>
      <Valor rotulo="Fonte">{cot.fonte}</Valor>
      <Valor rotulo="Observação">{cot.observacao ?? "—"}</Valor>
    </GradeValores>
  );
}

export function BlocoVigencia({ c }: { c: Contrato }) {
  const p = prazosDoContrato(c);
  return (
    <div className="space-y-4">
      {p.renovacaoAutomaticaEmRisco && (
        <Aviso tom="critico" titulo="Renovação automática em risco">
          A data limite de manifestação ({formatarData(p.dataLimiteManifestacao)}) está próxima. O sistema não renova contratos sozinho: registre a decisão e formalize junto ao fornecedor.
        </Aviso>
      )}
      <GradeValores colunas={4}>
        <Valor rotulo="Data início">{formatarData(c.vigencia.dataInicio)}</Valor>
        <Valor rotulo="Data fim">{formatarData(c.vigencia.dataFim)}</Valor>
        <Valor rotulo="Tipo de vigência">{c.vigencia.tipoVigencia}</Valor>
        <Valor rotulo="Duração" origem="calculado">{formatarNumero(p.duracaoDias)} dias</Valor>
        <Valor rotulo="Aviso prévio" origem={c.origens["vigencia.avisoPrevioDias"]}>{c.vigencia.avisoPrevioDias} dias</Valor>
        <Valor rotulo="Prazo do gestor">{c.vigencia.prazoGestorDias} dias</Valor>
        <Valor rotulo="Renovação automática">{c.vigencia.renovacaoAutomatica ? "Sim" : "Não"}</Valor>
        <Valor rotulo="Periodicidade de renovação">{c.vigencia.periodicidadeRenovacaoMeses ? `${c.vigencia.periodicidadeRenovacaoMeses} meses` : "—"}</Valor>
        <Valor rotulo="Dias até o vencimento" origem="calculado">
          <span className={p.diasAteVencimento < 0 ? "text-critico-600" : p.diasAteVencimento <= 90 ? "text-alerta-600" : ""}>{p.diasAteVencimento < 0 ? `Vencido há ${-p.diasAteVencimento} dias` : `${p.diasAteVencimento} dias`}</span>
        </Valor>
        <Valor rotulo="Data limite de manifestação" origem="calculado">{formatarData(p.dataLimiteManifestacao)}</Valor>
        <Valor rotulo="Início da avaliação" origem="calculado">{formatarData(p.dataAberturaAvaliacao)}</Valor>
        <Valor rotulo="Fase" origem="calculado">{p.fase}</Valor>
      </GradeValores>
      <p className="text-xs text-texto-fraco">
        Data limite = data fim − aviso prévio ({c.vigencia.avisoPrevioDias} dias). Início da avaliação = data limite − prazo do gestor ({c.vigencia.prazoGestorDias} dias).
      </p>
    </div>
  );
}

export function BlocoReajuste({ c }: { c: Contrato }) {
  const r = c.reajuste;
  if (!r.possui) return <p className="text-sm text-texto-suave">Contrato sem cláusula de reajuste.</p>;
  const datas = datasReajuste(r, c.vigencia, 6);
  return (
    <div className="space-y-3">
      <GradeValores colunas={4}>
        <Valor rotulo="Índice" origem={c.origens.reajuste}>{r.indice ?? "—"}</Valor>
        <Valor rotulo="Data-base">{formatarData(r.dataBase)}</Valor>
        <Valor rotulo="Periodicidade">{r.periodicidadeMeses ? `${r.periodicidadeMeses} meses` : "—"}</Valor>
        <Valor rotulo="Percentual previsto">{formatarPercentual(r.percentualPrevisto)}</Valor>
        <Valor rotulo="Próximo reajuste" origem="calculado">{formatarData(proximoReajuste(r, c.vigencia))}</Valor>
      </GradeValores>
      {datas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-texto-suave">Datas na vigência:</span>
          {datas.map((d) => (
            <Badge key={d}>{formatarData(d)}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlocoRescisao({ c }: { c: Contrato }) {
  const r = c.rescisao;
  return (
    <GradeValores colunas={4}>
      <Valor rotulo="Permite rescisão" origem={c.origens.rescisao}>{r.permite ? "Sim" : "Não"}</Valor>
      <Valor rotulo="Possui multa">{r.possuiMulta ? "Sim" : "Não"}</Valor>
      <Valor rotulo="Percentual">{formatarPercentual(r.percentual)}</Valor>
      <Valor rotulo="Valor">{formatarMoeda(r.valor)}</Valor>
      <Valor rotulo="Aviso prévio">{r.avisoPrevioDias ? `${r.avisoPrevioDias} dias` : "—"}</Valor>
      <Valor rotulo="Regra" className="sm:col-span-2 lg:col-span-3">{r.regra ?? "—"}</Valor>
      {r.observacoes && <Valor rotulo="Observações" className="sm:col-span-2 lg:col-span-4">{r.observacoes}</Valor>}
    </GradeValores>
  );
}

/** Espaço reservado para integração com o sistema atual (pedido, consumido, saldo). */
export function BlocoExecucaoFinanceira({ c }: { c: Contrato }) {
  const e = c.execucaoFinanceira;
  const saldo = e.valorContratado !== undefined && e.valorConsumido !== undefined ? e.valorContratado - e.valorConsumido : undefined;
  const pct = e.valorContratado ? ((e.valorConsumido ?? 0) / e.valorContratado) * 100 : undefined;
  return (
    <div className="space-y-3">
      {e.simulado && <Aviso tom="info">Dados simulados. Pedido, consumo e saldo virão do sistema atual (fonte oficial) quando a integração estiver disponível.</Aviso>}
      <GradeValores colunas={2}>
        <Valor rotulo="Pedido" origem="importado">{e.pedido_id ?? "—"}</Valor>
        <Valor rotulo="Valor contratado" origem="importado">{formatarMoeda(e.valorContratado)}</Valor>
        <Valor rotulo="Valor consumido" origem="importado">{formatarMoeda(e.valorConsumido)}</Valor>
        <Valor rotulo="Saldo" origem="calculado">{formatarMoeda(saldo)}</Valor>
      </GradeValores>
      {pct !== undefined && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-texto-suave">
            <span>Percentual consumido</span>
            <span className="tabular">{formatarPercentual(pct)}</span>
          </div>
          <div className="h-2 rounded-full bg-fundo">
            <div className={`h-2 rounded-full ${pct > 90 ? "bg-critico-600" : pct > 75 ? "bg-alerta-600" : "bg-primaria-600"}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Decomposição preço × volume × câmbio contra o contrato anterior. */
export function BlocoVariacao({ c, anterior }: { c: Contrato; anterior?: Contrato }) {
  if (!anterior) return <p className="text-sm text-texto-suave">Sem contrato anterior para comparação.</p>;
  const a = cenarioDe(anterior.condicoes);
  const n = cenarioDe(c.condicoes);
  if (!a || !n) return <Aviso tom="alerta">Cotação ausente em um dos contratos — decomposição cambial indisponível.</Aviso>;
  const d = decomporVariacao(a, n);
  const linha = (rotulo: string, v: number, ajuda: string) => (
    <div className="flex items-center justify-between border-b border-borda py-2 last:border-0">
      <div>
        <p className="text-sm">{rotulo}</p>
        <p className="text-xs text-texto-fraco">{ajuda}</p>
      </div>
      <span className={`shrink-0 whitespace-nowrap text-sm font-semibold tabular ${v > 0 ? "text-critico-600" : v < 0 ? "text-sucesso-600" : ""}`}>
        {v > 0 ? "+" : ""}
        {formatarMoeda(v)}
      </span>
    </div>
  );
  return (
    <div>
      {linha("Impacto de preço", d.impactoPreco, "Variação do preço unitário sobre o volume anterior")}
      {linha("Impacto de volume", d.impactoVolume, "Mudança de quantidade — não indica desempenho de Suprimentos")}
      {linha("Impacto cambial", d.impactoCambial, "Variação da cotação sobre o cenário novo")}
      <div className="flex items-center justify-between pt-3">
        <p className="text-sm font-semibold">Variação líquida anual (BRL)</p>
        <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular">{formatarMoeda(d.variacaoLiquidaBRL)}</span>
      </div>
      <p className="mt-1 text-xs text-texto-fraco">Comparação com {anterior.codigo}. Valores positivos = aumento de custo.</p>
    </div>
  );
}

/** Histórico contratual: cadeia CT anterior → atual → sucessor. Nunca sobrescreve contratos. */
export function BlocoHistoricoContratual({ c, cadeia }: { c: Contrato; cadeia: Contrato[] }) {
  const { fornecedor } = useApp();
  return (
    <div className="space-y-3">
      <ol className="space-y-1">
        {cadeia.map((x, i) => (
          <li key={x.contrato_id}>
            {i > 0 && (
              <span className="flex items-center gap-1 py-0.5 pl-3 text-[11px] text-texto-fraco">
                <ArrowRight size={12} className="rotate-90" />
                {x.relacaoAnterior}
              </span>
            )}
            <Link
              to={`/contratos/${x.contrato_id}`}
              className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${x.contrato_id === c.contrato_id ? "border-primaria-500 bg-primaria-50" : "border-borda hover:border-primaria-200"}`}
            >
              <span className="min-w-0">
                <span className="block font-semibold text-primaria-800">{x.codigo}</span>
                <span className="block truncate text-texto-suave">{fornecedor(x.fornecedorId)?.nomeFantasia} · {formatarData(x.vigencia.dataInicio)} a {formatarData(x.vigencia.dataFim)}</span>
              </span>
              <StatusBadge status={x.status} />
            </Link>
          </li>
        ))}
      </ol>
      {c.substituicao && (
        <GradeValores colunas={3}>
          <Valor rotulo="Fornecedor anterior" origem="herdado">{fornecedor(c.substituicao.fornecedorAnteriorId)?.razaoSocial}</Valor>
          <Valor rotulo="Valor anual anterior" origem="herdado">{formatarMoeda(c.substituicao.valorAnteriorAnual)}</Valor>
          <Valor rotulo="Origem da oportunidade">{c.substituicao.origemOportunidade}</Valor>
          <Valor rotulo="Motivo da substituição" className="sm:col-span-3">{c.motivoSubstituicao}</Valor>
        </GradeValores>
      )}
    </div>
  );
}

export function ListaAlertas({ alertas }: { alertas: Alerta[] }) {
  const { nomeUsuario } = useApp();
  if (!alertas.length) return <p className="text-sm text-texto-suave">Sem alertas de renovação para este contrato.</p>;
  const tom = { Enviado: "info", Programado: "neutro", Interrompido: "alerta" } as const;
  return (
    <ul className="divide-y divide-borda">
      {alertas.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
          <span className="w-24 text-sm tabular">{formatarData(a.dataPrevista)}</span>
          <span className="min-w-0 flex-1 text-sm">
            {a.tipo === "Renovação automática em risco" ? <RiscoRenovacaoBadge /> : a.tipo}
            <span className="block text-xs text-texto-fraco">
              {a.categoria} · Para: {a.destinatarios.map(nomeUsuario).join(", ")}
              {a.motivoInterrupcao && ` · ${a.motivoInterrupcao}`}
            </span>
          </span>
          <Badge tom={tom[a.status]}>{a.status}</Badge>
        </li>
      ))}
    </ul>
  );
}
