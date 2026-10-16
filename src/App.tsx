import { useEffect, useState, type FormEvent } from "react";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { BookOpen, GraduationCap, LayoutDashboard, LogOut, Plus, Search, School, Users, Wallet, CalendarCheck, FileText, Menu, X } from "lucide-react";
import "./styles.css";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
type Student = { id:string; student_number:string; first_name:string; last_name:string; gender:string|null; class_id:string|null; status:string };
type ClassRow = { id:string; name:string; level:string; academic_year:string };
type SchoolRow = { id:string; name:string; academic_year:string };
type Page = "Accueil" | "Élèves" | "Classes" | "Présences" | "Notes" | "Scolarité";

export default function App() {
  const [user,setUser] = useState<User|null>(null);
  const [loading,setLoading] = useState(true);
  const [authMode,setAuthMode] = useState<"login"|"signup">("login");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [fullName,setFullName] = useState("");
  const [schoolName,setSchoolName] = useState("");
  const [school,setSchool] = useState<SchoolRow|null>(null);
  const [students,setStudents] = useState<Student[]>([]);
  const [classes,setClasses] = useState<ClassRow[]>([]);
  const [page,setPage] = useState<Page>("Accueil");
  const [search,setSearch] = useState("");
  const [showAdd,setShowAdd] = useState(false);
  const [studentForm,setStudentForm] = useState({first_name:"",last_name:"",student_number:"",gender:"",class_id:""});
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({data})=>{ setUser(data.session?.user ?? null); setLoading(false); });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user ?? null));
    return ()=>subscription.unsubscribe();
  }, []);

  useEffect(() => { if (user) void loadSchool(); else { setSchool(null); setStudents([]); setClasses([]); } }, [user]);

  async function loadSchool() {
    if (!supabase || !user) return;
    setError("");
    const {data:membership,error:membershipError}=await supabase.from("school_memberships").select("school_id, schools(id,name,academic_year)").eq("user_id",user.id).eq("active",true).limit(1).maybeSingle();
    if (membershipError) { setError("Impossible de charger l’école. Vérifie que le schéma SQL est installé dans Supabase."); return; }
    const schoolData = membership?.schools as unknown as SchoolRow|undefined;
    if (!membership || !schoolData) { setSchool(null); return; }
    setSchool(schoolData);
    const [{data:st,error:stError},{data:cl,error:clError}] = await Promise.all([
      supabase.from("students").select("id,student_number,first_name,last_name,gender,class_id,status").eq("school_id",schoolData.id).order("last_name"),
      supabase.from("classes").select("id,name,level,academic_year").eq("school_id",schoolData.id).order("level")
    ]);
    if (stError || clError) setError("Erreur de chargement. Vérifie les politiques de sécurité RLS.");
    setStudents((st ?? []) as Student[]); setClasses((cl ?? []) as ClassRow[]);
  }

  async function submitAuth(e:FormEvent) {
    e.preventDefault(); if(!supabase) return;
    setBusy(true); setError(""); setMessage("");
    const result = authMode==="signup"
      ? await supabase.auth.signUp({email,password,options:{data:{full_name:fullName}}})
      : await supabase.auth.signInWithPassword({email,password});
    if(result.error) setError(result.error.message);
    else if(authMode==="signup" && !result.data.session) setMessage("Compte créé. Vérifie ton e-mail si la confirmation est activée, puis connecte-toi.");
    else setMessage(authMode==="signup" ? "Compte créé. Tu peux maintenant créer ton établissement." : "Connexion réussie.");
    setBusy(false);
  }

  async function createSchool(e:FormEvent) {
    e.preventDefault(); if(!supabase) return;
    setBusy(true); setError("");
    const {error}=await supabase.rpc("create_school_for_current_user",{school_name:schoolName.trim()});
    if(error) setError(error.message);
    else { setMessage("Établissement créé."); await loadSchool(); }
    setBusy(false);
  }

  async function addStudent(e:FormEvent) {
    e.preventDefault(); if(!supabase || !school) return;
    setBusy(true); setError(""); setMessage("");
    const {error}=await supabase.from("students").insert({school_id:school.id,student_number:studentForm.student_number.trim(),first_name:studentForm.first_name.trim(),last_name:studentForm.last_name.trim(),gender:studentForm.gender||null,status:"active"});
    if(error) setError(error.message);
    else { setMessage("Élève inscrit."); setShowAdd(false); setStudentForm({first_name:"",last_name:"",student_number:"",gender:"",class_id:""}); await loadSchool(); }
    setBusy(false);
  }

  async function addClass(e:FormEvent) {
    e.preventDefault(); if(!supabase || !school) return;
    const form=e.currentTarget as HTMLFormElement;
    const data=new FormData(form);
    setBusy(true); setError(""); setMessage("");
    const {error}=await supabase.from("classes").insert({school_id:school.id,name:String(data.get("name")||"").trim(),level:String(data.get("level")||"CI"),academic_year:school.academic_year});
    if(error) setError(error.message); else {setMessage("Classe ajoutée.");form.reset();await loadSchool();}
    setBusy(false);
  }

  async function signOut() { if(supabase) await supabase.auth.signOut(); }
  const filtered=students.filter(s=>`${s.first_name} ${s.last_name} ${s.student_number}`.toLowerCase().includes(search.toLowerCase()));
  const nav: {label:Page;icon:typeof LayoutDashboard}[]=[
    {label:"Accueil",icon:LayoutDashboard},{label:"Élèves",icon:GraduationCap},{label:"Classes",icon:BookOpen},
    {label:"Présences",icon:CalendarCheck},{label:"Notes",icon:FileText},{label:"Scolarité",icon:Wallet}
  ];

  if(loading) return <div className="center-page">Chargement d’ELS SCHOOL MANAGER…</div>;
  if(!supabase) return <div className="center-page"><section className="auth-card"><Brand/><h1>Configuration nécessaire</h1><p>Ajoute l’URL et la clé publique de ton projet Supabase dans le fichier <code>.env</code>, puis redémarre le serveur.</p><code>VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY</code></section></div>;
  if(!user) return <div className="center-page"><section className="auth-card"><Brand/><p className="eyebrow">GESTION SCOLAIRE SIMPLIFIÉE · BÉNIN</p><h1>{authMode==="login"?"Heureux de te revoir":"Créer le compte de direction"}</h1><p className="muted">{authMode==="login"?"Connecte-toi pour accéder à ton établissement.":"Crée le compte qui administrera ton établissement."}</p><form onSubmit={submitAuth} className="form-stack">
    {authMode==="signup"&&<label>Nom complet<input required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nom du directeur ou de la directrice"/></label>}
    <label>Adresse e-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="nom@ecole.com"/></label>
    <label>Mot de passe<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="8 caractères minimum"/></label>
    <button className="primary full" disabled={busy}>{busy?"Patiente…":authMode==="login"?"Se connecter":"Créer mon compte"}</button></form>
    {error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}
    <p className="switch-auth">{authMode==="login"?"Tu n’as pas encore de compte ?":"Tu as déjà un compte ?"} <button onClick={()=>{setAuthMode(authMode==="login"?"signup":"login");setError("");setMessage("");}}>{authMode==="login"?"Inscris-toi":"Connecte-toi"}</button></p>
  </section></div>;

  if(!school) return <div className="center-page"><section className="auth-card"><Brand/><p className="eyebrow">DERNIÈRE ÉTAPE</p><h1>Configure ton école</h1><p className="muted">Le compte est connecté. Donne un nom à ton établissement pour créer ton espace privé.</p><form onSubmit={createSchool} className="form-stack"><label>Nom de l’école<input required value={schoolName} onChange={e=>setSchoolName(e.target.value)} placeholder="Ex. École Primaire Les Pionniers"/></label><button className="primary full" disabled={busy}>{busy?"Création…":"Créer mon établissement"}</button></form>{error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}<button className="link-button" onClick={signOut}>Se déconnecter</button></section></div>;

  return <div className="app-layout"><aside className="sidebar"><Brand/><div className="school-chip"><div className="school-avatar"><School size={19}/></div><div><small>MON ÉTABLISSEMENT</small><strong>{school.name}</strong></div></div><span className="nav-title">MENU PRINCIPAL</span><nav>{nav.map(n=>{const Icon=n.icon;return <button key={n.label} className={page===n.label?"nav-item active":"nav-item"} onClick={()=>setPage(n.label)}><Icon size={18}/>{n.label}{n.label==="Élèves"&&<span className="nav-count">{students.length}</span>}</button>})}</nav><div className="sidebar-foot"><div className="user-line"><div className="user-avatar">{(user.email??"D").slice(0,1).toUpperCase()}</div><div><strong>{user.user_metadata?.full_name||"Direction"}</strong><small>{user.email}</small></div></div><button className="logout" onClick={signOut}><LogOut size={16}/> Déconnexion</button></div></aside>
    <main className="main"><header className="topbar"><div><span className="muted">Espace école /</span> <strong>{page}</strong></div><div className="year-tag">{school.academic_year}</div></header><div className="content"><div className="page-title"><div><span className="eyebrow">ELS SCHOOL MANAGER</span><h1>{page==="Accueil"?"Tableau de bord":page}</h1><p className="muted">{page==="Accueil"?"Les informations essentielles de ton école.":`Gestion simple de la section ${page.toLowerCase()}.`}</p></div>{page==="Élèves"&&<button className="primary" onClick={()=>setShowAdd(!showAdd)}><Plus size={17}/> Nouvel élève</button>}</div>
      {error&&<div className="alert error">{error}</div>}{message&&<div className="alert success">{message}<button onClick={()=>setMessage("")}>×</button></div>}
      {page==="Accueil"&&<><div className="stats"><Stat icon={<GraduationCap/>} label="Élèves inscrits" value={String(students.length)}/><Stat icon={<BookOpen/>} label="Classes" value={String(classes.length)}/><Stat icon={<School/>} label="Année scolaire" value={school.academic_year}/></div><section className="panel"><div className="panel-head"><div><h2>Derniers élèves inscrits</h2><p>Les derniers dossiers de ton école.</p></div><button className="link-button" onClick={()=>setPage("Élèves")}>Voir les élèves →</button></div><StudentTable rows={students.slice(0,5)} classes={classes}/></section></>}
      {page==="Élèves"&&<section className="panel"><div className="panel-head"><div><h2>Registre des élèves</h2><p>{students.length} dossier(s) enregistré(s).</p></div><label className="search"><Search size={16}/><input placeholder="Rechercher un élève…" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>{showAdd&&<form className="student-form" onSubmit={addStudent}><label>Prénom<input required value={studentForm.first_name} onChange={e=>setStudentForm({...studentForm,first_name:e.target.value})}/></label><label>Nom<input required value={studentForm.last_name} onChange={e=>setStudentForm({...studentForm,last_name:e.target.value})}/></label><label>Matricule<input required value={studentForm.student_number} onChange={e=>setStudentForm({...studentForm,student_number:e.target.value})} placeholder="Ex. ELS-001"/></label><label>Sexe<select value={studentForm.gender} onChange={e=>setStudentForm({...studentForm,gender:e.target.value})}><option value="">Non précisé</option><option value="M">Garçon</option><option value="F">Fille</option></select></label><button className="primary" disabled={busy}>{busy?"Enregistrement…":"Enregistrer l’élève"}</button></form>}<StudentTable rows={filtered} classes={classes}/></section>}
      {page==="Classes"&&<section className="panel"><div className="panel-head"><div><h2>Classes de l’établissement</h2><p>Crée les classes utilisées par ton école.</p></div></div><form className="class-form" onSubmit={addClass}><label>Nom de la classe<input name="name" required placeholder="Ex. CM2 A"/></label><label>Niveau<select name="level"><option>CI</option><option>CP</option><option>CE1</option><option>CE2</option><option>CM1</option><option>CM2</option></select></label><button className="primary" disabled={busy}><Plus size={16}/> Ajouter la classe</button></form><div className="class-grid">{classes.map(c=><div className="class-card" key={c.id}><div className="class-icon"><BookOpen/></div><div><strong>{c.name}</strong><p>{c.level} · {c.academic_year}</p></div></div>)}{classes.length===0&&<p className="muted">Aucune classe créée. Utilise le formulaire ci-dessus pour commencer.</p>}</div></section>}
      {["Présences","Notes","Scolarité"].includes(page)&&<section className="panel feature-soon"><div className="feature-icon">{page==="Présences"?<CalendarCheck/>:page==="Notes"?<FileText/>:<Wallet/>}</div><h2>{page}</h2><p>Ce module sera développé après validation de la connexion, des écoles, des classes et des inscriptions. On garde le logiciel simple et on avance étape par étape.</p></section>}
      <footer>© {new Date().getFullYear()} ELS SCHOOL MANAGER <span>Gestion scolaire primaire · Bénin</span></footer>
    </div></main></div>;
}

function Brand(){return <div className="brand"><div className="brand-mark"><School size={24}/></div><div><strong>ELS SCHOOL</strong><span>MANAGER</span></div></div>}
function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="stat-card"><div className="stat-icon">{icon}</div><p>{label}</p><strong>{value}</strong></div>}
function StudentTable({rows,classes}:{rows:Student[];classes:ClassRow[]}){return <div className="table-wrap"><table><thead><tr><th>ÉLÈVE</th><th>MATRICULE</th><th>CLASSE</th><th>STATUT</th></tr></thead><tbody>{rows.map(s=><tr key={s.id}><td><strong>{s.first_name} {s.last_name}</strong></td><td>{s.student_number}</td><td>{classes.find(c=>c.id===s.class_id)?.name??"Non affecté"}</td><td><span className="pill">{s.status==="active"?"Inscrit":s.status}</span></td></tr>)}</tbody></table>{rows.length===0&&<p className="empty">Aucun élève à afficher pour le moment.</p>}</div>}