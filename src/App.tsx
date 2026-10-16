import { useEffect, useState, type FormEvent } from "react";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { BookOpen, GraduationCap, LayoutDashboard, LogOut, Plus, Search, School, Wallet, CalendarCheck, FileText, Users, CheckCircle2, ReceiptText } from "lucide-react";
import "./styles.css";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

type Student = { id: string; student_number: string; first_name: string; last_name: string; gender: string | null; class_id: string | null; status: string };
type ClassRow = { id: string; name: string; level: string; academic_year: string };
type SchoolRow = { id: string; name: string; academic_year: string };
type AttendanceStatus = "present" | "absent" | "late" | "excused";
type AttendanceRow = { id: string; student_id: string; attendance_date: string; status: AttendanceStatus; note: string | null };
type GradeRow = { id: string; student_id: string; subject: string; term: string; score: number; coefficient: number; comment: string | null; created_at: string };
type PaymentRow = { id: string; student_id: string; receipt_number: string; amount_xof: number; payment_method: string; paid_at: string; note: string | null };
type Page = "Accueil" | "Élèves" | "Classes" | "Présences" | "Notes" | "Scolarité";

function localDate() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function money(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value) || 0) + " FCFA";
}
function studentLabel(student: Student | undefined) {
  return student ? student.first_name + " " + student.last_name + " · " + student.student_number : "Élève inconnu";
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [school, setSchool] = useState<SchoolRow | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [bulletinGrades, setBulletinGrades] = useState<GradeRow[]>([]);
  const [bulletinStudentId, setBulletinStudentId] = useState("");
  const [bulletinTerm, setBulletinTerm] = useState("Trimestre 1");
  const [bulletinRefresh, setBulletinRefresh] = useState(0);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [page, setPage] = useState<Page>("Accueil");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [studentForm, setStudentForm] = useState({ first_name: "", last_name: "", student_number: "", gender: "", class_id: "" });
  const [attendanceDate, setAttendanceDate] = useState(localDate());
  const [attendanceClass, setAttendanceClass] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState<Record<string, AttendanceStatus>>({});
  const [gradeForm, setGradeForm] = useState({ student_id: "", subject: "", term: "Trimestre 1", score: "10", coefficient: "1", comment: "" });
  const [feeForm, setFeeForm] = useState({ student_id: "", amount_xof: "", payment_method: "cash", note: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError("Impossible de vérifier la session. Recharge la page.");
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) void loadSchool();
    else {
      setSchool(null); setStudents([]); setClasses([]); setAttendance([]); setGrades([]); setPayments([]);
    }
  }, [user]);

  useEffect(() => {
    if (school?.id) void loadAttendance(school.id, attendanceDate);
  }, [school?.id, attendanceDate]);

  useEffect(() => {
    let active = true;
    const loadBulletin = async () => {
      if (!supabase || !school?.id || !bulletinStudentId) {
        setBulletinGrades([]);
        return;
      }
      const { data, error: bulletinError } = await supabase.from("grades")
        .select("id,student_id,subject,term,score,coefficient,comment,created_at")
        .eq("school_id", school.id).eq("student_id", bulletinStudentId).eq("term", bulletinTerm)
        .order("subject");
      if (!active) return;
      if (bulletinError) setError("Impossible de préparer le bulletin : " + bulletinError.message);
      else setBulletinGrades((data ?? []) as GradeRow[]);
    };
    void loadBulletin();
    return () => { active = false; };
  }, [school?.id, bulletinStudentId, bulletinTerm, bulletinRefresh]);

  async function loadSchool() {
    if (!supabase || !user) return;
    setError("");
    const { data: membership, error: membershipError } = await supabase
      .from("school_memberships").select("school_id, schools(id,name,academic_year)")
      .eq("user_id", user.id).eq("active", true).limit(1).maybeSingle();
    if (membershipError) { setError("Impossible de charger l’école. Vérifie que le schéma SQL est installé dans Supabase."); return; }
    const schoolData = membership?.schools as unknown as SchoolRow | undefined;
    if (!membership || !schoolData) { setSchool(null); return; }
    setSchool(schoolData);
    const [studentsResult, classesResult, gradesResult, paymentsResult] = await Promise.all([
      supabase.from("students").select("id,student_number,first_name,last_name,gender,class_id,status").eq("school_id", schoolData.id).order("last_name"),
      supabase.from("classes").select("id,name,level,academic_year").eq("school_id", schoolData.id).order("level"),
      supabase.from("grades").select("id,student_id,subject,term,score,coefficient,comment,created_at").eq("school_id", schoolData.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("fee_payments").select("id,student_id,receipt_number,amount_xof,payment_method,paid_at,note").eq("school_id", schoolData.id).order("paid_at", { ascending: false }).limit(100)
    ]);
    if (studentsResult.error || classesResult.error) setError("Erreur de chargement des élèves ou des classes. Vérifie les politiques RLS.");
    setStudents((studentsResult.data ?? []) as Student[]);
    setClasses((classesResult.data ?? []) as ClassRow[]);
    if (!gradesResult.error) setGrades((gradesResult.data ?? []) as GradeRow[]);
    if (!paymentsResult.error) setPayments((paymentsResult.data ?? []) as PaymentRow[]);
    if (gradesResult.error || paymentsResult.error) setMessage("Certains modules nécessitent une vérification des permissions de compte dans Supabase.");
  }

  async function loadAttendance(schoolId: string, date: string) {
    if (!supabase) return;
    const { data, error: attendanceError } = await supabase.from("attendance")
      .select("id,student_id,attendance_date,status,note").eq("school_id", schoolId).eq("attendance_date", date);
    if (attendanceError) { setError("Impossible de charger les présences. Vérifie le schéma SQL et les permissions."); return; }
    const rows = (data ?? []) as AttendanceRow[];
    setAttendance(rows);
    setAttendanceStatus(previous => {
      const next: Record<string, AttendanceStatus> = {};
      rows.forEach(row => { next[row.student_id] = row.status; });
      return next;
    });
  }

  async function submitAuth(e: FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setError(""); setMessage("");
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (result.error) setError(result.error.message);
    else if (authMode === "signup" && !result.data.session) setMessage("Compte créé. Vérifie ton e-mail si la confirmation est activée, puis connecte-toi.");
    else setMessage(authMode === "signup" ? "Compte créé. Tu peux maintenant créer ton établissement." : "Connexion réussie.");
    setBusy(false);
  }

  async function createSchool(e: FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setError(""); setMessage("");
    const { error } = await supabase.rpc("create_school_for_current_user", { school_name: schoolName.trim() });
    if (error) setError(error.message);
    else { setMessage("Établissement créé."); await loadSchool(); }
    setBusy(false);
  }

  async function addStudent(e: FormEvent) {
    e.preventDefault(); if (!supabase || !school) return;
    setBusy(true); setError(""); setMessage("");
    const { error } = await supabase.from("students").insert({
      school_id: school.id, student_number: studentForm.student_number.trim(), first_name: studentForm.first_name.trim(),
      last_name: studentForm.last_name.trim(), gender: studentForm.gender || null,
      class_id: studentForm.class_id || null, status: "active"
    });
    if (error) setError(error.message);
    else {
      setMessage("Élève inscrit."); setShowAdd(false);
      setStudentForm({ first_name: "", last_name: "", student_number: "", gender: "", class_id: "" });
      await loadSchool();
    }
    setBusy(false);
  }

  async function addClass(e: FormEvent) {
    e.preventDefault(); if (!supabase || !school) return;
    const form = e.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    const { error } = await supabase.from("classes").insert({
      school_id: school.id, name: String(data.get("name") || "").trim(),
      level: String(data.get("level") || "CI"), academic_year: school.academic_year
    });
    if (error) setError(error.message);
    else { setMessage("Classe ajoutée."); form.reset(); await loadSchool(); }
    setBusy(false);
  }

  async function saveAttendance(e: FormEvent) {
    e.preventDefault(); if (!supabase || !school) return;
    const classStudents = students.filter(s => s.status === "active" && s.class_id === attendanceClass);
    if (!attendanceClass || classStudents.length === 0) { setError("Sélectionne une classe qui contient des élèves."); return; }
    setBusy(true); setError(""); setMessage("");
    const rows = classStudents.map(s => ({
      school_id: school.id, student_id: s.id, attendance_date: attendanceDate,
      status: attendanceStatus[s.id] ?? "present", recorded_by: user?.id ?? null
    }));
    const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "school_id,student_id,attendance_date" });
    if (error) setError("Enregistrement des présences impossible : " + error.message);
    else {
      setMessage("Présences enregistrées pour " + classStudents.length + " élève(s).");
      await loadAttendance(school.id, attendanceDate);
    }
    setBusy(false);
  }

  async function addGrade(e: FormEvent) {
    e.preventDefault(); if (!supabase || !school) return;
    const score = Number(gradeForm.score);
    const coefficient = Number(gradeForm.coefficient);
    if (!gradeForm.student_id || !gradeForm.subject.trim() || !Number.isFinite(score) || score < 0 || score > 20 || !Number.isFinite(coefficient) || coefficient <= 0) {
      setError("Vérifie l’élève, la matière, la note (0 à 20) et le coefficient."); return;
    }
    setBusy(true); setError(""); setMessage("");
    const { error } = await supabase.from("grades").insert({
      school_id: school.id, student_id: gradeForm.student_id, subject: gradeForm.subject.trim(),
      term: gradeForm.term, score, coefficient, comment: gradeForm.comment.trim() || null, recorded_by: user?.id ?? null
    });
    if (error) setError("Enregistrement de la note impossible : " + error.message);
    else {
      setMessage("Note enregistrée.");
      setGradeForm({ student_id: "", subject: "", term: "Trimestre 1", score: "10", coefficient: "1", comment: "" });
      setBulletinRefresh(value => value + 1);
      await loadSchool();
    }
    setBusy(false);
  }

  async function addPayment(e: FormEvent) {
    e.preventDefault(); if (!supabase || !school) return;
    const amount = Number(feeForm.amount_xof);
    if (!feeForm.student_id || !Number.isSafeInteger(amount) || amount <= 0) {
      setError("Sélectionne un élève et indique un montant positif en FCFA."); return;
    }
    setBusy(true); setError(""); setMessage("");
    const receipt = "ELS-" + localDate().replace(/-/g, "") + "-" + crypto.randomUUID().slice(0, 6).toUpperCase();
    const { error } = await supabase.from("fee_payments").insert({
      school_id: school.id, student_id: feeForm.student_id, receipt_number: receipt,
      amount_xof: amount, payment_method: feeForm.payment_method, note: feeForm.note.trim() || null,
      recorded_by: user?.id ?? null
    });
    if (error) setError("Enregistrement du paiement impossible : " + error.message);
    else {
      setMessage("Paiement enregistré. Référence du reçu : " + receipt);
      setFeeForm({ student_id: "", amount_xof: "", payment_method: "cash", note: "" });
      await loadSchool();
    }
    setBusy(false);
  }

  async function signOut() { if (supabase) await supabase.auth.signOut(); }
  const filtered = students.filter(s => (s.first_name + " " + s.last_name + " " + s.student_number).toLowerCase().includes(search.toLowerCase()));
  const selectedClassStudents = students.filter(s => s.status === "active" && s.class_id === attendanceClass);
  const totalRecentPayments = payments.reduce((sum, p) => sum + Number(p.amount_xof || 0), 0);
  const todayAttendance = attendance.filter(a => a.attendance_date === localDate());
  const bulletinStudent = students.find(s => s.id === bulletinStudentId);
  const bulletinCoefficient = bulletinGrades.reduce((sum, g) => sum + Number(g.coefficient), 0);
  const bulletinAverage = bulletinCoefficient > 0
    ? bulletinGrades.reduce((sum, g) => sum + Number(g.score) * Number(g.coefficient), 0) / bulletinCoefficient
    : null;
  const nav: { label: Page; icon: typeof LayoutDashboard }[] = [
    { label: "Accueil", icon: LayoutDashboard }, { label: "Élèves", icon: GraduationCap },
    { label: "Classes", icon: BookOpen }, { label: "Présences", icon: CalendarCheck },
    { label: "Notes", icon: FileText }, { label: "Scolarité", icon: Wallet }
  ];

  if (loading) return <div className="center-page">Chargement d’ELS SCHOOL MANAGER…</div>;
  if (!supabase) return <div className="center-page"><section className="auth-card"><Brand/><h1>Configuration nécessaire</h1><p>Ajoute l’URL et la clé publique de ton projet Supabase dans le fichier <code>.env</code>, puis redémarre le serveur.</p><code>VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY</code></section></div>;
  if (!user) return <div className="center-page"><section className="auth-card"><Brand/><p className="eyebrow">GESTION SCOLAIRE SIMPLIFIÉE · BÉNIN</p><h1>{authMode === "login" ? "Heureux de te revoir" : "Créer le compte de direction"}</h1><p className="muted">{authMode === "login" ? "Connecte-toi pour accéder à ton établissement." : "Crée le compte qui administrera ton établissement."}</p><form onSubmit={submitAuth} className="form-stack">
    {authMode === "signup" && <label>Nom complet<input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nom du directeur ou de la directrice"/></label>}
    <label>Adresse e-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nom@ecole.com"/></label>
    <label>Mot de passe<input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum"/></label>
    <button className="primary full" disabled={busy}>{busy ? "Patiente…" : authMode === "login" ? "Se connecter" : "Créer mon compte"}</button></form>
    {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
    <p className="switch-auth">{authMode === "login" ? "Tu n’as pas encore de compte ?" : "Tu as déjà un compte ?"} <button onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>{authMode === "login" ? "Inscris-toi" : "Connecte-toi"}</button></p>
  </section></div>;

  if (!school) return <div className="center-page"><section className="auth-card"><Brand/><p className="eyebrow">DERNIÈRE ÉTAPE</p><h1>Configure ton école</h1><p className="muted">Le compte est connecté. Donne un nom à ton établissement pour créer ton espace privé.</p><form onSubmit={createSchool} className="form-stack"><label>Nom de l’école<input required minLength={3} maxLength={120} value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="Ex. École Primaire Les Pionniers"/></label><button className="primary full" disabled={busy}>{busy ? "Création…" : "Créer mon établissement"}</button></form>{error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}<button className="link-button" onClick={signOut}>Se déconnecter</button></section></div>;

  return <div className="app-layout"><aside className="sidebar"><Brand/><div className="school-chip"><div className="school-avatar"><School size={19}/></div><div><small>MON ÉTABLISSEMENT</small><strong>{school.name}</strong></div></div><span className="nav-title">MENU PRINCIPAL</span><nav>{nav.map(n => { const Icon = n.icon; return <button key={n.label} className={page === n.label ? "nav-item active" : "nav-item"} onClick={() => setPage(n.label)}><Icon size={18}/>{n.label}{n.label === "Élèves" && <span className="nav-count">{students.length}</span>}</button>; })}</nav><div className="sidebar-foot"><div className="user-line"><div className="user-avatar">{(user.email ?? "D").slice(0, 1).toUpperCase()}</div><div><strong>{user.user_metadata?.full_name || "Direction"}</strong><small>{user.email}</small></div></div><button className="logout" onClick={signOut}><LogOut size={16}/> Déconnexion</button></div></aside>
    <main className="main"><header className="topbar"><div><span className="muted">Espace école /</span> <strong>{page}</strong></div><div className="year-tag">{school.academic_year}</div></header><div className="content"><div className="page-title"><div><span className="eyebrow">ELS SCHOOL MANAGER</span><h1>{page === "Accueil" ? "Tableau de bord" : page}</h1><p className="muted">{page === "Accueil" ? "Les informations essentielles de ton école." : "Gestion simple de la section " + page.toLowerCase() + "."}</p></div>{page === "Élèves" && <button className="primary" onClick={() => setShowAdd(!showAdd)}><Plus size={17}/> Nouvel élève</button>}</div>
      {error && <div className="alert error">{error}</div>}{message && <div className="alert success">{message}<button onClick={() => setMessage("")}>×</button></div>}
      {page === "Accueil" && <><div className="stats"><Stat icon={<GraduationCap/>} label="Élèves inscrits" value={String(students.length)}/><Stat icon={<BookOpen/>} label="Classes" value={String(classes.length)}/><Stat icon={<Wallet/>} label="Paiements récents (100 max.)" value={money(totalRecentPayments)}/></div><div className="stats secondary-stats"><Stat icon={<CalendarCheck/>} label="Présences de la date sélectionnée" value={String(todayAttendance.length)}/><Stat icon={<Users/>} label="Année scolaire" value={school.academic_year}/></div><section className="panel"><div className="panel-head"><div><h2>Derniers élèves inscrits</h2><p>Les derniers dossiers de ton école.</p></div><button className="link-button" onClick={() => setPage("Élèves")}>Voir les élèves →</button></div><StudentTable rows={students.slice(0, 5)} classes={classes}/></section></>}
      {page === "Élèves" && <section className="panel"><div className="panel-head"><div><h2>Registre des élèves</h2><p>{students.length} dossier(s) enregistré(s).</p></div><label className="search"><Search size={16}/><input placeholder="Rechercher un élève…" value={search} onChange={e => setSearch(e.target.value)}/></label></div>{showAdd && <form className="student-form" onSubmit={addStudent}><label>Prénom<input required value={studentForm.first_name} onChange={e => setStudentForm({ ...studentForm, first_name: e.target.value })}/></label><label>Nom<input required value={studentForm.last_name} onChange={e => setStudentForm({ ...studentForm, last_name: e.target.value })}/></label><label>Matricule<input required value={studentForm.student_number} onChange={e => setStudentForm({ ...studentForm, student_number: e.target.value })} placeholder="Ex. ELS-001"/></label><label>Sexe<select value={studentForm.gender} onChange={e => setStudentForm({ ...studentForm, gender: e.target.value })}><option value="">Non précisé</option><option value="M">Garçon</option><option value="F">Fille</option></select></label><label>Classe<select value={studentForm.class_id} onChange={e => setStudentForm({ ...studentForm, class_id: e.target.value })}><option value="">Non affecté</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}</select></label><button className="primary" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer l’élève"}</button></form>}<StudentTable rows={filtered} classes={classes}/></section>}
      {page === "Classes" && <section className="panel"><div className="panel-head"><div><h2>Classes de l’établissement</h2><p>Crée les classes utilisées par ton école.</p></div></div><form className="class-form" onSubmit={addClass}><label>Nom de la classe<input name="name" required placeholder="Ex. CM2 A"/></label><label>Niveau<select name="level"><option>CI</option><option>CP</option><option>CE1</option><option>CE2</option><option>CM1</option><option>CM2</option></select></label><button className="primary" disabled={busy}><Plus size={16}/> Ajouter la classe</button></form><div className="class-grid">{classes.map(c => <div className="class-card" key={c.id}><div className="class-icon"><BookOpen/></div><div><strong>{c.name}</strong><p>{c.level} · {c.academic_year}</p></div></div>)}{classes.length === 0 && <p className="muted">Aucune classe créée. Utilise le formulaire ci-dessus pour commencer.</p>}</div></section>}
      {page === "Présences" && <section className="panel"><div className="panel-head"><div><h2>Feuille de présence</h2><p>Choisis une date et une classe, puis enregistre les statuts des élèves.</p></div></div><form onSubmit={saveAttendance} className="module-form"><label>Date<input type="date" required value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)}/></label><label>Classe<select required value={attendanceClass} onChange={e => setAttendanceClass(e.target.value)}><option value="">Choisir une classe</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} — {c.level}</option>)}</select></label><button className="primary" disabled={busy || !attendanceClass}>{busy ? "Enregistrement…" : "Enregistrer la feuille"}</button></form><div className="attendance-summary"><span><CheckCircle2 size={16}/> {selectedClassStudents.length} élève(s) dans cette classe</span><span>{attendance.filter(a => a.status === "present").length} présent(s) enregistrés à cette date</span></div><div className="table-wrap"><table><thead><tr><th>ÉLÈVE</th><th>MATRICULE</th><th>STATUT DU JOUR</th></tr></thead><tbody>{selectedClassStudents.map(s => <tr key={s.id}><td><strong>{s.first_name} {s.last_name}</strong></td><td>{s.student_number}</td><td><select className="status-select" aria-label={"Présence de " + s.first_name + " " + s.last_name} value={attendanceStatus[s.id] ?? "present"} onChange={e => setAttendanceStatus({ ...attendanceStatus, [s.id]: e.target.value as AttendanceStatus })}><option value="present">Présent</option><option value="absent">Absent</option><option value="late">En retard</option><option value="excused">Excusé</option></select></td></tr>)}</tbody></table>{attendanceClass && selectedClassStudents.length === 0 && <p className="empty">Aucun élève actif dans cette classe.</p>}{!attendanceClass && <p className="empty">Choisis une classe pour afficher les élèves.</p>}</div></section>}
      {page === "Notes" && <section className="panel"><div className="panel-head"><div><h2>Saisie des notes</h2><p>Les notes sont notées sur 20. Elles restent dans l’espace de cet établissement.</p></div></div><form onSubmit={addGrade} className="module-form grade-form"><label>Élève<select required value={gradeForm.student_id} onChange={e => setGradeForm({ ...gradeForm, student_id: e.target.value })}><option value="">Choisir un élève</option>{students.filter(s => s.status === "active").map(s => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}</select></label><label>Matière<input required maxLength={80} value={gradeForm.subject} onChange={e => setGradeForm({ ...gradeForm, subject: e.target.value })} placeholder="Ex. Mathématiques"/></label><label>Période<select value={gradeForm.term} onChange={e => setGradeForm({ ...gradeForm, term: e.target.value })}><option>Trimestre 1</option><option>Trimestre 2</option><option>Trimestre 3</option><option>Composition 1</option><option>Composition 2</option><option>Examen final</option></select></label><label>Note / 20<input type="number" required min="0" max="20" step="0.25" value={gradeForm.score} onChange={e => setGradeForm({ ...gradeForm, score: e.target.value })}/></label><label>Coefficient<input type="number" required min="0.01" step="0.25" value={gradeForm.coefficient} onChange={e => setGradeForm({ ...gradeForm, coefficient: e.target.value })}/></label><label>Commentaire (facultatif)<input maxLength={300} value={gradeForm.comment} onChange={e => setGradeForm({ ...gradeForm, comment: e.target.value })} placeholder="Observation courte"/></label><button className="primary" disabled={busy || students.length === 0}>{busy ? "Enregistrement…" : "Enregistrer la note"}</button></form><div className="panel-head list-heading"><div><h2>Notes récemment saisies</h2><p>Les 100 dernières notes au maximum.</p></div></div><div className="table-wrap"><table><thead><tr><th>ÉLÈVE</th><th>MATIÈRE</th><th>PÉRIODE</th><th>NOTE</th><th>COEFFICIENT</th></tr></thead><tbody>{grades.map(g => <tr key={g.id}><td>{studentLabel(students.find(s => s.id === g.student_id))}</td><td>{g.subject}</td><td>{g.term}</td><td><strong>{Number(g.score).toLocaleString("fr-FR")} / 20</strong></td><td>{Number(g.coefficient).toLocaleString("fr-FR")}</td></tr>)}</tbody></table>{grades.length === 0 && <p className="empty">Aucune note enregistrée.</p></div>
        <div className="bulletin-tools no-print"><div className="panel-head list-heading"><div><h2>Préparer un bulletin</h2><p>Choisis un élève et une période pour calculer sa moyenne pondérée et imprimer le bulletin.</p></div></div><div className="module-form grade-form"><label>Élève<select required value={bulletinStudentId} onChange={e => setBulletinStudentId(e.target.value)}><option value="">Choisir un élève</option>{students.filter(s => s.status === "active").map(s => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}</select></label><label>Période<select value={bulletinTerm} onChange={e => setBulletinTerm(e.target.value)}><option>Trimestre 1</option><option>Trimestre 2</option><option>Trimestre 3</option><option>Composition 1</option><option>Composition 2</option><option>Examen final</option></select></label><button type="button" className="primary" disabled={!bulletinStudentId || bulletinGrades.length === 0} onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button></div>{bulletinStudentId && bulletinGrades.length === 0 && <p className="muted">Aucune note saisie pour cet élève sur cette période.</p>}</div>
        {bulletinStudentId && bulletinStudent && bulletinGrades.length > 0 && <div className="bulletin-paper print-area"><div className="report-heading"><span>ELS SCHOOL MANAGER</span><h2>BULLETIN DE NOTES</h2><p>{school.name} · Année scolaire {school.academic_year}</p></div><div className="report-student"><div><small>ÉLÈVE</small><strong>{bulletinStudent.first_name} {bulletinStudent.last_name}</strong><span>Matricule : {bulletinStudent.student_number}</span></div><div><small>CLASSE</small><strong>{classes.find(cl => cl.id === bulletinStudent.class_id)?.name ?? "Non affecté"}</strong><span>{bulletinTerm}</span></div><div><small>MOYENNE PONDÉRÉE</small><strong>{bulletinAverage === null ? "—" : bulletinAverage.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " / 20"}</strong><span>{bulletinGrades.length} évaluation(s)</span></div></div><div className="table-wrap"><table><thead><tr><th>MATIÈRE</th><th>NOTE / 20</th><th>COEFFICIENT</th><th>POINTS PONDÉRÉS</th><th>OBSERVATION</th></tr></thead><tbody>{bulletinGrades.map(g => <tr key={g.id}><td><strong>{g.subject}</strong></td><td>{Number(g.score).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td><td>{Number(g.coefficient).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td><td>{(Number(g.score) * Number(g.coefficient)).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td><td>{g.comment || "—"}</td></tr>)}</tbody></table></div><p className="report-foot">Moyenne calculée à partir des notes et coefficients enregistrés pour la période sélectionnée.</p><div className="signature-lines"><span>Signature de l’enseignant</span><span>Cachet et signature de la direction</span></div></div>}
      </section>}
      {page === "Scolarité" && <section className="panel"><div className="panel-head"><div><h2>Encaissements et reçus</h2><p>Enregistre les paiements scolaires en FCFA et conserve la référence du reçu.</p></div><div className="fee-total"><small>Total des 100 derniers règlements affichés</small><strong>{money(totalRecentPayments)}</strong></div></div><form onSubmit={addPayment} className="module-form grade-form"><label>Élève<select required value={feeForm.student_id} onChange={e => setFeeForm({ ...feeForm, student_id: e.target.value })}><option value="">Choisir un élève</option>{students.filter(s => s.status === "active").map(s => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}</select></label><label>Montant (FCFA)<input type="number" required min="1" step="1" value={feeForm.amount_xof} onChange={e => setFeeForm({ ...feeForm, amount_xof: e.target.value })} placeholder="Ex. 25000"/></label><label>Moyen de paiement<select value={feeForm.payment_method} onChange={e => setFeeForm({ ...feeForm, payment_method: e.target.value })}><option value="cash">Espèces</option><option value="mobile_money">Mobile Money</option><option value="bank_transfer">Virement bancaire</option><option value="other">Autre</option></select></label><label>Note (facultatif)<input maxLength={300} value={feeForm.note} onChange={e => setFeeForm({ ...feeForm, note: e.target.value })} placeholder="Ex. Première tranche"/></label><button className="primary" disabled={busy || students.length === 0}><ReceiptText size={16}/>{busy ? "Enregistrement…" : "Enregistrer et générer un reçu"}</button></form><div className="panel-head list-heading"><div><h2>Derniers règlements</h2><p>Référence du reçu, élève, date et montant.</p></div></div><div className="table-wrap"><table><thead><tr><th>REÇU</th><th>ÉLÈVE</th><th>DATE</th><th>MOYEN</th><th>MONTANT</th><th className="no-print">REÇU</th></tr></thead><tbody>{payments.map(p => <tr key={p.id}><td><strong>{p.receipt_number}</strong></td><td>{studentLabel(students.find(s => s.id === p.student_id))}</td><td>{new Date(p.paid_at).toLocaleDateString("fr-FR")}</td><td>{p.payment_method === "cash" ? "Espèces" : p.payment_method === "mobile_money" ? "Mobile Money" : p.payment_method === "bank_transfer" ? "Virement" : "Autre"}</td><td><strong>{money(p.amount_xof)}</strong></td><td className="no-print"><button type="button" className="link-button" onClick={() => setSelectedReceipt(p)}>Voir le reçu</button></td></tr>)}</tbody></table>{payments.length === 0 && <p className="empty">Aucun règlement enregistré.</p>}</div>{selectedReceipt && <div className="receipt-paper print-area"><div className="report-heading"><span>ELS SCHOOL MANAGER</span><h2>REÇU DE PAIEMENT</h2><p>{school.name}</p></div><div className="receipt-reference"><small>RÉFÉRENCE DU REÇU</small><strong>{selectedReceipt.receipt_number}</strong></div><div className="receipt-details"><p><span>Élève</span><strong>{studentLabel(students.find(s => s.id === selectedReceipt.student_id))}</strong></p><p><span>Classe</span><strong>{classes.find(cl => cl.id === students.find(s => s.id === selectedReceipt.student_id)?.class_id)?.name ?? "Non affecté"}</strong></p><p><span>Date du règlement</span><strong>{new Date(selectedReceipt.paid_at).toLocaleDateString("fr-FR")}</strong></p><p><span>Moyen de paiement</span><strong>{selectedReceipt.payment_method === "cash" ? "Espèces" : selectedReceipt.payment_method === "mobile_money" ? "Mobile Money" : selectedReceipt.payment_method === "bank_transfer" ? "Virement bancaire" : "Autre"}</strong></p><p><span>Montant encaissé</span><strong>{money(selectedReceipt.amount_xof)}</strong></p>{selectedReceipt.note && <p><span>Motif / note</span><strong>{selectedReceipt.note}</strong></p>}</div><p className="report-foot">Reçu généré par ELS SCHOOL MANAGER. Conservez cette référence pour tout suivi.</p><div className="signature-lines"><span>Signature de la caisse</span><span>Cachet de l’établissement</span></div><button type="button" className="primary no-print" onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button></div>}</section>}
      <footer>© {new Date().getFullYear()} ELS SCHOOL MANAGER <span>Gestion scolaire primaire · Bénin</span></footer>
    </div></main></div>;
}

function Brand() { return <div className="brand"><div className="brand-mark"><School size={24}/></div><div><strong>ELS SCHOOL</strong><span>MANAGER</span></div></div>; }
function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="stat-card"><div className="stat-icon">{icon}</div><p>{label}</p><strong>{value}</strong></div>; }
function StudentTable({ rows, classes }: { rows: Student[]; classes: ClassRow[] }) { return <div className="table-wrap"><table><thead><tr><th>ÉLÈVE</th><th>MATRICULE</th><th>CLASSE</th><th>STATUT</th></tr></thead><tbody>{rows.map(s => <tr key={s.id}><td><strong>{s.first_name} {s.last_name}</strong></td><td>{s.student_number}</td><td>{classes.find(c => c.id === s.class_id)?.name ?? "Non affecté"}</td><td><span className="pill">{s.status === "active" ? "Inscrit" : s.status}</span></td></tr>)}</tbody></table>{rows.length === 0 && <p className="empty">Aucun élève à afficher pour le moment.</p>}</div>; }
