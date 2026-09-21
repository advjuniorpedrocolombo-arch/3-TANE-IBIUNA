(()=>{
  const API='https://script.google.com/macros/s/AKfycbz8cLXFmVawnKP5VB7DIIkQx66Bp8Mc_LA5eNzFKv6JhcQRc0_PjVKW3mdDySQ5UbZM/exec';
  const comp=(document.documentElement.dataset.componente||window.COMPONENTE_PORTAL||'').toUpperCase();
  if(!comp)return;
  async function carregar(){
    try{
      const r=await fetch(`${API}?action=listar&componente=${encodeURIComponent(comp)}&ts=${Date.now()}`,{cache:'no-store'});
      const d=await r.json();
      if(!d.ok)throw new Error(d.erro||'Falha ao carregar dados');
      window.PORTAL_3TANE={api:API,componente:comp,dados:d};
      document.dispatchEvent(new CustomEvent('portal3tane:carregado',{detail:d}));
    }catch(err){
      console.error('Portal 3º TANE:',err);
      document.dispatchEvent(new CustomEvent('portal3tane:erro',{detail:{erro:String(err.message||err)}}));
    }
  }
  window.PORTAL_3TANE_API=API;
  carregar();
})();