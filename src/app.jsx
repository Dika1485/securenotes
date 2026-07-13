import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';

// ─── SUPABASE ──────────────────────────────────────────────────
let _sb = null;
function getSupabase() {
  if (_sb) return _sb;
  const url = localStorage.getItem('sn_url');
  const key = localStorage.getItem('sn_key');
  if (url && key) _sb = createClient(url, key);
  return _sb;
}

// ─── CRYPTO ────────────────────────────────────────────────────
const ENC = new TextEncoder(), DEC = new TextDecoder();
async function deriveKey(pass, salt) {
  const m = await crypto.subtle.importKey('raw', ENC.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:310000, hash:'SHA-256' }, m, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
async function encryptText(plain, pass) {
  const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(pass,salt), ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,ENC.encode(plain));
  const out=new Uint8Array(28+ct.byteLength); out.set(salt,0); out.set(iv,16); out.set(new Uint8Array(ct),28);
  return btoa(String.fromCharCode(...out));
}
async function decryptText(b64, pass) {
  const buf=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const key=await deriveKey(pass,buf.slice(0,16));
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(16,28)},key,buf.slice(28));
  return DEC.decode(pt);
}

// ─── SIGNED URL CACHE ──────────────────────────────────────────
const urlCache = {};
async function getSignedUrl(path) {
  if (urlCache[path] && urlCache[path].exp > Date.now()) return urlCache[path].url;
  const sb = getSupabase();
  const { data, error } = await sb.storage.from('note-attachments').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  urlCache[path] = { url: data.signedUrl, exp: Date.now() + 3500000 };
  return data.signedUrl;
}

// ─── CATEGORIES ────────────────────────────────────────────────
const CATS = [
  { id:'note',     label:'Note',        icon:'📝', color:'#5b8dee' },
  { id:'password', label:'Password',    icon:'🔑', color:'#f5a623' },
  { id:'seed',     label:'Seed Phrase', icon:'🌱', color:'#9b6dff' },
  { id:'finance',  label:'Finance',     icon:'💳', color:'#4ecb8d' },
  { id:'private',  label:'Private',     icon:'🔒', color:'#e05260' },
  { id:'other',    label:'Other',       icon:'📎', color:'#8891a8' },
];
const getCat = id => CATS.find(c=>c.id===id)||CATS[0];

const SQL = `-- Run in Supabase SQL Editor

create table if not exists notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  title        text not null default 'Untitled',
  body         text,
  category     text default 'note',
  is_encrypted boolean default false,
  attachments  jsonb default '[]',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table notes enable row level security;
create policy "own notes" on notes for all
  using (auth.uid()=user_id) with check (auth.uid()=user_id);

insert into storage.buckets (id, name, public)
  values ('note-attachments','note-attachments',false)
  on conflict do nothing;
create policy "own files" on storage.objects for all
  using  (auth.uid()::text=(storage.foldername(name))[1])
  with check (auth.uid()::text=(storage.foldername(name))[1]);`;

// ─── TOAST ─────────────────────────────────────────────────────
let _toast = null;
const toast = (msg, type='info') => _toast?.({msg,type,id:Date.now()});
function Toast() {
  const [t,set] = useState(null);
  _toast = set;
  useEffect(()=>{ if(t){const id=setTimeout(()=>set(null),3200);return()=>clearTimeout(id);} },[t]);
  if (!t) return null;
  const colors = {info:'#5b8dee',success:'#4ecb8d',error:'#e05260',warn:'#f5a623'};
  return (
    <div style={{position:'fixed',bottom:24,right:24,zIndex:9999,background:'#1e2235',
      border:`1px solid ${colors[t.type]}`,borderRadius:12,padding:'12px 18px',
      fontSize:14,color:'#e8eaf0',boxShadow:'0 12px 40px rgba(0,0,0,.6)',
      display:'flex',alignItems:'center',gap:10,maxWidth:320,
      animation:'slideUp .2s ease'}}>
      <span style={{color:colors[t.type],fontSize:16}}>
        {t.type==='success'?'✓':t.type==='error'?'✕':t.type==='warn'?'⚠':'ℹ'}
      </span>
      {t.msg}
    </div>
  );
}

