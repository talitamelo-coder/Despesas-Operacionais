import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Input, Select } from "@/components/ui/Campos";
import { nomeDoBanco, REGIMES_TRIBUTARIOS, TIPOS_CHAVE_PIX, TIPOS_CONTA, UFS } from "@/domain/rules/fornecedor";
import type { DadosBancarios, Fornecedor, Pix, RegimeTributario, StatusCadastralFornecedor, TipoChavePix, TipoConta } from "@/domain/types";

function Secao({ titulo, children, nota }: { titulo: string; children: ReactNode; nota?: ReactNode }) {
  return (
    <section className="border-b border-borda pb-5 last:border-0 last:pb-0">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-texto-suave uppercase">{titulo}</h3>
      {nota}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

const opcoes = (l: string[]) => l.map((v) => ({ valor: v, rotulo: v }));

/** Formulário completo de fornecedor: dados gerais, endereço, dados bancários e PIX. */
export function FornecedorForm({ f, onChange, erros }: { f: Fornecedor; onChange: (f: Fornecedor) => void; erros: Record<string, string> }) {
  const set = (p: Partial<Fornecedor>) => onChange({ ...f, ...p });
  const banco = f.dadosBancarios ?? {};
  const setBanco = (p: Partial<DadosBancarios>) => set({ dadosBancarios: { ...banco, ...p } });
  const pix: Pix = f.pix ?? { tipo: "CNPJ" };
  const setPix = (p: Partial<Pix>) => set({ pix: { ...pix, ...p } });
  const nomeSugerido = nomeDoBanco(banco.codigoBanco);

  return (
    <div className="space-y-5">
      <Secao titulo="Dados gerais">
        <Input rotulo="Razão Social" obrigatorio className="md:col-span-2" placeholder="Nome empresarial completo" value={f.razaoSocial} onChange={(e) => set({ razaoSocial: e.target.value })} erro={erros.razaoSocial} />
        <Input rotulo="Nome Fantasia" placeholder="Opcional" value={f.nomeFantasia} onChange={(e) => set({ nomeFantasia: e.target.value })} />
        <div>
          <Input
            rotulo="CNPJ"
            obrigatorio={!f.estrangeiro && f.statusCadastral !== "Potencial"}
            placeholder="00.000.000/0000-00"
            disabled={f.estrangeiro}
            value={f.cnpj ?? ""}
            onChange={(e) => set({ cnpj: e.target.value })}
            erro={erros.cnpj}
          />
          <label className="mt-1.5 flex items-center gap-2 text-xs text-texto-suave">
            <input type="checkbox" checked={Boolean(f.estrangeiro)} onChange={(e) => set({ estrangeiro: e.target.checked, cnpj: e.target.checked ? undefined : f.cnpj })} />
            Fornecedor estrangeiro (sem CNPJ)
          </label>
        </div>
        <Input rotulo="Inscrição Estadual" placeholder="Opcional" value={f.inscricaoEstadual ?? ""} onChange={(e) => set({ inscricaoEstadual: e.target.value })} />
        <Input rotulo="E-mail" type="email" placeholder="financeiro@empresa.com.br" value={f.email ?? ""} onChange={(e) => set({ email: e.target.value })} erro={erros.email} />
        <Input rotulo="Telefone" placeholder="(11) 99999-9999" value={f.telefone ?? ""} onChange={(e) => set({ telefone: e.target.value })} erro={erros.telefone} />
        <Select rotulo="Regime Tributário" vazio={false} opcoes={opcoes(REGIMES_TRIBUTARIOS)} value={f.regimeTributario ?? "Não informado"} onChange={(e) => set({ regimeTributario: e.target.value as RegimeTributario })} />
        <Input rotulo="Código no sistema atual" placeholder="Opcional" value={f.codigoFornecedor ?? ""} onChange={(e) => set({ codigoFornecedor: e.target.value || undefined })} />
        <Select rotulo="Status cadastral" vazio={false} opcoes={opcoes(["Ativo", "Inativo", "Bloqueado", "Potencial"])} value={f.statusCadastral} onChange={(e) => set({ statusCadastral: e.target.value as StatusCadastralFornecedor })} />
      </Secao>

      <Secao titulo="Endereço">
        <Input rotulo="Endereço" className="md:col-span-2" placeholder="Rua, número, complemento" value={f.endereco ?? ""} onChange={(e) => set({ endereco: e.target.value })} />
        <Input rotulo="Cidade" placeholder="São Paulo" value={f.cidade ?? ""} onChange={(e) => set({ cidade: e.target.value })} />
        <Select rotulo="UF" vazio="Selecione…" opcoes={opcoes(UFS)} value={f.uf ?? ""} onChange={(e) => set({ uf: e.target.value || undefined })} erro={erros.uf} />
        <Input rotulo="CEP" className="md:w-1/2" placeholder="00000-000" value={f.cep ?? ""} onChange={(e) => set({ cep: e.target.value })} erro={erros.cep} />
      </Secao>

      <Secao
        titulo="Dados bancários"
        nota={
          <p className="mb-3 flex items-center gap-1.5 text-xs text-texto-suave">
            <Lock size={12} /> Dado sensível: aparece mascarado nas consultas e no histórico. A fonte oficial para pagamento continua sendo o sistema atual.
          </p>
        }
      >
        <Input
          rotulo="Código do Banco"
          placeholder="341"
          inputMode="numeric"
          value={banco.codigoBanco ?? ""}
          onChange={(e) => {
            const codigo = e.target.value;
            const anterior = nomeDoBanco(banco.codigoBanco);
            // Sugere o nome do banco pelo código, sem sobrescrever um nome digitado.
            const nome = !banco.nomeBanco || banco.nomeBanco === anterior ? nomeDoBanco(codigo) ?? banco.nomeBanco : banco.nomeBanco;
            setBanco({ codigoBanco: codigo, nomeBanco: nome });
          }}
          erro={erros["dadosBancarios.codigoBanco"]}
        />
        <Input rotulo="Nome do Banco" placeholder="Banco Itaú S/A" origem={nomeSugerido && banco.nomeBanco === nomeSugerido ? "calculado" : undefined} value={banco.nomeBanco ?? ""} onChange={(e) => setBanco({ nomeBanco: e.target.value })} />
        <Input rotulo="Agência" placeholder="0001" inputMode="numeric" value={banco.agencia ?? ""} onChange={(e) => setBanco({ agencia: e.target.value })} erro={erros["dadosBancarios.agencia"]} />
        <Input rotulo="Dígito da Agência" placeholder="X" maxLength={2} value={banco.digitoAgencia ?? ""} onChange={(e) => setBanco({ digitoAgencia: e.target.value })} />
        <Input rotulo="Conta" placeholder="00000000" inputMode="numeric" value={banco.conta ?? ""} onChange={(e) => setBanco({ conta: e.target.value })} erro={erros["dadosBancarios.conta"]} />
        <Input rotulo="Dígito da Conta" placeholder="0" maxLength={2} value={banco.digitoConta ?? ""} onChange={(e) => setBanco({ digitoConta: e.target.value })} />
        <Select rotulo="Tipo de Conta" className="md:w-1/2" vazio={false} opcoes={opcoes(TIPOS_CONTA)} value={banco.tipoConta ?? "Corrente"} onChange={(e) => setBanco({ tipoConta: e.target.value as TipoConta })} />
      </Secao>

      <Secao titulo="PIX (opcional)">
        <Select
          rotulo="Tipo de Chave PIX"
          vazio={false}
          opcoes={opcoes(TIPOS_CHAVE_PIX)}
          value={pix.tipo}
          onChange={(e) => {
            const tipo = e.target.value as TipoChavePix;
            // Chave CNPJ: o sistema já sabe o CNPJ do fornecedor.
            setPix({ tipo, chave: tipo === "CNPJ" && !pix.chave ? f.cnpj : pix.chave });
          }}
        />
        <Input rotulo="Chave PIX" placeholder="Chave PIX" value={pix.chave ?? ""} onChange={(e) => setPix({ chave: e.target.value })} erro={erros["pix.chave"]} />
      </Secao>
    </div>
  );
}
