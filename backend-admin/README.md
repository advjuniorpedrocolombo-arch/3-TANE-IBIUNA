# Painel administrativo — 3º TANE

Este backend centraliza a administração de **CI, TIAA, PPBS e ADMP**.

**PTCC não faz parte deste painel** e permanece independente no Supabase.

## Arquivos
- `Code.gs`: backend Google Apps Script.
- `Admin.html`: painel do professor.

## Planilha necessária
Crie uma planilha Google Sheets e copie o ID para `SHEET_ID` em `Code.gs`.

### Aba ATIVIDADES
Cabeçalhos:
`ID_ATIVIDADE | TURMA | COMPONENTE | TITULO | DESCRICAO | TIPO_ENVIO | EXTENSOES | MAX_ARQUIVOS | LIBERACAO | PRAZO | MATERIAL_APOIO_URL | CORRECAO_IA | GABARITO_CRITERIOS | STATUS | ORDEM | CRIADO_EM | ATUALIZADO_EM`

### Aba MATERIAIS
Cabeçalhos:
`ID_MATERIAL | TURMA | COMPONENTE | TITULO | DESCRICAO | ARQUIVO_URL | TIPO | ORDEM | STATUS | PUBLICADO_EM`

A aula pode ser gravada sem link de material. No painel basta marcar **Esta aula não possui material de apoio**.

### Aba ENTREGAS
Cabeçalhos:
`ID_ENTREGA | ID_ATIVIDADE | ALUNO | EMAIL | ARQUIVOS_URL | RESPOSTA_TEXTO | DATA_ENVIO | STATUS | TENTATIVA | OBSERVACAO`

## Componentes aceitos
- CI
- TIAA
- PPBS
- ADMP

## Implantação
1. Criar um projeto Google Apps Script.
2. Copiar `Code.gs`.
3. Criar um arquivo HTML chamado `Admin` e copiar `Admin.html`.
4. Configurar o `SHEET_ID`.
5. Definir o fuso horário do projeto como `America/Sao_Paulo`.
6. Implantar como aplicativo da Web, executando como o proprietário.
7. Autorizar o acesso à planilha quando solicitado.