// ─── ICONS ─────────────────────────────────────────────────────
const Ic = ({n,s=16,style:st}) => {
  const p={stroke:'currentColor',fill:'none',strokeWidth:2,width:s,height:s,viewBox:'0 0 24 24',style:{display:'block',...st}};
  const M={
    plus:   <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    search: <svg {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    trash:  <svg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6m4 0V4h6v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
    save:   <svg {...p}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
    eye:    <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    eyeoff: <svg {...p}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
    copy:   <svg {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
    lock:   <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
    unlock: <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>,
    menu:   <svg {...p}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
    logout: <svg {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    check:  <svg {...p} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    shield: <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    file:   <svg {...p}><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
    attach: <svg {...p}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>,
    image:  <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
    close:  <svg {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    x:      <svg {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    download:<svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    arrow:  <svg {...p}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  };
  return M[n]||null;
};

// ─── ATTACHMENT VIEWER ─────────────────────────────────────────
function AttachmentItem({ att, onRemove }) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const isImg = att.type?.startsWith('image/');

  useEffect(() => {
    getSignedUrl(att.path).then(u => { setUrl(u); setLoading(false); });
  }, [att.path]);

  if (isImg) {
    return (
      <div style={{position:'relative',borderRadius:10,overflow:'hidden',
        border:'1px solid rgba(255,255,255,.08)',background:'#1a1d2e',aspectRatio:'1',
        display:'flex',alignItems:'center',justifyContent:'center'}}>
        {loading ? (
          <div style={{fontSize:24,opacity:.3}}>🖼</div>
        ) : url ? (
          <img src={url} alt={att.name}
            style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}
            onError={e=>{ e.target.style.display='none'; }}/>
        ) : (
          <div style={{fontSize:24,opacity:.3}}>⚠️</div>
        )}
        {onRemove && (
          <button onClick={onRemove} style={{
            position:'absolute',top:6,right:6,width:24,height:24,borderRadius:'50%',
            background:'rgba(0,0,0,.75)',border:'none',color:'#fff',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,
            backdropFilter:'blur(4px)'}}>✕</button>
        )}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" download={att.name}
            style={{position:'absolute',bottom:6,right:6,width:24,height:24,borderRadius:'50%',
              background:'rgba(0,0,0,.75)',border:'none',color:'#fff',cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center',
              backdropFilter:'blur(4px)',textDecoration:'none'}}>
            <Ic n="download" s={13}/>
          </a>
        )}
      </div>
    );
  }

  return (
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
      borderRadius:10,border:'1px solid rgba(255,255,255,.08)',background:'#1a1d2e',marginBottom:6}}>
      <div style={{width:36,height:36,borderRadius:8,background:'rgba(91,141,238,.15)',
        display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <Ic n="file" s={18} style={{color:'#5b8dee'}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:500,color:'#e8eaf0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name}</div>
        <div style={{fontSize:11,color:'#8891a8',marginTop:2}}>{(att.size/1024).toFixed(1)} KB</div>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" download={att.name}
          style={{padding:'6px 12px',borderRadius:7,border:'1px solid rgba(91,141,238,.3)',
            background:'rgba(91,141,238,.1)',color:'#5b8dee',textDecoration:'none',fontSize:12,flexShrink:0}}>
          Download
        </a>
      )}
      {onRemove && (
        <button onClick={onRemove} style={{background:'none',border:'none',color:'#8891a8',cursor:'pointer',padding:4,flexShrink:0}}>
          <Ic n="x" s={15}/>
        </button>
      )}
    </div>
  );
}

// ─── MODAL ─────────────────────────────────────────────────────
function Modal({ title, sub, children, onClose, maxW=460 }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',
      alignItems:'center',justifyContent:'center',zIndex:200,padding:16,backdropFilter:'blur(6px)'}}
      onClick={onClose}>
      <div style={{background:'#161929',border:'1px solid rgba(255,255,255,.1)',borderRadius:18,
        padding:28,width:'100%',maxWidth:maxW,boxShadow:'0 24px 64px rgba(0,0,0,.6)'}}
        onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:17,fontWeight:700,color:'#e8eaf0',marginBottom:sub?6:18}}>{title}</div>
        {sub && <div style={{fontSize:13,color:'#8891a8',marginBottom:18,lineHeight:1.5}}>{sub}</div>}
        {children}
      </div>
    </div>
  );
}

// ─── ENCRYPT MODAL ─────────────────────────────────────────────
function EncryptModal({note,onClose,onSave}) {
  const [p1,setP1]=useState(''), [p2,setP2]=useState(''), [show,setShow]=useState(false), [busy,setBusy]=useState(false);
  async function go() {
    if(p1.length<4) return toast('Passphrase must be at least 4 characters','warn');
    if(p1!==p2) return toast('Passphrases do not match','error');
    setBusy(true);
    try { const enc=await encryptText(note.body||'',p1); await onSave({...note,body:enc,is_encrypted:true}); toast('Note encrypted','success'); onClose(); }
    catch { toast('Encryption failed','error'); }
    setBusy(false);
  }
  return (
    <Modal title="🔒 Encrypt Note" sub="Set a passphrase to lock this note. You'll need it every time you open it." onClose={onClose}>
      <div style={S.alertWarn}>⚠️ Forgotten passphrase = permanently unrecoverable content.</div>
      <label style={S.label}>Passphrase</label>
      <div style={{position:'relative',marginBottom:12}}>
        <input style={{...S.input,paddingRight:44}} type={show?'text':'password'} placeholder="Min 4 characters" value={p1} onChange={e=>setP1(e.target.value)}/>
        <button style={S.eyeBtn} onClick={()=>setShow(!show)}><Ic n={show?'eyeoff':'eye'} s={16}/></button>
      </div>
      <label style={S.label}>Confirm Passphrase</label>
      <input style={{...S.input,marginBottom:20}} type={show?'text':'password'} placeholder="Re-enter passphrase" value={p2} onChange={e=>setP2(e.target.value)}/>
      <div style={{display:'flex',gap:8}}>
        <button style={{...S.btnGhost,flex:1}} onClick={onClose}>Cancel</button>
        <button style={{...S.btnPrimary,flex:1}} onClick={go} disabled={busy}>{busy?'Encrypting…':'Encrypt'}</button>
      </div>
    </Modal>
  );
}

