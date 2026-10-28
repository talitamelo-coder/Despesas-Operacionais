import { useState } from "react";
import { Plus, ReceiptText } from "lucide-react";
import { useApp } from "@/app/contexto";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GradeValores, Input, InputNumero, Valor } from "@/components/ui/Campos";
import { Aviso, Carregando } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { Tabela } from "@/components/ui/Tabela";
import { formatarData, hoje } from "@/domain/datas";
import { formatarMoeda, formatarPercentual } from "@/domain/formatacao";
import { aceitaMovimento, erroSaldoPedido, rotuloAumentoSaldo } from "@/domain/rules/saldo";
import type { Contrato } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";
import { AditivoModal } from "./Aditivos";

/**
 * Saldo do contrato: contratado (vigência + aportes) − pedidos.
 * Pedido acima do saldo é bloqueado. Até a integração, pedidos são registrados aqui.
 */
export function BlocoSaldo({ c, compacto }: { c: Contrato; compacto?: boolean }) {
  const { usuario, pode, executar } = useApp();
  const { dados } = useConsulta(() => api.obterSaldoContrato(c.contrato_id, usuario.id), [c.contrato_id, usuario.id]);
  const [pedido, setPedido] = useState(false);
  const [aporte, setAporte] = useState(false);
  if (!dados) return <Carregando />;
  const { saldo: s, pedidos, aportes } = dados;
  const m = (v?: number) => formatarMoeda(v, s.moeda);
  const pct = s.percentualConsumido;
  const podeEditar = pode("editar_processo") && aceitaMovimento(c);
  const receita = c.natureza === "Receita";

  return (
    <div className="space-y-3">
      {s.indisponivel ? (
        <Aviso tom="critico" titulo="Sem saldo calculável">{s.indisponivel} Pedidos ficam bloqueados.</Aviso>
      ) : (
        <>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-texto-suave">{receita ? "Saldo a faturar" : "Disponível"}</span>
              <span className={`text-lg font-semibold tabular ${s.disponivel <= 0 ? "text-critico-600" : ""}`}>{m(s.disponivel)}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-fundo" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Saldo consumido">
              <div className={`h-2 rounded-full ${pct >= 100 ? "bg-critico-600" : pct >= 80 ? "bg-alerta-600" : "bg-primaria-600"}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <p className="mt-1 text-xs text-texto-suave">
              {formatarPercentual(pct)} consumido de {m(s.contratado)}
              {s.periodo && ` · ${c.vigencia.tipoVigencia === "Prazo indeterminado" ? "ciclo" : "vigência"} ${formatarData(s.periodo.inicio)} a ${formatarData(s.periodo.fim)}`}
            </p>
          </div>
          {pct >= 100 && <Aviso tom="critico">{receita ? "Saldo a faturar esgotado: o Contas a receber não consegue emitir acima do contratado sem aditivo." : "Saldo esgotado: novos pedidos estão bloqueados até registrar um aditivo de valor."}</Aviso>}
          {pct >= 80 && pct < 100 && <Aviso tom="alerta">Mais de 80% do saldo consumido. Avalie um aditivo de valor.</Aviso>}
          <GradeValores colunas={compacto ? 2 : 4}>
            <Valor rotulo="Contratado" origem="calculado">{m(s.contratado)}{s.aportes > 0 && <span className="block text-xs text-texto-suave">inclui {m(s.aportes)} adicionados</span>}</Valor>
            {receita ? (
              <Valor rotulo="Faturado (notas emitidas)">{m(s.realizado)}</Valor>
            ) : (
              <>
                <Valor rotulo="Pedidos aprovados (comprometido)">{m(s.comprometido)}</Valor>
                <Valor rotulo="Pedidos pagos (realizado)">{m(s.realizado)}</Valor>
              </>
            )}
          </GradeValores>
        </>
      )}
      {podeEditar && (
        <div className="flex flex-wrap gap-2">
          {!receita && <Button tamanho="sm" icone={<ReceiptText size={14} />} onClick={() => setPedido(true)}>Registrar pedido</Button>}
          <Button tamanho="sm" variante="secundario" icone={<Plus size={14} />} onClick={() => setAporte(true)}>Registrar {rotuloAumentoSaldo(c).toLowerCase()}</Button>
        </div>
      )}
      {!compacto && (
        <>
          {receita ? (
            <>
              <p className="pt-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Notas emitidas (Contas a receber)</p>
              <Tabela densa linhas={dados.emissoes} chave={(e) => e.id} vazio="Nenhuma emissão. Elas chegam pela integração com o Contas a receber." colunas={[
                { id: "n", titulo: "Documento", render: (e) => e.numeroDocumento },
                { id: "d", titulo: "Data", render: (e) => formatarData(e.data) },
                { id: "v", titulo: "Valor", alinhamento: "direita", render: (e) => m(e.valor) },
                { id: "s", titulo: "Situação", render: (e) => <Badge tom={e.status === "Emitida" ? "sucesso" : "neutro"}>{e.status}</Badge> },
                { id: "o", titulo: "Origem", render: (e) => <span className="text-xs text-texto-suave">{e.origem}</span> },
              ]} />
            </>
          ) : (
          <>
          <p className="pt-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Pedidos</p>
          <Tabela
            densa
            linhas={pedidos}
            chave={(p) => p.id}
            vazio="Nenhum pedido. Com a integração, os pedidos chegam do módulo de pedidos."
            colunas={[
              { id: "n", titulo: "Pedido", render: (p) => <span className="font-medium">{p.numero}</span> },
              { id: "d", titulo: "Data", render: (p) => formatarData(p.data) },
              { id: "desc", titulo: "Descrição", render: (p) => p.descricao ?? "—" },
              { id: "v", titulo: "Valor", alinhamento: "direita", render: (p) => m(p.valor) },
              { id: "s", titulo: "Situação", render: (p) => <Badge tom={p.status === "Pago" ? "sucesso" : p.status === "Aprovado" ? "info" : "neutro"}>{p.status}</Badge> },
              {
                id: "a",
                titulo: "",
                alinhamento: "direita",
                render: (p) =>
                  podeEditar && p.status === "Aprovado" ? (
                    <span className="flex justify-end gap-1">
                      <Button variante="fantasma" tamanho="sm" onClick={() => executar(() => api.atualizarStatusPedido(p.id, "Pago", usuario.id), "Pedido marcado como pago.")}>Pago</Button>
                      <Button variante="fantasma" tamanho="sm" onClick={() => executar(() => api.atualizarStatusPedido(p.id, "Cancelado", usuario.id), "Pedido cancelado; saldo devolvido.")}>Cancelar</Button>
                    </span>
                  ) : null,
              },
            ]}
          />
          </>
          )}
          {aportes.length > 0 && (
            <>
              <p className="pt-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Saldo adicionado por aditivo</p>
              <Tabela densa linhas={aportes} chave={(a) => a.id} colunas={[
                { id: "d", titulo: "Data", render: (a) => formatarData(a.data) },
                { id: "m", titulo: "Motivo", render: (a) => a.motivo },
                { id: "r", titulo: "Referência", render: (a) => a.referencia ?? "—" },
                { id: "v", titulo: "Valor", alinhamento: "direita", render: (a) => m(a.valor) },
              ]} />
            </>
          )}
          <p className="text-xs text-texto-fraco">{receita ? "Contratado = valor total (ou fixo mensal × meses da vigência) + aditivos. Cada nota emitida no Contas a receber consome o saldo; emissão acima dele é recusada." : "Contratado = valor anual × duração da vigência + aditivos. Pedidos aprovados e pagos consomem o saldo; pedido acima do disponível é bloqueado."}</p>
        </>
      )}
      {pedido && <PedidoModal c={c} disponivel={s} onFechar={() => setPedido(false)} />}
      {aporte && <AditivoModal c={c} reforco={rotuloAumentoSaldo(c) === "Reforço de saldo"} onFechar={() => setAporte(false)} />}
    </div>
  );
}

function PedidoModal({ c, disponivel, onFechar }: { c: Contrato; disponivel: Parameters<typeof erroSaldoPedido>[0]; onFechar: () => void }) {
  const { usuario, executar } = useApp();
  const [p, setP] = useState({ numero: "", data: hoje(), valor: undefined as number | undefined, descricao: "" });
  const erro = p.valor ? erroSaldoPedido(disponivel, p.valor, c) : undefined;
  return (
    <Modal aberto titulo={`Registrar pedido · ${c.codigo}`} onFechar={onFechar} rodape={<><Button variante="secundario" onClick={onFechar}>Cancelar</Button><Button disabled={!p.valor || !p.numero || Boolean(erro)} onClick={async () => (await executar(() => api.registrarPedido({ contrato_id: c.contrato_id, numero: p.numero, data: p.data, valor: p.valor ?? 0, descricao: p.descricao || undefined }, usuario.id), "Pedido registrado.")) && onFechar()}>Registrar</Button></>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input rotulo="Número do pedido" obrigatorio value={p.numero} onChange={(e) => setP({ ...p, numero: e.target.value })} />
        <Input rotulo="Data" type="date" obrigatorio value={p.data} onChange={(e) => setP({ ...p, data: e.target.value })} />
        <InputNumero rotulo={`Valor (${disponivel.moeda})`} obrigatorio valor={p.valor} onValor={(v) => setP({ ...p, valor: v })} />
        <Input rotulo="Descrição" value={p.descricao} onChange={(e) => setP({ ...p, descricao: e.target.value })} />
      </div>
      <p className="mt-3 text-sm text-texto-suave">Disponível: {formatarMoeda(disponivel.disponivel, disponivel.moeda)}. Até a integração com o módulo de pedidos, o registro é feito aqui.</p>
      {erro && <div className="mt-3"><Aviso tom="critico">{erro}</Aviso></div>}
    </Modal>
  );
}
