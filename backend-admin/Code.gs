const SHEET_ID='1susEJxYDXa8WM2ss_21RoJMe7xy1TTsckqgVKnvFvrU';
const TURMA='3º TANE - Ibiúna';
const COMPONENTES=['CI','TIAA','PPBS','ADMP'];

function doGet(){
  return HtmlService.createHtmlOutputFromFile('Admin')
    .setTitle('Painel do Professor - 3º TANE')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function ss_(){
  if(!SHEET_ID || SHEET_ID.indexOf('COLE_AQUI')===0) throw new Error('Configure o SHEET_ID no Code.gs antes de usar o painel.');
  return SpreadsheetApp.openById(SHEET_ID);
}
function sh_(nome){const sh=ss_().getSheetByName(nome);if(!sh)throw new Error('Aba não encontrada: '+nome);return sh}
function rows_(nome){const sh=sh_(nome);const lastRow=sh.getLastRow(),lastCol=sh.getLastColumn();if(lastRow<2||lastCol<1)return[];const v=sh.getRange(1,1,lastRow,lastCol).getValues();const h=v.shift().map(String);return v.filter(r=>r.some(c=>c!==''&&c!==null)).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])))}
function dateTime_(v){if(!v)return'';if(Object.prototype.toString.call(v)==='[object Date]')return Utilities.formatDate(v,Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm:ss');return String(v)}
function dateTimeInput_(v){if(!v)return'';if(Object.prototype.toString.call(v)==='[object Date]')return Utilities.formatDate(v,Session.getScriptTimeZone(),"yyyy-MM-dd'T'HH:mm");const s=String(v).trim();if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s))return s.slice(0,16);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s+'T23:59';return s}
function comp_(v){const c=String(v||'').trim().toUpperCase();if(!COMPONENTES.includes(c))throw new Error('Componente inválido: '+c);return c}
function ensureColumn_(sh,nome){const lastCol=Math.max(sh.getLastColumn(),1);const headers=sh.getRange(1,1,1,lastCol).getValues()[0].map(String);if(headers.indexOf(nome)>=0)return;sh.getRange(1,lastCol+1).setValue(nome)}
function headerMap_(sh){const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);return {h:h,m:Object.fromEntries(h.map((x,i)=>[x,i]))}}
function listarComponentes(){return COMPONENTES.map(c=>({id:c,nome:c}))}

function listarAtividades(componente){
  const c=comp_(componente);
  return rows_('ATIVIDADES').filter(x=>String(x.TURMA||'')===TURMA&&String(x.COMPONENTE||'').toUpperCase()===c).map(a=>({
    id:a.ID_ATIVIDADE,titulo:a.TITULO,descricao:a.DESCRICAO,tipoEnvio:a.TIPO_ENVIO,extensoes:a.EXTENSOES,maxArquivos:a.MAX_ARQUIVOS,
    liberacao:dateTimeInput_(a.LIBERACAO),prazo:dateTimeInput_(a.PRAZO),materialUrl:a.MATERIAL_APOIO_URL,correcaoIA:a.CORRECAO_IA,
    criterios:a.GABARITO_CRITERIOS,status:a.STATUS,ordem:a.ORDEM,componente:c
  })).sort((a,b)=>(Number(a.ordem)||999)-(Number(b.ordem)||999));
}