// ─── DECRYPT MODAL ─────────────────────────────────────────────
function DecryptModal({note,onClose,onDecrypted}) {
  const [pass,setPass]=useState(''), [show,setShow]=useState(false), [busy,setBusy]=useState(false);
  async function go() {
    setBusy(true);
    try { onDecrypted(await decryptText(note.body,pass)); onClose(); }
    catch { toast('Wrong passphrase','error'); }
    setBusy(false);
  }
  return (
    <Modal title="🔓 Unlock Note" sub="Enter your passphrase to view the encrypted content." onClose={onClose}>
      <label style={S.label}>Passphrase</label>
      <div style={{position:'relative',marginBottom:20}}>
        <input style={{...S.input,paddingRight:44}} type={show?'text':'password'} placeholder="Enter passphrase"
          value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go()}/>
        <button style={S.eyeBtn} onClick={()=>setShow(!show)}><Ic n={show?'eyeoff':'eye'} s={16}/></button>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button style={{...S.btnGhost,flex:1}} onClick={onClose}>Cancel</button>
        <button style={{...S.btnPrimary,flex:1}} onClick={go} disabled={busy}>{busy?'Decrypting…':'Unlock'}</button>
      </div>
    </Modal>
  );
}

// ─── DELETE MODAL ──────────────────────────────────────────────
function DeleteModal({onClose,onConfirm}) {
  return (
    <Modal title="Delete Note?" sub="This cannot be undone. The note and all its attachments will be permanently removed." onClose={onClose} maxW={380}>
      <div style={{display:'flex',gap:8}}>
        <button style={{...S.btnGhost,flex:1}} onClick={onClose}>Cancel</button>
        <button style={{...S.btnDanger,flex:1}} onClick={onConfirm}>Delete</button>
      </div>
    </Modal>
  );
}

// ─── SETUP PAGE ────────────────────────────────────────────────
function SetupPage({onDone}) {
  const [step,setStep]=useState(0), [url,setUrl]=useState(''), [key,setKey]=useState('');
  const [busy,setBusy]=useState(false), [showKey,setShowKey]=useState(false);

  async function connect() {
    if(!url||!key) return toast('Fill in both fields','warn');
    setBusy(true);
    try {
      const sb=createClient(url.trim(),key.trim());
      await sb.auth.getSession();
      localStorage.setItem('sn_url',url.trim()); localStorage.setItem('sn_key',key.trim());
      _sb=sb; setStep(2);
    } catch(e) { toast('Connection failed: '+e.message,'error'); }
    setBusy(false);
  }

  return (
    <div style={{minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',
      padding:20,background:'linear-gradient(135deg,#0d0f18 0%,#131627 100%)'}}>
      <div style={{width:'100%',maxWidth:420,background:'rgba(22,25,41,.9)',
        border:'1px solid rgba(255,255,255,.08)',borderRadius:20,padding:'36px 32px',
        backdropFilter:'blur(20px)',boxShadow:'0 32px 80px rgba(0,0,0,.5)'}}>
        <div style={{display:'flex',gap:5,marginBottom:28}}>
          {[0,1,2].map(i=><div key={i} style={{flex:1,height:3,borderRadius:2,
            background:i<=step?'linear-gradient(90deg,#5b8dee,#9b6dff)':'rgba(255,255,255,.1)',transition:'background .4s'}}/>)}
        </div>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:48,marginBottom:12}}>🔐</div>
          <div style={{fontSize:22,fontWeight:700,color:'#e8eaf0'}}>SecureNotes</div>
          <div style={{fontSize:14,color:'#8891a8',marginTop:6}}>
            {step===0?'Your encrypted private vault':step===1?'Connect to Supabase':'Run the setup SQL'}
          </div>
        </div>

        {step===0 && <>
          <div style={{...S.alertInfo,marginBottom:20}}>
            <Ic n="shield" s={16}/>&nbsp; Notes are <strong>AES-256 encrypted</strong> before leaving your browser.
          </div>
          <ol style={{fontSize:13,color:'#8891a8',lineHeight:2.4,paddingLeft:18,marginBottom:24}}>
            <li>Go to <strong style={{color:'#5b8dee'}}>supabase.com</strong> → create free account</li>
            <li>Create a new project (any name)</li>
            <li>Settings → API → copy <strong style={{color:'#e8eaf0'}}>Project URL</strong> & <strong style={{color:'#e8eaf0'}}>anon key</strong></li>
          </ol>
          <button style={{...S.btnPrimary,width:'100%'}} onClick={()=>setStep(1)}>I have my keys →</button>
        </>}

        {step===1 && <>
          <label style={S.label}>Supabase Project URL</label>
          <input style={{...S.input,marginBottom:14}} placeholder="https://xxxx.supabase.co" value={url} onChange={e=>setUrl(e.target.value)}/>
          <label style={S.label}>Supabase Anon Key</label>
          <div style={{position:'relative',marginBottom:22}}>
            <input style={{...S.input,fontFamily:'monospace',fontSize:12,paddingRight:44}}
              type={showKey?'text':'password'} placeholder="eyJhbGci..." value={key} onChange={e=>setKey(e.target.value)}/>
            <button style={S.eyeBtn} onClick={()=>setShowKey(!showKey)}><Ic n={showKey?'eyeoff':'eye'} s={16}/></button>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button style={{...S.btnGhost}} onClick={()=>setStep(0)}>← Back</button>
            <button style={{...S.btnPrimary,flex:1}} onClick={connect} disabled={busy}>{busy?'Testing…':'Connect →'}</button>
          </div>
        </>}

        {step===2 && <>
          <div style={{fontSize:13,color:'#8891a8',marginBottom:12,lineHeight:1.6}}>
            Run this SQL in your <strong style={{color:'#e8eaf0'}}>Supabase SQL Editor</strong>:
          </div>
          <pre style={{background:'#0d0f18',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,
            padding:14,fontSize:11,fontFamily:'monospace',overflowX:'auto',
            color:'#c9d1d9',marginBottom:20,whiteSpace:'pre-wrap',lineHeight:1.7,maxHeight:260,overflowY:'auto'}}>{SQL}</pre>
          <button style={{...S.btnPrimary,width:'100%'}} onClick={onDone}>✓ Done — Open App</button>
        </>}
      </div>
      <Toast/>
    </div>
  );
}

