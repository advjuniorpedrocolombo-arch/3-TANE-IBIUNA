/**
 * Motor de correção por IA — adicionar ao projeto Apps Script do backend.
 * Configuração: Propriedades do script > GEMINI_API_KEY.
 * Rode instalarAgendamentoCorrecoes() uma vez para agendar (5 min).
 * Não envia notas aos alunos; professor aprova separadamente.
 */
const IA_ABA = 'CORRECOES_IA';
const IA_MODELO = 'gemini-2.5-flash';
const IA_ALIASES = {'ADMP_AULA10':'ATD2_ADMP'};
const IA_LOTE = 5;

function instalarAgendamentoCorrecoes() {
  const existe = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'processarCorrecoesIA');
  if (!existe) ScriptApp.newTrigger('processarCorrecoesIA').timeBased().everyMinutes(5).create();
  return {ok:true, agendado:true};
}
function processarCorrecoesIA() {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {ok:false,motivo:'Execução anterior em andamento'};
  try {
    const chave=PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!chave) throw new Error('Configure GEMINI_API_KEY nas Propriedades do script; nunca no GitHub');
    const atividades=rows_('ATIVIDADES'), entregas=rows_('ENTREGAS');
    const destino=sh_(IA_ABA);
    const cab=destino.getRange(1,1,1,destino.getLastColumn()).getValues()[0].map(String);
    const obrigatorios=['ID_ENTREGA','ID_ATIVIDADE','ALUNO','EMAIL','CORRECAO_JSON','MENCAO','STATUS','CORRIGIDO_EM','APROVADO_EM','ENVIADO_EM','MODELO_IA','ERRO'];
    obrigatorios.forEach(h=>{if(!cab.includes(h))throw new Error('Coluna ausente: '+h)});
    const ja=new Set(rows_(IA_ABA).map(r=>String(r.ID_ENTREGA||'')));
    let corrigidas=0,erros=0,ignoradas=0;
    for(const e of entregas) {
      if(corrigidas+erros>=IA_LOTE)break;
      const id=String(e.ID_ENTREGA||'').trim();
      if(!id||ja.has(id))continue;
      const aid=IA_ALIASES[String(e.ID_ATIVIDADE||'')]||String(e.ID_ATIVIDADE||'');
      const a=atividades.find(x=>String(x.ID_ATIVIDADE||'')===aid);
      if(!a||String(a.CORRECAO_IA||'').trim().toUpperCase()!=='SIM'||!String(a.GABARITO_CRITERIOS||'').trim()){ignoradas++;continue}
      const reg={ID_ENTREGA:id,ID_ATIVIDADE:String(e.ID_ATIVIDADE||''),ALUNO:String(e.ALUNO||''),EMAIL:String(e.EMAIL||''),CORRECAO_JSON:'',MENCAO:'',STATUS:'ERRO',CORRIGIDO_EM:'',APROVADO_EM:'',ENVIADO_EM:'',MODELO_IA:IA_MODELO,ERRO:''};
      try {
        const conteudo=iaConteudo_(e);
        const avaliacao=iaAvaliar_(a,conteudo,chave);
        reg.CORRECAO_JSON=JSON.stringify(avaliacao);
        reg.MENCAO=avaliacao.mencao;
        reg.STATUS='PENDENTE_APROVACAO';
        reg.CORRIGIDO_EM=new Date();
        corrigidas++;
      } catch(err) {
        reg.ERRO=String(err.message||err).slice(0,1000);
        erros++;
      }
      destino.appendRow(cab.map(h=>reg[h]===undefined?'':reg[h]));
      ja.add(id);
    }
    return {ok:true,corrigidas,erros,ignoradas};
  } finally {lock.releaseLock()}
}

