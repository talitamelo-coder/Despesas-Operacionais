import { useState } from "react";
import { useApp } from "@/app/contexto";
import { Button } from "@/components/ui/Button";
import { GradeValores, Input, InputNumero, Select, Textarea, Valor } from "@/components/ui/Campos";
import { Aviso } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { Tabela } from "@/components/ui/Tabela";
import { formatarData, hoje } from "@/domain/datas";
import { formatarMoeda } from "@/domain/formatacao";
import { aplicarAditivoRegistrado, receitaMensalNaData, valorMensalFixoNaData, type NovoAditivo } from "@/domain/rules/receita";
import type { Contrato, TipoAditivo } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";

const TIPOS: TipoAditivo[] = ["Valor", "Prazo", "Valor e prazo", "Escopo", "Renegociação"];

/** Registro de aditivo: a única forma de mudar valor ou prazo de um contrato já registrado. */
export function AditivoModal({ c, onFechar }: { c: Contrato; onFechar: () => void }) {
  const { usuario, executar } = useApp();
  const receita = c.natureza === "Receita";
  const [a, setA] = useState<NovoAditivo>({ contrato_id: c.contrato_id, numero: "", data: hoje(), tipo: "Valor", descricao: "" });
  const [tentou, setTentou] = useState(false);
  const set = (p: Partial<NovoAditivo>) => setA({ ...a, ...p });
  const previa = aplicarAditivoRegistrado(c, a);
  const valor = a.tipo === "Valor" || a.tipo === "Valor e prazo" || a.tipo === "Renegociação";
  const prazo = a.tipo === "Prazo" || a.tipo === "Valor e prazo" || a.tipo === "Renegociação";
  const m = (v?: number) => formatarMoeda(v, c.condicoes.moeda);
  const salvar = async () => {
    setTentou(true);
    if (previa.erros.length) return;
    if (await executar(() => api.registrarAditivo(a, usuario.id), `Aditivo ${a.numero} registrado.`)) onFechar();
  };
  return (
    <Modal aberto titulo={`Registrar aditivo · ${c.codigo}`} largura="lg" onFechar={onFechar} rodape={<><Button variante="secundario" onClick={onFechar}>Cancelar</Button><Button onClick={salvar}>Registrar aditivo</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Input rotulo="Número do aditivo" obrigatorio placeholder="Ex.: 3º Aditivo" value={a.numero} onChange={(e) => set({ numero: e.target.value })} />
          <Input rotulo="Data de assinatura" type="date" obrigatorio value={a.data} onChange={(e) => set({ data: e.target.value })} />
          <Select rotulo="Tipo" vazio={false} value={a.tipo} onChange={(e) => set({ tipo: e.target.value as TipoAditivo })} opcoes={TIPOS.map((t) => ({ valor: t, rotulo: t }))} />
          <Textarea className="md:col-span-3" rotulo="Descrição" obrigatorio value={a.descricao} onChange={(e) => set({ descricao: e.target.value })} placeholder="O que o aditivo muda e por quê" />
        </div>
        {valor && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <InputNumero rotulo={`Variação do valor total (${c.condicoes.moeda})`} ajuda="Positivo aumenta o saldo; negativo reduz." valor={a.variacaoValorTotal} onValor={(v) => set({ variacaoValorTotal: v })} />
            {receita ? (
              <>
                <InputNumero rotulo={`Novo valor mensal fixo (${c.condicoes.moeda})`} ajuda={`Hoje: ${m(c.receita ? valorMensalFixoNaData(c.receita, hoje()) : 0)}`} valor={a.novoValorMensalFixo} onValor={(v) => set({ novoValorMensalFixo: v })} />
                <Input rotulo="Novo valor vale a partir de" type="date" value={a.aPartirDe ?? ""} onChange={(e) => set({ aPartirDe: e.target.value || undefined })} />
              </>
            ) : (
              <InputNumero rotulo={`Novo valor anual (${c.condicoes.moeda})`} ajuda={`Hoje: ${m(c.condicoes.valorAnual)}`} valor={a.novoValorAnual} onValor={(v) => set({ novoValorAnual: v })} />
            )}
          </div>
        )}
        {prazo && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input rotulo="Nova data de fim" type="date" ajuda={`Hoje: ${c.vigencia.dataFim ? formatarData(c.vigencia.dataFim) : "indeterminado"}`} value={a.novaDataFim ?? ""} onChange={(e) => set({ novaDataFim: e.target.value || undefined })} />
          </div>
        )}
        <div className="rounded-md bg-fundo px-3 py-2 text-sm">
          Antes: <b>{previa.antes}</b> → Depois: <b>{previa.depois}</b>
          <span className="block text-xs text-texto-suave">Fica no histórico de aditivos e na auditoria. O contrato anterior a este nunca é alterado.</span>
        </div>
        {tentou && previa.erros.length > 0 && <Aviso tom="critico">{previa.erros.join(" ")}</Aviso>}
      </div>
    </Modal>
  );
}