// ─── AUTH PAGE ─────────────────────────────────────────────────
function AuthPage({onAuth}) {
  const [mode,setMode]=useState('login'), [email,setEmail]=useState(''), [pass,setPass]=useState('');
  const [show,setShow]=useState(false), [busy,setBusy]=useState(false), [msg,setMsg]=useState(null);

  async function submit() {
    setMsg(null); setBusy(true);
    const sb=getSupabase();
    try {
      if(mode==='login') { const{data,error}=await sb.auth.signInWithPassword({email,password:pass}); if(error)throw error; onAuth(data.user); }
      else if(mode==='signup') { const{error}=await sb.auth.signUp({email,password:pass}); if(error)throw error; setMsg({ok:true,text:'Check your email to confirm, then sign in.'}); setMode('login'); }
      else { const{error}=await sb.auth.resetPasswordForEmail(email); if(error)throw error; setMsg({ok:true,text:'Reset link sent!'}); }
    } catch(e) { setMsg({ok:false,text:e.message}); }
    setBusy(false);
  }

  return (
    <div style={{minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',
      padding:20,background:'linear-gradient(135deg,#0d0f18 0%,#131627 100%)'}}>
      <div style={{width:'100%',maxWidth:400,background:'rgba(22,25,41,.9)',
        border:'1px solid rgba(255,255,255,.08)',borderRadius:20,padding:'36px 32px',
        backdropFilter:'blur(20px)',boxShadow:'0 32px 80px rgba(0,0,0,.5)'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:48,marginBottom:12}}>🔐</div>
          <div style={{fontSize:22,fontWeight:700,color:'#e8eaf0'}}>SecureNotes</div>
          <div style={{fontSize:14,color:'#8891a8',marginTop:4}}>Your encrypted personal vault</div>
        </div>

        {msg && <div style={msg.ok?S.alertSuccess:S.alertError}>{msg.text}</div>}

        {mode!=='forgot' && <>
          <label style={S.label}>Email</label>
          <input style={{...S.input,marginBottom:14}} type="email" placeholder="you@example.com"
            value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/>
          <label style={S.label}>Password</label>
          <div style={{position:'relative',marginBottom:22}}>
            <input style={{...S.input,paddingRight:44}} type={show?'text':'password'}
              placeholder={mode==='signup'?'Min 6 characters':'Your password'}
              value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/>
            <button style={S.eyeBtn} onClick={()=>setShow(!show)}><Ic n={show?'eyeoff':'eye'} s={16}/></button>
          </div>
        </>}
        {mode==='forgot' && <>
          <label style={S.label}>Email</label>
          <input style={{...S.input,marginBottom:22}} type="email" placeholder="you@example.com"
            value={email} onChange={e=>setEmail(e.target.value)}/>
        </>}

        <button style={{...S.btnPrimary,width:'100%',marginBottom:16}} onClick={submit} disabled={busy}>
          {busy?'Please wait…':mode==='login'?'Sign In':mode==='signup'?'Create Account':'Send Reset Link'}
        </button>
        <div style={{textAlign:'center',fontSize:13,color:'#8891a8'}}>
          {mode==='login'&&<><button style={S.link} onClick={()=>setMode('forgot')}>Forgot password?</button>{' · '}<button style={S.link} onClick={()=>setMode('signup')}>Create account</button></>}
          {mode==='signup'&&<>Have an account? <button style={S.link} onClick={()=>setMode('login')}>Sign in</button></>}
          {mode==='forgot'&&<button style={S.link} onClick={()=>setMode('login')}>← Back</button>}
        </div>
      </div>
      <Toast/>
    </div>
  );
}

