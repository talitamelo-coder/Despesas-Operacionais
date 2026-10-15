# Importação da planilha de licenças

Converte a planilha "Fornecedores e Licença" em um arquivo de importação de licenças,
carregado em **Licenças → Importar licenças** (perfis Administrador, Suprimentos ou TI).

```bash
pip install openpyxl
python3 -I converter_licencas.py licencas.xlsx backup-contratos.json licencas-importacao.json relatorio-licencas.xlsx
```

`backup-contratos.json` é a cópia de segurança atual do sistema (Administração → Dados e backup),
usada só para sugerir o contrato de cada produto. **Nenhum contrato é alterado.**

Regras aplicadas:
- Aba Software = catálogo; abas por ferramenta = quem usa; faturas de telefonia = só o mês mais recente.
- Pessoas unificadas pelo e-mail; sem e-mail, pelo nome (marcado para confirmar).
- E-mails de serviço ligados ao nome de uma pessoa viram "Conta compartilhada (responsável: Nome)".
- Mesmo nome com dois e-mails pessoais: marcado como possível duplicidade.
- Produto sem lista de usuários fica com "uso não controlado por pessoa" (sem custo ocioso).
- Contrato sugerido pelo fornecedor (só quando há um único vigente) sempre fica para confirmar.

Não versione planilhas nem os arquivos gerados: contêm dados pessoais (LGPD).
