/* ===== La voz de la Junta ===== */
(function(){
/* CONFIGURACIÓN — pegue aquí la URL del Apps Script (termina en /exec).
   Vacía = datos de prueba. También puede pasarse en la dirección: ...html?fuente=URL */
const VOZ_CONFIG={
  url:"",          // direccion del Apps Script (/exec): se pasa al proyectar con ?fuente=
  token:"",        // clave del panel: se pasa al proyectar con ?clave=
  refrescoSeg:20,   // cada cuánto se consultan voces nuevas
  censoBase:113     // afirmaciones del censo antes del evento (actualizar el día del evento)
};
/* Se puede pasar la fuente en la dirección (?fuente=...&clave=...), pero solo si apunta al Apps Script */
try{const q=new URLSearchParams(location.search);const f=q.get("fuente");
  if(f&&/^https:\/\/script\.google\.com\/macros\/s\//.test(f))VOZ_CONFIG.url=f;
  const k=q.get("clave");if(k)VOZ_CONFIG.token=k}catch(e){}

const PAL=[["conectividad","Conectividad","t"],["energia","Energía","t"],["agua","Agua","t"],["clima","Clima","t"],["reglas","Reglas claras","e"],["credito","Crédito","e"],["formacion","Formación","e"],["brechas","Brechas","g"],["instituciones","Instituciones","g"]];
const FAM={t:"Lo que el territorio pone",e:"Lo que mueve a las empresas",g:"Lo que sostiene a la gente"};
const SECT=[["maritimo","Marítimo","Marít."],["energia","Energía","Energ."],["turismo","Turismo","Turis."],["industria","Industria","Indus."],["agro","Agro","Agro"],["comext","Com. exterior","Com. ext."],["desemp","Des. empresarial","Des. emp."],["hogares","Hogares y social","Hogares"]];
const MOM={1:"Visión",2:"Compromiso"};
const palN=Object.fromEntries(PAL.map(p=>[p[0],p[1]])),palF=Object.fromEntries(PAL.map(p=>[p[0],p[2]]));
const secN=Object.fromEntries(SECT.map(x=>[x[0],x[1]]));
const MIC='<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

/* NUBE DE PALABRAS — nucleo curado (palabra -> palanca). Las de fuera entran con 3+ menciones. */
const VOCAB={vias:"conectividad",puerto:"conectividad",aeropuerto:"conectividad",conectividad:"conectividad",logistica:"conectividad",
 energia:"energia",tarifas:"energia",agua:"agua",acueducto:"agua",riego:"agua",dique:"agua",clima:"clima",erosion:"clima",
 formalizacion:"reglas",tramites:"reglas",regulacion:"reglas",credito:"credito",financiamiento:"credito",garantias:"credito",mipyme:"credito",
 talento:"formacion",bilinguismo:"formacion",turismo:"formacion",industria:"formacion",agro:"formacion",
 empleo:"brechas",pobreza:"brechas",inclusion:"brechas",ruralidad:"brechas",instituciones:"instituciones"};
const MIN_FUERA=3;   // menciones minimas para que entre una palabra que no esta en el nucleo
const VACIAS=new Set("para pero como este esta esto esos esas aqui alli donde cuando porque sobre entre desde hasta cada todo toda todos todas muy mas menos algo nada otro otra segun ante bajo tras solo tambien nuestro nuestra sera seria hacer tener poder deber estar haber".split(" "));
const sinTildes=t=>String(t||"").toLowerCase().normalize("NFD").replace(new RegExp("["+String.fromCharCode(768)+"-"+String.fromCharCode(879)+"]","g"),"").trim();
const palabraOk=w=>w.length>=4&&!VACIAS.has(w)&&/^[a-zñ]+$/.test(w);
const FAMPAL={conectividad:"t",energia:"t",agua:"t",clima:"t",reglas:"e",credito:"e",formacion:"e",brechas:"g",instituciones:"g"};
/* si una voz vino antes del vocabulario, se le presta una palabra segun su palanca */
const PRESTADA={conectividad:"conectividad",energia:"energía",agua:"agua",clima:"clima",reglas:"formalización",credito:"crédito",formacion:"talento",brechas:"empleo",instituciones:"instituciones"};
const palabrasDe=d=>{
  const p=(d.palabras||[]).map(w=>String(w||"").toLowerCase().trim()).filter(w=>palabraOk(sinTildes(w)));
  const vistas={},fuera=[];
  p.forEach(w=>{const k=sinTildes(w);if(!vistas[k]){vistas[k]=1;fuera.push(w)}});
  if(fuera.length)return fuera;
  return PRESTADA[d.palanca]?[PRESTADA[d.palanca]]:[];
};
/* logos: cuando exista el catalogo, se llena con {organizacion normalizada: "url"} */
const LOGOS={};
const COLORES=["#3FA3AA","#43B77A","#6B8CFF","#FF7A3D","#F25100","#083D42","#7A5CFF","#C2185B"];
function escudo(org){
  const n=sinTildes(org)||"?";
  if(LOGOS[n])return `<img src="${LOGOS[n]}" alt="">`;
  const ini=String(org||"?").split(/\s+/).filter(x=>x.length>2).slice(0,2).map(x=>x[0].toUpperCase()).join("")||String(org||"?").slice(0,2).toUpperCase();
  let h=0;for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))>>>0;
  return `<b style="background:${COLORES[h%COLORES.length]}">${esc(ini)}</b>`;
}
let filPalabra=null;
let secAbierta="nube";   // nube | palancas | voces

/* DATOS DE PRUEBA — organizaciones genéricas, no son respuestas reales */
const D=(m,n,o,p,s,t,f,a)=>({momento:m,nombre:n,organizacion:o,palanca:p,sector:s,texto:t||"",audio:a!==0,validada:n.length%3===0});
const DEMO=[
D(1,"Laura","Gremio industrial","energia","industria","Que Cartagena sea un hub industrial y no solo turístico: con energía confiable, Mamonal puede duplicar su empleo formal."),
D(1,"Andrés","Operador portuario","conectividad","comext","Que el puerto se conecte por tren y doble calzada con el interior del país."),
D(1,"Marcela","Gremio hotelero","conectividad","turismo","Un aeropuerto a la altura de los visitantes que ya tenemos."),
D(1,"Jorge","Asociación agropecuaria","agua","agro","Riego para Montes de María: el agua para producir no es la misma que el agua para vivir.",0,1),
D(1,"Diana","Fundación empresarial","brechas","hogares","Que el crecimiento llegue a los barrios que no ven el puerto."),
D(1,"Camilo","Clúster marítimo","reglas","maritimo","Que los astilleros de Cartagena compitan con Panamá, con reglas reglamentadas y trámites cortos."),
D(1,"Paola","Universidad regional","formacion","desemp","Técnicos formados para lo que pide el puerto, el turismo y la industria."),
D(1,"Ricardo","Gremio de comerciantes","reglas","desemp","Un camino de formalización por etapas para el pequeño comercio.",0,1),
D(1,"Sofía","Empresa de energía renovable","energia","energia","Aprovechar el viento y el sol del Caribe con conexión a tiempo a la red."),
D(1,"Hernán","Entidad financiera","credito","desemp","Crédito que llegue a la mipyme de Bolívar y no se quede en Bogotá."),
D(1,"Natalia","Organización ambiental","clima","hogares","Una ciudad que se anticipa al mar y a las lluvias, no que reacciona."),
D(1,"Felipe","Gremio logístico","conectividad","comext","Accesos portuarios que no dependan de una sola vía urbana."),
D(1,"Isabel","Cooperativa agrícola","agua","agro","Distritos de riego que funcionen y centros de acopio cerca del productor.",0,1),
D(1,"Tomás","Gremio de la construcción","instituciones","hogares","Instituciones regionales con capacidad de ejecutar, con respaldo de la Nación."),
D(2,"Laura","Gremio industrial","energia","industria","Compartir los datos de consumo y costo energético de nuestros afiliados para sostener el argumento ante el DNP."),
D(2,"Andrés","Operador portuario","conectividad","comext","Acompañar la ficha técnica de los accesos portuarios con nuestras cifras de carga."),
D(2,"Marcela","Gremio hotelero","formacion","turismo","Abrir 40 plazas de práctica en hoteles para jóvenes de bachillerato técnico."),
D(2,"Camilo","Clúster marítimo","reglas","maritimo","Entregar las 26 recomendaciones de la ley de fomento con su norma de soporte."),
D(2,"Paola","Universidad regional","formacion","desemp","Poner a disposición un grupo de investigación para medir la pertinencia de la oferta."),
D(2,"Hernán","Entidad financiera","credito","desemp","Diseñar con la Cámara una línea piloto para empresas recién formalizadas.",0,1),
D(2,"Natalia","Organización ambiental","clima","hogares","Aportar la cartografía de riesgo que ya tenemos levantada."),
D(2,"Sofía","Empresa de energía renovable","energia","energia","Reportar las solicitudes de conexión represadas para que el dato sea público."),
D(2,"Diana","Fundación empresarial","brechas","hogares","Conectar nuestros programas de empleabilidad con la agenda de la Junta."),
];
const RESERVA=[
D(1,"Julián","Gremio de transporte","conectividad","comext","El Canal del Dique y el río como corredor de carga."),
D(1,"Valentina","Emprendimiento digital","formacion","desemp","Cartagena como sede de servicios globales, con bilingüismo de verdad.",0,1),
D(2,"Julián","Gremio de transporte","conectividad","comext","Compartir los aforos de carga del corredor Mamonal."),
D(1,"Álvaro","Gremio agroindustrial","agua","agro","Transformar aquí lo que se cosecha aquí."),
D(2,"Valentina","Emprendimiento digital","formacion","desemp","Mentorías para 20 emprendimientos de base tecnológica."),
D(1,"Carolina","Caja de compensación","brechas","hogares","Que el empleo formal crezca donde más falta hace.",0,1),
D(2,"Carolina","Caja de compensación","brechas","hogares","Cruzar nuestros datos de afiliación con el censo empresarial.")
];

let datos=[],modo="prueba",ultimaDemo=null,ult=null,filMom=0,filPal=null,reserva=RESERVA.slice();
const $v=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hora=d=>d.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"});

function estado(){const e=$v("#vzEstado");e.className="vz-estado "+modo;
  e.lastElementChild.textContent=modo==="cargando"?"Conectando…":modo==="vivo"?"En vivo · actualizado "+hora(ult):modo==="caido"?"Sin conexión · mostrando lo último"+(ult?" ("+hora(ult)+")":""):"Datos de prueba · no son respuestas reales";}

function pinta(){
  estado();
  const T=datos, V=datos.filter(d=>!d.procesando&&palN[d.palanca]);
  const proc=datos.filter(d=>d.procesando).length;
  const F=V.filter(d=>!filMom||+d.momento===filMom);
  const orgs=new Set(T.map(d=>(d.organizacion||"").trim().toLowerCase()).filter(Boolean));
  // momentos
  const M=$v("#vzMom");M.innerHTML="";
  [[0,"Todo"],[1,"Visión"],[2,"Compromiso"]].forEach(([k,t])=>{const b=document.createElement("button");b.className="sug"+(k===filMom?" on":"");b.type="button";
    b.textContent=t+" ("+(k?T.filter(d=>+d.momento===k).length:T.length)+")";b.onclick=()=>{filMom=k;pinta()};M.appendChild(b)});
  // kpis
  $v("#vzKpis").innerHTML=[
    [T.length,proc?`voces recibidas · ${proc} transcribiéndose`:"voces recibidas, transcritas y ubicadas"],[orgs.size,"organizaciones que hablaron"],
    [T.filter(d=>+d.momento===2).length,"compromisos concretos"],
    [VOZ_CONFIG.censoBase+V.length,"afirmaciones en el censo",VOZ_CONFIG.censoBase+" + "+V.length]
  ].map(k=>`<div class="kpi"><div class="num">${k[0]}${k[2]?`<small>${k[2]}</small>`:""}</div><div class="lab">${k[1]}</div></div>`).join("");
  // palancas
  const cnt={},org={};PAL.forEach(p=>{cnt[p[0]]=0;org[p[0]]=new Set()});
  F.forEach(d=>{cnt[d.palanca]++;if(d.organizacion)org[d.palanca].add(d.organizacion.trim())});
  const mx=Math.max(1,...Object.values(cnt));
  const P=$v("#vzPal");P.innerHTML="";let fam="";
  PAL.forEach(([id,nom,f])=>{
    if(f!==fam){fam=f;const h=document.createElement("div");h.className="vz-fam";h.textContent=FAM[f];P.appendChild(h)}
    const o=[...org[id]],os=o.slice(0,5).join(" · ")+(o.length>5?` · y ${o.length-5} más`:"");
    const b=document.createElement("button");b.type="button";b.className="vz-pal"+(filPal===id?" on":"");
    b.innerHTML=`<b>${esc(nom)}</b><span class="bar"><i class="f-${f}" style="width:${cnt[id]/mx*100}%"></i></span><span class="n">${cnt[id]}</span><span class="orgs">${o.length?esc(os):"<i>nadie todavía</i>"}</span>`;
    b.onclick=()=>{filPal=filPal===id?null:id;pinta()};P.appendChild(b)});
  // matriz
  const mm={};let mmx=1;F.forEach(d=>{const k=d.palanca+"|"+d.sector;mm[k]=(mm[k]||0)+1;mmx=Math.max(mmx,mm[k])});
  $v("#vzMat").innerHTML="<tr><th></th>"+SECT.map(s=>`<th title="${esc(s[1])}">${esc(s[2])}</th>`).join("")+"</tr>"+
    PAL.map(([id,nom])=>"<tr><th class='r'>"+esc(nom)+"</th>"+SECT.map(([s])=>{const n=mm[id+"|"+s]||0;
      if(!n)return"<td class='z' style='background:var(--mono)'>·</td>";const pct=Math.round(25+75*n/mmx);
      return`<td style="background:color-mix(in srgb,var(--p1) ${pct}%,var(--sup));color:${pct>55?"#fff":"var(--ink)"}">${n}</td>`}).join("")+"</tr>").join("");
  // secciones: una a la vez, para que la vista no se vea saturada
  const SECS=[["nube","Nube de palabras"],["analisis","Palancas y voces"]];
  const S=$v("#vzSecs");S.innerHTML="";
  SECS.forEach(([k,t])=>{const b=document.createElement("button");b.type="button";
    b.className="sug"+(secAbierta===k?" on":"");b.textContent=t;
    b.onclick=()=>{secAbierta=k;pinta()};S.appendChild(b)});
  [...document.querySelectorAll("#v-voz .vz-sec")].forEach(el=>
    el.classList.toggle("abierta",el.dataset.sec===secAbierta));

  // nube de palabras
  const cuenta={},quienes={},muestra={};
  F.forEach(d=>palabrasDe(d).forEach(w=>{
    const k=sinTildes(w);
    cuenta[k]=(cuenta[k]||0)+1;
    // se muestra la forma con tildes si alguien la dijo asi
    if(!muestra[k]||(w.length>=muestra[k].length&&w!==k))muestra[k]=w;
    (quienes[k]=quienes[k]||new Set()).add((d.organizacion||"").trim()||"Sin organización");
  }));
  const lista=Object.keys(cuenta).filter(w=>VOCAB[w]||cuenta[w]>=MIN_FUERA);
  const maxW=Math.max(1,...lista.map(w=>cuenta[w]));
  const N=$v("#vzNube");
  if(!lista.length){N.innerHTML="<p class='vz-nube-vacia'>La nube se llena sola a medida que la gente responde.</p>";}
  else{
    // orden estable: no salta en cada refresco
    const semilla=w=>{let h=0;for(let i=0;i<w.length;i++)h=(h*131+w.charCodeAt(i))>>>0;return h};
    const orden=lista.slice().sort((a,b)=>semilla(a)-semilla(b));
    const proy=document.body.classList.contains("proyectar");
    const min=proy?22:15,max=proy?104:58;
    N.innerHTML=orden.map(w=>{
      const n=cuenta[w],t=Math.round(min+(max-min)*Math.sqrt(n/maxW));
      const fam=VOCAB[w]?("w-"+FAMPAL[VOCAB[w]]):"w-otra";
      const apagada=filPalabra&&filPalabra!==w?" apagada":"";
      const on=filPalabra===w?" on":"";
      return `<button type="button" class="vz-w ${fam}${apagada}${on}" data-w="${esc(w)}" style="font-size:${t}px" title="${n} ${n===1?"persona":"personas"}">${esc(muestra[w]||w)}<i>${n}</i></button>`;
    }).join("");
    [...N.querySelectorAll(".vz-w")].forEach(b=>b.onclick=()=>{filPalabra=filPalabra===b.dataset.w?null:b.dataset.w;pinta()});
  }
  const Q=$v("#vzQuienes");
  if(filPalabra&&quienes[filPalabra]){
    const orgs=[...quienes[filPalabra]].sort((a,b)=>a.localeCompare(b,"es"));
    Q.className="vz-quienes abierta";
    Q.innerHTML=`<p><b>${esc(muestra[filPalabra]||filPalabra)}</b> · ${orgs.length} ${orgs.length===1?"organización":"organizaciones"}</p>`+
      `<div class="vz-escudos">${orgs.map(o=>`<span class="vz-esc">${escudo(o)}<span>${esc(o)}</span></span>`).join("")}</div>`;
  } else {Q.className="vz-quienes";Q.innerHTML=""}
  $v("#vzNubeT").textContent=filPalabra?"Quién dijo «"+(muestra[filPalabra]||filPalabra)+"»":"Las palabras que más se repitieron";
  $v("#vzNubeLimpiar").hidden=!filPalabra;

  // muro
  const FT=T.filter(d=>!filMom||+d.momento===filMom);
  const W=(filPal?F.filter(d=>d.palanca===filPal):FT).slice(-12).reverse();
  $v("#vzMuroT").textContent=filPal?"Las voces · "+palN[filPal]:"Las voces más recientes";
  $v("#vzMuro").innerHTML=W.length?W.map(d=>{
    const corta=t=>{t=String(t||"");return t.length>260?t.slice(0,257).replace(/\s+\S*$/,"")+"…":t};
    let cuerpo="",pills="";
    if(d.procesando){cuerpo=`<span class="audio vz-proc">${MIC} Transcribiendo la nota de voz y ubicándola en su palanca…</span>`;pills=`<span class="pill warn">por ubicar</span>`}
    else{
      if(d.texto){cuerpo=`<q>${esc(corta(d.texto))}</q>`}
      if(d.audio)cuerpo+=`<span class="audio">${MIC} transcrita de su nota de voz</span>`;
      pills=(palN[d.palanca]?`<span class="pill g">${esc(palN[d.palanca])}</span>`:`<span class="pill bad">sin palanca</span>`)+(secN[d.sector]?`<span class="pill g">${esc(secN[d.sector])}</span>`:"")+
        `<span class="pill ${d.validada?"ok":"az"}">${d.validada?"validada":"ubicada por IA"}</span>`}
    return`<article class="vz-voz m${+d.momento}"><div class="meta" style="padding:0;margin:0"><span class="tema">${MOM[d.momento]||""}</span>${pills}</div>${cuerpo}<div class="quien2"><b>${esc(d.nombre)}</b> · ${esc(d.organizacion)}</div></article>`}).join("")
    :"<p class='vz-vacio'>Todavía no hay voces en este filtro.</p>";
}

function cargar(){
  if(!VOZ_CONFIG.url)return;
  const cb="vozcb"+Date.now(),s=document.createElement("script");
  const fin=()=>{try{delete window[cb]}catch(e){window[cb]=undefined}s.remove()};
  const t=setTimeout(()=>{modo="caido";pinta();fin()},15000);
  window[cb]=d=>{clearTimeout(t);
    if(d&&d.ok===false){modo="caido";pinta();fin();console.warn("El panel no pudo leer los datos:",d.error);return}
    if(d&&Array.isArray(d.voces)){datos=d.voces;modo="vivo";ult=new Date();pinta()}fin()};
  s.onerror=()=>{clearTimeout(t);modo="caido";pinta();fin()};
  s.src=VOZ_CONFIG.url+(VOZ_CONFIG.url.includes("?")?"&":"?")+"accion=datos&token="+encodeURIComponent(VOZ_CONFIG.token)+"&callback="+cb+"&_="+Date.now();
  document.body.appendChild(s);
}

$v("#vzNubeLimpiar").onclick=()=>{filPalabra=null;pinta()};
$v("#vzProy").onclick=()=>{const on=document.body.classList.toggle("proyectar");$v("#vzProy").textContent=on?"Salir de proyección":"Modo proyección";pinta();
  try{if(on&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();else if(!on&&document.fullscreenElement)document.exitFullscreen()}catch(e){}};
document.addEventListener("fullscreenchange",()=>{if(!document.fullscreenElement&&document.body.classList.contains("proyectar")){document.body.classList.remove("proyectar");$v("#vzProy").textContent="Modo proyección"}});

if(VOZ_CONFIG.url){modo="cargando";pinta();cargar();setInterval(cargar,VOZ_CONFIG.refrescoSeg*1000)}
else{datos=DEMO.slice();modo="prueba";pinta();
  // simula el flujo real: llega la nota de voz, se transcribe y se ubica en su palanca
  setInterval(()=>{if(ultimaDemo&&ultimaDemo.procesando){ultimaDemo.procesando=false;pinta();return}
    if(reserva.length){ultimaDemo=Object.assign({},reserva.shift(),{procesando:true});datos.push(ultimaDemo);pinta()}},6000)}
try{if(new URLSearchParams(location.search).get("vista")==="voz")ver("voz")}catch(e){}
})();