// ─── NOTE EDITOR ───────────────────────────────────────────────
function NoteEditor({note,user,onSave,onDelete,onBack}) {
  const [title,setTitle]=useState(note.title||'');
  const [body,setBody]=useState(note.body||'');
  const [cat,setCat]=useState(note.category||'note');
  const [saving,setSaving]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [decBody,setDec]=useState(null);
  const [mono,setMono]=useState(['password','seed'].includes(note.category));
  const [copied,setCopied]=useState(false);
  const [atts,setAtts]=useState(note.attachments||[]);
  const [showEnc,setEnc]=useState(false);
  const [showDec,setSDec]=useState(false);
  const [showDel,setSDel]=useState(false);
  const [uploading,setUploading]=useState(false);
  const fileRef=useRef();

  useEffect(()=>{
    setTitle(note.title||''); setBody(note.body||''); setCat(note.category||'note');
    setAtts(note.attachments||[]); setDec(null); setDirty(false);
    setMono(['password','seed'].includes(note.category));
  },[note.id]);
  useEffect(()=>setMono(['password','seed'].includes(cat)),[cat]);

  const mark=()=>setDirty(true);

  async function save(override) {
    setSaving(true);
    await onSave(override||{...note,title:title||'Untitled',body,category:cat,attachments:atts});
    setDirty(false); setSaving(false);
  }

  async function copyContent() {
    await navigator.clipboard.writeText(note.is_encrypted?(decBody||''):body);
    setCopied(true); setTimeout(()=>setCopied(false),1500); toast('Copied!','success');
  }

  async function uploadFiles(e) {
    const files=Array.from(e.target.files); if(!files.length) return;
    setUploading(true);
    const sb=getSupabase();
    const newAtts=[...atts];
    for(const file of files) {
      const path=`${user.id}/${Date.now()}-${file.name}`;
      const{error}=await sb.storage.from('note-attachments').upload(path,file);
      if(error){toast('Upload failed: '+error.message,'error');continue;}
      newAtts.push({name:file.name,path,type:file.type,size:file.size});
      toast('Uploaded: '+file.name,'success');
    }
    setAtts(newAtts); mark(); setUploading(false);
    e.target.value='';
  }

  async function removeAtt(idx) {
    const sb=getSupabase();
    await sb.storage.from('note-attachments').remove([atts[idx].path]);
    setAtts(a=>a.filter((_,i)=>i!==idx)); mark();
    toast('Attachment removed','info');
  }

  const cat_=getCat(cat);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Topbar */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 16px',
        borderBottom:'1px solid rgba(255,255,255,.06)',background:'rgba(15,17,28,.8)',
        backdropFilter:'blur(10px)',flexShrink:0,flexWrap:'wrap'}}>
        <button style={{...S.iconBtn,display:'flex'}} onClick={onBack} title="Back">
          <Ic n="arrow" s={18}/>
        </button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:'#e8eaf0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {cat_.icon} {title||'Untitled'}
          </div>
          {dirty&&<div style={{fontSize:11,color:'#f5a623'}}>● Unsaved changes</div>}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
          {note.is_encrypted&&<span style={{fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:6,
            background:'rgba(155,109,255,.15)',color:'#9b6dff',border:'1px solid rgba(155,109,255,.2)'}}>🔒 ENC</span>}
          {note.is_encrypted&&!decBody&&<button style={S.btnGhostSm} onClick={()=>setSDec(true)}>Unlock</button>}
          {!note.is_encrypted&&<button style={S.btnGhostSm} onClick={()=>setEnc(true)}>Encrypt</button>}
          <button style={S.btnGhostSm} onClick={copyContent}>{copied?'✓ Copied':'⎘ Copy'}</button>
          <button style={{...S.btnPrimary,padding:'7px 14px',fontSize:13,width:'auto'}}
            onClick={()=>save()} disabled={saving||!dirty}>
            {saving?'Saving…':'Save'}
          </button>
          <button style={{...S.iconBtn,color:'#e05260',border:'1px solid rgba(224,82,96,.25)'}} onClick={()=>setSDel(true)}>
            <Ic n="trash" s={15}/>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{flex:1,overflowY:'auto',padding:'20px clamp(16px,4vw,32px)'}}>
        {/* Category chips */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
          {CATS.map(c=>(
            <button key={c.id} onClick={()=>{setCat(c.id);mark();}}
              style={{...S.chip,...(cat===c.id?{background:c.color+'22',borderColor:c.color+'55',color:c.color}:{})}}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        {/* Title */}
        <input value={title} onChange={e=>{setTitle(e.target.value);mark();}}
          placeholder="Note title…"
          style={{width:'100%',background:'transparent',border:'none',outline:'none',
            fontSize:'clamp(18px,4vw,24px)',fontWeight:700,color:'#e8eaf0',
            fontFamily:'inherit',marginBottom:12,boxSizing:'border-box'}}/>

        <div style={{height:1,background:'rgba(255,255,255,.07)',marginBottom:16}}/>

        {/* Body */}
        {note.is_encrypted&&decBody===null ? (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,
            padding:'48px 20px',textAlign:'center'}}>
            <div style={{fontSize:56,opacity:.3}}>🔒</div>
            <div style={{fontWeight:700,fontSize:17,color:'#e8eaf0'}}>This note is encrypted</div>
            <div style={{fontSize:14,color:'#8891a8'}}>Enter your passphrase to view the content</div>
            <button style={{...S.btnPrimary,width:'auto',padding:'10px 24px'}} onClick={()=>setSDec(true)}>
              🔓 Unlock & View
            </button>
          </div>
        ) : (
          <textarea value={note.is_encrypted?(decBody||''):body}
            onChange={e=>{ const v=e.target.value; note.is_encrypted?setDec(v):(setBody(v),mark()); }}
            placeholder={cat==='password'?'username: …\npassword: …\nurl: …':cat==='seed'?'word1 word2 … word24':'Start writing…'}
            style={{width:'100%',minHeight:'clamp(200px,40vh,400px)',background:'transparent',
              border:'none',outline:'none',resize:'none',color:'#d4d8f0',lineHeight:1.85,
              fontFamily:mono?'"JetBrains Mono",Consolas,monospace':'inherit',
              fontSize:mono?13:15,boxSizing:'border-box'}}/>
        )}

        {/* Mono toggle */}
        <div style={{display:'flex',gap:8,alignItems:'center',marginTop:12,paddingTop:12,
          borderTop:'1px solid rgba(255,255,255,.05)'}}>
          <button onClick={()=>setMono(!mono)}
            style={{...S.chip,...(mono?{background:'rgba(91,141,238,.15)',borderColor:'rgba(91,141,238,.4)',color:'#5b8dee'}:{})}}>
            ⌨ Mono
          </button>
          <span style={{fontSize:12,color:'#4a5270'}}>
            {cat==='seed'&&'Recommended for seed phrases'}
            {cat==='password'&&'Recommended for passwords'}
          </span>
        </div>

        {/* Attachments */}
        <div style={{marginTop:24}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
            <span style={{fontSize:13,fontWeight:600,color:'#8891a8'}}>Attachments {atts.length>0&&`(${atts.length})`}</span>
            <button style={{...S.btnGhostSm,position:'relative'}} onClick={()=>fileRef.current.click()} disabled={uploading}>
              <Ic n="attach" s={13}/> {uploading?'Uploading…':'Add file'}
            </button>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
              style={{display:'none'}} onChange={uploadFiles}/>
          </div>

          {/* Image grid */}
          {atts.filter(a=>a.type?.startsWith('image/')).length>0&&(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(clamp(80px,20vw,120px),1fr))',gap:8,marginBottom:12}}>
              {atts.filter(a=>a.type?.startsWith('image/')).map((a,i)=>(
                <AttachmentItem key={a.path} att={a} onRemove={()=>removeAtt(atts.indexOf(a))}/>
              ))}
            </div>
          )}

          {/* Non-image files */}
          {atts.filter(a=>!a.type?.startsWith('image/')).map((a,i)=>(
            <AttachmentItem key={a.path} att={a} onRemove={()=>removeAtt(atts.indexOf(a))}/>
          ))}

          {atts.length===0&&(
            <div style={{padding:'20px',textAlign:'center',border:'2px dashed rgba(255,255,255,.07)',
              borderRadius:12,color:'#4a5270',fontSize:13}}>
              No attachments yet — click "Add file" to upload images or documents
            </div>
          )}
        </div>
      </div>

      {showEnc&&<EncryptModal note={{...note,body}} onClose={()=>setEnc(false)} onSave={n=>{save(n);setEnc(false);}}/>}
      {showDec&&<DecryptModal note={note} onClose={()=>setSDec(false)} onDecrypted={setDec}/>}
      {showDel&&<DeleteModal onClose={()=>setSDel(false)} onConfirm={()=>{setSDel(false);onDelete(note.id);}}/>}
    </div>
  );
}

