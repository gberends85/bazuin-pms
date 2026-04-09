'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@autostallingdebazuin.nl');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { accessToken } = await api.auth.login(email, password);
      setToken(accessToken);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Inloggen mislukt');
    } finally { setLoading(false); }
  }

  return (
    <div style={{minHeight:'100vh',background:'#0a2240',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'white',borderRadius:14,padding:40,width:380,boxShadow:'0 16px 64px rgba(0,0,0,0.3)'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{width:52,height:52,background:'#e8a020',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:20,color:'#0a2240',margin:'0 auto 14px'}}>AB</div>
          <h1 style={{margin:'0 0 4px',fontSize:20,fontWeight:800,color:'#0a2240'}}>Autostalling De Bazuin</h1>
          <p style={{margin:0,color:'#7090b0',fontSize:13}}>Beheerportaal — Harlingen</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{marginBottom:14}}>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:'#7090b0',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>E-mailadres</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
              style={{width:'100%',padding:'10px 12px',border:'0.5px solid rgba(10,34,64,0.2)',borderRadius:8,fontSize:14,outline:'none',color:'#0a2240'}} />
          </div>
          <div style={{marginBottom:20}}>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:'#7090b0',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Wachtwoord</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoFocus
              style={{width:'100%',padding:'10px 12px',border:'0.5px solid rgba(10,34,64,0.2)',borderRadius:8,fontSize:14,outline:'none',color:'#0a2240'}} />
          </div>
          {error && <div style={{background:'#fdeaea',color:'#8a2020',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:14,fontWeight:500}}>{error}</div>}
          <button type="submit" disabled={loading} className="btn btn-navy" style={{width:'100%',justifyContent:'center',padding:'12px',fontSize:14}}>
            {loading ? 'Inloggen...' : 'Inloggen →'}
          </button>
        </form>
      </div>
    </div>
  );
}