function salvarAtividade(d){
  if(!d||!d.id||!d.titulo)throw new Error('ID e título são obrigatórios');
  const c=comp_(d.componente),sh=sh_('ATIVIDADES');ensureColumn_(sh,'LIBERACAO');
  const v=sh.getDataRange().getValues(),h=v[0].map(String),idx=h.indexOf('ID_ATIVIDADE'),idxTurma=h.indexOf('TURMA'),idxComp=h.indexOf('COMPONENTE'),now=new Date();
  const map={ID_ATIVIDADE:String(d.id).trim(),TURMA:TURMA,COMPONENTE:c,TITULO:String(d.titulo).trim(),DESCRICAO:d.descricao||'',TIPO_ENVIO:d.tipoEnvio||'SEM_ENVIO',EXTENSOES:d.extensoes||'',MAX_ARQUIVOS:Number(d.maxArquivos||0),LIBERACAO:d.liberacao||'',PRAZO:d.prazo||'',MATERIAL_APOIO_URL:d.materialUrl||'',CORRECAO_IA:d.correcaoIA||'NAO',GABARITO_CRITERIOS:d.criterios||'',STATUS:d.status||'RASCUNHO',ORDEM:Number(d.ordem||999),CRIADO_EM:now,ATUALIZADO_EM:now};
  let found=0;for(let i=1;i<v.length;i++){if(String(v[i][idx])===String(map.ID_ATIVIDADE)&&(idxTurma<0||String(v[i][idxTurma])===TURMA)&&(idxComp<0||String(v[i][idxComp]).toUpperCase()===c)){found=i+1;break}}
  if(found){const old=Object.fromEntries(h.map((k,i)=>[k,v[found-1][i]]));map.CRIADO_EM=old.CRIADO_EM||now;sh.getRange(found,1,1,h.length).setValues([h.map(k=>map[k]!==undefined?map[k]:'')])}else sh.appendRow(h.map(k=>map[k]!==undefined?map[k]:''));
  return {ok:true,id:map.ID_ATIVIDADE,componente:c};
}

function excluirAtividade(componente,id){
  const c=comp_(componente);if(!id)throw new Error('ID da atividade não informado');const sh=sh_('ATIVIDADES'),v=sh.getDataRange().getValues(),h=v[0].map(String),idxId=h.indexOf('ID_ATIVIDADE'),idxTurma=h.indexOf('TURMA'),idxComp=h.indexOf('COMPONENTE');
  for(let i=1;i<v.length;i++)if(String(v[i][idxId])===String(id)&&(idxTurma<0||String(v[i][idxTurma])===TURMA)&&(idxComp<0||String(v[i][idxComp]).toUpperCase()===c)){sh.deleteRow(i+1);return {ok:true,id:id,componente:c}}
  throw new Error('Atividade não encontrada');
}

function listarMateriais(componente){
  const c=comp_(componente);
  return rows_('MATERIAIS').filter(x=>String(x.COMPONENTE||'').toUpperCase()===c&&(!x.TURMA||String(x.TURMA)===TURMA)).map(m=>({id:String(m.ID_MATERIAL||''),titulo:String(m.TITULO||''),descricao:String(m.DESCRICAO||''),url:String(m.ARQUIVO_URL||''),tipo:String(m.TIPO||'MATERIAL'),ordem:Number(m.ORDEM||999),status:String(m.STATUS||'OCULTO'),publicadoEm:dateTime_(m.PUBLICADO_EM),componente:c})).sort((a,b)=>(Number(a.ordem)||999)-(Number(b.ordem)||999));
}

function salvarMaterial(d){
  if(!d||!d.titulo)throw new Error('Título é obrigatório');const c=comp_(d.componente),sh=sh_('MATERIAIS');ensureColumn_(sh,'TURMA');const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String),id=String(d.id||('MAT-'+Utilities.getUuid().slice(0,8).toUpperCase())).trim(),now=new Date();
  const map={ID_MATERIAL:id,TURMA:TURMA,COMPONENTE:c,TITULO:String(d.titulo||'').trim(),DESCRICAO:String(d.descricao||''),ARQUIVO_URL:String(d.url||'').trim(),TIPO:String(d.tipo||'MATERIAL'),ORDEM:Number(d.ordem||999),STATUS:String(d.status||'PUBLICADO'),PUBLICADO_EM:now};
  const data=sh.getDataRange().getValues(),idxId=h.indexOf('ID_MATERIAL'),idxComp=h.indexOf('COMPONENTE'),idxTurma=h.indexOf('TURMA');let found=0;
  for(let i=1;i<data.length;i++)if(String(data[i][idxId])===id&&(idxComp<0||String(data[i][idxComp]).toUpperCase()===c)&&(idxTurma<0||String(data[i][idxTurma])===TURMA)){found=i+1;break}
  if(found){const old=Object.fromEntries(h.map((k,i)=>[k,data[found-1][i]]));if(old.PUBLICADO_EM)map.PUBLICADO_EM=old.PUBLICADO_EM;sh.getRange(found,1,1,h.length).setValues([h.map(k=>map[k]!==undefined?map[k]:'')])}else sh.appendRow(h.map(k=>map[k]!==undefined?map[k]:''));
  return {ok:true,id:id,componente:c};
}

