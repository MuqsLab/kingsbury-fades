'use strict';
// Kingsbury Fades: a static, editable site. Real bookings are handled entirely by Setmore.
// Pages CMS edits content/*.json; Cloudflare Pages redeploys that GitHub change.
const $ = (selector, scope=document) => scope.querySelector(selector);
const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanAsset = value => {
  const p=String(value||'').trim();
  if(/^https:\/\//i.test(p)) return p;
  if(/^(?:\/)?(?:assets\/images\/)[a-z\d_./ -]+$/i.test(p) && !p.includes('..')) return p.replace(/^\//,'');
  return 'assets/images/logo.webp';
};
const safeUrl = (value, fallback='#') => { try { const url=new URL(value); if(url.protocol==='https:') return url.href; }catch(e){} return fallback; };
const phoneNumber = value => 'tel:'+String(value||'').replace(/[^\d+]/g,'');
const phoneLabel = value => { const v=String(value||'').replace(/\D/g,''); return v.length===10?`${v.slice(0,4)} ${v.slice(4,7)} ${v.slice(7)}`:String(value||''); };
const setText = (sel,text) => { const el=$(sel); if(el) el.textContent=String(text??''); };
let data,lightboxIndex=0,activeGallery=[],heroIndex=0,heroTimer=null,lastFocus=null;
const iconText={scissors:'✂',sparkles:'✦',user:'♟',smile:'☻',droplets:'♨',eye:'◉',sun:'☼',zap:'ϟ'};
function validSetmore(value){try {const u=new URL(value); return u.protocol==='https:' && (u.hostname==='setmore.com' || u.hostname.endsWith('.setmore.com'));}catch(e){return false}}
function mapEmbed(address){return 'https://www.google.com/maps?q='+encodeURIComponent(address)+'&output=embed';}
function loadSection(name){return fetch(`content/${name}.json`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(`Cannot load ${name}`);return r.json()});}
async function loadData(){
  const seed=JSON.parse($('#preview-seed').textContent);
  if(location.protocol==='file:')return seed;  // Double-click the index.html to preview without installing anything.
  try {
    const [site,services,gallery,barbers]=await Promise.all(['site','services','gallery','barbers'].map(loadSection));
    return {site,services,gallery,barbers};
  }catch(err){console.warn('Using bundled preview content:',err);return seed;}
}
// Optional live Google widgets. Owner copies the vendor's embed snippet to Pages CMS.
// Only known widget hosts are accepted; inline JavaScript is never executed.
function allowedWidgetUrl(raw){
 try {const u=new URL(raw); const hosts=['repu.ai','laudiva.ai','sociablekit.com'];
 return u.protocol==='https:' && hosts.some(x=>u.hostname===x||u.hostname.endsWith('.'+x));}catch(e){return false;}
}
function mountApprovedWidget(target,code){
 if(!target || !String(code||'').trim()) return false;
 const doc=new DOMParser().parseFromString(String(code),'text/html');
 const frag=document.createDocumentFragment(); let count=0;
 for(const node of doc.body.childNodes){
  if(node.nodeType!==1)continue;
  const tag=node.tagName.toLowerCase();
  if(tag==='script'){
   const src=node.getAttribute('src'); if(!allowedWidgetUrl(src))continue;
   const script=document.createElement('script'); script.src=src;script.async=true;
   for(const {name,value} of node.attributes) if(name.startsWith('data-')) script.setAttribute(name,value);
   frag.appendChild(script);count++;
  } else if(tag==='iframe'){
   const src=node.getAttribute('src'); if(!allowedWidgetUrl(src))continue;
   const frame=document.createElement('iframe');frame.src=src;frame.loading='lazy';frame.title='Live Google Business content';frame.style.cssText='width:100%;min-height:300px;border:0;background:transparent;';
   frag.appendChild(frame);count++;
  } else if(['div','span','section'].includes(tag)){
   const el=document.createElement(tag);
   for(const {name,value} of node.attributes) if(['id','class'].includes(name)||name.startsWith('data-'))el.setAttribute(name,value);
   if(node.textContent && !node.children.length)el.textContent=node.textContent;
   frag.appendChild(el);count++;
  }
 }
 if(!count) return false;
 target.replaceChildren(frag); return true;
}
function mountGoogleWidgets(s){
 const reviews=$('#google-reviews-live');
 if(!mountApprovedWidget(reviews,s.google_reviews_widget_embed_code))reviews.classList.add('needs-connection');
 const photos=$('#google-photos-live'), target=$('#google-photos-widget');
 if(mountApprovedWidget(target,s.google_photos_widget_embed_code))photos.hidden=false;
}
function renderSite(){
 const s=data.site;
 setText('#hero-kicker',s.hero_kicker);
 const rawTitle=String(s.hero_title||'A FRESH CUT. A BETTER MOOD.');
 const match=rawTitle.match(/^(.*?[.!?])\s+(.+)$/);
 $('#hero-heading').innerHTML=match?`${esc(match[1])}<br><em>${esc(match[2])}</em>`:esc(rawTitle);
 setText('#hero-description',s.hero_description); $('#hero-logo').src=cleanAsset(s.hero_logo||s.logo);
 setText('#about-heading',s.intro_title); // Replace with typographic split below, safely escaped.
 const introParts=String(s.intro_title||'').split(/\s+(?=[^\s]+\.?$)/);
 if(introParts.length>1) $('#about-heading').innerHTML=esc(introParts.slice(0,-1).join(' '))+'<br><em>'+esc(introParts.at(-1))+'</em>';
 setText('#about-description',s.intro_text);
 $('#about-photo').src=cleanAsset(s.shop_image);
 $('#storefront-image').src=cleanAsset(s.storefront_image);
 $('#footer-logo').src=cleanAsset(s.logo);
 const phone=s.phone_primary||'0402356274';
 ['#nav-call','#call-primary','#mobile-call','#footer-main-phone'].forEach(k=>{const el=$(k);if(el)el.href=phoneNumber(phone)});
 setText('#call-number',phoneLabel(phone));setText('#footer-main-phone',phoneLabel(phone));
 if(s.phone_secondary){$('#footer-second-phone').href=phoneNumber(s.phone_secondary);setText('#footer-second-phone',phoneLabel(s.phone_secondary))}else $('#footer-second-phone').hidden=true;
 setText('#shop-address',s.address);setText('#footer-address',s.address);
 $('#directions-link').href=safeUrl(s.google_maps_link,'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.address));
 $('#map-frame').src=mapEmbed(s.address);
 setText('#hours-mon',s.opening_mon);setText('#hours-tue-sat',s.opening_tue_sat);setText('#hours-sun',s.opening_sun);
 ['instagram','facebook','tiktok'].forEach(name=>{const el=$(`#social-${name}`); if(s[name])el.href=safeUrl(s[name]);else el.hidden=true});
 const googleFallback='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.business_name+' Barbershop '+s.address);
 const read=$('#read-reviews'),write=$('#leave-review');
 read.href=safeUrl(s.google_reviews_link,googleFallback);
 read.textContent='READ GOOGLE REVIEWS ↗';
 write.href=safeUrl(s.google_review_write_link,googleFallback);
 write.textContent='LEAVE A GOOGLE REVIEW ↗';
 $('#google-photos-link').href=safeUrl(s.google_photos_link||s.google_maps_link,googleFallback);
 mountGoogleWidgets(s);
 setText('#year',new Date().getFullYear());
 const captions=['INSIDE THE SHOP','OUR SHOPFRONT','FRESH CUTS'];
 const images=Array.isArray(s.hero_images)?s.hero_images.filter(Boolean):[];
 const heroImages=images.length?images:[s.shop_image,s.storefront_image];
 $('#hero-slides').innerHTML=heroImages.map((src,i)=>`<div class="hero-slide ${i===0?'is-current':''}" style="background-image:url('${esc(cleanAsset(src))}')"></div>`).join('');
 $('#slide-dots').innerHTML=heroImages.map((_,i)=>`<button type="button" aria-label="Show slide ${i+1}" data-slide="${i}" class="${i===0?'active':''}"></button>`).join('');
 const goToSlide=(i)=>{heroIndex=(i+heroImages.length)%heroImages.length;$$('.hero-slide').forEach((el,n)=>el.classList.toggle('is-current',n===heroIndex));$$('#slide-dots button').forEach((el,n)=>el.classList.toggle('active',n===heroIndex));setText('#slide-number',`${String(heroIndex+1).padStart(2,'0')} / ${String(heroImages.length).padStart(2,'0')}`);setText('#slide-caption',captions[heroIndex]||'KINGSBURY FADES')};
 $$('button[data-slide]').forEach(b=>b.addEventListener('click',()=>{goToSlide(Number(b.dataset.slide));restartSlider()}));
 const restartSlider=()=>{clearInterval(heroTimer);if(heroImages.length>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches)heroTimer=setInterval(()=>{if(!document.hidden)goToSlide(heroIndex+1)},5000)};
 restartSlider();
 $$('.top-strip .top-right').forEach(el=>{el.textContent='✦ '+s.address.toUpperCase()});
 if(!s.accepts_walkins) $$('.status-indicator,.hero-meta>span:first-child').forEach(el=>el.style.display='none');
 renderServices();renderBarbers();renderGallery();setupBooking();
}
function renderServices(){
 $('#services-list').innerHTML=data.services.map(row=>`<article class="service-card"><span class="service-icon" aria-hidden="true">${esc(iconText[row.icon]||'✦')}</span><div class="service-details"><h3>${esc(row.name)}</h3><p>${esc(row.description||'')}</p><span class="service-duration">${Number(row.minutes)||0} MINUTES</span></div><strong class="service-price">$${Number(row.price)||0}</strong></article>`).join('');
}
function renderBarbers(){
 $('#barbers-grid').innerHTML=data.barbers.map((b,i)=>`<article class="barber-card"><div class="barber-avatar"><span class="initial">${esc(b.initial||String(b.name||'?')[0])}</span>${b.photo?`<img src="${esc(cleanAsset(b.photo))}" alt="${esc(b.name)} profile photo" loading="lazy">`:''}</div><div class="barber-details"><span class="barber-label">YOUR BARBER</span><h3>${esc(b.name)}</h3><p>${esc(b.description||'')}</p>${b.phone?`<a class="barber-phone" href="${esc(phoneNumber(b.phone))}" aria-label="Call ${esc(b.name)} on ${esc(phoneLabel(b.phone))}"><span class="barber-phone-symbol" aria-hidden="true">☎</span><span>${esc(phoneLabel(b.phone))}</span></a>`:''}<div class="barber-actions"><button type="button" class="button button-gold js-book-barber" data-barber-name="${esc(b.name)}" data-barber-index="${i}" aria-label="Book an appointment with ${esc(b.name)}">BOOK ${esc(b.name).toUpperCase()} ↗</button></div></div></article>`).join('');
}
function renderGallery(){
 activeGallery=data.gallery.filter(x=>x.image);
 $('#gallery-grid').innerHTML=activeGallery.map((p,i)=>`<button type="button" class="gallery-item" data-gallery="${i}" aria-label="View ${esc(p.title)}"><img src="${esc(cleanAsset(p.image))}" alt="${esc(p.alt||p.title)}" loading="lazy"><span class="expand" aria-hidden="true">↗</span><span class="gallery-overlay"><strong>${esc(p.title)}</strong><small>${esc(p.category||'OUR WORK')}</small></span></button>`).join('');
 $$('[data-gallery]').forEach(b=>b.addEventListener('click',()=>openLightbox(Number(b.dataset.gallery))));
}
function setupBooking(){
 const el=$('#booking-body');const url=data.site.setmore_booking_url;
 if(validSetmore(url)){
  // No payment permission is granted to the iframe; Setmore account must have payments disabled.
  el.innerHTML=`<iframe title="Kingsbury Fades appointment booking powered by Setmore" loading="lazy" allow="web-share" referrerpolicy="strict-origin-when-cross-origin" data-booking-src="${esc(url)}"></iframe>`;
 }else{
  el.innerHTML=`<div class="booking-setup"><span class="setup-symbol">♛</span><h3>ONLINE BOOKINGS COMING SOON</h3><p>The website is ready for your own Setmore booking link. The owner can add it in <strong>Website settings and text</strong> in Pages CMS. Until then, please call the shop to book.</p><a class="button button-gold" href="${esc(phoneNumber(data.site.phone_primary))}">☎ CALL ${esc(phoneLabel(data.site.phone_primary))}</a><small>Walk-ins welcome · Payment in-store</small></div>`;
 }
 $$('.js-book').forEach(button=>button.addEventListener('click',()=>openBooking()));
 $$('.js-book-barber').forEach(button=>button.addEventListener('click',()=>openBooking(data.barbers[Number(button.dataset.barberIndex)]?.booking_url)));
}
function showModal(sel){const modal=$(sel);lastFocus=document.activeElement;modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');document.body.classList.add('no-scroll');$('.icon-close',modal)?.focus();}
function closeModal(sel){const modal=$(sel);modal.classList.remove('is-open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('no-scroll');if(sel==='#booking-modal'){const frame=$('#booking-body iframe');if(frame)frame.src='about:blank';}lastFocus?.focus?.()}
function openBooking(staffBookingUrl){
 // The Setmore form is the only place an appointment can actually be confirmed.
 showModal('#booking-modal');const frame=$('#booking-body iframe');if(frame){frame.src=validSetmore(staffBookingUrl)?staffBookingUrl:frame.dataset.bookingSrc;}
}
function openLightbox(i){if(!activeGallery.length)return;lightboxIndex=i;updateLightbox();showModal('#lightbox')}
function updateLightbox(){const p=activeGallery[lightboxIndex];$('#lightbox-photo').src=cleanAsset(p.image);$('#lightbox-photo').alt=p.alt||p.title;setText('#lightbox-caption',p.title+'  ·  '+(p.category||'Kingsbury Fades'))}
function shiftLightbox(amount){lightboxIndex=(lightboxIndex+amount+activeGallery.length)%activeGallery.length;updateLightbox()}
$$('[data-dismiss]').forEach(button=>button.addEventListener('click',()=>closeModal('#'+button.dataset.dismiss.replace('booking','booking-modal'))));
$('#lightbox-prev').addEventListener('click',()=>shiftLightbox(-1));$('#lightbox-next').addEventListener('click',()=>shiftLightbox(1));
document.addEventListener('keydown',e=>{
 if(e.key==='Escape')$$('.modal-shell.is-open').forEach(m=>closeModal('#'+m.id));
 if($('#lightbox').classList.contains('is-open')){if(e.key==='ArrowLeft')shiftLightbox(-1);if(e.key==='ArrowRight')shiftLightbox(1)}
});
$('#menu-toggle').addEventListener('click',()=>{const nav=$('#main-nav');const open=nav.classList.toggle('open');$('#menu-toggle').setAttribute('aria-expanded',String(open));});
$$('#main-nav a').forEach(a=>a.addEventListener('click',()=>{$('#main-nav').classList.remove('open');$('#menu-toggle').setAttribute('aria-expanded','false')}));
$('.js-to-top').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
(async()=>{data=await loadData();renderSite();})();
