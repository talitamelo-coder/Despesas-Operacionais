import { useEffect, useState, type ReactNode } from "react";
import { useApp, useOpcoes } from "@/app/contexto";
import { Button } from "@/components/ui/Button";
import { Input, InputNumero, Select, Textarea, Toggle } from "@/components/ui/Campos";
import { Aviso } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import type { Contrato, FonteCotacao, IndiceReajuste, Moeda, Periodicidade, TipoVigencia } from "@/domain/types";
import { api } from "@/services";

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-b border-borda pb-5 last:border-0 last:pb-0">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-texto-suave uppercase">{titulo}</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{children}</div>
    </section>
  );
}

/**
 * Edição direta dos dados do contrato (correção de cadastro, contratos importados).
 * Alterações comerciais negociadas devem passar por um processo (renovação, aditivo).
 * Toda alteração é registrada na auditoria, campo a campo.
 */
export function EditarContratoModal({ contrato, aberto, onFechar }: { contrato: Contrato; aberto: boolean; onFechar: () => void }) {
  const { usuario, executar, nomeUsuario } = useApp();
  const op = useOpcoes();
  const [c, setC] = useState<Contrato>(contrato);
  const [revisado, setRevisado] = useState(false);
  useEffect(() => {
    if (aberto) {
      setC(structuredClone(contrato));
      setRevisado(false);
    }
  }, [aberto, contrato]);

  // A pessoa já atribuída sempre aparece na lista, mesmo com outro perfil (ex.: Administrador como gestor).
  const comAtual = (lista: { valor: string; rotulo: string }[], id?: string) =>
    !id || lista.some((o) => o.valor === id) ? lista : [{ valor: id, rotulo: nomeUsuario(id) }, ...lista];
  const set = (p: Partial<Contrato>) => setC((x) => ({ ...x, ...p }));
  const cond = (p: Partial<Contrato["condicoes"]>) => setC((x) => ({ ...x, condicoes: { ...x.condicoes, ...p } }));
  const vig = (p: Partial<Contrato["vigencia"]>) => setC((x) => ({ ...x, vigencia: { ...x.vigencia, ...p } }));
  const confirmacoes = contrato.confirmacoesPendentes ?? [];

  const salvar = async () => {
    const { saving: _s, ...resto } = c; // saving é editado na aba própria (Suprimentos/Admin)
    const patch: Partial<Contrato> = { ...resto, confirmacoesPendentes: revisado ? [] : c.confirmacoesPendentes };
    if (await executar(() => api.atualizarContrato(c.contrato_id, patch, usuario.id), "Contrato atualizado.")) onFechar();
  };

  return (
    <Modal
      aberto={aberto}
      titulo={`Editar contrato ${contrato.codigo}`}
      largura="xl"
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secundario" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar}>Salvar alterações</Button>
        </>
      }
    >
      <div className="space-y-5">
        {confirmacoes.length > 0 && (
          <Aviso tom="alerta" titulo="Pontos a confirmar (importação)">
            <ul className="list-disc pl-4">
              {confirmacoes.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <label className="mt-2 flex items-center gap-2 font-medium">
              <input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)} />
              Revisei e confirmei estes pontos
            </label>
          </Aviso>
        )}

        <Secao titulo="Dados gerais">
          <Select rotulo="Empresa" obrigatorio vazio={false} opcoes={op.empresas} value={c.empresaId} onChange={(e) => set({ empresaId: e.target.value })} />
          <Select rotulo="Fornecedor" obrigatorio vazio={false} className="md:col-span-2" opcoes={op.fornecedores} value={c.fornecedorId} onChange={(e) => set({ fornecedorId: e.target.value })} />
          <Textarea rotulo="Objeto" obrigatorio className="md:col-span-3" value={c.objeto} onChange={(e) => set({ objeto: e.target.value })} />
          <Select rotulo="Tipo de contrato" vazio={false} opcoes={op.tipos} value={c.tipoContratoId} onChange={(e) => set({ tipoContratoId: e.target.value })} />
          <Input rotulo="Centro de custo" value={c.centroCusto ?? ""} onChange={(e) => set({ centroCusto: e.target.value || undefined })} />
          <Input rotulo="Projeto" value={c.projeto ?? ""} onChange={(e) => set({ projeto: e.target.value || undefined })} />
          <Select rotulo="Gestor" vazio={false} opcoes={comAtual(op.gestores, c.gestorId)} value={c.gestorId} onChange={(e) => set({ gestorId: e.target.value })} />
          <Select rotulo="Diretor" opcoes={comAtual(op.diretores, c.diretorId)} value={c.diretorId ?? ""} onChange={(e) => set({ diretorId: e.target.value || undefined })} />
          <Select rotulo="Analista de Suprimentos" vazio={false} opcoes={comAtual(op.analistas, c.analistaId)} value={c.analistaId} onChange={(e) => set({ analistaId: e.target.value })} />
        </Secao>

        <Secao titulo="Condições comerciais">
          <Select rotulo="Moeda" vazio={false} opcoes={op.moedas} value={c.condicoes.moeda} onChange={(e) => cond({ moeda: e.target.value as Moeda })} />
          <InputNumero rotulo={`Valor anual (${c.condicoes.moeda})`} obrigatorio valor={c.condicoes.valorAnual || undefined} onValor={(v) => cond({ valorAnual: v ?? 0 })} />
          <Select rotulo="Periodicidade de pagamento" vazio={false} opcoes={op.periodicidades} value={c.condicoes.periodicidadePagamento} onChange={(e) => cond({ periodicidadePagamento: e.target.value as Periodicidade })} />
          <InputNumero rotulo="Quantidade" valor={c.condicoes.quantidade} onValor={(v) => cond({ quantidade: v })} />
          <Input rotulo="Unidade" placeholder="licenças, meses, postos…" value={c.condicoes.unidade ?? ""} onChange={(e) => cond({ unidade: e.target.value || undefined })} />
          <Input rotulo="Condição de pagamento" value={c.condicoes.condicaoPagamento} onChange={(e) => cond({ condicaoPagamento: e.target.value })} />
          {c.condicoes.moeda !== "BRL" && (
            <>
              <InputNumero rotulo="Cotação (R$ por unidade da moeda)" obrigatorio valor={c.condicoes.cotacao?.valor} onValor={(v) => cond({ cotacao: v ? { data: c.condicoes.cotacao?.data ?? new Date().toISOString().slice(0, 10), fonte: c.condicoes.cotacao?.fonte ?? "PTAX", ...c.condicoes.cotacao, valor: v } : undefined })} />
              <Input rotulo="Data da cotação" type="date" value={c.condicoes.cotacao?.data ?? ""} onChange={(e) => c.condicoes.cotacao && cond({ cotacao: { ...c.condicoes.cotacao, data: e.target.value } })} />
              <Select rotulo="Fonte" vazio={false} opcoes={op.fontesCotacao} value={c.condicoes.cotacao?.fonte ?? "PTAX"} onChange={(e) => c.condicoes.cotacao && cond({ cotacao: { ...c.condicoes.cotacao, fonte: e.target.value as FonteCotacao } })} />
            </>
          )}
        </Secao>

        <Secao titulo="Vigência e renovação">
          <Input rotulo="Data início" obrigatorio type="date" value={c.vigencia.dataInicio} onChange={(e) => vig({ dataInicio: e.target.value })} />
          <Input rotulo="Data fim" obrigatorio={c.vigencia.tipoVigencia === "Prazo determinado"} type="date" value={c.vigencia.dataFim} onChange={(e) => vig({ dataFim: e.target.value })} />
          <Select rotulo="Tipo de vigência" vazio={false} opcoes={["Prazo determinado", "Prazo indeterminado"].map((v) => ({ valor: v, rotulo: v }))} value={c.vigencia.tipoVigencia} onChange={(e) => vig({ tipoVigencia: e.target.value as TipoVigencia })} />
          <InputNumero rotulo="Aviso prévio (dias)" valor={c.vigencia.avisoPrevioDias} onValor={(v) => vig({ avisoPrevioDias: v ?? 0 })} />
          <InputNumero rotulo="Prazo do gestor (dias)" valor={c.vigencia.prazoGestorDias} onValor={(v) => vig({ prazoGestorDias: v ?? 30 })} />
          <div className="flex items-end pb-1">
            <Toggle rotulo="Renovação automática" checked={c.vigencia.renovacaoAutomatica} onChange={(v) => vig({ renovacaoAutomatica: v })} />
          </div>
        </Secao>

        <Secao titulo="Reajuste e rescisão">
          <div className="flex items-end pb-1">
            <Toggle rotulo="Possui reajuste" checked={c.reajuste.possui} onChange={(v) => set({ reajuste: { ...c.reajuste, possui: v } })} />
          </div>
          {c.reajuste.possui ? (
            <>
              <Select rotulo="Índice" opcoes={op.indices} value={c.reajuste.indice ?? ""} onChange={(e) => set({ reajuste: { ...c.reajuste, indice: (e.target.value || undefined) as IndiceReajuste | undefined } })} />
              <InputNumero rotulo="Percentual previsto (%)" valor={c.reajuste.percentualPrevisto} onValor={(v) => set({ reajuste: { ...c.reajuste, percentualPrevisto: v } })} />
              <Input rotulo="Data-base" type="date" value={c.reajuste.dataBase ?? ""} onChange={(e) => set({ reajuste: { ...c.reajuste, dataBase: e.target.value || undefined } })} />
              <InputNumero rotulo="Periodicidade (meses)" valor={c.reajuste.periodicidadeMeses} onValor={(v) => set({ reajuste: { ...c.reajuste, periodicidadeMeses: v } })} />
              <div />
            </>
          ) : (
            <div className="md:col-span-2" />
          )}
          <div className="flex items-end pb-1">
            <Toggle rotulo="Possui multa rescisória" checked={c.rescisao.possuiMulta} onChange={(v) => set({ rescisao: { ...c.rescisao, possuiMulta: v } })} />
          </div>
          <InputNumero rotulo="Multa (%)" valor={c.rescisao.percentual} onValor={(v) => set({ rescisao: { ...c.rescisao, percentual: v } })} />
          <InputNumero rotulo="Aviso prévio rescisão (dias)" valor={c.rescisao.avisoPrevioDias} onValor={(v) => set({ rescisao: { ...c.rescisao, avisoPrevioDias: v } })} />
          <Textarea rotulo="Regra de rescisão / multa" className="md:col-span-3" value={c.rescisao.regra ?? ""} onChange={(e) => set({ rescisao: { ...c.rescisao, regra: e.target.value || undefined } })} />
        </Secao>

        <Secao titulo="Observações">
          <Textarea rotulo="Observações" className="md:col-span-3" rows={6} value={c.observacoes ?? ""} onChange={(e) => set({ observacoes: e.target.value || undefined })} />
        </Secao>
      </div>
    </Modal>
  );
}
