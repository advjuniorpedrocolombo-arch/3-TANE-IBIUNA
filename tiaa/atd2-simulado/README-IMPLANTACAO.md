# ATD2 — TIAA — Implantação rápida

Tudo já está preparado no Drive e no GitHub. Falta apenas publicar o backend no Google Apps Script e colar a URL na página.

## 1. Criar o Apps Script
1. Abra a planilha **ATD2 - Simulado de Prova - Respostas**.
2. Vá em **Extensões > Apps Script**.
3. Apague o conteúdo padrão e cole todo o arquivo `AppsScript_ATD2_TIAA.gs` desta pasta.
4. Salve.

## 2. Criar o gatilho da devolutiva
1. No seletor de funções do Apps Script, escolha `criarGatilhoDevolutiva`.
2. Clique em **Executar** uma única vez.
3. Autorize o acesso solicitado.

Depois disso, quando o professor preencher a **MENÇÃO**, a **DEVOLUTIVA / OBSERVAÇÕES** e marcar a caixa **ENVIAR DEVOLUTIVA**, o sistema enviará o resultado ao e-mail cadastrado pelo aluno.

## 3. Publicar como Web App
1. Clique em **Implantar > Nova implantação**.
2. Tipo: **Aplicativo da Web**.
3. Executar como: **Eu**.
4. Quem pode acessar: **Qualquer pessoa**.
5. Clique em **Implantar** e copie a URL terminada em `/exec`.

## 4. Ativar a página do aluno
Abra `index.html` desta pasta e substitua:

`COLE_AQUI_A_URL_DO_APPS_SCRIPT`

pela URL `/exec` obtida na etapa anterior.

Pronto. O envio aceita somente arquivos `.xlsm` de até 20 MB.