/* PROVA ADMINISTRAÇÃO PÚBLICA — BACKEND V3
 * Banco de questões/configuração: planilha principal.
 * Respostas/controle/correção: planilha separada "PROVA Administração Pública - Controle e Correção".
 * Comunicação com GitHub Pages via JSONP/GET.
 */

const APP = {
  SPREADSHEET_BANCO_ID: '1IhZ7u5eSWVTf2Hv8g5eMBycUlz5bhYcbMvkMHQFizAQ',
  SPREADSHEET_CONTROLE_ID: '1Co3MS-zqENPzcT5XpedtZPLAzeqyXoyIH2B6nKETebw',
  SHEET_QUESTOES: 'BANCO_QUESTOES',
  SHEET_RESPOSTAS: 'RESPOSTAS_ALUNOS',
  SHEET_CONFIG: 'CONFIGURACAO',
  TIMEZONE: 'America/Sao_Paulo',
  VERSAO: 'ADM-PUBLICA-2026-09-v3'
};

const COL = {ID:1,INICIO:2,NOME:3,EMAIL:4,TURMA:5,VERSAO:6,ENVIO:7,TEMPO_UTILIZADO:8,TEMPO_REFERENCIA:9,EXCEDENTE:10,ACERTOS:11,NOTA:12,MENCAO_AUTO:13,STATUS:14,CORRIGIR_IA:15,DATA_CORRECAO_IA:16,MENCAO_IA:17,ARQUIVO_CORRECAO:18,REVISADO:19,MENCAO_FINAL:20,APROVAR_ENVIAR:21,DATA_ENVIO:22,STATUS_ENVIO:23,ESTADO_JSON:24,OBSERVACOES:25};

function doGet(e){
  try{
    const p=(e&&e.parameter)||{};
    const action=String(p.action||'ping');
    let out;
    if(action==='ping') out={ok:true,sistema:'Prova Administração Pública',versao:APP.VERSAO,agora:new Date().toISOString()};
    else if(action==='iniciarOuRetomar') out=iniciarOuRetomar_({nome:p.nome,email:p.email,turma:p.turma});
    else if(action==='consultar') out=consultarTentativa_(p.email||'');
    else if(action==='salvarResposta'||action==='salvarRespostas') out=salvarRespostasLote_({email:p.email,respostas:parseJson_(p.respostas,[])});
    else if(action==='finalizar') out=finalizarPorAluno_({email:p.email,respostas:parseJson_(p.respostas,[])});
    else out={ok:false,erro:'Ação inválida.'};
    return responder_(out,p.callback);
  }catch(err){return responder_({ok:false,erro:String(err&&err.message||err)},e&&e.parameter&&e.parameter.callback)}
}

function doPost(e){
  try{
    const raw=e&&e.postData&&e.postData.contents||'{}';
    const p=parseJson_(raw,{});
    let out;
    if(p.action==='iniciarOuRetomar') out=iniciarOuRetomar_(p);
    else if(p.action==='consultar') out=consultarTentativa_(p.email||'');
    else if(p.action==='salvarResposta'||p.action==='salvarRespostas') out=salvarRespostasLote_(p);
    else if(p.action==='finalizar') out=finalizarPorAluno_(p);
    else out={ok:false,erro:'Ação inválida.'};
    return responder_(out,'');
  }catch(err){return responder_({ok:false,erro:String(err&&err.message||err)},'')}
}