function excluirMaterial(componente,id){
  const c=comp_(componente);if(!id)throw new Error('ID do material não informado');const sh=sh_('MATERIAIS'),v=sh.getDataRange().getValues(),h=v[0].map(String),idxId=h.indexOf('ID_MATERIAL'),idxComp=h.indexOf('COMPONENTE'),idxTurma=h.indexOf('TURMA');
  for(let i=1;i<v.length;i++)if(String(v[i][idxId])===String(id)&&(idxComp<0||String(v[i][idxComp]).toUpperCase()===c)&&(idxTurma<0||!v[i][idxTurma]||String(v[i][idxTurma])===TURMA)){sh.deleteRow(i+1);return {ok:true,id:id,componente:c}}
  throw new Error('Material não encontrado');
}

const COLUNAS_CORRECAO=['MENCAO_IA','FEEDBACK_IA','MENCAO_FINAL','FEEDBACK_FINAL','STATUS_CORRECAO','APROVADO','DATA_APROVACAO','EMAIL_ENVIADO','DATA_EMAIL'];
function ensureEntregaColumns_(){const sh=sh_('ENTREGAS');COLUNAS_CORRECAO.forEach(c=>ensureColumn_(sh,c));return sh}
function atividadesIds_(c){return new Set(rows_('ATIVIDADES').filter(x=>String(x.TURMA||'')===TURMA&&String(x.COMPONENTE||'').toUpperCase()===c).map(x=>String(x.ID_ATIVIDADE||'')))}
function atividade_(c,id){const a=rows_('ATIVIDADES').find(x=>String(x.TURMA||'')===TURMA&&String(x.COMPONENTE||'').toUpperCase()===c&&String(x.ID_ATIVIDADE||'')===String(id));if(!a)throw new Error('Atividade não encontrada para esta turma/componente.');return a}

function listarEntregas(componente,idAtividade){
  const c=comp_(componente),ids=atividadesIds_(c),sh=ensureEntregaColumns_(),hm=headerMap_(sh),h=hm.h,m=hm.m;
  const v=sh.getDataRange().getValues(),out=[];
  for(let i=1;i<v.length;i++){
    const r=v[i],id=String(r[m.ID_ATIVIDADE]||'');
    if(!ids.has(id)|| (idAtividade&&id!==String(idAtividade)))continue;
    out.push({linha:i+1,id:String(r[m.ID_ENTREGA]||''),idAtividade:id,aluno:String(r[m.ALUNO]||''),email:String(r[m.EMAIL]||''),arquivos:String(r[m.ARQUIVOS_URL]||''),resposta:String(r[m.RESPOSTA_TEXTO]||''),dataEnvio:dateTime_(r[m.DATA_ENVIO]),status:String(r[m.STATUS]||''),tentativa:Number(r[m.TENTATIVA]||1),observacao:String(r[m.OBSERVACAO]||''),mencaoIA:String(r[m.MENCAO_IA]||''),feedbackIA:String(r[m.FEEDBACK_IA]||''),mencaoFinal:String(r[m.MENCAO_FINAL]||''),feedbackFinal:String(r[m.FEEDBACK_FINAL]||''),statusCorrecao:String(r[m.STATUS_CORRECAO]||''),aprovado:String(r[m.APROVADO]||''),dataAprovacao:dateTime_(r[m.DATA_APROVACAO]),emailEnviado:String(r[m.EMAIL_ENVIADO]||''),dataEmail:dateTime_(r[m.DATA_EMAIL])});
  }
  return out;
}