// ─── SIDEBAR ───────────────────────────────────────────────────
function Sidebar({notes,active,user,search,setSearch,fCat,setFCat,onSelect,onNew,onLogout}) {
  function fmtDate(d) {
    if(!d) return '';
    const dt=new Date(d),diff=Date.now()-dt;
    if(diff<86400000) return dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    if(diff<604800000) return dt.toLocaleDateString([],{weekday:'short'});
    return dt.toLocaleDateString([],{month:'short',day:'numeric'});
  }
  const filtered=notes.filter(n=>{
    const q=search.toLowerCase();
    return(!q||n.title?.toLowerCase().includes(q)||(!n.is_encrypted&&n.body?.toLowerCase().includes(q)))
      &&(fCat==='all'||n.category===fCat);
  });

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'18px 14px 12px',borderBottom:'1px solid rgba(255,255,255,.06)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <div style={{width:34,height:34,borderRadius:9,
            background:'linear-gradient(135deg,#5b8dee,#9b6dff)',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>🔐</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:'#e8eaf0',lineHeight:1.2}}>SecureNotes</div>
            <div style={{fontSize:10,color:'#4a5270',textTransform:'uppercase',letterSpacing:.6}}>Private Vault</div>
          </div>
          <button style={{...S.iconBtn,marginLeft:'auto',background:'rgba(91,141,238,.15)',
            borderColor:'rgba(91,141,238,.3)',color:'#5b8dee'}} onClick={onNew} title="New note">
            <Ic n="plus" s={16}/>
          </button>
        </div>

        {/* Search */}
        <div style={{position:'relative',marginBottom:10}}>
          <div style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#4a5270',pointerEvents:'none'}}>
            <Ic n="search" s={14}/>
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search notes…"
            style={{...S.input,paddingLeft:34,fontSize:13,height:36}}/>
        </div>

        {/* Category filter */}
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          <button onClick={()=>setFCat('all')}
            style={{...S.chip,fontSize:11,...(fCat==='all'?{background:'rgba(91,141,238,.15)',borderColor:'rgba(91,141,238,.4)',color:'#5b8dee'}:{})}}>
            All
          </button>
          {CATS.map(c=>(
            <button key={c.id} onClick={()=>setFCat(c.id)} title={c.label}
              style={{...S.chip,padding:'3px 8px',fontSize:13,...(fCat===c.id?{background:c.color+'22',borderColor:c.color+'44',color:c.color}:{})}}>
              {c.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Note list */}
      <div style={{flex:1,overflowY:'auto',padding:'6px 8px'}}>
        <div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:.8,
          color:'#4a5270',padding:'6px 6px 4px'}}>{filtered.length} note{filtered.length!==1?'s':''}</div>

        {filtered.length===0&&(
          <div style={{padding:'28px 12px',textAlign:'center',color:'#4a5270',fontSize:13}}>
            {search?'No matching notes':'No notes yet.\nCreate your first note!'}
          </div>
        )}

        {filtered.map(n=>{
          const c=getCat(n.category);
          const isActive=active?.id===n.id;
          return (
            <div key={n.id} onClick={()=>onSelect(n)}
              style={{padding:'10px 10px',borderRadius:10,cursor:'pointer',marginBottom:2,
                background:isActive?'rgba(91,141,238,.12)':'transparent',
                border:`1px solid ${isActive?'rgba(91,141,238,.3)':'transparent'}`,
                transition:'all .12s'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                <span style={{fontSize:14}}>{c.icon}</span>
                <span style={{fontSize:13,fontWeight:600,color:'#e8eaf0',flex:1,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n.title||'Untitled'}</span>
                {n.is_encrypted&&<span style={{fontSize:12,opacity:.6}}>🔒</span>}
                <span style={{fontSize:11,color:'#4a5270',flexShrink:0}}>{fmtDate(n.updated_at)}</span>
              </div>
              <div style={{fontSize:12,color:'#8891a8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {n.is_encrypted?'Encrypted content':(n.body?.slice(0,60)||'No content…')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{padding:'12px 14px',borderTop:'1px solid rgba(255,255,255,.06)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,borderRadius:'50%',
            background:'linear-gradient(135deg,#5b8dee,#9b6dff)',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:14,fontWeight:700,color:'#fff',flexShrink:0}}>
            {user.email?.[0].toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:500,color:'#e8eaf0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.email}</div>
            <div style={{fontSize:11,color:'#4a5270'}}>Signed in</div>
          </div>
          <button style={{...S.iconBtn}} onClick={onLogout} title="Sign out"><Ic n="logout" s={15}/></button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────
function App() {
  const [page,setPage]=useState(localStorage.getItem('sn_url')?'app':'setup');
  const [user,setUser]=useState(null);
  const [loading,setLoad]=useState(true);
  const [notes,setNotes]=useState([]);
  const [active,setActive]=useState(null);
  const [search,setSearch]=useState('');
  const [fCat,setFCat]=useState('all');
  const [mobView,setMobView]=useState('list'); // 'list' | 'editor'

  useEffect(()=>{
    if(page!=='app'){setLoad(false);return;}
    const sb=getSupabase();
    if(!sb){setPage('setup');setLoad(false);return;}
    sb.auth.getSession().then(({data:{session}})=>{
      setUser(session?.user||null); setLoad(false);
      if(session?.user) loadNotes(session.user.id);
    });
    const{data:{subscription}}=sb.auth.onAuthStateChange((_,session)=>{
      setUser(session?.user||null);
      if(session?.user) loadNotes(session.user.id);
      else{setNotes([]);setActive(null);}
    });
    return()=>subscription.unsubscribe();
  },[page]);

  async function loadNotes(uid) {
    const sb=getSupabase();
    const{data,error}=await sb.from('notes').select('*').eq('user_id',uid).order('updated_at',{ascending:false});
    if(error){toast('Failed to load notes','error');return;}
    setNotes(data||[]);
    if(data?.length) setActive(data[0]);
  }

  async function saveNote(note) {
    const sb=getSupabase();
    const isNew=!note.id||note.id==='new';
    const payload={title:note.title,body:note.body,category:note.category,
      is_encrypted:note.is_encrypted||false,attachments:note.attachments||[],
      updated_at:new Date().toISOString(),user_id:user.id};
    if(isNew){
      const{data,error}=await sb.from('notes').insert([payload]).select().single();
      if(error){toast('Save failed','error');return;}
      setNotes(n=>[data,...n]); setActive(data); toast('Note created','success');
    } else {
      const{data,error}=await sb.from('notes').update(payload).eq('id',note.id).select().single();
      if(error){toast('Save failed','error');return;}
      setNotes(n=>n.map(x=>x.id===data.id?data:x)); setActive(data); toast('Saved','success');
    }
  }

  async function deleteNote(id) {
    await getSupabase().from('notes').delete().eq('id',id);
    const rest=notes.filter(n=>n.id!==id);
    setNotes(rest); setActive(rest[0]||null); setMobView('list'); toast('Deleted','info');
  }

  function newNote() {
    setActive({id:'new',title:'',body:'',category:'note',is_encrypted:false,attachments:[]});
    setMobView('editor');
  }

  function selectNote(n) { setActive(n); setMobView('editor'); }

  if(page==='setup') return <SetupPage onDone={()=>{setPage('app');}}/>;
  if(loading) return (
    <div style={{height:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',
      flexDirection:'column',gap:14,background:'#0d0f18'}}>
      <div style={{width:36,height:36,border:'3px solid rgba(91,141,238,.2)',
        borderTopColor:'#5b8dee',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>
      <div style={{fontSize:14,color:'#8891a8'}}>Loading SecureNotes…</div>
    </div>
  );
  if(!user) return <AuthPage onAuth={u=>{setUser(u);loadNotes(u.id);}}/>;

  const isMobile = window.innerWidth < 768;

  const sidebarEl = (
    <div style={{width:isMobile?'100%':260,flexShrink:0,
      height:'100%',background:'#101322',borderRight:isMobile?'none':'1px solid rgba(255,255,255,.06)'}}>
      <Sidebar notes={notes} active={active} user={user}
        search={search} setSearch={setSearch}
        fCat={fCat} setFCat={setFCat}
        onSelect={selectNote} onNew={newNote}
        onLogout={()=>getSupabase().auth.signOut()}/>
    </div>
  );

  const editorEl = active ? (
    <div style={{flex:1,overflow:'hidden',background:'#0d0f18'}}>
      <NoteEditor note={active} user={user}
        onSave={saveNote} onDelete={deleteNote}
        onBack={()=>setMobView('list')}/>
    </div>
  ) : (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',
      justifyContent:'center',gap:14,color:'#8891a8',textAlign:'center',padding:40,
      background:'#0d0f18'}}>
      <div style={{fontSize:64,opacity:.2}}>📝</div>
      <div style={{fontWeight:700,fontSize:17,color:'#e8eaf0'}}>Select a note</div>
      <div style={{fontSize:14}}>Choose from the list or create a new one</div>
      <button style={{...S.btnPrimary,width:'auto',padding:'10px 24px'}} onClick={newNote}>
        <Ic n="plus" s={15}/>&nbsp; New Note
      </button>
    </div>
  );

  // Mobile: show either list or editor
  if (isMobile) {
    return (
      <div style={{height:'100dvh',background:'#0d0f18',overflow:'hidden'}}>
        {mobView==='list' ? sidebarEl : editorEl}
        <Toast/>
      </div>
    );
  }

  // Desktop: side-by-side
  return (
    <div style={{display:'flex',height:'100dvh',overflow:'hidden',background:'#0d0f18'}}>
      {sidebarEl}
      {editorEl}
      <Toast/>
    </div>
  );
}

// ─── STYLES ────────────────────────────────────────────────────
const S = {
  input:      { width:'100%',padding:'10px 14px',borderRadius:9,background:'rgba(255,255,255,.05)',
                border:'1px solid rgba(255,255,255,.08)',color:'#e8eaf0',
                fontFamily:'inherit',fontSize:14,outline:'none',boxSizing:'border-box',
                transition:'border-color .15s' },
  label:      { fontSize:13,fontWeight:500,color:'#8891a8',marginBottom:6,display:'block' },
  btnPrimary: { display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,
                padding:'10px 20px',borderRadius:9,border:'none',
                background:'linear-gradient(135deg,#5b8dee,#6b8ef5)',color:'#fff',
                fontSize:14,fontWeight:600,cursor:'pointer',width:'100%',
                boxShadow:'0 4px 14px rgba(91,141,238,.35)',transition:'opacity .15s' },
  btnGhost:   { display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,
                padding:'10px 18px',borderRadius:9,border:'1px solid rgba(255,255,255,.1)',
                background:'rgba(255,255,255,.04)',color:'#8891a8',fontSize:14,fontWeight:500,cursor:'pointer' },
  btnGhostSm: { display:'inline-flex',alignItems:'center',gap:5,padding:'5px 12px',
                borderRadius:7,border:'1px solid rgba(255,255,255,.1)',
                background:'rgba(255,255,255,.04)',color:'#8891a8',fontSize:13,cursor:'pointer' },
  btnDanger:  { display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,
                padding:'10px 18px',borderRadius:9,border:'none',
                background:'#e05260',color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer' },
  iconBtn:    { padding:7,borderRadius:8,background:'rgba(255,255,255,.04)',
                border:'1px solid rgba(255,255,255,.08)',color:'#8891a8',
                cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0 },
  chip:       { padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:500,cursor:'pointer',
                border:'1px solid rgba(255,255,255,.1)',color:'#8891a8',background:'transparent',
                transition:'all .12s' },
  link:       { background:'none',border:'none',color:'#5b8dee',cursor:'pointer',fontSize:13 },
  eyeBtn:     { position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',
                background:'none',border:'none',color:'#4a5270',cursor:'pointer',padding:0 },
  alertInfo:  { padding:'10px 14px',borderRadius:9,fontSize:13,marginBottom:14,lineHeight:1.5,
                background:'rgba(91,141,238,.1)',border:'1px solid rgba(91,141,238,.25)',color:'#5b8dee',display:'flex',alignItems:'center',gap:6 },
  alertWarn:  { padding:'10px 14px',borderRadius:9,fontSize:13,marginBottom:16,lineHeight:1.5,
                background:'rgba(245,166,35,.1)',border:'1px solid rgba(245,166,35,.25)',color:'#f5a623' },
  alertError: { padding:'10px 14px',borderRadius:9,fontSize:13,marginBottom:14,lineHeight:1.5,
                background:'rgba(224,82,96,.1)',border:'1px solid rgba(224,82,96,.25)',color:'#e05260' },
  alertSuccess:{ padding:'10px 14px',borderRadius:9,fontSize:13,marginBottom:14,lineHeight:1.5,
                background:'rgba(78,203,141,.1)',border:'1px solid rgba(78,203,141,.25)',color:'#4ecb8d' },
};

// ─── GLOBAL CSS ────────────────────────────────────────────────
const styleEl = document.createElement('style');
styleEl.textContent = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;overflow:hidden}
  body{background:#0d0f18;color:#e8eaf0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
  #root{height:100dvh}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  input:focus,textarea:focus{border-color:rgba(91,141,238,.5)!important;box-shadow:0 0 0 3px rgba(91,141,238,.1)}
  button:disabled{opacity:.45;cursor:not-allowed}
  textarea{line-height:1.75}
  img{max-width:100%}
  a{color:inherit}
`;
document.head.appendChild(styleEl);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