function responder_(obj,callback){
  const txt=JSON.stringify(obj);
  if(callback) return ContentService.createTextOutput(String(callback)+'('+txt+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}
function parseJson_(s,padrao){try{return JSON.parse(String(s||''))}catch(_){return padrao}}

function iniciarOuRetomar_(p){
  const email=normEmail_(p.email),nome=String(p.nome||'').trim(),turma=String(p.turma||'').trim();
  if(!emailOk_(email)) return {ok:false,erro:'Informe um e-mail válido.'};
  if(!nome) return {ok:false,erro:'Informe o nome do aluno.'};
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const ex=localizar_(email); if(ex) return montarRetorno_(ex.row);
    const qs=lerQuestoes_(),cfg=lerConfig_(),total=Math.min(Number(cfg.TOTAL_QUESTOES||20),qs.length);
    if(!total) return {ok:false,erro:'Banco de questões vazio.'};
    const sel=shuffle_(qs).slice(0,total),ord=sel.map(q=>q.id),opt={};
    sel.forEach(q=>opt[q.id]=shuffle_(q.alternativas.map(a=>a.id)));
    const estado={questionOrder:ord,optionOrder:opt,answers:{},lastSavedAt:new Date().toISOString()};
    const row=[criarId_(),new Date(),nome,email,turma,Utilities.getUuid(),'','',Number(cfg.TEMPO_MINUTOS||30),'','','','','EM ANDAMENTO',false,'','','',false,'',false,'','',JSON.stringify(estado),'Tentativa iniciada'];
    const sh=respostasSheet_(); sh.appendRow(row); const r=sh.getLastRow(); garantirChecksLinha_(sh,r); SpreadsheetApp.flush();
    return montarRetorno_(r);
  }finally{lock.releaseLock()}
}

function consultarTentativa_(email){
  const e=normEmail_(email); if(!emailOk_(e)) return {ok:false,erro:'E-mail inválido.'};
  const t=localizar_(e); return t?montarRetorno_(t.row):{ok:false,existe:false,erro:'Tentativa não encontrada.'};
}

function salvarRespostasLote_(p){
  const email=normEmail_(p.email),respostas=Array.isArray(p.respostas)?p.respostas:[];
  if(!emailOk_(email)) return {ok:false,erro:'E-mail inválido.'};
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const t=localizar_(email); if(!t) return {ok:false,erro:'Tentativa não encontrada.'};
    const sh=respostasSheet_(); const status=String(sh.getRange(t.row,COL.STATUS).getDisplayValue()||'');
    if(statusFinal_(status)) return {ok:false,finalizada:true,erro:'Prova já finalizada.'};
    const tempo=calcularTempo_(t.row);
    if(tempo.restanteSegundos<=0){finalizarLinha_(t.row,'FINALIZADA POR TEMPO');return montarRetorno_(t.row)}
    const estado=lerEstado_(t.row),validas=validarRespostas_(estado,respostas);
    validas.forEach(r=>estado.answers[r.questionId]=r.optionId);
    estado.lastSavedAt=new Date().toISOString();
    sh.getRange(t.row,COL.ESTADO_JSON).setValue(JSON.stringify(estado)); SpreadsheetApp.flush();
    return {ok:true,salvo:true,respostasSalvas:Object.keys(estado.answers).length,tempoRestanteSegundos:calcularTempo_(t.row).restanteSegundos};
  }finally{lock.releaseLock()}
}

function finalizarPorAluno_(p){
  const email=normEmail_(p.email); if(!emailOk_(email)) return {ok:false,erro:'E-mail inválido.'};
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const t=localizar_(email); if(!t) return {ok:false,erro:'Tentativa não encontrada.'};
    const estado=lerEstado_(t.row),respostas=Array.isArray(p.respostas)?p.respostas:[];
    validarRespostas_(estado,respostas).forEach(r=>estado.answers[r.questionId]=r.optionId);
    respostasSheet_().getRange(t.row,COL.ESTADO_JSON).setValue(JSON.stringify(estado));
    const st=String(respostasSheet_().getRange(t.row,COL.STATUS).getDisplayValue()||'');
    if(!statusFinal_(st)) finalizarLinha_(t.row,calcularTempo_(t.row).restanteSegundos<=0?'FINALIZADA POR TEMPO':'FINALIZADA PELO ALUNO');
    SpreadsheetApp.flush(); return montarRetorno_(t.row);
  }finally{lock.releaseLock()}
}