export function BlocoAditivos({ c }: { c: Contrato }) {
  const { pode, nomeUsuario } = useApp();
  const { dados } = useConsulta(() => api.listarAditivos(c.contrato_id), [c.contrato_id]);
  const [novo, setNovo] = useState(false);
  return (
    <div className="space-y-3">
      <Tabela
        densa
        linhas={dados ?? []}
        chave={(a) => a.id}
        vazio="Nenhum aditivo registrado."
        colunas={[
          { id: "n", titulo: "Aditivo", render: (a) => <span className="font-medium">{a.numero}<span className="block text-xs font-normal text-texto-suave">{a.tipo}</span></span> },
          { id: "d", titulo: "Data", render: (a) => formatarData(a.data) },
          { id: "desc", titulo: "Descrição", render: (a) => a.descricao },
          { id: "m", titulo: "Mudança", render: (a) => <span className="text-xs">{a.antes} → {a.depois}</span> },
          { id: "u", titulo: "Registrado por", render: (a) => nomeUsuario(a.registradoPorId) },
        ]}
      />
      {pode("editar_processo") && c.status === "Vigente" && <Button tamanho="sm" variante="secundario" onClick={() => setNovo(true)}>Registrar aditivo</Button>}
      {novo && <AditivoModal c={c} onFechar={() => setNovo(false)} />}
    </div>
  );
}

/** Valores contratados de um contrato de cliente (somente leitura: mudam por aditivo). */
export function BlocoValoresReceita({ c }: { c: Contrato }) {
  const r = c.receita;
  if (!r) return null;
  const m = (v?: number) => formatarMoeda(v, c.condicoes.moeda);
  const h = hoje();
  return (
    <div className="space-y-3">
      {r.contratoPrincipalId && <Aviso tom="info">Receita apurada no contrato principal; aqui não soma de novo.</Aviso>}
      <GradeValores colunas={4}>
        <Valor rotulo="Tipo de receita">{r.tipoReceita}</Valor>
        <Valor rotulo="Fixo mensal vigente" origem="calculado">{r.tipoReceita === "Variável" ? "—" : m(valorMensalFixoNaData(r, h))}</Valor>
        <Valor rotulo="Variável estimado / mês">{r.tipoReceita === "Fixa" ? "—" : m(r.valorMensalVariavelEstimado)}</Valor>
        <Valor rotulo="Receita mensal estimada" origem="calculado">{m(receitaMensalNaData(r, h))}</Valor>
        <Valor rotulo="Valor total contratado">{r.valorTotalContratado ? m(r.valorTotalContratado) : "Não informado (saldo pelo fixo × meses)"}</Valor>
        <Valor rotulo="Moeda">{c.condicoes.moeda}</Valor>
      </GradeValores>
      {r.escalonamento?.length ? (
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-texto-suave uppercase">Valores previstos</p>
          <ul className="divide-y divide-borda rounded-md border border-borda text-sm">
            <li className="flex justify-between px-3 py-1.5"><span>Início ({formatarData(c.vigencia.dataInicio)})</span><span className="tabular">{m(r.valorMensalFixo)}/mês</span></li>
            {[...r.escalonamento].sort((a, b) => a.aPartirDe.localeCompare(b.aPartirDe)).map((e) => (
              <li key={e.aPartirDe} className="flex justify-between px-3 py-1.5"><span>A partir de {formatarData(e.aPartirDe)}</span><span className="tabular">{m(e.valorMensalFixo)}/mês</span></li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-texto-fraco">Medição da parte variável e faturamento são feitos no Contas a receber, respeitando estes valores. Mudanças entram por aditivo, renegociação ou novo contrato.</p>
    </div>
  );
}
