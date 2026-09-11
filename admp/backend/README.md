# Backend — Prova de Administração Pública

Arquivo principal: `ProvaAdministracaoPublica.gs`

## Onde instalar

Abra a planilha `BANCO_QUESTOES_PROVA_ADMINISTRACAO_PUBLICA` e depois:

1. **Extensões > Apps Script**.
2. Apague o conteúdo inicial de `Código.gs` ou crie um novo arquivo `.gs`.
3. Copie **todo** o conteúdo de `ProvaAdministracaoPublica.gs` para o projeto.
4. Salve.
5. Execute manualmente a função `instalarSistema()` uma vez.
6. Autorize as permissões solicitadas pelo Google.
7. Volte à planilha e atualize a página.
8. No menu **PROVA ADM. PÚBLICA**, execute **Verificar estrutura** e depois **Testar backend**.

## Publicação como Web App

Implantação atual:

`https://script.google.com/macros/s/AKfycbxcF6IGrDmVMWR_Ev4eBDJXXVBK2qlmJarvrV7pKYJLr4W8FJ9mcis55x9C1nM-DdLl/exec`

Configuração esperada:

1. Tipo: **App da Web**.
2. Executar como: **você**.
3. Acesso: o endpoint precisa estar acessível aos alunos para a página GitHub conseguir chamar o backend.
4. Em futuras alterações do Apps Script, atualizar a implantação preservando a URL quando possível.

Essa URL será usada na interface GitHub da prova.

## O que o backend já faz

- identifica o aluno pelo e-mail;
- cria uma única tentativa por e-mail;
- sorteia a ordem das 20 questões;
- sorteia a ordem das alternativas A/B/C/D individualmente;
- grava a ordem sorteada na planilha;
- salva respostas durante a prova;
- recupera a mesma tentativa se o navegador fechar ou a conexão cair;
- cronômetro de 30 minutos calculado pelo horário original salvo no servidor;
- finalização automática por tempo;
- bloqueio de nova tentativa após finalização;
- correção objetiva automática;
- cálculo de acertos, nota e menção;
- gatilhos da planilha:
  - `CORRIGIR COM IA`;
  - `REVISADO PELO PROFESSOR`;
  - `APROVAR E ENVIAR`;
- geração de PDF de devolutiva;
- envio da devolutiva por e-mail após aprovação do professor.

## IA opcional

O backend funciona mesmo sem IA externa. Nesse caso, gera uma devolutiva objetiva automática.

Para usar a OpenAI na devolutiva, adicione em **Configurações do projeto > Propriedades do script**:

- `OPENAI_API_KEY` = sua chave;
- opcionalmente `OPENAI_MODEL` = nome do modelo que deseja utilizar.

Nunca coloque a chave no GitHub ou no HTML público.

## Estrutura usada

O código já está apontado para:

- planilha da prova criada para Administração Pública;
- abas `BANCO_QUESTOES`, `RESPOSTAS_ALUNOS` e `CONFIGURACAO`;
- pasta `05 - Correções e Devolutivas` no Google Drive.

## Observação sobre menções

As faixas iniciais no código são:

- `MB`: nota 9,0 a 10,0;
- `B`: nota 7,0 a 8,99;
- `R`: nota 5,0 a 6,99;
- `I`: abaixo de 5,0.

Elas ficam na função `calcularMencao_()` e podem ser alteradas antes da prova oficial.