function montarRetorno_(row){
  const sh=respostasSheet_(),vals=sh.getRange(row,1,1,COL.OBSERVACOES).getValues()[0],estado=parseJson_(vals[COL.ESTADO_JSON-1],{questionOrder:[],optionOrder:{},answers:{}}),map=mapQuestoes_(),tempo=calcularTempo_(row),finalizada=statusFinal_(vals[COL.STATUS-1]);
  if(!finalizada&&tempo.restanteSegundos<=0){finalizarLinha_(row,'FINALIZADA POR TEMPO');return montarRetorno_(row)}
  const questoes=(estado.questionOrder||[]).map((qid,i)=>{const q=map[qid];if(!q)return null;const altMap={};q.alternativas.forEach(a=>altMap[a.id]=a.texto);return{numero:i+1,id:q.id,enunciado:q.enunciado,alternativas:(estado.optionOrder[qid]||[]).map((aid,j)=>({id:aid,letra:['A','B','C','D'][j],texto:altMap[aid]})),respostaMarcada:estado.answers[qid]||null}}).filter(Boolean);
  const out={ok:true,existe:true,id:vals[0],nome:vals[2],email:vals[3],turma:vals[4],status:vals[13],finalizada:statusFinal_(vals[13]),inicio:iso_(vals[1]),tempoTotalSegundos:tempo.totalSegundos,tempoRestanteSegundos:statusFinal_(vals[13])?0:tempo.restanteSegundos,questoes,respostasSalvas:Object.keys(estado.answers||{}).length};
  if(out.finalizada){out.acertos=vals[10];out.nota=vals[11];out.mencao=vals[19]||vals[12];out.envio=iso_(vals[6])}
  return out;
}

function finalizarLinha_(row,status){
  const sh=respostasSheet_(),corr=corrigir_(row),t=calcularTempo_(row),cfg=lerConfig_();
  sh.getRange(row,COL.ENVIO).setValue(new Date());
  sh.getRange(row,COL.TEMPO_UTILIZADO).setValue(segRelogio_(Math.min(t.decorridoSegundos,t.totalSegundos)));
  sh.getRange(row,COL.TEMPO_REFERENCIA).setValue(Number(cfg.TEMPO_MINUTOS||30));
  sh.getRange(row,COL.ACERTOS).setValue(corr.acertos);
  sh.getRange(row,COL.NOTA).setValue(corr.nota);
  sh.getRange(row,COL.MENCAO_AUTO).setValue(corr.mencao);
  sh.getRange(row,COL.MENCAO_FINAL).setValue(corr.mencao);
  sh.getRange(row,COL.STATUS).setValue(status);
}
function corrigir_(row){const e=lerEstado_(row),m=mapQuestoes_();let a=0;(e.questionOrder||[]).forEach(id=>{if(m[id]&&e.answers[id]===m[id].corretaId)a++});const total=(e.questionOrder||[]).length||20,nota=Number((a/total*10).toFixed(2));return{acertos:a,nota,mencao:nota>=9?'MB':nota>=7?'B':nota>=5?'R':'I'}}