function entregaLinha_(componente,linha){
  const c=comp_(componente),sh=ensureEntregaColumns_(),n=Number(linha);if(!n||n<2||n>sh.getLastRow())throw new Error('Entrega inválida.');
  const hm=headerMap_(sh),r=sh.getRange(n,1,1,hm.h.length).getValues()[0],o=Object.fromEntries(hm.h.map((k,i)=>[k,r[i]]));
  if(!atividadesIds_(c).has(String(o.ID_ATIVIDADE||'')))throw new Error('Esta entrega não pertence ao componente selecionado.');
  return {sh:sh,linha:n,h:hm.h,m:hm.m,o:o};
}
function setEntrega_(ctx,valores){Object.keys(valores).forEach(k=>{if(ctx.m[k]===undefined)throw new Error('Coluna não encontrada: '+k);ctx.sh.getRange(ctx.linha,ctx.m[k]+1).setValue(valores[k])})}
function mencaoValida_(v){const x=String(v||'').trim().toUpperCase();if(!['MB','B','R','I'].includes(x))throw new Error('Menção inválida. Use MB, B, R ou I.');return x}

function salvarCorrecaoProfessor(componente,linha,mencao,feedback){
  const ctx=entregaLinha_(componente,linha),m=mencaoValida_(mencao),f=String(feedback||'').trim();
  setEntrega_(ctx,{MENCAO_FINAL:m,FEEDBACK_FINAL:f,STATUS_CORRECAO:'REVISADA_PELO_PROFESSOR',APROVADO:'NAO'});
  return {ok:true,mencao:m};
}

function aprovarCorrecao(componente,linha,mencao,feedback){
  const ctx=entregaLinha_(componente,linha),m=mencaoValida_(mencao),f=String(feedback||'').trim();
  if(!f)throw new Error('Informe o feedback antes de aprovar.');
  setEntrega_(ctx,{MENCAO_FINAL:m,FEEDBACK_FINAL:f,STATUS_CORRECAO:'APROVADA',APROVADO:'SIM',DATA_APROVACAO:new Date()});
  return {ok:true,mencao:m};
}

