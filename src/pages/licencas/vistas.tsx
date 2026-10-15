import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Phone, Plus, Search, UserMinus, X } from "lucide-react";
import { useApp } from "@/app/contexto";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { GradeValores, Valor } from "@/components/ui/Campos";
import { Aviso, Vazio } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { Paginacao, Tabela } from "@/components/ui/Tabela";
import { custoMensalAtribuicao, resumoColaborador } from "@/domain/rules/licencas";
import { formatarData } from "@/domain/datas";
import { formatarMoeda, formatarNumero, normalizarBusca } from "@/domain/formatacao";
import type { AtribuicaoLicenca, Colaborador } from "@/domain/types";
import { api } from "@/services";
import type { Contexto } from "./Licencas";

function Busca({ valor, onValor, placeholder }: { valor: string; onValor: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-texto-fraco" />
      <input value={valor} onChange={(e) => onValor(e.target.value)} placeholder={placeholder} className="h-9 w-full rounded-md border border-borda-forte pr-3 pl-9 text-sm" />
    </div>
  );
}

// ---------------------------------------------------------------- Por produto

export function PorProduto({ ctx, selecionado }: { ctx: Contexto; selecionado?: string }) {
  const { dados, resumos } = ctx;
  const { usuario, executar } = useApp();
  const [busca, setBusca] = useState("");
  const [verRemovidas, setVerRemovidas] = useState(false);
  const produtos = dados.produtos.filter((p) => p.categoria === "Software" && (!busca || normalizarBusca(`${p.nome} ${p.fornecedorNome}`).includes(normalizarBusca(busca)))).sort((a, b) => a.nome.localeCompare(b.nome));
  const p = dados.produtos.find((x) => x.id === selecionado) ?? produtos[0];
  const colab = useMemo(() => new Map(dados.colaboradores.map((c) => [c.id, c])), [dados.colaboradores]);

  if (!p) return <Vazio titulo="Nenhum produto cadastrado" descricao="Use “Novo produto” ou “Importar licenças”." />;
  if (p.categoria === "Linha telefônica") return <LinhasTelefonicas ctx={ctx} />;
  const r = resumos.get(p.id)!;
  const atribs = dados.atribuicoes.filter((a) => a.produtoId === p.id && (verRemovidas || a.status === "Ativa"));
  const contrato = ctx.codigoContrato(p.contrato_id);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
      <Card className="self-start">
        <div className="p-3"><Busca valor={busca} onValor={setBusca} placeholder="Buscar produto" /></div>
        <ul className="max-h-[70vh] divide-y divide-borda overflow-y-auto border-t border-borda">
          {produtos.map((x) => {
            const rx = resumos.get(x.id)!;
            return (
              <li key={x.id}>
                <button onClick={() => ctx.irPara("produto", x.id)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-fundo ${x.id === p.id ? "bg-primaria-50" : ""}`}>
                  <span className="min-w-0">
                    <span className={`block truncate ${x.situacao !== "Ativo" ? "text-texto-fraco line-through" : "font-medium"}`}>{x.nome}</span>
                    <span className="block truncate text-xs text-texto-suave">{x.fornecedorNome}</span>
                  </span>
                  <span className={`shrink-0 text-xs tabular ${rx.excedente ? "font-semibold text-critico-600" : "text-texto-suave"}`}>{rx.emUso}/{rx.contratadas}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader
            titulo={<span className="flex items-center gap-2">{p.nome} {p.situacao !== "Ativo" && <Badge>{p.situacao}</Badge>}</span>}
            subtitulo={p.fornecedorNome}
            acoes={ctx.podeGerir && (
              <>
                <Button variante="secundario" tamanho="sm" icone={<Pencil size={14} />} onClick={() => ctx.editarProduto(p)}>Editar</Button>
                {p.situacao === "Ativo" && <Button tamanho="sm" icone={<Plus size={14} />} onClick={() => ctx.atribuir(p)}>Atribuir</Button>}
              </>
            )}
          />
          <CardBody className="space-y-4">
            {!!p.confirmacoesPendentes?.length && <Aviso tom="alerta" titulo="A confirmar">{p.confirmacoesPendentes.join(" · ")}</Aviso>}
            {p.controlePorUsuario === false && <Aviso tom="info">Uso não controlado por pessoa: as licenças são consideradas em uso e não geram custo ocioso. Para controlar, edite o produto e ligue “Controlar uso por pessoa”.</Aviso>}
            {r.excedente > 0 && <Aviso tom="critico">Há {r.excedente} pessoa(s) acima da quantidade contratada. Verifique se a quantidade está desatualizada ou se há cobrança extra.</Aviso>}
            <GradeValores colunas={4}>
              <Valor rotulo="Contrato">{contrato ? <Link className="font-semibold text-primaria-800 hover:underline" to={`/contratos/${contrato.contrato_id}`}>{contrato.codigo}</Link> : "Sem contrato"}</Valor>
              <Valor rotulo="Contratadas · em uso · livres" origem="calculado">{r.contratadas} · {r.emUso} · {r.livres}</Valor>
              <Valor rotulo={`Valor por licença (${p.periodicidade.toLowerCase()})`}>{formatarMoeda(p.valorUnitario, p.moeda)}</Valor>
              <Valor rotulo="Licença/mês em BRL" origem="calculado">{formatarMoeda(r.custoUnitarioMensalBRL)}</Valor>
              <Valor rotulo="Custo anual" origem="calculado">{formatarMoeda(r.custoAnualBRL)}</Valor>
              <Valor rotulo="Com IOF e impostos" origem="calculado">{formatarMoeda(r.custoAnualComImpostosBRL)}</Valor>
              <Valor rotulo="Custo ocioso por ano" origem="calculado">{formatarMoeda(r.custoOciosoAnualBRL)}</Valor>
              <Valor rotulo="Vencimento">{p.vencimento ? formatarData(p.vencimento) : p.vencimentoTexto ?? "—"}</Valor>
            </GradeValores>
            {(p.responsavel || p.utilizacao || p.manutencao || p.substituto || p.riscos) && (
              <div className="rounded-md bg-fundo p-3">
                <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Ficha da ferramenta</p>
                <GradeValores colunas={2}>
                  <Valor rotulo="Responsável">{p.responsavel ?? "—"}</Valor>
                  <Valor rotulo="Utilização">{p.utilizacao ?? "—"}</Valor>
                  <Valor rotulo="Por que é mantida">{p.manutencao ?? "—"}</Valor>
                  <Valor rotulo="Quem pode substituir">{p.substituto ?? "—"}</Valor>
                  <Valor rotulo="Riscos" className="sm:col-span-2">{p.riscos ?? "—"}</Valor>
                </GradeValores>
              </div>
            )}
            {p.observacoes && <p className="text-xs whitespace-pre-line text-texto-suave">{p.observacoes}</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            titulo={`Quem usa (${r.emUso})`}
            acoes={<label className="flex items-center gap-2 text-xs text-texto-suave"><input type="checkbox" checked={verRemovidas} onChange={(e) => setVerRemovidas(e.target.checked)} /> Mostrar removidas</label>}
          />
          <Tabela<AtribuicaoLicenca>
            densa
            linhas={atribs.sort((a, b) => (colab.get(a.colaboradorId)?.nome ?? "").localeCompare(colab.get(b.colaboradorId)?.nome ?? ""))}
            chave={(a) => a.id}
            vazio="Ninguém usando este produto."
            colunas={[
              { id: "n", titulo: "Colaborador", render: (a) => { const c = colab.get(a.colaboradorId); return <button className="text-left hover:underline" onClick={() => ctx.irPara("pessoa", a.colaboradorId)}>{c?.nome ?? "—"}{c && !c.ativo && <Badge tom="critico" className="ml-2">Inativo</Badge>}</button>; } },
              { id: "e", titulo: "E-mail", render: (a) => <span className="text-xs text-texto-suave">{colab.get(a.colaboradorId)?.email ?? "—"}</span> },
              { id: "ar", titulo: "Área", render: (a) => colab.get(a.colaboradorId)?.area ?? "—" },
              { id: "d", titulo: "Desde", render: (a) => <span className="tabular">{formatarData(a.dataInicio)}</span> },
              { id: "s", titulo: "Situação", render: (a) => (a.status === "Ativa" ? <Badge tom="sucesso">Ativa</Badge> : <Badge>Removida {formatarData(a.dataFim)}</Badge>) },
              { id: "x", titulo: "", alinhamento: "direita", render: (a) => (ctx.podeGerir && a.status === "Ativa" ? <Button variante="fantasma" tamanho="sm" icone={<X size={14} />} onClick={() => executar(() => api.removerAtribuicao(a.id, usuario.id), "Licença removida.")}>Remover</Button> : null) },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Por pessoa

export function PorPessoa({ ctx, selecionado }: { ctx: Contexto; selecionado?: string }) {
  const { dados } = ctx;
  const { usuario, executar, nomeEmpresa } = useApp();
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [confirmarDesligamento, setConfirmarDesligamento] = useState(false);
  const produtos = useMemo(() => new Map(dados.produtos.map((p) => [p.id, p])), [dados.produtos]);
  const lista = dados.colaboradores
    .filter((c) => !busca || normalizarBusca(`${c.nome} ${c.email ?? ""} ${c.area ?? ""}`).includes(normalizarBusca(busca)))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const sel = dados.colaboradores.find((c) => c.id === selecionado);
  const TAM = 25;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
      <Card className="min-w-0">
        <div className="p-3"><Busca valor={busca} onValor={(v) => (setBusca(v), setPagina(0))} placeholder="Buscar por nome, e-mail ou área" /></div>
        <Tabela<Colaborador>
          densa
          linhas={lista.slice(pagina * TAM, (pagina + 1) * TAM)}
          chave={(c) => c.id}
          onLinha={(c) => ctx.irPara("pessoa", c.id)}
          vazio="Nenhum colaborador."
          colunas={[
            { id: "n", titulo: "Nome", render: (c) => <span className={c.id === selecionado ? "font-semibold" : ""}>{c.nome}{c.tipo === "Conta compartilhada" && <Badge className="ml-2">Conta compartilhada</Badge>}</span> },
            { id: "e", titulo: "E-mail", render: (c) => <span className="text-xs text-texto-suave">{c.email ?? <span className="text-alerta-600">a completar</span>}</span> },
            { id: "a", titulo: "Área", render: (c) => c.area ?? "—" },
            { id: "l", titulo: "Licenças", alinhamento: "direita", render: (c) => <span className="tabular">{resumoColaborador(c.id, dados.atribuicoes, dados.produtos).licencas}</span> },
            { id: "v", titulo: "Custo/mês", alinhamento: "direita", render: (c) => <span className="tabular">{formatarMoeda(resumoColaborador(c.id, dados.atribuicoes, dados.produtos).custoMensalBRL)}</span> },
            { id: "s", titulo: "", render: (c) => (!c.ativo ? <Badge tom="neutro">Inativo</Badge> : c.confirmacoesPendentes?.length ? <span title={c.confirmacoesPendentes.join("; ")}><Badge tom="alerta">Confirmar</Badge></span> : null) },
          ]}
        />
        <Paginacao pagina={pagina} total={lista.length} tamanho={TAM} onPagina={setPagina} />
      </Card>

      <div className="space-y-4">
        {sel ? (
          <Card>
            <CardHeader
              titulo={sel.nome}
              subtitulo={[sel.email, sel.area, sel.empresaId && nomeEmpresa(sel.empresaId)].filter(Boolean).join(" · ")}
              acoes={ctx.podeGerir && <Button variante="secundario" tamanho="sm" icone={<Pencil size={14} />} onClick={() => ctx.editarColaborador(sel)}>Editar</Button>}
            />
            <CardBody className="space-y-3">
              {!!sel.confirmacoesPendentes?.length && <Aviso tom="alerta">{sel.confirmacoesPendentes.join(" · ")}</Aviso>}
              {(() => {
                const r = resumoColaborador(sel.id, dados.atribuicoes, dados.produtos);
                return <p className="text-sm">{r.licencas} licença(s) ativa(s) · <b>{formatarMoeda(r.custoMensalBRL)}</b> por mês</p>;
              })()}
              <ul className="divide-y divide-borda rounded-md border border-borda">
                {dados.atribuicoes.filter((a) => a.colaboradorId === sel.id && a.status === "Ativa").map((a) => {
                  const p = produtos.get(a.produtoId);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <button className="min-w-0 text-left hover:underline" onClick={() => p && ctx.irPara(p.categoria === "Linha telefônica" ? "linhas" : "produto", p.id)}>
                        <span className="block truncate">{p?.nome}{a.linha ? ` · ${a.linha.numero}` : ""}</span>
                        <span className="block text-xs text-texto-suave">{p?.fornecedorNome}</span>
                      </button>
                      <span className="shrink-0 text-xs tabular">{p ? formatarMoeda(custoMensalAtribuicao(a, p)) : "—"}</span>
                      {ctx.podeGerir && <button aria-label="Remover" className="rounded p-1 text-texto-suave hover:bg-critico-50 hover:text-critico-600" onClick={() => executar(() => api.removerAtribuicao(a.id, usuario.id), "Licença removida.")}><X size={14} /></button>}
                    </li>
                  );
                })}
              </ul>
              {ctx.podeGerir && dados.atribuicoes.some((a) => a.colaboradorId === sel.id && a.status === "Ativa") && (
                <Button variante="perigo" icone={<UserMinus size={16} />} onClick={() => setConfirmarDesligamento(true)}>Remover todas as licenças</Button>
              )}
            </CardBody>
          </Card>
        ) : (
          <Card><Vazio titulo="Selecione uma pessoa" descricao="Veja todas as licenças dela, o custo por mês e remova tudo em caso de desligamento." /></Card>
        )}
      </div>

      <Modal
        aberto={confirmarDesligamento && Boolean(sel)}
        titulo="Remover todas as licenças"
        onFechar={() => setConfirmarDesligamento(false)}
        rodape={
          <>
            <Button variante="secundario" onClick={() => setConfirmarDesligamento(false)}>Cancelar</Button>
            <Button
              variante="perigo"
              onClick={async () => {
                const n = await executar(() => api.removerLicencasDoColaborador(sel!.id, usuario.id));
                if (n !== undefined) {
                  if (sel!.ativo) await executar(() => api.salvarColaborador({ ...sel!, ativo: false }, usuario.id));
                  setConfirmarDesligamento(false);
                }
              }}
            >
              Remover e marcar como inativo
            </Button>
          </>
        }
      >
        <p className="text-sm">Todas as licenças de <b>{sel?.nome}</b> serão removidas (o histórico é mantido) e a pessoa será marcada como inativa. Lembre de cancelar os acessos também nas ferramentas.</p>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- Linhas telefônicas

export function LinhasTelefonicas({ ctx }: { ctx: Contexto }) {
  const { dados, resumos } = ctx;
  const { usuario, executar } = useApp();
  const produtosLinha = dados.produtos.filter((p) => p.categoria === "Linha telefônica" && p.situacao === "Ativo");
  const colab = new Map(dados.colaboradores.map((c) => [c.id, c]));
  const prod = new Map(produtosLinha.map((p) => [p.id, p]));
  const linhas = dados.atribuicoes.filter((a) => a.status === "Ativa" && prod.has(a.produtoId));
  const total = produtosLinha.reduce((acc, p) => acc + (resumos.get(p.id)!.custoMensalBRL ?? 0), 0);

  if (!produtosLinha.length)
    return <Vazio icone={<Phone size={28} />} titulo="Nenhum plano de linhas cadastrado" descricao="Cadastre um produto com categoria “Linha telefônica” (ex.: Linhas móveis Claro) e atribua as linhas aos colaboradores." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {produtosLinha.map((p) => {
          const c = ctx.codigoContrato(p.contrato_id);
          return (
            <Card key={p.id} className="min-w-[260px] flex-1 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{p.nome}</p>
                  <p className="text-xs text-texto-suave">{p.fornecedorNome}{c ? <> · <Link className="text-primaria-800 hover:underline" to={`/contratos/${c.contrato_id}`}>{c.codigo}</Link></> : " · sem contrato"}</p>
                </div>
                {ctx.podeGerir && <Button tamanho="sm" icone={<Plus size={14} />} onClick={() => ctx.atribuir(p)}>Linha</Button>}
              </div>
              <p className="mt-2 text-sm tabular">{resumos.get(p.id)!.emUso} linha(s) · {formatarMoeda(resumos.get(p.id)!.custoMensalBRL)}/mês</p>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader titulo={`Linhas ativas (${linhas.length})`} subtitulo={`Total mensal: ${formatarMoeda(total)} · anual: ${formatarMoeda(total * 12)}`} />
        <Tabela<AtribuicaoLicenca>
          densa
          linhas={linhas.sort((a, b) => (colab.get(a.colaboradorId)?.nome ?? "").localeCompare(colab.get(b.colaboradorId)?.nome ?? ""))}
          chave={(a) => a.id}
          colunas={[
            { id: "num", titulo: "Número", render: (a) => <span className="whitespace-nowrap tabular">{a.linha?.numero ?? "—"}</span> },
            { id: "op", titulo: "Operadora", render: (a) => a.linha?.operadora ?? prod.get(a.produtoId)?.fornecedorNome },
            { id: "pl", titulo: "Plano", render: (a) => <span className="text-xs">{a.linha?.plano ?? "—"}</span> },
            { id: "c", titulo: "Colaborador", render: (a) => <button className="text-left hover:underline" onClick={() => ctx.irPara("pessoa", a.colaboradorId)}>{colab.get(a.colaboradorId)?.nome ?? "—"}</button> },
            { id: "ar", titulo: "Área / CC", render: (a) => <span className="text-xs">{[colab.get(a.colaboradorId)?.area, colab.get(a.colaboradorId)?.centroCusto].filter(Boolean).join(" · ") || "—"}</span> },
            { id: "v", titulo: "Custo/mês", alinhamento: "direita", render: (a) => <span className="tabular">{formatarMoeda(a.valorMensalBRL)}</span> },
            { id: "x", titulo: "", alinhamento: "direita", render: (a) => (ctx.podeGerir ? <Button variante="fantasma" tamanho="sm" icone={<X size={14} />} onClick={() => executar(() => api.removerAtribuicao(a.id, usuario.id), "Linha removida.")}>Remover</Button> : null) },
          ]}
        />
      </Card>
      <p className="text-xs text-texto-fraco">{formatarNumero(linhas.length)} linha(s). O custo de cada linha vem do valor informado (fatura).</p>
    </div>
  );
}