function lerQuestoes_(){const v=questoesSheet_().getDataRange().getValues(),h=v[0].map(String),ix={};h.forEach((x,i)=>ix[String(x).trim()]=i);return v.slice(1).filter(r=>r[ix.ID]).map(r=>({id:String(r[ix.ID]).trim(),enunciado:String(r[ix.ENUNCIADO]||''),corretaId:String(r[ix.CORRETA_ID]||''),alternativas:[{id:'ALT_A',texto:String(r[ix.ALT_A]||'')},{id:'ALT_B',texto:String(r[ix.ALT_B]||'')},{id:'ALT_C',texto:String(r[ix.ALT_C]||'')},{id:'ALT_D',texto:String(r[ix.ALT_D]||'')}]}))}
function mapQuestoes_(){const m={};lerQuestoes_().forEach(q=>m[q.id]=q);return m}
function lerConfig_(){const sh=configSheet_(),n=Math.max(0,sh.getLastRow()-1),v=n?sh.getRange(2,1,n,2).getValues():[],o={};v.forEach(r=>{if(r[0])o[String(r[0]).trim()]=r[1]});return o}
function lerEstado_(row){return parseJson_(respostasSheet_().getRange(row,COL.ESTADO_JSON).getValue(),{questionOrder:[],optionOrder:{},answers:{}})}
function validarRespostas_(e,rs){const q=new Set(e.questionOrder||[]);return rs.map(r=>({questionId:String(r.questionId||''),optionId:String(r.optionId||'')})).filter(r=>q.has(r.questionId)&&(e.optionOrder[r.questionId]||[]).includes(r.optionId))}
function localizar_(email){const sh=respostasSheet_(),last=sh.getLastRow();if(last<2)return null;const v=sh.getRange(2,COL.EMAIL,last-1,1).getDisplayValues();for(let i=v.length-1;i>=0;i--)if(normEmail_(v[i][0])===email)return{row:i+2};return null}
function calcularTempo_(row){const start=respostasSheet_().getRange(row,COL.INICIO).getValue(),total=Number(lerConfig_().TEMPO_MINUTOS||30)*60,dec=Math.max(0,Math.floor((Date.now()-new Date(start).getTime())/1000));return{totalSegundos:total,decorridoSegundos:dec,restanteSegundos:Math.max(0,total-dec)}}
function statusFinal_(s){s=String(s||'').toUpperCase();return s.includes('FINALIZADA')||s.includes('CORRIG')||s.includes('REVISADO')||s.includes('ENVIADA')}
function shuffle_(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function garantirChecksLinha_(sh,r){[COL.CORRIGIR_IA,COL.REVISADO,COL.APROVAR_ENVIAR].forEach(c=>sh.getRange(r,c).insertCheckboxes().setValue(false))}

function bancoSs_(){return SpreadsheetApp.openById(APP.SPREADSHEET_BANCO_ID)}
function controleSs_(){return SpreadsheetApp.openById(APP.SPREADSHEET_CONTROLE_ID)}
function questoesSheet_(){return bancoSs_().getSheetByName(APP.SHEET_QUESTOES)}
function configSheet_(){return bancoSs_().getSheetByName(APP.SHEET_CONFIG)}
function respostasSheet_(){const sh=controleSs_().getSheetByName(APP.SHEET_RESPOSTAS);if(!sh)throw new Error('Aba RESPOSTAS_ALUNOS não encontrada na planilha de Controle e Correção.');return sh}

function normEmail_(v){return String(v||'').trim().toLowerCase()}
function emailOk_(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function criarId_(){return 'ADM-'+Utilities.formatDate(new Date(),APP.TIMEZONE,'yyyyMMdd-HHmmss')+'-'+Math.floor(1000+Math.random()*9000)}
function iso_(v){if(!v)return null;const d=new Date(v);return isNaN(d)?null:d.toISOString()}
function segRelogio_(s){s=Math.max(0,Math.floor(s));return [Math.floor(s/3600),Math.floor((s%3600)/60),s%60].map(n=>String(n).padStart(2,'0')).join(':')}

function onOpen(){SpreadsheetApp.getUi().createMenu('PROVA ADM. PÚBLICA').addItem('Testar backend V3','testarBackendV3').addToUi()}
function testarBackendV3(){
  const qs=lerQuestoes_(),sh=respostasSheet_();
  SpreadsheetApp.getUi().alert('Backend V3 OK\nBanco: '+bancoSs_().getName()+'\nControle: '+controleSs_().getName()+'\nAba respostas: '+sh.getName()+'\nQuestões: '+qs.length);
}