function enviarCorrecaoEmail(componente,linha){
  const ctx=entregaLinha_(componente,linha),o=ctx.o,email=String(o.EMAIL||'').trim();
  if(String(o.APROVADO||'').toUpperCase()!=='SIM')throw new Error('A correção precisa ser aprovada antes do envio.');
  if(!email)throw new Error('O aluno não possui e-mail cadastrado nesta entrega.');
  const mencao=String(o.MENCAO_FINAL||'').trim(),feedback=String(o.FEEDBACK_FINAL||'').trim(),a=atividade_(comp_(componente),o.ID_ATIVIDADE);
  const assunto='Correção da atividade - '+String(a.TITULO||o.ID_ATIVIDADE);
  const html='<p>Olá, <strong>'+escapeHtml_(o.ALUNO||'aluno(a)')+'</strong>.</p><p>Sua atividade <strong>'+escapeHtml_(a.TITULO||o.ID_ATIVIDADE)+'</strong> foi corrigida e aprovada pelo professor.</p><p><strong>Menção: '+escapeHtml_(mencao)+'</strong></p><p><strong>Feedback:</strong><br>'+escapeHtml_(feedback).replace(/\n/g,'<br>')+'</p><p>Atenciosamente,<br>Prof. Junior Colombo</p>';
  MailApp.sendEmail({to:email,subject:assunto,htmlBody:html,name:'Prof. Junior Colombo'});
  setEntrega_(ctx,{EMAIL_ENVIADO:'SIM',DATA_EMAIL:new Date(),STATUS_CORRECAO:'ENVIADA_AO_ALUNO'});
  return {ok:true,email:email};
}
function escapeHtml_(s){return String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

function idsDrive_(texto){const s=String(texto||''),out=[],re=/[-\w]{25,}/g;let m;while((m=re.exec(s))!==null)if(!out.includes(m[0]))out.push(m[0]);return out}
function anexosIA_(texto){
  const ids=idsDrive_(texto),content=[];
  ids.slice(0,5).forEach(id=>{
    try{
      const f=DriveApp.getFileById(id),blob=f.getBlob(),bytes=blob.getBytes();
      if(bytes.length>20*1024*1024)throw new Error('Arquivo maior que 20 MB: '+f.getName());
      const mime=blob.getContentType()||'',b64=Utilities.base64Encode(bytes);
      if(/^image\/(png|jpeg|jpg|webp)$/i.test(mime)) content.push({type:'input_image',image_url:'data:'+mime+';base64,'+b64,detail:'high'});
      else content.push({type:'input_file',filename:f.getName(),file_data:b64});
    }catch(err){content.push({type:'input_text',text:'[Não foi possível anexar um arquivo da entrega: '+err.message+']'})}
  });
  return content;
}
function textoRespostaOpenAI_(json){
  if(json.output_text)return String(json.output_text);
  const partes=[];(json.output||[]).forEach(o=>(o.content||[]).forEach(c=>{if(c.type==='output_text'&&c.text)partes.push(c.text)}));return partes.join('\n').trim();
}
function parseCorrecao_(texto){
  let s=String(texto||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{const j=JSON.parse(s);return {mencao:mencaoValida_(j.mencao),feedback:String(j.feedback||'').trim()}}catch(e){}
  const mm=s.match(/\b(MB|B|R|I)\b/i);if(!mm)throw new Error('A IA respondeu em formato inesperado. Tente novamente.');
  return {mencao:mencaoValida_(mm[1]),feedback:s.replace(mm[0],'').replace(/^\s*[-:–—]+\s*/,'').trim()};
}

function corrigirComIA(componente,linha){
  const c=comp_(componente),ctx=entregaLinha_(c,linha),o=ctx.o,a=atividade_(c,o.ID_ATIVIDADE),criterios=String(a.GABARITO_CRITERIOS||'').trim();
  if(String(a.CORRECAO_IA||'').toUpperCase()!=='SIM')throw new Error('A correção por IA não está habilitada nesta atividade.');
  if(!criterios)throw new Error('Cadastre o gabarito/critério desta atividade antes de utilizar a correção por IA.');
  const key=PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if(!key)throw new Error('Configure OPENAI_API_KEY nas Propriedades do Script antes de usar a correção por IA.');
  const model=PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL')||'gpt-5.6-luna';
  const prompt='Você é um auxiliar de correção escolar. O GABARITO/CRITÉRIOS DO PROFESSOR abaixo é obrigatório e soberano. Não crie exigências adicionais, não penalize redações equivalentes quando o gabarito permitir e não altere os critérios definidos pelo professor.\n\nATIVIDADE: '+String(a.TITULO||o.ID_ATIVIDADE)+'\nDESCRIÇÃO: '+String(a.DESCRICAO||'')+'\n\nGABARITO/CRITÉRIOS DO PROFESSOR:\n'+criterios+'\n\nALUNO: '+String(o.ALUNO||'')+'\nRESPOSTA TEXTUAL REGISTRADA:\n'+String(o.RESPOSTA_TEXTO||'(sem resposta textual; analise os arquivos anexados)')+'\n\nAvalie exclusivamente com as menções MB, B, R ou I. Produza feedback curto, pedagógico e objetivo, indicando acertos e o que precisa melhorar conforme o gabarito. Retorne APENAS JSON válido no formato {"mencao":"MB","feedback":"texto"}.';
  const content=[{type:'input_text',text:prompt}].concat(anexosIA_(o.ARQUIVOS_URL));
  const payload={model:model,input:[{role:'user',content:content}]};
  const resp=UrlFetchApp.fetch('https://api.openai.com/v1/responses',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+key},payload:JSON.stringify(payload),muteHttpExceptions:true});
  const code=resp.getResponseCode(),body=resp.getContentText();if(code<200||code>=300)throw new Error('Falha na correção por IA ('+code+'): '+body.slice(0,500));
  const r=parseCorrecao_(textoRespostaOpenAI_(JSON.parse(body)));
  setEntrega_(ctx,{MENCAO_IA:r.mencao,FEEDBACK_IA:r.feedback,MENCAO_FINAL:r.mencao,FEEDBACK_FINAL:r.feedback,STATUS_CORRECAO:'AGUARDANDO_APROVACAO',APROVADO:'NAO'});
  return {ok:true,mencao:r.mencao,feedback:r.feedback};
}

function statusPainel(){return {ok:true,sistema:'3º TANE',turma:TURMA,componentes:COMPONENTES,timeZone:Session.getScriptTimeZone()}}
