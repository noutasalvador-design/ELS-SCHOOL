import { useEffect, useState, type FormEvent } from "react";
import { api, type AppUser } from "./lib/api";
import { BookOpen, GraduationCap, LayoutDashboard, LogOut, Plus, Search, School, Wallet, CalendarCheck, FileText, Users, CheckCircle2, ReceiptText, CreditCard, BadgeCheck, Palette, ArrowRight, ShieldCheck, Sparkles, ImagePlus, Upload, Settings2 } from "lucide-react";
import "./styles.css";



type Student = { id: string; student_number: string; first_name: string; last_name: string; gender: string | null; class_id: string | null; status: string };
type ClassRow = { id: string; name: string; level: string; academic_year: string };
type SchoolRow = { id: string; name: string; academic_year: string; logo_data_url?: string | null };
type AttendanceStatus = "present" | "absent" | "late" | "excused";
type AttendanceRow = { id: string; student_id: string; attendance_date: string; status: AttendanceStatus; note: string | null };
type GradeRow = { id: string; student_id: string; subject: string; term: string; score: number; coefficient: number; comment: string | null; created_at: string };
type PaymentRow = { id: string; student_id: string; receipt_number: string; amount_xof: number; payment_method: string; paid_at: string; note: string | null };
type FeeCharge = { id: string; title: string; amount_xof: number; class_id: string | null; student_id: string | null; academic_year: string; due_date: string | null; class_name: string | null; first_name: string | null; last_name: string | null };
type FeeSummary = { student_id: string; student_number: string; first_name: string; last_name: string; expected_xof: number; paid_xof: number };
type StaffRow = { id: string; user_id: string; full_name: string; email: string; role: string; active: boolean };
type Page = "Accueil" | "Élèves" | "Classes" | "Présences" | "Notes" | "Scolarité" | "Abonnement" | "Personnalisation";
type SubscriptionRow = { plan_code: "essentiel" | "standard" | "illimite"; status: string; monthly_price_xof: number; student_limit: number | null; current_period_end: string | null };
type SubscriptionPlan = { code: "essentiel" | "standard" | "illimite"; name: string; monthly_price_xof: number; student_limit: number | null };
const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { code: "essentiel", name: "Essentiel", monthly_price_xof: 5000, student_limit: 100 },
  { code: "standard", name: "Standard", monthly_price_xof: 10000, student_limit: 300 },
  { code: "illimite", name: "Illimité", monthly_price_xof: 25000, student_limit: null }
];

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
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [showAuth, setShowAuth] = useState(false);
  const [accentColor, setAccentColor] = useState(() => { try { return localStorage.getItem("els-school-accent") || "#1b6b58"; } catch { return "#1b6b58"; } });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [logoDraft, setLogoDraft] = useState("");
  const [logoSaving, setLogoSaving] = useState(false);
  const [school, setSchool] = useState<SchoolRow | null>(null);
  const [schoolSubscription, setSchoolSubscription] = useState<SubscriptionRow | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>(DEFAULT_SUBSCRIPTION_PLANS);
  const [subscriptionError, setSubscriptionError] = useState("");
  const [paymentBusyPlan, setPaymentBusyPlan] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [subscriptionRefresh, setSubscriptionRefresh] = useState(0);
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
  const [feeCharges, setFeeCharges] = useState<FeeCharge[]>([]);
  const [feeSummary, setFeeSummary] = useState<FeeSummary[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [feeAssignmentForm, setFeeAssignmentForm] = useState({ title: "", amount_xof: "", target_type: "class", class_id: "", student_id: "", due_date: "" });
  const [staffForm, setStaffForm] = useState({ email: "", role: "teacher" });
  const [page, setPage] = useState<Page>("Accueil");
  const [yearDraft, setYearDraft] = useState("");
  const [yearSaving, setYearSaving] = useState(false);
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

  useEffect(() => { try { localStorage.setItem("els-school-accent", accentColor); } catch { /* stockage facultatif */ } }, [accentColor]);
  useEffect(() => { setLogoDraft(school?.logo_data_url || ""); }, [school?.id, school?.logo_data_url]);

  useEffect(() => {
    let active = true;
    api<{ user: AppUser | null }>("/api/auth/me").then(result => { if (active) setUser(result.user); })
      .catch(() => { if (active) setError("Impossible de vérifier la session. Vérifie que la base Neon est configurée."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (user) void loadSchool();
    else {
      setSchool(null); setStudents([]); setClasses([]); setAttendance([]); setGrades([]); setPayments([]);
      setBulletinGrades([]); setBulletinStudentId(""); setSelectedReceipt(null); setAttendanceStatus({});
    }
  }, [user]);

  useEffect(() => {
    if (school?.id) void loadAttendance(school.id, attendanceDate);
  }, [school?.id, attendanceDate]);

  useEffect(() => {
    let active = true;
    async function loadSubscription() {
      if (!school?.id) { setSchoolSubscription(null); setSubscriptionPlans(DEFAULT_SUBSCRIPTION_PLANS); setSubscriptionError(""); return; }
      try {
        const result = await api<{ subscription: SubscriptionRow | null; plans: SubscriptionPlan[] }>("/api/data?action=overview");
        if (!active) return;
        setSchoolSubscription(result.subscription); setSubscriptionPlans(result.plans); setSubscriptionError("");
      } catch {
        if (!active) return;
        setSubscriptionPlans(DEFAULT_SUBSCRIPTION_PLANS);
        setSubscriptionError("Impossible de charger les forfaits depuis Neon. Vérifie la configuration de la base.");
      }
    }
    void loadSubscription();
    return () => { active = false; };
  }, [school?.id, subscriptionRefresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paiement") === "retour") {
      setPaymentMessage("Retour depuis SasPay reçu. La confirmation est vérifiée côté serveur ; actualise le statut dans quelques instants si le forfait n’a pas encore changé.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadBulletin() {
      if (!school?.id || !bulletinStudentId) { setBulletinGrades([]); return; }
      try {
        const result = await api<{ rows: GradeRow[] }>(`/api/data?action=bulletin&student_id=${encodeURIComponent(bulletinStudentId)}&term=${encodeURIComponent(bulletinTerm)}`);
        if (active) setBulletinGrades(result.rows ?? []);
      } catch (e) { if (active) setError("Impossible de préparer le bulletin : " + (e as Error).message); }
    }
    void loadBulletin();
    return () => { active = false; };
  }, [school?.id, bulletinStudentId, bulletinTerm, bulletinRefresh]);

  async function loadSchool() {
    if (!user) return;
    setError("");
    try {
      const result = await api<{ school: SchoolRow | null; students: Student[]; classes: ClassRow[]; grades: GradeRow[]; payments: PaymentRow[]; subscription: SubscriptionRow | null; plans: SubscriptionPlan[]; feeCharges: FeeCharge[]; feeSummary: FeeSummary[]; staff: StaffRow[] }>("/api/data?action=overview");
      setSchool(result.school); setStudents(result.students ?? []); setClasses(result.classes ?? []);
      setGrades(result.grades ?? []); setPayments(result.payments ?? []);
      setFeeCharges(result.feeCharges ?? []); setFeeSummary(result.feeSummary ?? []); setStaff(result.staff ?? []);
      setSchoolSubscription(result.subscription ?? null); setSubscriptionPlans(result.plans?.length ? result.plans : DEFAULT_SUBSCRIPTION_PLANS); setSubscriptionError("");
    } catch (e) { setError("Impossible de charger l’espace de l’école : " + (e as Error).message); }
  }

  async function loadAttendance(schoolId: string, date: string) {
    try {
      const result = await api<{ rows: AttendanceRow[] }>(`/api/data?action=attendance&date=${encodeURIComponent(date)}`);
      const rows = result.rows ?? []; setAttendance(rows);
      setAttendanceStatus(() => { const next: Record<string, AttendanceStatus> = {}; rows.forEach(row => { next[row.student_id] = row.status; }); return next; });
    } catch (e) { setError("Impossible de charger les présences : " + (e as Error).message); }
  }
  async function submitAuth(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ user: AppUser }>(authMode === "signup" ? "/api/auth/signup" : "/api/auth/login", { method: "POST", body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), password }) });
      setUser(result.user); setMessage(authMode === "signup" ? "Compte créé. Tu peux maintenant créer ton établissement." : "Connexion réussie."); setPassword("");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function startSubscriptionPayment(planCode: SubscriptionPlan["code"]) {
    if (!school) { setPaymentMessage("Connecte-toi et ouvre l’espace de ton établissement avant de payer."); return; }
    setPaymentBusyPlan(planCode); setPaymentMessage(""); setError("");
    try {
      const result = await api<{ checkout_url: string }>("/api/saspay/start", { method: "POST", body: JSON.stringify({ school_id: school.id, plan_code: planCode }) });
      if (typeof result.checkout_url !== "string") throw new Error("Lien de paiement invalide.");
      window.location.assign(result.checkout_url);
    } catch (e) { setPaymentMessage((e as Error).message || "Impossible de démarrer le paiement SasPay."); setPaymentBusyPlan(null); }
  }
  async function createSchool(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { await api("/api/data", { method: "POST", body: JSON.stringify({ action: "createSchool", school_name: schoolName.trim() }) }); setMessage("Établissement créé."); await loadSchool(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function addStudent(e: FormEvent) {
    e.preventDefault(); if (!school) return; setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/data", { method: "POST", body: JSON.stringify({ action: editingStudentId ? "updateStudent" : "addStudent", ...(editingStudentId ? { id: editingStudentId } : {}), student_number: studentForm.student_number.trim(), first_name: studentForm.first_name.trim(), last_name: studentForm.last_name.trim(), gender: studentForm.gender || null, class_id: studentForm.class_id || null }) });
      setMessage(editingStudentId ? "Dossier de l’élève mis à jour." : "Élève inscrit."); setShowAdd(false); setEditingStudentId(null); setStudentForm({ first_name: "", last_name: "", student_number: "", gender: "", class_id: "" }); await loadSchool();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function editStudent(student: Student) {
    setEditingStudentId(student.id);
    setStudentForm({ first_name: student.first_name, last_name: student.last_name, student_number: student.student_number, gender: student.gender || "", class_id: student.class_id || "" });
    setShowAdd(true);
    setPage("Élèves");
    setError(""); setMessage("");
  }
  async function archiveStudent(student: Student) {
    if (!window.confirm("Archiver le dossier de " + student.first_name + " " + student.last_name + " ? L’élève ne sera plus compté comme actif.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/data", { method: "POST", body: JSON.stringify({ action: "archiveStudent", id: student.id }) });
      setMessage("Dossier archivé. Les données scolaires historiques sont conservées."); await loadSchool();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function addFeeAssignment(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/data", { method: "POST", body: JSON.stringify({ action: "addFeeAssignment", title: feeAssignmentForm.title.trim(), amount_xof: Number(feeAssignmentForm.amount_xof), class_id: feeAssignmentForm.target_type === "class" ? feeAssignmentForm.class_id : "", student_id: feeAssignmentForm.target_type === "student" ? feeAssignmentForm.student_id : "", due_date: feeAssignmentForm.due_date || null }) });
      setMessage("Frais scolaire ajouté."); setFeeAssignmentForm({ title: "", amount_xof: "", target_type: "class", class_id: "", student_id: "", due_date: "" }); await loadSchool();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function addStaffMember(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/data", { method: "POST", body: JSON.stringify({ action: "addMember", email: staffForm.email.trim(), role: staffForm.role }) });
      setMessage("Accès ajouté à l’établissement."); setStaffForm({ email: "", role: "teacher" }); await loadSchool();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function updateStaffMember(membershipId: string, role: string) {
    setBusy(true); setError(""); setMessage("");
    try { await api("/api/data", { method: "POST", body: JSON.stringify({ action: "updateMember", membership_id: membershipId, role }) }); setMessage("Rôle mis à jour."); await loadSchool(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function removeStaffMember(member: StaffRow) {
    if (!window.confirm("Désactiver l’accès de " + member.full_name + " à cette école ?")) return;
    setBusy(true); setError(""); setMessage("");
    try { await api("/api/data", { method: "POST", body: JSON.stringify({ action: "removeMember", membership_id: member.id }) }); setMessage("Accès désactivé pour cet établissement."); await loadSchool(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function addClass(e: FormEvent) {
    e.preventDefault(); if (!school) return; const form = e.currentTarget as HTMLFormElement; const data = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/data", { method: "POST", body: JSON.stringify({ action: "addClass", name: String(data.get("name") || "").trim(), level: String(data.get("level") || "CI") }) });
      setMessage("Classe ajoutée."); form.reset(); await loadSchool();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function saveAttendance(e: FormEvent) {
    e.preventDefault(); if (!school) return;
    const classStudents = students.filter(s => s.status === "active" && s.class_id === attendanceClass);
    if (!attendanceClass || classStudents.length === 0) { setError("Sélectionne une classe qui contient des élèves."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/data", { method: "POST", body: JSON.stringify({ action: "saveAttendance", rows: classStudents.map(s => ({ student_id: s.id, attendance_date: attendanceDate, status: attendanceStatus[s.id] ?? "present" })) }) });
      setMessage("Présences enregistrées pour " + classStudents.length + " élève(s)."); await loadAttendance(school.id, attendanceDate);
    } catch (e) { setError("Enregistrement des présences impossible : " + (e as Error).message); } finally { setBusy(false); }
  }
  async function addGrade(e: FormEvent) {
    e.preventDefault(); if (!school) return;
    const score = Number(gradeForm.score), coefficient = Number(gradeForm.coefficient);
    if (!gradeForm.student_id || !gradeForm.subject.trim() || !Number.isFinite(score) || score < 0 || score > 20 || !Number.isFinite(coefficient) || coefficient <= 0) { setError("Vérifie l’élève, la matière, la note (0 à 20) et le coefficient."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/data", { method: "POST", body: JSON.stringify({ action: "addGrade", student_id: gradeForm.student_id, subject: gradeForm.subject.trim(), term: gradeForm.term, score, coefficient, comment: gradeForm.comment.trim() || null }) });
      setMessage("Note enregistrée."); setGradeForm({ student_id: "", subject: "", term: "Trimestre 1", score: "10", coefficient: "1", comment: "" }); setBulletinRefresh(value => value + 1); await loadSchool();
    } catch (e) { setError("Enregistrement de la note impossible : " + (e as Error).message); } finally { setBusy(false); }
  }
  async function addPayment(e: FormEvent) {
    e.preventDefault(); if (!school) return; const amount = Number(feeForm.amount_xof);
    if (!feeForm.student_id || !Number.isSafeInteger(amount) || amount <= 0) { setError("Sélectionne un élève et indique un montant positif en FCFA."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ receipt: string }>("/api/data", { method: "POST", body: JSON.stringify({ action: "addPayment", student_id: feeForm.student_id, amount_xof: amount, payment_method: feeForm.payment_method, note: feeForm.note.trim() || null }) });
      setMessage("Paiement enregistré. Référence du reçu : " + result.receipt); setFeeForm({ student_id: "", amount_xof: "", payment_method: "cash", note: "" }); await loadSchool();
    } catch (e) { setError("Enregistrement du paiement impossible : " + (e as Error).message); } finally { setBusy(false); }
  }
  async function saveSchoolLogo() {
    if (!school) return;
    setLogoSaving(true); setError(""); setMessage("");
    try {
      const result = await api<{ school: SchoolRow }>("/api/data", { method: "POST", body: JSON.stringify({ action: "updateSchoolLogo", logo_data_url: logoDraft || null }) });
      setSchool(current => current ? { ...current, logo_data_url: result.school.logo_data_url ?? null } : current);
      setMessage(logoDraft ? "Logo de l’établissement mis à jour." : "Logo supprimé.");
    } catch (e) { setError("Enregistrement du logo impossible : " + (e as Error).message); }
    finally { setLogoSaving(false); }
  }
  async function signOut() {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } finally { setUser(null); setSchool(null); setStudents([]); setClasses([]); setGrades([]); setPayments([]); }
  }

  const filtered = students.filter(s => (s.first_name + " " + s.last_name + " " + s.student_number).toLowerCase().includes(search.toLowerCase()));
  const selectedClassStudents = students.filter(s => s.status === "active" && s.class_id === attendanceClass);
  const totalRecentPayments = payments.reduce((sum, p) => sum + Number(p.amount_xof || 0), 0);
  const totalOutstanding = feeSummary.reduce((sum, row) => sum + Math.max(0, Number(row.expected_xof || 0) - Number(row.paid_xof || 0)), 0);
  const activeStudentCount = students.filter(s => s.status === "active").length;
  const studentLimitReached = schoolSubscription?.student_limit !== null && schoolSubscription?.student_limit !== undefined && activeStudentCount >= schoolSubscription.student_limit;
  const todayAttendance = attendance.filter(a => a.attendance_date === localDate());
  const activeStudents = students.filter(s => s.status === "active");
  const classEnrollment = classes.map(c => ({ name: c.name, count: activeStudents.filter(s => s.class_id === c.id).length })).sort((a,b) => b.count-a.count).slice(0,6);
  const maxClassEnrollment = Math.max(1, ...classEnrollment.map(c => c.count));
  const attendanceCounts = [
    { label: "Présents", count: attendance.filter(a => a.status === "present").length, color: "#278760" },
    { label: "Absents", count: attendance.filter(a => a.status === "absent").length, color: "#d45c5c" },
    { label: "En retard", count: attendance.filter(a => a.status === "late").length, color: "#d49a32" },
    { label: "Excusés", count: attendance.filter(a => a.status === "excused").length, color: "#6687b8" }
  ];
  const paymentMethodTotals = [
    { label: "Espèces", count: payments.filter(p => p.payment_method === "cash").reduce((sum,p) => sum + Number(p.amount_xof || 0), 0) },
    { label: "Mobile Money", count: payments.filter(p => p.payment_method === "mobile_money").reduce((sum,p) => sum + Number(p.amount_xof || 0), 0) },
    { label: "Virement", count: payments.filter(p => p.payment_method === "bank_transfer").reduce((sum,p) => sum + Number(p.amount_xof || 0), 0) },
    { label: "Autre", count: payments.filter(p => p.payment_method === "other").reduce((sum,p) => sum + Number(p.amount_xof || 0), 0) }
  ];
  const maxPaymentMethod = Math.max(1, ...paymentMethodTotals.map(p => p.count));
  const termAverages = ["Trimestre 1","Trimestre 2","Trimestre 3"].map(term => {
    const termGrades = grades.filter(g => g.term === term);
    const coeff = termGrades.reduce((sum,g) => sum + Number(g.coefficient || 0), 0);
    return { label: term.replace("Trimestre ","T"), average: coeff ? termGrades.reduce((sum,g) => sum + Number(g.score) * Number(g.coefficient), 0) / coeff : 0, count: termGrades.length };
  });
  async function saveAcademicYear(e: FormEvent) {
    e.preventDefault();
    const year = yearDraft.trim();
    if (!/^\d{4}\s*[-/–]\s*\d{4}$/.test(year)) { setError("Saisis une année scolaire au format 2026-2027."); return; }
    setYearSaving(true); setError(""); setMessage("");
    try {
      const result = await api<{ school: SchoolRow }>("/api/data", { method: "POST", body: JSON.stringify({ action: "updateAcademicYear", academic_year: year.replace(/\s+/g, "").replace("/", "-").replace("–", "-") }) });
      setSchool(result.school);
      setClasses(current => current.map(c => ({ ...c, academic_year: result.school.academic_year })));
      setYearDraft(result.school.academic_year);
      setMessage("Année scolaire mise à jour.");
    } catch (e) { setError("Modification de l’année scolaire impossible : " + (e as Error).message); }
    finally { setYearSaving(false); }
  }
  const bulletinStudent = students.find(s => s.id === bulletinStudentId);
  const bulletinCoefficient = bulletinGrades.reduce((sum, g) => sum + Number(g.coefficient), 0);
  const bulletinAverage = bulletinCoefficient > 0
    ? bulletinGrades.reduce((sum, g) => sum + Number(g.score) * Number(g.coefficient), 0) / bulletinCoefficient
    : null;
  const nav: { label: Page; icon: typeof LayoutDashboard }[] = [
    { label: "Accueil", icon: LayoutDashboard }, { label: "Élèves", icon: GraduationCap },
    { label: "Classes", icon: BookOpen }, { label: "Présences", icon: CalendarCheck },
    { label: "Notes", icon: FileText }, { label: "Scolarité", icon: Wallet },
    { label: "Abonnement", icon: CreditCard }, { label: "Personnalisation", icon: Palette }
  ];

  if (loading) return <div className="center-page">Chargement d’ELS SCHOOL MANAGER…</div>;
  if (!user && !showAuth) return <div className="marketing-page">
    <header className="marketing-nav"><Brand/><nav><a href="#fonctionnalites">Fonctionnalités</a><a href="#essai">Essai gratuit</a><a href="#offres">Tarifs</a><button className="marketing-login" onClick={() => { setAuthMode("login"); setShowAuth(true); }}>Connexion</button></nav></header>
    <section className="hero-band"><div className="hero-copy"><span className="marketing-kicker"><Sparkles size={15}/> ELS SCHOOL MANAGER · POUR LES ÉCOLES DU BÉNIN</span><h1>Votre école, mieux organisée. <em>Chaque jour.</em></h1><p>Les inscriptions, les classes, les présences, les notes et les règlements réunis dans un espace clair. Moins de paperasse, plus de maîtrise.</p><div className="trial-highlight"><span className="trial-icon"><CheckCircle2 size={20}/></span><div><strong>14 jours d’essai gratuit</strong><small>Découvrez les fonctionnalités avant de choisir un abonnement.</small></div><span className="trial-no-card">Sans paiement au démarrage</span></div><div className="hero-actions"><button className="marketing-cta" onClick={() => { setAuthMode("signup"); setShowAuth(true); }}>Essayer gratuitement <ArrowRight size={17}/></button><a href="#fonctionnalites">Explorer les fonctionnalités</a></div><div className="hero-proof"><span><ShieldCheck size={17}/> Espace privé par établissement</span><span><CheckCircle2 size={17}/> Simple sur téléphone et ordinateur</span></div></div>
    <div className="hero-visual"><div className="visual-orbit orbit-one"></div><div className="visual-orbit orbit-two"></div><div className="dashboard-preview"><div className="preview-top"><span className="preview-dot"></span><span className="preview-dot"></span><span className="preview-dot"></span><small>ELS SCHOOL · TABLEAU DE BORD</small></div><div className="preview-welcome">Bonjour, Direction <span>Cette année scolaire</span></div><div className="preview-stats"><div><span>Élèves inscrits</span><strong>248</strong><i>↗ Suivi centralisé</i></div><div><span>Classes</span><strong>12</strong><i>Organisation claire</i></div></div><div className="preview-chart"><div><b>Vue d’ensemble</b><span>Activité de l’école</span></div><div className="chart-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></div><div className="preview-row"><span className="preview-check"><CheckCircle2 size={16}/></span><div><b>Suivi des présences</b><small>Tout au même endroit</small></div><span className="preview-pill">Organisé</span></div></div><div className="floating-note"><span><GraduationCap size={18}/></span><div><b>Chaque élève compte</b><small>Un suivi plus simple au quotidien</small></div></div></div></section>
    <div className="trial-ribbon" id="essai"><div><span className="trial-ribbon-number">14</span><div><strong>jours pour tout essayer</strong><small>Créez votre compte et configurez votre école.</small></div></div><button onClick={() => { setAuthMode("signup"); setShowAuth(true); }}>Démarrer mon essai <ArrowRight size={16}/></button></div><div className="trust-strip"><span>ÉCOLES PRIMAIRES</span><span>ÉLÈVES</span><span>CLASSES</span><span>PRÉSENCES</span><span>SCOLARITÉ</span></div>
    <section className="marketing-section" id="fonctionnalites"><div className="section-intro"><span className="marketing-kicker">TOUT L’ESSENTIEL, SANS COMPLEXITÉ</span><h2>Moins de paperasse.<br/><em>Plus de temps pour l’école.</em></h2><p>Les outils dont la direction a besoin, réunis dans une interface facile à prendre en main.</p></div><div className="feature-bands"><article className="feature-band feature-green"><div className="feature-number">01 / INSCRIPTIONS</div><div><GraduationCap size={27}/><h3>Les dossiers élèves, bien rangés.</h3><p>Enregistrez les élèves, retrouvez rapidement leurs informations et affectez-les à une classe.</p></div><div className="feature-mini-list"><span>Matricules organisés</span><span>Recherche rapide</span><span>Classes liées aux dossiers</span></div></article><article className="feature-band feature-cream"><div className="feature-number">02 / SUIVI PÉDAGOGIQUE</div><div><BookOpen size={27}/><h3>Un suivi quotidien plus fluide.</h3><p>Gérez les classes, les présences et les notes sans multiplier les cahiers et les fichiers.</p></div><div className="feature-mini-list"><span>Feuilles de présence</span><span>Notes et moyennes</span><span>Bulletins imprimables</span></div></article><article className="feature-band feature-blue"><div className="feature-number">03 / GESTION</div><div><Wallet size={27}/><h3>Gardez les règlements en vue.</h3><p>Consignez les paiements scolaires et retrouvez les références des reçus en quelques instants.</p></div><div className="feature-mini-list"><span>Montants en FCFA</span><span>Historique des règlements</span><span>Reçus imprimables</span></div></article></div></section>
    <section className="pricing-band" id="offres"><div><span className="marketing-kicker">14 JOURS GRATUITS AVANT ABONNEMENT</span><h2>Testez d’abord. Choisissez ensuite.</h2><p>Découvrez le service avant de sélectionner le forfait adapté à la taille de votre école.</p></div><div className="marketing-prices"><article><span>ESSENTIEL</span><strong>5 000 <small>FCFA / mois</small></strong><p>Jusqu’à 100 élèves</p><small>Après les 14 jours gratuits</small></article><article className="price-featured"><span>STANDARD · POPULAIRE</span><strong>10 000 <small>FCFA / mois</small></strong><p>Jusqu’à 300 élèves</p><small>Après les 14 jours gratuits</small></article><article><span>ILLIMITÉ</span><strong>25 000 <small>FCFA / mois</small></strong><p>Sans limite d’élèves</p><small>Après les 14 jours gratuits</small></article></div><button className="marketing-cta" onClick={() => { setAuthMode("signup"); setShowAuth(true); }}>Commencer mes 14 jours gratuits <ArrowRight size={17}/></button></section>
    <section className="creator-contact" id="contact">
      <div className="creator-copy"><span className="marketing-kicker">UN PROJET EN TÊTE ?</span><h2>Besoin d’un site web ou d’une vitrine professionnelle&nbsp;?</h2><p>Je peux vous accompagner dans la création d’un site web moderne pour votre activité, votre entreprise ou votre commerce. Parlons de votre projet.</p><a className="creator-contact-button" href="https://wa.me/2290140861480?text=Bonjour%20Salvador%2C%20je%20souhaite%20parler%20d%E2%80%99un%20projet%20de%20site%20web." target="_blank" rel="noreferrer">Me contacter sur WhatsApp <ArrowRight size={17}/></a><a className="creator-phone" href="tel:+2290140861480">Téléphone : 01 40 86 14 80</a></div>
      <div className="creator-qr-card"><img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=BEGIN%3AVCARD%0AVERSION%3A3.0%0AFN%3ASalvador%20-%20ELS%0AORG%3AELS%20Web%0ATEL%3BTYPE%3DCELL%3A%2B2290140861480%0ANOTE%3ACr%C3%A9ation%20de%20sites%20web%20et%20vitrines%0AEND%3AVCARD" alt="Code QR pour enregistrer le contact de Salvador ELS" loading="lazy"/><div><strong>Scannez pour me contacter</strong><span>Salvador · Développeur web</span></div></div>
    </section>
    <footer className="marketing-footer"><div className="footer-brand"><Brand/><span>© {new Date().getFullYear()} ELS SCHOOL MANAGER</span></div><div className="footer-credit"><strong>Créé par Salvador</strong><span>Développeur web & informatique</span><a href="https://wa.me/2290140861480?text=Bonjour%20Salvador%2C%20je%20vous%20contacte%20depuis%20ELS%20SCHOOL%20MANAGER." target="_blank" rel="noreferrer">Me contacter · 01 40 86 14 80</a></div><button onClick={() => { setAuthMode("login"); setShowAuth(true); }}>Se connecter</button></footer>
  </div>;
  if (!user) return <div className="auth-scene"><button className="auth-back" onClick={() => { setShowAuth(false); setError(""); setMessage(""); }}>← Retour à l’accueil</button><div className="auth-scene-grid"></div><div className="auth-stage"><div className="auth-fragments fragment-one"></div><div className="auth-fragments fragment-two"></div><div className="auth-fragments fragment-three"></div><div className="auth-fragments fragment-four"></div><section className="auth-card auth-card-3d" key={authMode}><div className="auth-card-glow"></div><Brand/><p className="eyebrow">{authMode === "login" ? "VOTRE ESPACE DE DIRECTION" : "14 JOURS D’ESSAI GRATUIT"}</p><h1>{authMode === "login" ? "Heureux de vous revoir." : "Votre école commence ici."}</h1><p className="muted">{authMode === "login" ? "Retrouvez les informations essentielles de votre établissement." : "Créez votre compte. Vous découvrirez les offres après votre essai."}</p>{authMode === "signup" && <div className="auth-trial-note"><CheckCircle2 size={16}/> 14 jours gratuits · Pas d’abonnement à choisir maintenant</div>}<form onSubmit={submitAuth} className="form-stack">
    {authMode === "signup" && <label>Nom complet<input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nom du directeur ou de la directrice"/></label>}
    <label>Adresse e-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nom@ecole.com"/></label>
    <label>Mot de passe<input type="password" required minLength={10} value={password} onChange={e => setPassword(e.target.value)} placeholder="10 caractères minimum"/></label>
    <button className="primary full" disabled={busy}>{busy ? "Patientez…" : authMode === "login" ? "Se connecter" : "Créer mon compte"}</button></form>
    {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
    <p className="switch-auth">{authMode === "login" ? "Pas encore de compte ?" : "Vous avez déjà un compte ?"} <button onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>{authMode === "login" ? "Créer un compte" : "Se connecter"}</button></p>
  </section></div></div>;

  if (!school) return <div className="center-page"><section className="auth-card"><Brand/><p className="eyebrow">DERNIÈRE ÉTAPE</p><h1>Configure ton école</h1><p className="muted">Le compte est connecté. Donne un nom à ton établissement pour créer ton espace privé.</p><form onSubmit={createSchool} className="form-stack"><label>Nom de l’école<input required minLength={3} maxLength={120} value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="Ex. École Primaire Les Pionniers"/></label><button className="primary full" disabled={busy}>{busy ? "Création…" : "Créer mon établissement"}</button></form>{error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}<button className="link-button" onClick={signOut}>Se déconnecter</button></section></div>;

  return <div className="app-layout" style={{ "--accent": accentColor } as React.CSSProperties}><aside className="sidebar"><Brand/><div className="school-chip"><div className="school-avatar">{school.logo_data_url ? <img src={school.logo_data_url} alt={"Logo de " + school.name}/> : <School size={21}/>}</div><div><small>MON ÉTABLISSEMENT</small><strong>{school.name}</strong><span className="school-year-mini">{school.academic_year}</span></div></div><span className="nav-title">MENU PRINCIPAL</span><nav>{nav.map(n => { const Icon = n.icon; return <button key={n.label} className={page === n.label ? "nav-item active" : "nav-item"} onClick={() => setPage(n.label)}><Icon size={18}/>{n.label}{n.label === "Élèves" && <span className="nav-count">{students.length}</span>}</button>; })}</nav><div className="sidebar-foot"><div className="user-line"><div className="user-avatar">{(user.email ?? "D").slice(0, 1).toUpperCase()}</div><div><strong>{user.user_metadata?.full_name || "Direction"}</strong><small>{user.email}</small></div></div><button className="logout" onClick={signOut}><LogOut size={16}/> Déconnexion</button></div></aside>
    <main className="main"><header className="topbar"><div><span className="muted">Espace école /</span> <strong>{page}</strong></div><div className="topbar-tools"><button className="year-tag year-tag-button" title="Modifier l’année scolaire" onClick={() => { setYearDraft(school.academic_year); setPage("Accueil"); }}>{school.academic_year}</button><button className="theme-quick" title="Personnaliser les couleurs" onClick={() => setPage("Personnalisation")}><Palette size={17}/></button></div></header><div className="content"><div className="page-title"><div><span className="eyebrow">ELS SCHOOL MANAGER</span><h1>{page === "Accueil" ? "Tableau de bord" : page}</h1><p className="muted">{page === "Accueil" ? "Les informations essentielles de ton école." : "Gestion simple de la section " + page.toLowerCase() + "."}</p></div>{page === "Élèves" && <button className="primary" onClick={() => setShowAdd(!showAdd)}><Plus size={17}/> Nouvel élève</button>}</div>
      {error && <div className="alert error">{error}</div>}{message && <div className="alert success">{message}<button onClick={() => setMessage("")}>×</button></div>}
      {page === "Accueil" && <>
        <div className="stats"><Stat icon={<GraduationCap/>} label="Élèves actifs" value={String(activeStudentCount)}/><Stat icon={<BookOpen/>} label="Classes" value={String(classes.length)}/><Stat icon={<Wallet/>} label="Paiements récents" value={money(totalRecentPayments)}/><Stat icon={<ReceiptText/>} label="Reste à recouvrer" value={money(totalOutstanding)}/></div>{studentLimitReached && <div className="alert error">La limite de ton forfait est atteinte ({schoolSubscription?.student_limit} élèves). Passe à un forfait supérieur depuis Abonnement pour inscrire davantage d’élèves.</div>}
        <div className="stats secondary-stats"><Stat icon={<CalendarCheck/>} label="Présences de la date chargée" value={String(attendance.length)}/><Stat icon={<Users/>} label="Année scolaire" value={school.academic_year}/></div>
        <section className="panel year-editor-panel"><div><span className="eyebrow">PARAMÈTRES DE L’ÉCOLE</span><h2>Année scolaire</h2><p>Modifie l’année affichée dans l’application et sur les documents.</p></div><form className="year-editor-form" onSubmit={saveAcademicYear}><label htmlFor="academic-year">Année scolaire</label><input id="academic-year" required value={yearDraft || school.academic_year} onChange={e => setYearDraft(e.target.value)} placeholder="2026-2027" pattern="\d{4}\s*[-/–]\s*\d{4}" title="Exemple : 2026-2027"/><button className="primary" disabled={yearSaving}>{yearSaving ? "Enregistrement…" : "Enregistrer l’année"}</button></form></section>
        <div className="dashboard-charts">
          <section className="panel chart-panel"><div className="panel-head"><div><h2>Inscriptions par classe</h2><p>Répartition des élèves actifs par classe.</p></div><GraduationCap size={21}/></div>{classEnrollment.length ? <div className="chart-list">{classEnrollment.map(item => <div className="chart-row" key={item.name}><div className="chart-label"><span>{item.name}</span><strong>{item.count}</strong></div><div className="chart-track"><i style={{width: (item.count/maxClassEnrollment*100)+"%"}}/></div></div>)}</div> : <p className="chart-empty">Ajoute des classes et inscris des élèves pour voir ce diagramme.</p>}</section>
          <section className="panel chart-panel"><div className="panel-head"><div><h2>Suivi des présences</h2><p>Statuts enregistrés pour la date choisie dans Présences.</p></div><CalendarCheck size={21}/></div>{attendance.length ? <div className="chart-list">{attendanceCounts.map(item => <div className="chart-row" key={item.label}><div className="chart-label"><span>{item.label}</span><strong>{item.count}</strong></div><div className="chart-track"><i style={{width:(item.count/Math.max(1,attendance.length)*100)+"%",background:item.color}}/></div></div>)}</div> : <p className="chart-empty">Enregistre les présences d’une classe pour alimenter ce diagramme.</p>}<button className="link-button" onClick={() => setPage("Présences")}>Gérer les présences →</button></section>
          <section className="panel chart-panel"><div className="panel-head"><div><h2>Encaissements par moyen</h2><p>Montants des règlements récents, en FCFA.</p></div><Wallet size={21}/></div>{totalRecentPayments ? <div className="chart-list">{paymentMethodTotals.map(item => <div className="chart-row" key={item.label}><div className="chart-label"><span>{item.label}</span><strong>{money(item.count)}</strong></div><div className="chart-track"><i style={{width:(item.count/maxPaymentMethod*100)+"%"}}/></div></div>)}</div> : <p className="chart-empty">Les diagrammes se rempliront après les premiers règlements.</p>}<button className="link-button" onClick={() => setPage("Scolarité")}>Voir la scolarité →</button></section>
          <section className="panel chart-panel"><div className="panel-head"><div><h2>Moyennes par trimestre</h2><p>Moyenne pondérée sur 20 à partir des notes saisies.</p></div><FileText size={21}/></div><div className="term-chart">{termAverages.map(term => <div className="term-column" key={term.label}><strong>{term.count ? term.average.toLocaleString("fr-FR",{maximumFractionDigits:1}) : "—"}</strong><div className="term-track"><i style={{height:(term.count ? Math.min(20,Math.max(0,term.average))/20*100 : 0)+"%"}}/></div><span>{term.label}</span><small>{term.count} note(s)</small></div>)}</div><button className="link-button" onClick={() => setPage("Notes")}>Saisir les notes →</button></section>
        </div>
        <section className="panel"><div className="panel-head"><div><h2>Derniers élèves inscrits</h2><p>Les derniers dossiers de ton école.</p></div><button className="link-button" onClick={() => setPage("Élèves")}>Voir les élèves →</button></div><StudentTable rows={students.slice(0, 5)} classes={classes} onEdit={editStudent} onArchive={archiveStudent}/></section>
      </>}
      {page === "Élèves" && <section className="panel"><div className="panel-head"><div><h2>Registre des élèves</h2><p>{students.length} dossier(s) enregistré(s).</p></div><label className="search"><Search size={16}/><input placeholder="Rechercher un élève…" value={search} onChange={e => setSearch(e.target.value)}/></label></div>{showAdd && <form className="student-form" onSubmit={addStudent}><label>Prénom<input required value={studentForm.first_name} onChange={e => setStudentForm({ ...studentForm, first_name: e.target.value })}/></label><label>Nom<input required value={studentForm.last_name} onChange={e => setStudentForm({ ...studentForm, last_name: e.target.value })}/></label><label>Matricule<input value={studentForm.student_number} onChange={e => setStudentForm({ ...studentForm, student_number: e.target.value })} placeholder="Laisser vide pour générer automatiquement"/></label><label>Sexe<select value={studentForm.gender} onChange={e => setStudentForm({ ...studentForm, gender: e.target.value })}><option value="">Non précisé</option><option value="M">Garçon</option><option value="F">Fille</option></select></label><label>Classe<select value={studentForm.class_id} onChange={e => setStudentForm({ ...studentForm, class_id: e.target.value })}><option value="">Non affecté</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}</select></label><button className="primary" disabled={busy}>{busy ? "Enregistrement…" : editingStudentId ? "Enregistrer les modifications" : "Enregistrer l’élève"}</button><button type="button" className="secondary" onClick={() => { setShowAdd(false); setEditingStudentId(null); setStudentForm({ first_name: "", last_name: "", student_number: "", gender: "", class_id: "" }); }}>Annuler</button></form>}<StudentTable rows={filtered} classes={classes} onEdit={editStudent} onArchive={archiveStudent}/></section>}
      {page === "Classes" && <section className="panel"><div className="panel-head"><div><h2>Classes de l’établissement</h2><p>Crée les classes utilisées par ton école.</p></div></div><form className="class-form" onSubmit={addClass}><label>Nom de la classe<input name="name" required placeholder="Ex. CM2 A"/></label><label>Niveau<select name="level"><option>CI</option><option>CP</option><option>CE1</option><option>CE2</option><option>CM1</option><option>CM2</option></select></label><button className="primary" disabled={busy}><Plus size={16}/> Ajouter la classe</button></form><div className="class-grid">{classes.map(c => <div className="class-card" key={c.id}><div className="class-icon"><BookOpen/></div><div><strong>{c.name}</strong><p>{c.level} · {c.academic_year}</p></div></div>)}{classes.length === 0 && <p className="muted">Aucune classe créée. Utilise le formulaire ci-dessus pour commencer.</p>}</div></section>}
      {page === "Présences" && <section className="panel"><div className="panel-head"><div><h2>Feuille de présence</h2><p>Choisis une date et une classe, puis enregistre les statuts des élèves.</p></div></div><form onSubmit={saveAttendance} className="module-form"><label>Date<input type="date" required value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)}/></label><label>Classe<select required value={attendanceClass} onChange={e => setAttendanceClass(e.target.value)}><option value="">Choisir une classe</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} — {c.level}</option>)}</select></label><button className="primary" disabled={busy || !attendanceClass}>{busy ? "Enregistrement…" : "Enregistrer la feuille"}</button></form><div className="attendance-summary"><span><CheckCircle2 size={16}/> {selectedClassStudents.length} élève(s) dans cette classe</span><span>{attendance.filter(a => a.status === "present").length} présent(s) enregistrés à cette date</span></div><div className="table-wrap"><table><thead><tr><th>ÉLÈVE</th><th>MATRICULE</th><th>STATUT DU JOUR</th></tr></thead><tbody>{selectedClassStudents.map(s => <tr key={s.id}><td><strong>{s.first_name} {s.last_name}</strong></td><td>{s.student_number}</td><td><select className="status-select" aria-label={"Présence de " + s.first_name + " " + s.last_name} value={attendanceStatus[s.id] ?? "present"} onChange={e => setAttendanceStatus({ ...attendanceStatus, [s.id]: e.target.value as AttendanceStatus })}><option value="present">Présent</option><option value="absent">Absent</option><option value="late">En retard</option><option value="excused">Excusé</option></select></td></tr>)}</tbody></table>{attendanceClass && selectedClassStudents.length === 0 && <p className="empty">Aucun élève actif dans cette classe.</p>}{!attendanceClass && <p className="empty">Choisis une classe pour afficher les élèves.</p>}</div></section>}
      {page === "Notes" && <section className="panel"><div className="panel-head"><div><h2>Saisie des notes</h2><p>Les notes sont notées sur 20. Elles restent dans l’espace de cet établissement.</p></div></div><form onSubmit={addGrade} className="module-form grade-form"><label>Élève<select required value={gradeForm.student_id} onChange={e => setGradeForm({ ...gradeForm, student_id: e.target.value })}><option value="">Choisir un élève</option>{students.filter(s => s.status === "active").map(s => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}</select></label><label>Matière<input required maxLength={80} value={gradeForm.subject} onChange={e => setGradeForm({ ...gradeForm, subject: e.target.value })} placeholder="Ex. Mathématiques"/></label><label>Période<select value={gradeForm.term} onChange={e => setGradeForm({ ...gradeForm, term: e.target.value })}><option>Trimestre 1</option><option>Trimestre 2</option><option>Trimestre 3</option><option>Composition 1</option><option>Composition 2</option><option>Examen final</option></select></label><label>Note / 20<input type="number" required min="0" max="20" step="0.25" value={gradeForm.score} onChange={e => setGradeForm({ ...gradeForm, score: e.target.value })}/></label><label>Coefficient<input type="number" required min="0.01" step="0.25" value={gradeForm.coefficient} onChange={e => setGradeForm({ ...gradeForm, coefficient: e.target.value })}/></label><label>Commentaire (facultatif)<input maxLength={300} value={gradeForm.comment} onChange={e => setGradeForm({ ...gradeForm, comment: e.target.value })} placeholder="Observation courte"/></label><button className="primary" disabled={busy || students.length === 0}>{busy ? "Enregistrement…" : "Enregistrer la note"}</button></form><div className="panel-head list-heading"><div><h2>Notes récemment saisies</h2><p>Les 100 dernières notes au maximum.</p></div></div><div className="table-wrap"><table><thead><tr><th>ÉLÈVE</th><th>MATIÈRE</th><th>PÉRIODE</th><th>NOTE</th><th>COEFFICIENT</th></tr></thead><tbody>{grades.map(g => <tr key={g.id}><td>{studentLabel(students.find(s => s.id === g.student_id))}</td><td>{g.subject}</td><td>{g.term}</td><td><strong>{Number(g.score).toLocaleString("fr-FR")} / 20</strong></td><td>{Number(g.coefficient).toLocaleString("fr-FR")}</td></tr>)}</tbody></table>{grades.length === 0 && <p className="empty">Aucune note enregistrée.</p>}</div>
        <div className="bulletin-tools no-print"><div className="panel-head list-heading"><div><h2>Préparer un bulletin</h2><p>Choisis un élève et une période pour calculer sa moyenne pondérée et imprimer le bulletin.</p></div></div><div className="module-form grade-form"><label>Élève<select required value={bulletinStudentId} onChange={e => setBulletinStudentId(e.target.value)}><option value="">Choisir un élève</option>{students.filter(s => s.status === "active").map(s => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}</select></label><label>Période<select value={bulletinTerm} onChange={e => setBulletinTerm(e.target.value)}><option>Trimestre 1</option><option>Trimestre 2</option><option>Trimestre 3</option><option>Composition 1</option><option>Composition 2</option><option>Examen final</option></select></label><button type="button" className="primary" disabled={!bulletinStudentId || bulletinGrades.length === 0} onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button></div>{bulletinStudentId && bulletinGrades.length === 0 && <p className="muted">Aucune note saisie pour cet élève sur cette période.</p>}</div>
        {bulletinStudentId && bulletinStudent && bulletinGrades.length > 0 && <div className="bulletin-paper print-area"><div className="report-heading"><span>ELS SCHOOL MANAGER</span><h2>BULLETIN DE NOTES</h2><p>{school.name} · Année scolaire {school.academic_year}</p></div><div className="report-student"><div><small>ÉLÈVE</small><strong>{bulletinStudent.first_name} {bulletinStudent.last_name}</strong><span>Matricule : {bulletinStudent.student_number}</span></div><div><small>CLASSE</small><strong>{classes.find(cl => cl.id === bulletinStudent.class_id)?.name ?? "Non affecté"}</strong><span>{bulletinTerm}</span></div><div><small>MOYENNE PONDÉRÉE</small><strong>{bulletinAverage === null ? "—" : bulletinAverage.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " / 20"}</strong><span>{bulletinGrades.length} évaluation(s)</span></div></div><div className="table-wrap"><table><thead><tr><th>MATIÈRE</th><th>NOTE / 20</th><th>COEFFICIENT</th><th>POINTS PONDÉRÉS</th><th>OBSERVATION</th></tr></thead><tbody>{bulletinGrades.map(g => <tr key={g.id}><td><strong>{g.subject}</strong></td><td>{Number(g.score).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td><td>{Number(g.coefficient).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td><td>{(Number(g.score) * Number(g.coefficient)).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td><td>{g.comment || "—"}</td></tr>)}</tbody></table></div><p className="report-foot">Moyenne calculée à partir des notes et coefficients enregistrés pour la période sélectionnée.</p><div className="signature-lines"><span>Signature de l’enseignant</span><span>Cachet et signature de la direction</span></div></div>}
      </section>}
      {page === "Scolarité" && <><section className="panel"><div className="panel-head"><div><h2>Encaissements et reçus</h2><p>Enregistre les paiements scolaires en FCFA et conserve la référence du reçu.</p></div><div className="fee-total"><small>Total des 100 derniers règlements affichés</small><strong>{money(totalRecentPayments)}</strong></div></div><form onSubmit={addPayment> className="module-form grade-form"><label>Élève<select required value={feeForm.student_id} onChange={e => setFeeForm({ ...feeForm, student_id: e.target.value })}><option value="">Choisir un élève</option>{students.filter(s => s.status === "active").map(s => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}</select></label><label>Montant (FCFA)<input type="number" required min="1" step="1" value={feeForm.amount_xof} onChange={e => setFeeForm({ ...feeForm, amount_xof: e.target.value })} placeholder="Ex. 25000"/></label><label>Moyen de paiement<select value={feeForm.payment_method} onChange={e => setFeeForm({ ...feeForm, payment_method: e.target.value })}><option value="cash">Espèces</option><option value="mobile_money">Mobile Money</option><option value="bank_transfer">Virement bancaire</option><option value="other">Autre</option></select></label><label>Note (facultatif)<input maxLength={300} value={feeForm.note} onChange={e => setFeeForm({ ...feeForm, note: e.target.value })} placeholder="Ex. Première tranche"/></label><button className="primary" disabled={busy || students.length === 0}><ReceiptText size={16}/>{busy ? "Enregistrement…" : "Enregistrer et générer un reçu"}</button></form><div className="panel-head list-heading"><div><h2>Derniers règlements</h2><p>Référence du reçu, élève, date et montant.</p></div></div><div className="table-wrap"><table><thead><tr><th>REÇU</th><th>ÉLÈVE</th><th>DATE</th><th>MOYEN</th><th>MONTANT</th><th className="no-print">REÇU</th></tr></thead><tbody>{payments.map(p => <tr key={p.id}><td><strong>{p.receipt_number}</strong></td><td>{studentLabel(students.find(s => s.id === p.student_id))}</td><td>{new Date(p.paid_at).toLocaleDateString("fr-FR")}</td><td>{p.payment_method === "cash" ? "Espèces" : p.payment_method === "mobile_money" ? "Mobile Money" : p.payment_method === "bank_transfer" ? "Virement" : "Autre"}</td><td><strong>{money(p.amount_xof)}</strong></td><td className="no-print"><button type="button" className="link-button" onClick={() => setSelectedReceipt(p)}>Voir le reçu</button></td></tr>)}</tbody></table>{payments.length === 0 && <p className="empty">Aucun règlement enregistré.</p>}</div>{selectedReceipt && <div className="receipt-paper print-area"><div className="report-heading"><span>ELS SCHOOL MANAGER</span><h2>REÇU DE PAIEMENT</h2><p>{school.name}</p></div><div className="receipt-reference"><small>RÉFÉRENCE DU REÇU</small><strong>{selectedReceipt.receipt_number}</strong></div><div className="receipt-details"><p><span>Élève</span><strong>{studentLabel(students.find(s => s.id === selectedReceipt.student_id))}</strong></p><p><span>Classe</span><strong>{classes.find(cl => cl.id === students.find(s => s.id === selectedReceipt.student_id)?.class_id)?.name ?? "Non affecté"}</strong></p><p><span>Date du règlement</span><strong>{new Date(selectedReceipt.paid_at).toLocaleDateString("fr-FR")}</strong></p><p><span>Moyen de paiement</span><strong>{selectedReceipt.payment_method === "cash" ? "Espèces" : selectedReceipt.payment_method === "mobile_money" ? "Mobile Money" : selectedReceipt.payment_method === "bank_transfer" ? "Virement bancaire" : "Autre"}</strong></p><p><span>Montant encaissé</span><strong>{money(selectedReceipt.amount_xof)}</strong></p>{selectedReceipt.note && <p><span>Motif / note</span><strong>{selectedReceipt.note}</strong></p>}</div><p className="report-foot">Reçu généré par ELS SCHOOL MANAGER. Conservez cette référence pour tout suivi.</p><div className="signature-lines"><span>Signature de la caisse</span><span>Cachet de l’établissement</span></div><button type="button" className="primary no-print" onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button></div>}</section><section className="panel fee-assignment-panel"><div className="panel-head"><div><h2>Frais scolaires attendus</h2><p>Définis les frais par classe ou pour un élève, puis compare les montants attendus aux versements enregistrés.</p></div><Wallet size={22}/></div><form className="module-form grade-form" onSubmit={addFeeAssignment}><label>Intitulé du frais<input required maxLength={120} value={feeAssignmentForm.title} onChange={e => setFeeAssignmentForm({ ...feeAssignmentForm, title: e.target.value })} placeholder="Ex. Frais de scolarité"/></label><label>Montant (FCFA)<input required type="number" min="1" step="1" value={feeAssignmentForm.amount_xof} onChange={e => setFeeAssignmentForm({ ...feeAssignmentForm, amount_xof: e.target.value })}/></label><label>Appliquer à<select value={feeAssignmentForm.target_type} onChange={e => setFeeAssignmentForm({ ...feeAssignmentForm, target_type: e.target.value, class_id: "", student_id: "" })}><option value="class">Une classe entière</option><option value="student">Un élève précis</option></select></label>{feeAssignmentForm.target_type === "class" ? <label>Classe<select required value={feeAssignmentForm.class_id} onChange={e => setFeeAssignmentForm({ ...feeAssignmentForm, class_id: e.target.value })}><option value="">Choisir une classe</option>{classes.map(cl => <option key={cl.id} value={cl.id}>{cl.name} — {cl.level}</option>)}</select></label> : <label>Élève<select required value={feeAssignmentForm.student_id} onChange={e => setFeeAssignmentForm({ ...feeAssignmentForm, student_id: e.target.value })}><option value="">Choisir un élève</option>{students.filter(st => st.status === "active").map(st => <option key={st.id} value={st.id}>{studentLabel(st)}</option>)}</select></label>}<label>Échéance (facultative)<input type="date" value={feeAssignmentForm.due_date} onChange={e => setFeeAssignmentForm({ ...feeAssignmentForm, due_date: e.target.value })}/></label><button className="primary" disabled={busy || (feeAssignmentForm.target_type === "class" ? !feeAssignmentForm.class_id : !feeAssignmentForm.student_id)}>Définir les frais</button></form><div className="table-wrap"><table><thead><tr><th>ÉLÈVE</th><th>FRAIS ATTENDUS</th><th>ENCAISSÉ</th><th>RESTE À PAYER</th></tr></thead><tbody>{feeSummary.map(row => { const expected = Number(row.expected_xof || 0); const paid = Number(row.paid_xof || 0); return <tr key={row.student_id}><td><strong>{row.first_name} {row.last_name}</strong><div className="muted">{row.student_number}</div></td><td>{money(expected)}</td><td>{money(paid)}</td><td><strong className={expected > paid ? "balance-due" : "balance-clear"}>{money(Math.max(0, expected - paid))}</strong></td></tr>; })}</tbody></table>{feeSummary.length === 0 && <p className="empty">Inscris des élèves et définis les frais pour suivre les soldes.</p>}</div><div className="panel-head list-heading"><div><h2>Barème des frais défini</h2><p>Frais attribués à une classe ou à un élève pour l’année {school.academic_year}.</p></div></div><div className="table-wrap"><table><thead><tr><th>INTITULÉ</th><th>DESTINATION</th><th>MONTANT</th><th>ÉCHÉANCE</th></tr></thead><tbody>{feeCharges.map(f => <tr key={f.id}><td><strong>{f.title}</strong></td><td>{f.class_id ? "Classe : " + (f.class_name || "classe") : "Élève : " + [f.first_name,f.last_name].filter(Boolean).join(" ")}</td><td>{money(Number(f.amount_xof))}</td><td>{f.due_date ? new Date(f.due_date).toLocaleDateString("fr-FR") : "—"}</td></tr>)}</tbody></table>{feeCharges.length === 0 && <p className="empty">Aucun frais défini pour cette année.</p>}</div></section></>}
      {page === "Personnalisation" && <><section className="panel branding-panel"><div className="panel-head"><div><span className="eyebrow">IDENTITÉ DE L’ÉTABLISSEMENT</span><h2>Logo de votre école</h2><p>Ajoutez le logo officiel pour personnaliser votre espace.</p></div><ImagePlus size={25}/></div><div className="branding-layout"><div className="logo-preview">{logoDraft ? <img src={logoDraft} alt="Aperçu du logo de l’école"/> : <div className="logo-placeholder"><School size={36}/><span>Votre logo</span></div>}</div><div className="branding-controls"><label className="upload-dropzone" htmlFor="school-logo"><Upload size={20}/><strong>Choisir une image</strong><span>PNG, JPG ou WebP · 1 Mo maximum</span><input id="school-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file=e.target.files?.[0]; if(!file)return; if(!["image/png","image/jpeg","image/webp"].includes(file.type)){setError("Format non pris en charge. Utilise PNG, JPG ou WebP.");e.target.value="";return;} if(file.size>1024*1024){setError("Le logo doit peser 1 Mo maximum.");e.target.value="";return;} const reader=new FileReader(); reader.onload=()=>{if(typeof reader.result==="string")setLogoDraft(reader.result)}; reader.onerror=()=>setError("Impossible de lire cette image."); reader.readAsDataURL(file); }}/></label><p className="muted">Le logo sera enregistré dans l’espace de votre école et apparaîtra dans le menu latéral.</p><div className="branding-actions"><button type="button" className="primary" onClick={saveSchoolLogo} disabled={logoSaving || logoDraft===(school.logo_data_url||"")}>{logoSaving ? "Enregistrement…" : <><Upload size={16}/> Enregistrer le logo</>}</button>{(logoDraft || school.logo_data_url) && <button type="button" className="secondary" onClick={() => setLogoDraft("")}><Settings2 size={15}/> Retirer le logo</button>}</div></div></div></section><section className="panel theme-panel"><div className="panel-head"><div><span className="eyebrow">APPARENCE</span><h2>Couleurs de votre espace</h2><p>Adaptez la couleur principale aux couleurs de votre établissement.</p></div><Palette size={24}/></div><div className="theme-customizer"><div className="theme-color-preview" style={{ background: accentColor }}>{school.logo_data_url ? <img src={school.logo_data_url} alt="" className="theme-preview-logo"/> : <School size={34}/>}<strong>{school.name}</strong><span>Année scolaire {school.academic_year}</span></div><div className="theme-controls"><label htmlFor="accent-color">Couleur principale</label><div className="color-input-row"><input id="accent-color" type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} /><input aria-label="Code hexadécimal de la couleur" value={accentColor} onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setAccentColor(e.target.value)} maxLength={7}/></div><p className="muted">La couleur s’applique aux boutons et aux éléments actifs du menu. Votre choix est conservé sur cet appareil.</p><div className="color-swatches">{[{name:"Bleu professionnel",value:"#2166d1"},{name:"Vert forêt",value:"#15845d"},{name:"Bleu profond",value:"#2457a6"},{name:"Prune",value:"#7942a1"},{name:"Terracotta",value:"#bb583b"},{name:"Noir élégant",value:"#29313d"}].map(color => <button type="button" key={color.value} title={color.name} aria-label={color.name} className={accentColor===color.value?"color-swatch selected":"color-swatch"} style={{background:color.value}} onClick={()=>setAccentColor(color.value)}/>)}</div><button type="button" className="secondary" onClick={()=>setAccentColor("#2166d1")}>Réinitialiser la couleur</button></div></div></section><section className="panel access-panel"><div className="panel-head"><div><span className="eyebrow">ACCÈS À L’ÉTABLISSEMENT</span><h2>Équipe et permissions</h2><p>Ajoute les comptes déjà créés dans ELS SCHOOL et attribue un rôle adapté.</p></div><ShieldCheck size={24}/></div><form className="module-form grade-form" onSubmit={addStaffMember}><label>E-mail du compte<input type="email" required value={staffForm.email} onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} placeholder="enseignant@ecole.bj"/></label><label>Rôle<select value={staffForm.role} onChange={e => setStaffForm({ ...staffForm, role: e.target.value })}><option value="teacher">Enseignant — présences et notes</option><option value="secretary">Secrétariat — inscriptions et classes</option><option value="accountant">Comptabilité — encaissements et frais</option></select></label><button className="primary" disabled={busy}>Ajouter l’accès</button></form><p className="muted">Le compte doit d’abord être créé avec sa propre adresse e-mail. Seule la direction peut modifier les rôles ou désactiver un accès.</p><div className="table-wrap"><table><thead><tr><th>MEMBRE</th><th>RÔLE</th><th>STATUT</th><th>ACTIONS</th></tr></thead><tbody>{staff.map(member => <tr key={member.id}><td><strong>{member.full_name}</strong><div className="muted">{member.email}</div></td><td>{member.role === "school_director" ? "Direction" : <select value={member.role} disabled={!staff.some(s => s.role === "school_director" && s.user_id === user.id) || !member.active || busy} onChange={e => void updateStaffMember(member.id, e.target.value)}><option value="teacher">Enseignant</option><option value="secretary">Secrétariat</option><option value="accountant">Comptabilité</option></select>}</td><td>{member.active ? "Actif" : "Désactivé"}</td><td>{member.role !== "school_director" && member.active && <button type="button" className="link-button" disabled={busy} onClick={() => void removeStaffMember(member)}>Désactiver</button>}</td></tr>)}</tbody></table></div></section></>}
      {page === "Abonnement" && <section className="panel">
        <div className="panel-head"><div><h2>Abonnement de l’établissement</h2><p>Consulte les forfaits mensuels disponibles pour ton établissement.</p></div><div className="fee-total"><small>Élèves actuellement inscrits</small><strong>{students.filter(s => s.status === "active").length}</strong></div></div>
        {subscriptionError && <div className="alert error">{subscriptionError}</div>}
        {paymentMessage && <div className={paymentMessage.startsWith("Retour depuis") ? "alert" : "alert error"} role="status">{paymentMessage}</div>}
        {!subscriptionError && schoolSubscription && <div className="subscription-current">
          <div><span className="eyebrow">FORFAIT ACTUEL</span><h2>{schoolSubscription.plan_code === "essentiel" ? "Essentiel" : schoolSubscription.plan_code === "standard" ? "Standard" : "Illimité"}</h2><p className="muted">{schoolSubscription.status === "trial" ? "Essai gratuit de 14 jours" : schoolSubscription.status === "active" ? "Abonnement actif" : schoolSubscription.status === "past_due" ? "Paiement en retard" : schoolSubscription.status === "cancelled" ? "Abonnement résilié" : schoolSubscription.status === "suspended" ? "Abonnement suspendu" : schoolSubscription.status}</p>{schoolSubscription.status === "trial" && schoolSubscription.current_period_end && <p className="trial-end-date">Fin de l’essai : <strong>{new Date(schoolSubscription.current_period_end).toLocaleDateString("fr-FR")}</strong></p>}</div>
          <div className="fee-total"><small>Tarif mensuel</small><strong>{money(schoolSubscription.monthly_price_xof)}</strong></div>
          <div className="fee-total"><small>Limite du forfait</small><strong>{schoolSubscription.student_limit === null ? "Illimité" : schoolSubscription.student_limit + " élèves"}</strong></div>
        </div>}
        <div className="subscription-plans">{subscriptionPlans.map(plan => {
          const isCurrent = schoolSubscription?.plan_code === plan.code;
          return <article className={isCurrent ? "subscription-plan current" : "subscription-plan"} key={plan.code}>
            {isCurrent && <span className="plan-current"><BadgeCheck size={15}/> Forfait actuel</span>}
            <h3>{plan.name}</h3><p className="plan-price">{money(plan.monthly_price_xof)}<span> / mois</span></p>
            <p>{plan.student_limit === null ? "Nombre illimité d’élèves" : "Jusqu’à " + plan.student_limit + " élèves"}</p>
            <ul><li>Gestion des inscriptions</li><li>Classes, présences et notes</li><li>Paiements scolaires et reçus</li></ul>
            <button type="button" className="primary subscription-pay-button" disabled={paymentBusyPlan !== null} onClick={() => void startSubscriptionPayment(plan.code)}>
              <CreditCard size={16}/>{paymentBusyPlan === plan.code ? "Préparation du paiement…" : isCurrent && schoolSubscription?.status === "active" ? "Renouveler avec SasPay" : "Payer avec SasPay"}
            </button>
          </article>;
        })}</div>
        <div className="subscription-actions"><p className="muted subscription-note">Le forfait ne devient actif qu’après vérification du paiement par le serveur SasPay. Si tu viens de payer, utilise le bouton ci-dessous pour recharger le statut.</p><button type="button" className="secondary" disabled={paymentBusyPlan !== null} onClick={() => setSubscriptionRefresh(value => value + 1)}>Actualiser le statut</button></div>
      </section>}
      <footer>© {new Date().getFullYear()} ELS SCHOOL MANAGER <span>Gestion scolaire primaire · Bénin</span></footer>
    </div></main></div>;
}

function Brand() { return <div className="brand"><div className="brand-mark"><School size={24}/></div><div><strong>ELS SCHOOL</strong><span>MANAGER</span></div></div>; }
function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="stat-card"><div className="stat-icon">{icon}</div><p>{label}</p><strong>{value}</strong></div>; }
function StudentTable({ rows, classes, onEdit, onArchive }: { rows: Student[]; classes: ClassRow[]; onEdit: (student: Student) => void; onArchive: (student: Student) => void }) { return <div className="table-wrap"><table><thead><tr><th>ÉLÈVE</th><th>MATRICULE</th><th>CLASSE</th><th>STATUT</th><th className="no-print">ACTIONS</th></tr></thead><tbody>{rows.map(s => <tr key={s.id}><td><strong>{s.first_name} {s.last_name}</strong></td><td>{s.student_number}</td><td>{classes.find(c => c.id === s.class_id)?.name ?? "Non affecté"}</td><td><span className="pill">{s.status === "active" ? "Inscrit" : s.status === "inactive" ? "Archivé" : s.status}</span></td><td className="no-print">{s.status === "active" && <><button type="button" className="link-button" onClick={() => onEdit(s)}>Modifier</button><button type="button" className="link-button danger-link" onClick={() => onArchive(s)}>Archiver</button></>}</td></tr>)}</tbody></table>{rows.length === 0 && <p className="empty">Aucun élève à afficher pour le moment.</p>}</div>; }
