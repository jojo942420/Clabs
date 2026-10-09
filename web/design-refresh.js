// CLabs visual refresh. Existing authentication, routing and permission checks stay in place.
const clabsPolishStyle=document.createElement('style');
clabsPolishStyle.textContent=`
.auth-gate{place-items:center;min-height:100dvh;padding:28px;background:#0c3028}
.auth-background{opacity:.2;filter:saturate(.6);object-position:center}
.auth-gate::before{background:radial-gradient(ellipse at 20% 10%,#8bcdaa38,transparent 45%),radial-gradient(ellipse at 85% 90%,#bfd58324,transparent 40%),linear-gradient(130deg,#072c29b8,#163e35de)}
.auth-card{position:relative;isolation:isolate;max-width:370px;padding:28px 30px 24px;border:1px solid #ffffffa6;border-top:1px solid #ffffffa6;border-radius:30px;background:linear-gradient(145deg,#fffffff7,#f1f8f4f0);box-shadow:0 30px 90px #001c2866,inset 0 1px 0 white;backdrop-filter:blur(20px);text-align:left}
.auth-card::before{content:'';position:absolute;inset:-9px 14px 14px -9px;border:1px solid #d4efdd38;border-radius:35px;z-index:-1;pointer-events:none}
.auth-brand-logo{width:124px;margin:-2px 0 18px -6px}
.auth-card h1{font-size:29px;font-weight:750;letter-spacing:-1.1px;color:#123f33;margin:0 0 6px}
.auth-subtitle{font-size:13px;color:#617b6f;max-width:245px;margin-bottom:22px}
.auth-kicker{position:absolute;top:35px;right:28px;font-size:9px;font-weight:750;letter-spacing:1.5px;color:#507566;padding:6px 9px;border:1px solid #bcd9c9;border-radius:30px;background:#eaf5ee}
.auth-login-form label{font-size:12px;letter-spacing:.3px;color:#3c5d4e;margin:15px 0 7px}
.auth-login-form input{border:1px solid #d5e4dc;background:#fff;border-radius:12px;box-shadow:inset 0 2px 3px #133c2904;padding:12px 14px;min-height:47px}
.auth-login-form .btn[type=submit]{position:relative;min-height:48px;margin:23px 0 0;border:1px solid #126645;border-radius:13px;background:linear-gradient(135deg,#238d65,#0e5c43);box-shadow:0 5px 0 #084d37,0 9px 19px #155e3d26;letter-spacing:.2px}
.auth-login-form .btn[type=submit]:hover{background:linear-gradient(135deg,#269b70,#116c4d);transform:translateY(-1px)}
.auth-login-form .btn[type=submit]:active{transform:translateY(3px);box-shadow:0 2px 0 #084d37}
.auth-password-wrap{position:relative}.auth-password-wrap input{padding-right:65px}
.auth-password-toggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;padding:8px;color:#236b50;font-size:12px;font-weight:700;min-height:36px}
.auth-footnote{display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;color:#6c8276;margin:23px 0 0}.auth-footnote svg{width:14px;height:14px}
#authMessage{font-size:13px}#authMessage:not(:empty){border:1px solid #f0cdd1}
body{background:#f2f6f3}body>aside{width:258px;padding:25px 16px 18px;background:linear-gradient(170deg,#153e33,#0c2925);border:0;color:#e6f1eb;box-shadow:5px 0 28px #153e3308;scrollbar-width:thin;scrollbar-color:#466b5b transparent}
body>aside .brand{padding:0 10px 19px}body>aside .brand-logo{width:138px;background:#f7fcf8;border:1px solid #ffffff70;border-radius:13px;padding:4px 10px}
body>aside .navlabel{display:none}#nav{display:block}#nav .navgroup{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin:0 0 15px}
#nav .navgroup-title{grid-column:1/-1;margin:2px 9px 5px;color:#95b7a8;font-size:9px;letter-spacing:1.8px;font-weight:650}
#nav button{position:relative;flex-direction:column;justify-content:center;align-items:center;gap:3px;margin:0;padding:10px 4px;min-height:64px;width:100%;border:1px solid #ffffff09;border-radius:12px;background:#ffffff04;color:#bdd4c8;font-size:11px;font-weight:550;text-align:center;transition:background .18s,border-color .18s,box-shadow .18s}
#nav button[hidden]{display:none}#nav button span{white-space:normal;line-height:1.3}#nav button>.clabs-icon{color:#9fc7b5;width:25px;height:25px}#nav button .clabs-icon svg{width:20px;height:20px}
#nav button:hover{background:#ffffff0e;border-color:#ffffff20;color:white}
#nav button.active{background:linear-gradient(140deg,#e5f5e9,#c9e5d4);color:#164933;border-color:#d7f0e0;box-shadow:0 3px 0 #061f1955,0 6px 15px #00000012;font-weight:750}
#nav button.active>.clabs-icon{color:#176946}#nav button:focus-visible{outline:2px solid #c1e7cc;outline-offset:2px}
body>aside .sidebottom{border-top:1px solid #ffffff15;padding:15px 8px 0;font-size:11px;color:#c8ded2}body>aside .sidebottom .muted{color:#86aa99;font-size:10px;margin-top:4px}
main{margin-left:258px}main>header{background:#fffffff0;height:73px;border-color:#e1eae4}.workspace{padding-top:24px}.crumb{color:#82988b}#crumb{color:#28573f;font-weight:650}
.home-dashboard .homepage-brand{border-radius:24px;box-shadow:0 8px 25px #16402b08}.home-section-title{margin-bottom:17px}.home-section-title h2{font-size:15px;letter-spacing:-.2px}
.home-dashboard .tab-thumbnails{grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:16px 12px;margin-bottom:33px;padding:0 2px 5px;overflow:visible}
.tab-thumbnail{position:relative;isolation:isolate;min-height:110px;padding:14px 6px 12px;gap:12px;border:1px solid #fff;border-bottom-color:#c9dacd;border-radius:18px;background:linear-gradient(145deg,#fff 5%,#f0f6f2);color:#2d5040;font-size:12px;font-weight:650;box-shadow:0 5px 0 #dce7de,0 6px 0 #c4d6ca,0 12px 18px #234f3210,inset 0 1px 0 #fff;transform:translateY(0);transition:transform .2s,box-shadow .2s,border-color .2s}
.tab-thumbnail::after{content:'';position:absolute;top:9px;right:10px;width:4px;height:4px;border-radius:50%;background:#b5cdbe}
.tab-thumbnail .clabs-icon{position:relative;width:43px;height:43px;border:1px solid #ffffffd9;border-radius:13px;background:linear-gradient(135deg,#ffffff 0%,var(--icon-bg) 45%,var(--icon-bg) 100%);transform:perspective(180px) rotateX(10deg) rotateY(-13deg) rotateZ(-7deg);box-shadow:2px 3px 0 color-mix(in srgb,var(--icon-color) 22%,white),3px 5px 0 color-mix(in srgb,var(--icon-color) 30%,white),7px 10px 12px #1c4e3620,inset 0 2px 0 #fff;transition:transform .2s}
.tab-thumbnail .clabs-icon svg{width:28px;height:28px;stroke-width:1.8;filter:drop-shadow(0 1px 0 #fff) drop-shadow(1px 2px 1px #143e2917)}
.tab-thumbnail:hover{background:linear-gradient(140deg,#fff,#e9f4ed);border-color:#b9d8c5;transform:translateY(-4px);box-shadow:0 5px 0 #cce0d2,0 6px 0 #b8cfbf,0 17px 23px #234f3220}
.tab-thumbnail:hover .clabs-icon{transform:perspective(180px) rotateX(0) rotateY(0) rotateZ(0) translateY(-2px)}
.tab-thumbnail:active{transform:translateY(3px);box-shadow:0 2px 0 #c4d6ca,0 5px 9px #234f3215}
.tab-thumbnail:focus-visible{outline:3px solid #27865e;outline-offset:5px}.btn.primary:hover{background:#0e6345;border-color:#0e6345}
@media(max-width:1100px) and (min-width:751px){body>aside{width:218px;padding:22px 12px}main{margin-left:218px}#nav button{font-size:10px}}
@media(max-width:750px){body>aside{position:sticky;top:0;z-index:20;width:100%;padding:10px 12px 12px;overflow:visible;box-shadow:0 4px 16px #102f2514}body>aside .brand{padding:0 2px 9px}body>aside .brand-logo{width:96px;height:34px;object-fit:contain;padding:0 5px;border-radius:8px}#nav{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 5px;scrollbar-width:thin;scrollbar-color:#7b9c88 transparent}#nav .navgroup{display:flex;flex-shrink:0;gap:5px;margin:0;padding-right:10px;border-right:1px solid #ffffff18}#nav .navgroup:last-child{border:0;padding:0}#nav .navgroup-title{display:none}#nav button{width:74px;min-height:58px;flex-shrink:0;font-size:10px;padding:7px 4px;border-radius:10px}#nav button>.clabs-icon{width:22px;height:22px}#nav button svg{display:block;width:18px;height:18px}main{margin-left:0}main>header{height:55px}.home-dashboard .tab-thumbnails{grid-template-columns:repeat(3,minmax(0,1fr));gap:16px 10px}.tab-thumbnail{min-height:103px;font-size:11px;border-radius:16px}.auth-card{max-width:360px;padding:26px}.auth-gate{padding:23px}.auth-kicker{right:24px;top:33px}}
@media(prefers-reduced-motion:reduce){.tab-thumbnail,.tab-thumbnail .clabs-icon,#nav button,.auth-login-form .btn{transition:none!important}.tab-thumbnail:hover,.tab-thumbnail:hover .clabs-icon{transform:none}}
@media print{body>aside{display:none!important}main{margin:0!important}}
`;
document.head.append(clabsPolishStyle);
const polishedCard=document.querySelector('.auth-card');
polishedCard.insertAdjacentHTML('afterbegin','<span class="auth-kicker">STAFF PORTAL</span>');
polishedCard.insertAdjacentHTML('beforeend','<p class="auth-footnote"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> Your laboratory. One connected workspace.</p>');
document.getElementById('authMessage').setAttribute('role','status');
const clabsPassword=document.getElementById('loginPassword');
const passwordWrap=document.createElement('div');passwordWrap.className='auth-password-wrap';clabsPassword.before(passwordWrap);passwordWrap.append(clabsPassword);
const revealPassword=document.createElement('button');revealPassword.type='button';revealPassword.className='auth-password-toggle';revealPassword.textContent='Show';revealPassword.setAttribute('aria-label','Show password');revealPassword.setAttribute('aria-controls','loginPassword');revealPassword.setAttribute('aria-pressed','false');
revealPassword.onclick=()=>{const reveal=clabsPassword.type==='password';clabsPassword.type=reveal?'text':'password';revealPassword.textContent=reveal?'Hide':'Show';revealPassword.setAttribute('aria-label',reveal?'Hide password':'Show password');revealPassword.setAttribute('aria-pressed',String(reveal));};passwordWrap.append(revealPassword);
const polishedLoginScreen=loginScreen;loginScreen=function(...args){clabsPassword.type='password';revealPassword.textContent='Show';revealPassword.setAttribute('aria-label','Show password');revealPassword.setAttribute('aria-pressed','false');return polishedLoginScreen(...args)};
const polishedGroupedNav=groupedNav;groupedNav=function(){polishedGroupedNav();document.querySelectorAll('#nav button').forEach(button=>{button.title=button.dataset.page;button.setAttribute('aria-label',button.dataset.page);if(button.dataset.page==='Electrocardiogram')button.querySelector('span').textContent='ECG';if(button.dataset.page==='Stock Records')button.querySelector('span').textContent='Stock';});};