function iaConteudo_(e){
  const partes=[];
  const texto=String(e.RESPOSTA_TEXTO||'').trim();
  if(texto)partes.push({text:'RESPOSTA ESCRITA DO ALUNO:\n'+texto.slice(0,60000)});
  const urls=String(e.ARQUIVOS_URL||'').split(/\s+/).filter(Boolean);
  for(const url of urls) {
    const match=url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
    if(!match)throw new Error('URL de arquivo não reconhecida; requer revisão manual');
    const file=DriveApp.getFileById(match[1]);
    const blob=file.getBlob(),mime=blob.getContentType(),nome=file.getName();
    if(mime==='application/vnd.google-apps.document'){
      partes.push({text:'ARQUIVO '+nome+':\n'+DocumentApp.openById(file.getId()).getBody().getText().slice(0,60000)});
    }else if(mime==='text/plain'){
      partes.push({text:'ARQUIVO '+nome+':\n'+blob.getDataAsString().slice(0,60000)});
    }else if(mime==='application/pdf'||/^image\/(png|jpeg|webp)$/.test(mime)){
      if(blob.getBytes().length>12*1024*1024)throw new Error('Arquivo muito grande para correção automática: '+nome);
      partes.push({text:'Arquivo enviado: '+nome});
      partes.push({inline_data:{mime_type:mime,data:Utilities.base64Encode(blob.getBytes())}});
    }else{
      throw new Error('Formato '+mime+' não suportado automaticamente ('+nome+'). Converter em PDF ou Google Docs');
    }
  }
  if(!partes.length)throw new Error('Entrega sem texto ou arquivos para avaliar');
  return partes;
}
function iaAvaliar_(a,conteudo,chave) {
  const instrucao=[
    'Você atua como auxiliar de avaliação educacional. Avalie somente o trabalho entregue.',
    'Compare com o gabarito e critérios do professor; não invente respostas e não atribua méritos sem evidência.',
    'Menções: MB = domínio muito bom; B = bom domínio; R = compreensão regular/parcial; I = insuficiente.',
    'Se estiver ilegível, incompleto ou impossível de avaliar, retorne erro_avaliacao=true e explique, sem atribuir menção.',
    'Retorne JSON puro: {"mencao":"MB|B|R|I","justificativa":"...","pontos_fortes":["..."],"melhorias":["..."],"erro_avaliacao":false}.',
    'Atividade: '+String(a.TITULO||''),
    'GABARITO E CRITÉRIOS:\n'+String(a.GABARITO_CRITERIOS||'').slice(0,60000)
  ].join('\n\n');
  const payload={contents:[{role:'user',parts:[{text:instrucao},...conteudo]}],generationConfig:{temperature:0.1,responseMimeType:'application/json'}};
  const url='https://generativelanguage.googleapis.com/v1beta/models/'+IA_MODELO+':generateContent';
  const res=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',headers:{'x-goog-api-key':chave},payload:JSON.stringify(payload),muteHttpExceptions:true});
  if(res.getResponseCode()!==200)throw new Error('Falha no provedor IA (HTTP '+res.getResponseCode()+'): '+res.getContentText().slice(0,300));
  const obj=JSON.parse(res.getContentText());
  const raw=obj.candidates&&obj.candidates[0]&&obj.candidates[0].content&&obj.candidates[0].content.parts;
  if(!raw||!raw[0]||!raw[0].text)throw new Error('IA não retornou avaliação');
  const out=JSON.parse(raw[0].text);
  if(out.erro_avaliacao)throw new Error('Revisão manual necessária: '+String(out.justificativa||''));
  if(!['MB','B','R','I'].includes(out.mencao)||!out.justificativa)throw new Error('Resposta de IA inválida');
  return {mencao:out.mencao,justificativa:String(out.justificativa),pontos_fortes:out.pontos_fortes||[],melhorias:out.melhorias||[]};
}
/** Repete apenas falhas expressamente liberadas pelo professor. */
function liberarTentativaDeCorrecao(idEntrega){
  const sh=sh_(IA_ABA),values=sh.getDataRange().getValues(),headers=values[0].map(String);
  const idCol=headers.indexOf('ID_ENTREGA'),statusCol=headers.indexOf('STATUS');
  for(let i=1;i<values.length;i++){
    if(String(values[i][idCol])===String(idEntrega)&&String(values[i][statusCol])==='ERRO'){
      sh.deleteRow(i+1);return {ok:true};
    }
  }
  return {ok:false,motivo:'Registro de erro não encontrado'};
}
