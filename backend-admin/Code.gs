const SHEET_ID='COLE_AQUI_ID_DA_PLANILHA_3TANE';
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

function listarEntregas(componente,idAtividade){
  const c=comp_(componente),ids=new Set(rows_('ATIVIDADES').filter(x=>String(x.TURMA||'')===TURMA&&String(x.COMPONENTE||'').toUpperCase()===c).map(x=>String(x.ID_ATIVIDADE||'')));
  return rows_('ENTREGAS').filter(x=>ids.has(String(x.ID_ATIVIDADE||''))&&(!idAtividade||String(x.ID_ATIVIDADE)===String(idAtividade))).map(e=>({id:String(e.ID_ENTREGA||''),idAtividade:String(e.ID_ATIVIDADE||''),aluno:String(e.ALUNO||''),email:String(e.EMAIL||''),arquivos:String(e.ARQUIVOS_URL||''),resposta:String(e.RESPOSTA_TEXTO||''),dataEnvio:dateTime_(e.DATA_ENVIO),status:String(e.STATUS||''),tentativa:Number(e.TENTATIVA||1),observacao:String(e.OBSERVACAO||'')}));
}

function statusPainel(){return {ok:true,sistema:'3º TANE',turma:TURMA,componentes:COMPONENTES,timeZone:Session.getScriptTimeZone()}}
