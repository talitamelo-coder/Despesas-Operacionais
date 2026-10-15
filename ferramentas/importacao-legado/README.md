# Importação das planilhas legadas

Converte `Controle_Contratos_v11.xlsm` (controle atual) e `Mobicare_Controladoria_Contratos_2011_YTD.xlsx`
(histórico) em um arquivo de cópia de segurança do sistema, restaurável em
**Administração → Dados e backup → Restaurar de um arquivo**.

```bash
pip install openpyxl
python3 -I converter.py Controle.xlsm Mobicare.xlsx base-config.json backup.json relatorio.xlsx
```

`base-config.json` contém a configuração padrão do sistema (listas e regras) e é gerado a partir de
`criarEstadoVazio()` em `src/mocks/seed.ts`.

Regras aplicadas (detalhes no cabeçalho do script):
- Controle v11 é a fonte principal; linhas da Mobicare de fornecedores que já estão no Controle v11 são
  anexadas como histórico nas observações do contrato correspondente, sem criar duplicata.
- Nada é inventado: o que falta fica vazio e aparece no sistema como "A completar".
- Suposições inevitáveis viram "pontos a confirmar" no próprio contrato.

**Nunca versione as planilhas nem o backup gerado:** contêm dados confidenciais de contratos.
