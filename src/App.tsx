import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from './supabase';
import PracticeAssignments, { MyPracticeCard, PracticeScheduleSummary } from './PracticeAssignments';
import { BookOpen, CalendarDays, ClipboardList, GraduationCap, LogOut, MessageSquareText, Users, Link2, Check, X, TrainFront, LayoutDashboard, FileText, Pencil, Trash2, Plus, BookMarked, Send, ShieldCheck, Star } from 'lucide-react';

type Role='owner'|'teacher'|'conductor';
type User={id:string;name:string;email:string;passwordHash:string;role:Role;linkedUserId?:string|null;rating?:number;profileNote?:string;isSeniorConductor?:boolean};
type CloudProfile={id:string;display_name:string;email:string;role:'lnp'|'viewer';conductor_id:string|null};
type Grade={id:string;studentId:string;subject:string;score:number|string|null;mark:'grade'|'Н'|'cross'|'dash'|'points'|'pass'|'fail';pointsGrade?:number|null;comment:string;date:string;lessonId?:string};
type Lesson={id:string;title:string;date:string|null;details:string;isGradeColumn?:boolean;isCompleted?:boolean};
type TaskAttachment={name:string;path:string;size:number;type:string};
type Task={id:string;title:string;details:string;due:string;done:boolean;lessonId?:string;attachments:TaskAttachment[]};
type Attendance={id:string;lessonId:string;studentId:string;status:'present'|'absent'|'late'};
type DocRecord={id:string;studentId:string;brought:boolean;broughtList:string;issuedList:string;missingList:string;comment:string;uniformIssued:boolean;uniformReturned:boolean;contractReceived:boolean;uniformPickupAt:string;uniformNote:string};
type DocumentConfirmation={conductorId:string;documentsSubmitted:boolean;documentsSubmittedAt:string|null;uniformPickedUp:boolean;uniformPickedUpAt:string|null};
type Note={id:string;studentId:string;body:string;date:string};
type ChatMessage={id:string;channel:'moderators'|'students';sender_id:string;sender_name:string;sender_role:'lnp'|'viewer';body:string;created_at:string};
type PublicDiaryData={person:{id:string;name:string};lessons:{id:string;title:string;date:string|null;details:string;isGradeColumn?:boolean;isCompleted?:boolean}[];grades:{id:string;lessonId:string|null;score:string;comment:string;date:string;isPoints?:boolean;pointsGrade?:number|null}[];homework:{id:string;title:string;details:string;due:string|null;lessonId:string|null;attachments?:TaskAttachment[]}[];document:{brought:boolean;broughtList:string;issuedList:string;missingList:string;comment:string;uniformIssued:boolean;uniformReturned:boolean;uniformPickupAt:string|null;uniformNote:string}|null;documentConfirmation:DocumentConfirmation};
type RatingCriterion={id:string;title:string;sortOrder:number};
type MetricRating={conductorId:string;criterionId:string;score:number};
type DB={users:User[];grades:Grade[];lessons:Lesson[];tasks:Task[];attendance:Attendance[];documents:DocRecord[];documentConfirmations:DocumentConfirmation[];notes:Note[];ratingCriteria:RatingCriterion[];metricRatings:MetricRating[]};
const blank:DB={users:[],grades:[],lessons:[],tasks:[],attendance:[],documents:[],documentConfirmations:[],notes:[],ratingCriteria:[],metricRatings:[]};
const uid=()=>crypto.randomUUID();
const dateNow=()=>new Date().toISOString();
const todayDateInput=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const dateInputValue=(value:string)=>{if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const dateInputToIso=(value:string)=>{if(!value)return '';const [year,month,day]=value.split('-').map(Number);return new Date(year,month-1,day,12,0,0).toISOString();};
const dateOnly=(value:string)=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'});};
async function hashPassword(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');}
const tabs=[
 {id:'grades',label:'Журнал',icon:GraduationCap},{id:'assignments',label:'Назначения',icon:ClipboardList},{id:'rating',label:'Рейтинги',icon:Star},{id:'diary',label:'Дневник',icon:BookOpen},
 {id:'people',label:'Редактор проводников и ЛНП',icon:Users},{id:'chat',label:'Чаты',icon:MessageSquareText},{id:'schedule',label:'Уроки',icon:CalendarDays},
 {id:'documents',label:'Документы и форма',icon:FileText},{id:'notes',label:'Примечания',icon:MessageSquareText},{id:'other',label:'Другое',icon:Link2}
] as const;
type Tab=string;
const roleName=(r:Role)=>r==='owner'?'ЛНП':'Пользователь';
const niceDate=(s:string|null|undefined)=>s?new Date(s).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'}):'Дата и время уточняются';
const initials=(s:string)=>s.trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
export default function App(){
 const [db,setDb]=useState<DB>(blank);
 const [current,setCurrent]=useState<string>('');
 const [profile,setProfile]=useState<CloudProfile|null>(null);
 const [adminProfiles,setAdminProfiles]=useState<CloudProfile[]>([]);
 const [isPrimaryLnp,setIsPrimaryLnp]=useState(false);
 const [publicDiary,setPublicDiary]=useState<PublicDiaryData|null>(null);
 const [publicDiaryError,setPublicDiaryError]=useState('');
 const [inviteCode,setInviteCode]=useState('');
 const [inviteInput,setInviteInput]=useState('');
 const [loading,setLoading]=useState(true);
 const [selectedPersonId,setSelectedPersonId]=useState('');
 const [tab,setTab]=useState<Tab>('grades');
 const [mode,setMode]=useState<'login'|'signup'>('login');
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [signupPersonId,setSignupPersonId]=useState('');
 const [newPersonName,setNewPersonName]=useState('');
 const [editingPersonId,setEditingPersonId]=useState('');
 const [profileNoteEditingId,setProfileNoteEditingId]=useState('');
 const [profileNoteDraft,setProfileNoteDraft]=useState('');
 const [selectedCell,setSelectedCell]=useState<{studentId:string;lessonId:string}|null>(null);
 const [cellValue,setCellValue]=useState('');
 const [cellComment,setCellComment]=useState('');
 const [pointsMode,setPointsMode]=useState(false);
 const [pointsInput,setPointsInput]=useState('');
 const [pointsGrade,setPointsGrade]=useState('10');
 const [savingCell,setSavingCell]=useState(false);
 const savingCellRef=useRef(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [editId,setEditId]=useState('');
 const [student,setStudent]=useState(''),[subject,setSubject]=useState(''),[score,setScore]=useState('10'),[gradeComment,setGradeComment]=useState('');
 const [lessonTitle,setLessonTitle]=useState(''),[lessonDate,setLessonDate]=useState(''),[lessonDetails,setLessonDetails]=useState('');
 const [columnTitle,setColumnTitle]=useState(''),[columnEditId,setColumnEditId]=useState('');
 const [taskTitle,setTaskTitle]=useState(''),[taskDetails,setTaskDetails]=useState(''),[taskDue,setTaskDue]=useState(''),[taskLesson,setTaskLesson]=useState('');
 const [taskFiles,setTaskFiles]=useState<File[]>([]);
 const [homeworkCellLesson,setHomeworkCellLesson]=useState<string|null>(null);
 const [deletingTaskId,setDeletingTaskId]=useState<string|null>(null);
 const [attendanceLesson,setAttendanceLesson]=useState(''),[attendanceStudent,setAttendanceStudent]=useState('');
 const [docStudent,setDocStudent]=useState(''),[docBrought,setDocBrought]=useState(false),[docBroughtList,setDocBroughtList]=useState(''),[docIssued,setDocIssued]=useState(''),[docMissing,setDocMissing]=useState(''),[docComment,setDocComment]=useState('');
 const [docEditingStudent,setDocEditingStudent]=useState('');
 const [docUniformIssued,setDocUniformIssued]=useState(false),[docUniformReturned,setDocUniformReturned]=useState(false),[docContractReceived,setDocContractReceived]=useState(false),[docPickupAt,setDocPickupAt]=useState(''),[docUniformNote,setDocUniformNote]=useState('');
 const [savingDocumentConfirmation,setSavingDocumentConfirmation]=useState(false);
 const [noteStudent,setNoteStudent]=useState(''),[noteText,setNoteText]=useState('');
 const [chatRoom,setChatRoom]=useState<'students'|'moderators'>('students');
 const [chatMessages,setChatMessages]=useState<ChatMessage[]>([]);
 const [chatBody,setChatBody]=useState('');
 const [chatLoading,setChatLoading]=useState(false);
 const [chatSending,setChatSending]=useState(false);
 const linkedPerson=profile?.conductor_id?db.users.find(u=>u.id===profile.conductor_id):db.users.find(u=>u.linkedUserId===profile?.id)||null;
 const user:User|null=profile?{id:linkedPerson?.id||profile.conductor_id||profile.id,name:linkedPerson?.name||profile.display_name,email:profile.email,passwordHash:'',role:profile.role==='lnp'?'owner':'conductor'}:null;
 const canTeach=user?.role==='owner';
 const isOwner=user?.role==='owner';
 const lnpCount=adminProfiles.filter(p=>p.role==='lnp').length;
 const people=db.users.filter(u=>u.role==='conductor');
 const assignmentStats=useMemo(()=>people.map(person=>{
  const metricValues=db.metricRatings.filter(item=>item.conductorId===person.id).map(item=>item.score).filter(value=>Number.isFinite(value)&&value>0);
  const criteriaAverage=metricValues.length?metricValues.reduce((sum,value)=>sum+value,0)/metricValues.length:null;
  const gradeValues=db.grades.filter(item=>item.studentId===person.id&&(item.mark==='grade'||item.mark==='points')).map(item=>{
   const value=item.mark==='points'?Number(item.pointsGrade||0):Number(String(item.score??'').replace(',','.'));
   return Number.isFinite(value)&&value>=1&&value<=10?value:null;
  }).filter(value=>value!==null) as number[];
  const gradeAverage=gradeValues.length?gradeValues.reduce((sum,value)=>sum+value,0)/gradeValues.length:null;
  const attendanceRows=db.attendance.filter(item=>item.studentId===person.id);
  const attendanceRate=attendanceRows.length?attendanceRows.reduce((sum,item)=>sum+(item.status==='present'?1:item.status==='late'?0.5:0),0)/attendanceRows.length*100:null;
  const rating=criteriaAverage;
  let weightedTotal=0;
  let totalWeight=0;
  if(rating!==null){weightedTotal+=rating*0.65;totalWeight+=0.65;}
  if(gradeAverage!==null){weightedTotal+=gradeAverage*10*0.20;totalWeight+=0.20;}
  if(attendanceRate!==null){weightedTotal+=attendanceRate*0.15;totalWeight+=0.15;}
  return {conductorId:person.id,recommendationScore:totalWeight?weightedTotal/totalWeight:null,rating,criteriaAverage,gradeAverage,attendanceRate};
 }),[db.users,db.metricRatings,db.grades,db.attendance]);
 const documentPeople=db.users;
 const journalPeople=people;
 const canUseModeratorChat=profile?.role==='lnp';
 async function loadCloudData(userId:string){
  const [pr,cr,lr,mr,hr,ar,dr,dcr,nr]=await Promise.all([
   supabase.from('profiles').select('id,display_name,email,role,conductor_id').eq('id',userId).single(),
   supabase.from('conductors').select('*').order('full_name'),
   supabase.from('lessons').select('*').order('display_order',{ascending:true}).order('starts_at'),
   supabase.from('marks').select('*'),
   supabase.from('homework').select('*').order('created_at'),
   supabase.from('attendance').select('*'),
   supabase.from('documents').select('*'),
   supabase.from('document_confirmations').select('*'),
   supabase.from('notes').select('*').order('created_at',{ascending:false})
  ]);
  const failure=[pr,cr,lr,mr,hr,ar,dr,dcr,nr].find(x=>x.error);
  if(failure?.error)throw failure.error;
  const p=pr.data as CloudProfile;
  const [noticeRows, criteriaRows, metricRows] = await Promise.all([
   supabase.from('conductor_account_notes').select('conductor_id,message'),
   p.role==='lnp'?supabase.from('conductor_rating_criteria').select('id,title,sort_order').order('sort_order',{ascending:true}).order('title',{ascending:true}) : Promise.resolve({data:[],error:null}),
   p.role==='lnp'?supabase.from('conductor_metric_ratings').select('conductor_id,criterion_id,score') : Promise.resolve({data:[],error:null})
  ]);
  if(noticeRows.error)throw noticeRows.error;
  if(criteriaRows.error)throw criteriaRows.error;
  if(metricRows.error)throw metricRows.error;
  const noteByConductor=new Map((noticeRows.data||[]).map((row:any)=>[row.conductor_id,row.message]));
  const roster=(cr.data||[]).map((x:any):User=>({id:x.id,name:x.full_name,email:'',passwordHash:'',role:x.linked_user_id?'owner':'conductor',linkedUserId:x.linked_user_id,profileNote:String(noteByConductor.get(x.id)||''),isSeniorConductor:!!x.is_senior_conductor}));
  setProfile(p);setTab(p.role==='lnp'?'grades':'diary');
  if(p.role==='lnp'){const primary=await supabase.rpc('is_primary_lnp');setIsPrimaryLnp(!primary.error&&!!primary.data);}else setIsPrimaryLnp(false);
  setDb({
   users:roster,
   ratingCriteria:(criteriaRows.data||[]).map((x:any):RatingCriterion=>({id:x.id,title:x.title,sortOrder:Number(x.sort_order||0)})),
   metricRatings:(metricRows.data||[]).map((x:any):MetricRating=>({conductorId:x.conductor_id,criterionId:x.criterion_id,score:Number(x.score)})),
   grades:(mr.data||[]).map((x:any):Grade=>({id:x.id,studentId:x.conductor_id,lessonId:x.lesson_id,subject:'',score:x.points_value!==null&&x.points_value!==undefined?String(x.points_value):x.value==='Н'||x.value==='✝'?null:x.value,mark:x.points_value!==null&&x.points_value!==undefined?'points':x.value==='Н'?'Н':x.value==='✝'?'cross':x.value==='—'?'dash':x.value==='Зач'?'pass':x.value==='Незач'?'fail':'grade',pointsGrade:x.points_grade===null||x.points_grade===undefined?null:Number(x.points_grade),comment:x.comment||'',date:x.updated_at||''})),
   lessons:(lr.data||[]).map((x:any):Lesson=>({id:x.id,title:x.title,date:x.starts_at||null,details:x.details||'',isGradeColumn:!!x.is_grade_column,isCompleted:!!x.is_completed})),  
   tasks:(hr.data||[]).map((x:any):Task=>({id:x.id,title:x.title,details:x.details||'',due:x.due_date||'',done:false,lessonId:x.lesson_id,attachments:Array.isArray(x.attachments)?x.attachments:[]})), 
   attendance:(ar.data||[]).map((x:any):Attendance=>({id:x.id,lessonId:x.lesson_id,studentId:x.conductor_id,status:x.status})),
   documents:(dr.data||[]).map((x:any):DocRecord=>({id:x.id,studentId:x.conductor_id,brought:!!x.brought,broughtList:x.brought_list||'',issuedList:x.issued_list||'',missingList:x.missing_list||'',comment:x.comment||'',uniformIssued:!!x.uniform_issued,uniformReturned:!!x.uniform_returned,contractReceived:!!x.contract_received,uniformPickupAt:x.uniform_pickup_at||'',uniformNote:x.uniform_note||''})),
   documentConfirmations:(dcr.data||[]).map((x:any):DocumentConfirmation=>({conductorId:x.conductor_id,documentsSubmitted:!!x.documents_submitted,documentsSubmittedAt:x.documents_submitted_at||null,uniformPickedUp:!!x.uniform_picked_up,uniformPickedUpAt:x.uniform_picked_up_at||null})),
   notes:(nr.data||[]).map((x:any):Note=>({id:x.id,studentId:x.conductor_id,body:x.body,date:x.created_at}))
  });
  if(p.role==='lnp'){
   const admins=await supabase.from('profiles').select('id,display_name,email,role,conductor_id').order('created_at');
   if(admins.error)throw admins.error;
   setAdminProfiles((admins.data||[]) as CloudProfile[]);
  }else setAdminProfiles([p]);
 }
 useEffect(()=>{
  let alive=true;
  const init=async()=>{const diaryId=new URLSearchParams(window.location.search).get('diary');if(diaryId){try{const {data,error}=await supabase.rpc('get_public_diary',{p_conductor_id:diaryId});if(error)throw error;setPublicDiary(data as PublicDiaryData);}catch(e){setPublicDiaryError((e as Error).message||'Дневник не найден');}setLoading(false);return;}const {data:{session}}=await supabase.auth.getSession();if(!alive)return;if(session){setCurrent(session.user.id);try{await loadCloudData(session.user.id);}catch(e){setError((e as Error).message);}}setLoading(false);};
  void init();
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(session){setCurrent(session.user.id);window.setTimeout(()=>{void loadCloudData(session.user.id).catch(e=>setError((e as Error).message));},0);}else{setCurrent('');setProfile(null);setAdminProfiles([]);setIsPrimaryLnp(false);setDb(blank);setLoading(false);}});
  return()=>{alive=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  if(tab!=='chat'||!current||!profile)return;
  let active=true;
  setChatLoading(true);setChatMessages([]);
  const loadMessages=async()=>{
   const {data,error}=await supabase.from('chat_messages').select('id,channel,sender_id,sender_name,sender_role,body,created_at').eq('channel',chatRoom).order('created_at',{ascending:false}).limit(200);
   if(!active)return;
   if(error){setError('Не удалось загрузить чат: '+error.message);setChatMessages([]);}else setChatMessages(((data||[]) as ChatMessage[]).reverse());
   setChatLoading(false);
  };
  void loadMessages();
  const channel=supabase.channel('journal-chat-'+chatRoom+'-'+current)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:'channel=eq.'+chatRoom},payload=>{
    const message=payload.new as ChatMessage;
    if(!active||message.channel!==chatRoom)return;
    setChatMessages(previous=>previous.some(item=>item.id===message.id)?previous:[...previous,message].slice(-200));
   })
   .on('postgres_changes',{event:'DELETE',schema:'public',table:'chat_messages'},payload=>{
    const deletedId=(payload.old as {id?:string})?.id;
    if(!active||!deletedId)return;
    setChatMessages(previous=>previous.filter(item=>item.id!==deletedId));
   })
   .subscribe();
  return()=>{active=false;void supabase.removeChannel(channel);};
 },[tab,chatRoom,current,profile?.role]);
 async function sendChatMessage(e:FormEvent){
  e.preventDefault();const body=chatBody.trim();if(!body||!current||chatSending)return;
  setChatSending(true);setError('');
  try{
   const {data,error}=await supabase.from('chat_messages').insert({channel:chatRoom,sender_id:current,body}).select('id,channel,sender_id,sender_name,sender_role,body,created_at').single();
   if(error)throw error;
   const message=data as ChatMessage;
   setChatMessages(previous=>previous.some(item=>item.id===message.id)?previous:[...previous,message].slice(-200));
   setChatBody('');
  }catch(e){setError('Не удалось отправить сообщение: '+((e as Error).message||'ошибка'));}
  finally{setChatSending(false);}
 }
 async function deleteChatMessage(id:string){
  if(!window.confirm('Удалить это сообщение?'))return;
  const {data,error}=await supabase.from('chat_messages').delete().eq('id',id).select('id');
  if(error){setError('Не удалось удалить сообщение: '+error.message);return;}
  if(!data?.length){setError('Сообщение не удалено: нет прав на удаление.');return;}
  setChatMessages(previous=>previous.filter(item=>item.id!==id));
 }
 const patch=async(part:Partial<DB>):Promise<boolean>=>{
  const next={...db,...part};setDb(next);
  try{
   const mappings:any={
    users:{table:'conductors',rows:(xs:User[])=>xs.map(x=>({id:x.id,full_name:x.name,linked_user_id:x.linkedUserId||null,created_by:current||null}))},
    grades:{table:'marks',rows:(xs:Grade[])=>xs.map(x=>({id:x.id,conductor_id:x.studentId,lesson_id:x.lessonId,value:x.mark==='Н'?'Н':x.mark==='cross'?'✝':x.mark==='dash'?'—':String(x.score),points_value:x.mark==='points'?Number(String(x.score).replace(',','.')):null,points_grade:x.mark==='points'?Number(x.pointsGrade):null,comment:x.comment||'',created_by:current||null}))},
    lessons:{table:'lessons',rows:(xs:Lesson[])=>xs.map((x,index)=>({id:x.id,title:x.title,starts_at:x.date||null,details:x.details,is_grade_column:!!x.isGradeColumn,is_completed:!!x.isCompleted,display_order:index+1,created_by:current||null}))}, 
    tasks:{table:'homework',rows:(xs:Task[])=>xs.filter(x=>x.lessonId).map(x=>({id:x.id,lesson_id:x.lessonId,title:x.title,details:x.details,due_date:x.due||null,is_done:false,attachments:x.attachments||[],created_by:current||null}))}, 
    attendance:{table:'attendance',conflict:'lesson_id,conductor_id',rows:(xs:Attendance[])=>xs.map(x=>({id:x.id,lesson_id:x.lessonId,conductor_id:x.studentId,status:x.status,created_by:current||null}))},
    documents:{table:'documents',conflict:'conductor_id',rows:(xs:DocRecord[])=>xs.map(x=>({id:x.id,conductor_id:x.studentId,brought:x.brought,brought_list:x.broughtList,issued_list:x.issuedList,missing_list:x.missingList,comment:x.comment,uniform_issued:x.uniformIssued,uniform_returned:x.uniformReturned,contract_received:x.contractReceived,uniform_pickup_at:x.uniformPickupAt||null,uniform_note:x.uniformNote||''}))}, 
    notes:{table:'notes',rows:(xs:Note[])=>xs.map(x=>({id:x.id,conductor_id:x.studentId,body:x.body,created_by:current||null}))}
   };
   for(const key of Object.keys(part) as (keyof DB)[]){
    const cfg=mappings[key];if(!cfg)continue;
    const oldRows=(db[key] as any[])||[],newRows=(next[key] as any[])||[];
    const rows=cfg.rows(newRows);
    if(rows.length){const {error}=await supabase.from(cfg.table).upsert(rows,cfg.conflict?{onConflict:cfg.conflict}:undefined);if(error)throw error;}
    const retained=new Set(newRows.map((x:any)=>x.id));
    for(const removed of oldRows.filter((x:any)=>!retained.has(x.id))){const {error}=await supabase.from(cfg.table).delete().eq('id',removed.id);if(error)throw error;}
   }
   return true;
  }catch(e){setError('Не удалось сохранить изменения в базе: '+((e as Error).message||'ошибка'));void loadCloudData(current);return false;}
 };
 const flash=(s:string)=>{setNotice(s);setError('');};
 async function auth(e:FormEvent){e.preventDefault();setError('');setNotice('');try{
  const normalized=email.trim().toLowerCase();
  if(!normalized||password.length<6)throw new Error('Укажи почту и пароль не короче 6 символов');
  if(mode==='signup'){
   const {data,error}=await supabase.auth.signUp({email:normalized,password,options:{emailRedirectTo:window.location.origin+window.location.pathname,data:{full_name:name.trim()||normalized.split('@')[0]}}});
   if(error)throw error;
   if(data.session){
    setCurrent(data.session.user.id);
    const claim=await supabase.rpc('claim_first_lnp');
    if(claim.error)throw claim.error;
    await loadCloudData(data.session.user.id);
    flash(claim.data?'Создан аккаунт первого ЛНП':'Аккаунт создан. Выбери себя из списка проводников.');
   }else flash('Проверь почту и подтверди регистрацию. После входа выберешь себя в списке проводников.');
  }else{
   const {data,error}=await supabase.auth.signInWithPassword({email:normalized,password});
   if(error)throw error;
   if(!data.user)throw new Error('Не удалось войти');
   setCurrent(data.user.id);
   const claim=await supabase.rpc('claim_first_lnp');
   if(claim.error)throw claim.error;
   await loadCloudData(data.user.id);
   flash(claim.data?'Тебе назначены права первого ЛНП':'Вход выполнен');
  }
 }catch(e){setError((e as Error).message||'Не удалось выполнить действие');}}

 async function logout(){await supabase.auth.signOut();setCurrent('');setProfile(null);setPassword('');setTab('grades');}
 async function addPerson(e:FormEvent){e.preventDefault();const fullName=newPersonName.trim();if(!fullName)return;try{if(editingPersonId){const person=db.users.find(x=>x.id===editingPersonId);const {error}=await supabase.from('conductors').update({full_name:fullName}).eq('id',editingPersonId);if(error)throw error;if(person?.linkedUserId){const {error:profileError}=await supabase.from('profiles').update({display_name:fullName}).eq('id',person.linkedUserId);if(profileError)throw profileError;}}else{const {error}=await supabase.from('conductors').insert({full_name:fullName,created_by:current});if(error)throw error;}await loadCloudData(current);setNewPersonName('');setEditingPersonId('');flash(editingPersonId?'Имя участника изменено':'Проводник добавлен в журнал');}catch(e){setError((e as Error).message);}}
 function editPerson(p:User){setEditingPersonId(p.id);setNewPersonName(p.name);}
 async function saveProfileNote(e:FormEvent){e.preventDefault();if(!profileNoteEditingId)return;const clean=profileNoteDraft.trim();const {error}=await supabase.from('conductor_account_notes').upsert({conductor_id:profileNoteEditingId,message:clean,updated_by:current},{onConflict:'conductor_id'});if(error){setError('Не удалось сохранить примечание профиля: '+error.message);return;}setDb(previous=>({...previous,users:previous.users.map(person=>person.id===profileNoteEditingId?{...person,profileNote:clean}:person)}));setProfileNoteEditingId('');setProfileNoteDraft('');flash('Примечание для аккаунта сохранено');}
 async function saveMetricRating(conductorId:string,criterionId:string,raw:string):Promise<boolean>{
  const clean=raw.trim();const value=clean?Number(clean):0;
  if(clean&&(!Number.isInteger(value)||value<1||value>100)){setError('Каждый показатель оценивается целым числом от 1 до 100.');return false;}
  const result=value===0
   ?await supabase.from('conductor_metric_ratings').delete().eq('conductor_id',conductorId).eq('criterion_id',criterionId)
   :await supabase.from('conductor_metric_ratings').upsert({conductor_id:conductorId,criterion_id:criterionId,score:value,updated_by:current},{onConflict:'conductor_id,criterion_id'});
  if(result.error){setError('Не удалось сохранить показатель: '+result.error.message);return false;}
  setDb(previous=>({...previous,metricRatings:value===0
   ?previous.metricRatings.filter(item=>!(item.conductorId===conductorId&&item.criterionId===criterionId))
   :[...previous.metricRatings.filter(item=>!(item.conductorId===conductorId&&item.criterionId===criterionId)),{conductorId,criterionId,score:value}]}));
  flash('Показатель сохранён');return true;
 }
 async function removePerson(id:string){const p=db.users.find(x=>x.id===id);if(!p||!window.confirm('Удалить '+p.name+' и все связанные с ним записи?'))return;const {error}=await supabase.from('conductors').delete().eq('id',id);if(error){setError(error.message);return;}await loadCloudData(current);flash('Проводник удалён');}
 function resetGrade(){setEditId('');setStudent('');setSubject('');setScore('10');setGradeComment('');}
 function saveGrade(e:FormEvent){e.preventDefault();if(!user||!student||!subject.trim())return;
  const item:Grade={id:editId||uid(),studentId:student,subject:subject.trim(),score:score==='Н'?null:Number(score),mark:score==='Н'?'Н':'grade',comment:gradeComment.trim(),date:editId?(db.grades.find(x=>x.id===editId)?.date||dateNow()):dateNow()};
  patch({grades:editId?db.grades.map(x=>x.id===editId?item:x):[item,...db.grades]});resetGrade();flash('Оценка сохранена');
 }
 function editGrade(g:Grade){setEditId(g.id);setStudent(g.studentId);setSubject(g.subject);setScore(g.mark==='Н'?'Н':g.mark==='cross'?'✝':String(g.score));setGradeComment(g.comment);window.scrollTo({top:0,behavior:'smooth'});}
 function saveLesson(e:FormEvent){e.preventDefault();const item:Lesson={id:editId||uid(),title:lessonTitle.trim(),date:lessonDate?new Date(lessonDate).toISOString():null,details:lessonDetails.trim(),isGradeColumn:false,isCompleted:db.lessons.find(x=>x.id===editId)?.isCompleted||false};patch({lessons:editId?db.lessons.map(x=>x.id===editId?item:x):[...db.lessons,item].sort((a,b)=>(a.date||'').localeCompare(b.date||''))});setEditId('');setLessonTitle('');setLessonDate('');setLessonDetails('');flash(lessonDate?'Занятие сохранено':'Занятие добавлено без даты. Дату и время можно указать позже.');}
 function editLesson(l:Lesson){setEditId(l.id);setLessonTitle(l.title);setLessonDate(l.date?new Date(l.date).toISOString().slice(0,16):'');setLessonDetails(l.details);}
 function markLessonCompleted(l:Lesson){void patch({lessons:db.lessons.map(x=>x.id===l.id?{...x,isCompleted:!x.isCompleted}:x)});flash(l.isCompleted?'Урок возвращён в активные':'Урок отмечен как проведённый');}
 function addGradeColumn(){const title=columnTitle.trim()||' ';const item:Lesson={id:uid(),title,date:dateNow(),details:'',isGradeColumn:true};void patch({lessons:[...db.lessons,item]});setColumnTitle('');flash('Колонка для оценок добавлена');}
 function reorderJournalColumn(sourceId:string,targetId:string){if(!sourceId||sourceId===targetId)return;const from=db.lessons.findIndex(l=>l.id===sourceId),to=db.lessons.findIndex(l=>l.id===targetId);if(from<0||to<0)return;const ordered=[...db.lessons];const [moved]=ordered.splice(from,1);ordered.splice(to,0,moved);void patch({lessons:ordered});flash('Порядок колонок сохранён');}
 function deleteGradeColumn(id:string){const column=db.lessons.find(l=>l.id===id);if(!column?.isGradeColumn)return;if(!window.confirm('Удалить колонку «'+column.title+'» и все оценки в ней?'))return;void patch({grades:db.grades.filter(g=>g.lessonId!==id),lessons:db.lessons.filter(l=>l.id!==id)});flash('Колонка и оценки в ней удалены');}
 function renameGradeColumn(id:string,title:string){const clean=title.trim();if(!clean){setColumnEditId('');return;}void patch({lessons:db.lessons.map(l=>l.id===id?{...l,title:clean}:l)});setColumnEditId('');setColumnTitle('');flash('Название колонки изменено');}
 async function saveTask(e:FormEvent){e.preventDefault();if(!taskLesson||!taskTitle.trim())return;const id=editId||uid();const attachments=[...(db.tasks.find(x=>x.id===editId)?.attachments||[])];try{for(const file of taskFiles){if(file.size>50*1024*1024)throw new Error('Файл «'+file.name+'» больше 50 МБ. Уменьши файл или раздели его.');const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=current+'/'+id+'/'+uid()+'-'+safe;const {error}=await supabase.storage.from('homework-files').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});if(error)throw error;attachments.push({name:file.name,path,size:file.size,type:file.type||'application/octet-stream'});}const item:Task={id,title:taskTitle.trim(),details:taskDetails.trim(),due:taskDue,lessonId:taskLesson,done:false,attachments};await patch({tasks:editId?db.tasks.map(x=>x.id===editId?item:x):[item,...db.tasks]});setEditId('');setTaskTitle('');setTaskDetails('');setTaskDue('');setTaskLesson('');setTaskFiles([]);setHomeworkCellLesson(null);flash('Домашнее задание сохранено');}catch(e){setError((e as Error).message||'Не удалось прикрепить файл');}}
 function editTask(t:Task){setEditId(t.id);setTaskTitle(t.title);setTaskDetails(t.details);setTaskDue(t.due);setTaskLesson(t.lessonId||'');setTaskFiles([]);}
 function openHomeworkCell(lessonId:string){const existing=db.tasks.find(t=>t.lessonId===lessonId);setHomeworkCellLesson(lessonId);setEditId(existing?.id||'');setTaskTitle(existing?.title||'');setTaskDetails(existing?.details||'');setTaskDue(existing?.due||'');setTaskLesson(lessonId);setTaskFiles([]);}
 function closeHomeworkCell(){setHomeworkCellLesson(null);setEditId('');setTaskTitle('');setTaskDetails('');setTaskDue('');setTaskLesson('');setTaskFiles([]);}
 async function deleteHomeworkTask(id:string){
  if(!window.confirm('Удалить это домашнее задание вместе с прикреплёнными файлами?'))return;
  const task=db.tasks.find(x=>x.id===id);
  if(!task){setError('Домашнее задание уже отсутствует в журнале.');return;}
  setDeletingTaskId(id);setError('');
  try{
   const {data:deletedRows,error}=await supabase.from('homework').delete().eq('id',id).select('id');
   if(error)throw error;
   if(!deletedRows?.length)throw new Error('База не подтвердила удаление. Проверь, что ты вошёл под аккаунтом ЛНП.');
   setDb(prev=>({...prev,tasks:prev.tasks.filter(x=>x.id!==id)}));
   closeHomeworkCell();
   const paths=(task.attachments||[]).map(a=>a.path).filter(Boolean);
   if(paths.length){
    const {error:fileError}=await supabase.storage.from('homework-files').remove(paths);
    if(fileError){setError('Задание удалено, но файл не удалось очистить из хранилища: '+fileError.message);return;}
   }
   flash('Домашнее задание и прикреплённые файлы удалены');
  }catch(e){setError('Не удалось удалить домашнее задание: '+((e as Error).message||'ошибка'));}
  finally{setDeletingTaskId(null);}
 }
 async function openTaskAttachment(path:string){const {data,error}=await supabase.storage.from('homework-files').createSignedUrl(path,120);if(error){setError('Не удалось открыть файл: '+error.message);return;}window.open(data.signedUrl,'_blank','noopener,noreferrer');}
 async function saveDoc(e:FormEvent){e.preventDefault();if(!docStudent)return;const old=db.documents.find(x=>x.studentId===docStudent);const item:DocRecord={id:old?.id||uid(),studentId:docStudent,brought:docBrought,broughtList:docBroughtList.trim(),issuedList:docIssued.trim(),missingList:docMissing.trim(),comment:docComment.trim(),uniformIssued:docUniformIssued,uniformReturned:docUniformReturned,contractReceived:docContractReceived,uniformPickupAt:'',uniformNote:''};const saved=await patch({documents:old?db.documents.map(x=>x.studentId===docStudent?item:x):[...db.documents,item]});if(!saved)return;setDocEditingStudent('');setEditId('');await loadCloudData(current);flash('Карточка участника сохранена');}
 function editDoc(d:DocRecord){setDocEditingStudent(d.studentId);setDocStudent(d.studentId);setDocBrought(d.brought);setDocBroughtList(d.broughtList);setDocIssued(d.issuedList);setDocMissing(d.missingList);setDocComment(d.comment);setDocUniformIssued(d.uniformIssued);setDocUniformReturned(d.uniformReturned);setDocContractReceived(d.contractReceived);}
 function cancelDocEdit(){setDocEditingStudent('');setDocStudent('');setDocBrought(false);setDocBroughtList('');setDocIssued('');setDocMissing('');setDocComment('');setDocUniformIssued(false);setDocUniformReturned(false);setDocContractReceived(false);}
 function emptyDocFor(studentId:string):DocRecord{return {id:'',studentId,brought:false,broughtList:'',issuedList:'',missingList:'',comment:'',uniformIssued:false,uniformReturned:false,contractReceived:false,uniformPickupAt:'',uniformNote:''};}
 async function updateStudentDocumentConfirmation(field:'documents'|'uniform',checked:boolean){
   if(!profile||profile.role!=='viewer'||!profile.conductor_id||!current)return;
   if(savingDocumentConfirmation)return;
   setSavingDocumentConfirmation(true);setError('');setNotice('');
   const conductorId=profile.conductor_id;
   try{
    const {data,error}=await supabase.rpc('update_public_document_confirmation',{p_conductor_id:conductorId,p_field:field,p_checked:checked});
    if(error)throw error;
    const updated=data as DocumentConfirmation;
    setDb(previousDb=>{
     const oldDoc=previousDb.documents.find(x=>x.studentId===conductorId)||emptyDocFor(conductorId);
     const nextDoc:DocRecord={...oldDoc,brought:field==='documents'?checked:oldDoc.brought,uniformIssued:field==='uniform'?checked:oldDoc.uniformIssued};
     return {...previousDb,documents:[...previousDb.documents.filter(x=>x.studentId!==conductorId),nextDoc],documentConfirmations:[...previousDb.documentConfirmations.filter(x=>x.conductorId!==conductorId),updated]};
    });
    flash(field==='documents'?(checked?'Документы собраны':'Отметка о сдаче документов снята'):(checked?'Форма выдана':'Отметка о получении формы снята'));
   }catch(e){setError('Не удалось сохранить отметку: '+((e as Error).message||'ошибка'));}
   finally{setSavingDocumentConfirmation(false);}
  }
  function saveNote(e:FormEvent){e.preventDefault();if(!user||!noteStudent||!noteText.trim())return;patch({notes:[{id:uid(),studentId:noteStudent,body:noteText.trim(),date:dateNow()},...db.notes]});setNoteText('');flash('Примечание добавлено');}
 function editMatrixCell(studentId:string,lessonId:string){const existing=db.grades.find(g=>g.studentId===studentId&&g.lessonId===lessonId);setSelectedCell({studentId,lessonId});setCellValue(existing&&existing.mark!=='points'?(existing.mark==='Н'?'Н':existing.mark==='cross'?'':String(existing.score??'')):'');setCellComment(existing?.comment||'');setPointsMode(existing?.mark==='points');setPointsInput(existing?.mark==='points'?String(existing.score??''):'');setPointsGrade(existing?.pointsGrade?String(existing.pointsGrade):'10');setError('');}
 function chooseMatrixValue(value:string){setCellValue(value);setError('');}
 async function saveMatrixCell(){
  if(!selectedCell||savingCellRef.current)return;
  savingCellRef.current=true;setSavingCell(true);setError('');
  const {studentId,lessonId}=selectedCell;
  try{
   let savedGrade:Grade|null=null;
   if(pointsMode){
    const raw=pointsInput.trim().replace(',','.');
    const value=Number(raw);
    const grade=Number(pointsGrade);
    if(!raw||!Number.isFinite(value)||value<0)throw new Error('Введи количество баллов — ноль или положительное число.');
    if(!Number.isInteger(grade)||grade<1||grade>10)throw new Error('Выбери отметку от 1 до 10, соответствующую баллам.');
    const {data,error}=await supabase.from('marks').upsert({
     conductor_id:studentId,
     lesson_id:lessonId,
     value:raw,
     points_value:value,
     points_grade:grade,
     comment:cellComment.trim(),
     created_by:current||null,
     updated_at:dateNow()
    },{onConflict:'conductor_id,lesson_id'}).select('id,conductor_id,lesson_id,value,points_value,points_grade,comment,updated_at').single();
    if(error)throw error;
    savedGrade={id:data.id,studentId:data.conductor_id,lessonId:data.lesson_id,subject:db.lessons.find(l=>l.id===lessonId)?.title||'Занятие',score:String(data.points_value),mark:'points',pointsGrade:Number(data.points_grade),comment:data.comment||'',date:data.updated_at||dateNow()};
   }else{
    const normalized=cellValue.trim().toUpperCase();
    if(normalized===''){
     const {error}=await supabase.from('marks').delete().eq('conductor_id',studentId).eq('lesson_id',lessonId);
     if(error)throw error;
     setDb(previous=>({...previous,grades:previous.grades.filter(g=>!(g.studentId===studentId&&g.lessonId===lessonId))}));
     setSelectedCell(null);flash('Ячейка очищена');return;
    }
    const allowed=normalized==='Н'||normalized==='—'||normalized==='ЗАЧ'||normalized==='НЕЗАЧ'||/^(?:[1-9]|10)$/.test(normalized);
    if(!allowed)throw new Error('Выбери одну оценку от 1 до 10, «Н», «—», «Зач» или «Незач». Дробные оценки отключены, чтобы цифры не объединялись случайно.');
    const storedValue=normalized==='ЗАЧ'?'Зач':normalized==='НЕЗАЧ'?'Незач':normalized;
    const {data,error}=await supabase.from('marks').upsert({
     conductor_id:studentId,
     lesson_id:lessonId,
     value:storedValue,
     points_value:null,
     points_grade:null,
     comment:cellComment.trim(),
     created_by:current||null,
     updated_at:dateNow()
    },{onConflict:'conductor_id,lesson_id'}).select('id,conductor_id,lesson_id,value,points_value,points_grade,comment,updated_at').single();
    if(error)throw error;
    const value=data.value;
    savedGrade={
     id:data.id,
     studentId:data.conductor_id,
     lessonId:data.lesson_id,
     subject:db.lessons.find(l=>l.id===lessonId)?.title||'Занятие',
     score:value==='Н'||value==='✝'?null:value,
     mark:value==='Н'?'Н':value==='✝'?'cross':value==='—'?'dash':value==='Зач'?'pass':value==='Незач'?'fail':'grade',
     pointsGrade:null,
     comment:data.comment||'',
     date:data.updated_at||dateNow()
    };
   }
   if(savedGrade){
    setDb(previous=>({...previous,grades:[...previous.grades.filter(g=>!(g.studentId===studentId&&g.lessonId===lessonId)),savedGrade!]}));
    setSelectedCell(null);
    flash(pointsMode?'Баллы и соответствующая отметка сохранены':savedGrade.mark==='Н'?'Отсутствие отмечено':savedGrade.mark==='pass'?'Зачёт отмечен':savedGrade.mark==='fail'?'Незачёт отмечен':'Оценка сохранена');
   }
  }catch(e){
   setError('Не удалось сохранить оценку: '+((e as Error).message||'ошибка'));
  }finally{
   savingCellRef.current=false;setSavingCell(false);
  }
 }
 function markAttendance(status:Attendance['status']){if(!attendanceLesson||!attendanceStudent)return;const old=db.attendance.find(x=>x.lessonId===attendanceLesson&&x.studentId===attendanceStudent);const item:Attendance={id:old?.id||uid(),lessonId:attendanceLesson,studentId:attendanceStudent,status};void patch({attendance:[...db.attendance.filter(x=>x.id!==item.id),item]});flash('Посещаемость отмечена');}
 async function remove(key:'grades'|'lessons'|'tasks'|'documents'|'notes',id:string){if(!window.confirm('Удалить эту запись?'))return;if(key==='tasks'){const task=db.tasks.find(x=>x.id===id);const paths=(task?.attachments||[]).map(a=>a.path);if(paths.length){const {error}=await supabase.storage.from('homework-files').remove(paths);if(error){setError('Не удалось удалить прикреплённые файлы: '+error.message);return;}}}const next={...db,[key]:db[key].filter(x=>x.id!==id)} as DB;void patch({[key]:next[key]} as Partial<DB>);flash('Запись удалена');}
 async function promote(id:string){setError('');const {error}=await supabase.rpc('promote_to_lnp',{target_user_id:id});if(error){setError('Не удалось назначить второго ЛНП: '+error.message);return;}await loadCloudData(current);flash('Пользователь назначен вторым ЛНП');}
 async function createInvite(){setError('');const {data,error}=await supabase.rpc('create_second_lnp_invite');if(error){setError(error.message);return;}setInviteCode(data as string);}
 async function redeemInvite(){setError('');const {error}=await supabase.rpc('redeem_second_lnp_invite',{invite_code:inviteInput});if(error){setError(error.message);return;}setInviteInput('');await loadCloudData(current);flash('Приглашение подтверждено. Ты назначен вторым ЛНП.');}
 const myGrades=useMemo(()=>db.grades.filter(g=>g.studentId===user?.id),[db.grades,user?.id]);
 const myAttendance=useMemo(()=>db.attendance.filter(a=>a.studentId===user?.id),[db.attendance,user?.id]);
 async function linkConductor(){if(!selectedPersonId)return;const {error}=await supabase.from('profiles').update({conductor_id:selectedPersonId}).eq('id',current);if(error){setError(error.message);return;}await loadCloudData(current);flash('Аккаунт привязан к записи в журнале');}
 if(loading)return <main className="auth-wrap"><section className="auth-card"><p>Загружаем журнал…</p></section></main>;
 if(new URLSearchParams(window.location.search).has('diary'))return <PublicDiaryPage data={publicDiary} error={publicDiaryError}/>;
 if(profile?.role==='viewer'&&!['diary','other','chat'].includes(tab))return <main className="auth-wrap"><section className="auth-card"><h1>Доступ закрыт</h1><p className="muted">Проводникам доступен только личный дневник. Полный журнал доступен только ЛНП.</p><button className="primary" onClick={()=>setTab('diary')}>Открыть мой дневник</button></section></main>;
 if(!user)return <main className="auth-wrap"><section className="auth-card"><div className="brand"><span className="brand-icon"><TrainFront/></span><div><b>Журнал ДЖД</b><small>Вход запоминается на устройстве</small></div></div><h1>{mode==='login'?'Вход в журнал':'Регистрация'}</h1><p className="muted">Вход и журнал работают через защищённую базу ДЖД.</p><form onSubmit={auth} className="stack">{mode==='signup'&&<label>Имя и фамилия<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Имя и фамилия"/></label>}<label>Электронная почта<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><label>Пароль<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Не менее 6 символов"/></label><button className="primary" type="submit">{mode==='login'?'Войти':'Создать аккаунт'}</button></form><button className="link" onClick={()=>{setMode(mode==='login'?'signup':'login');setError('');}}>{mode==='login'?'Нет аккаунта? Зарегистрироваться':'Уже зарегистрирован? Войти'}</button>{error&&<p className="alert error">{error}</p>}{notice&&<p className="alert success">{notice}</p>}{db.users.length===0&&<p className="muted">Первый зарегистрировавшийся пользователь получит права первого ЛНП. Остальные аккаунты будут обычными пользователями.</p>}</section></main>;
 if(profile?.role==='viewer'&&!profile.conductor_id)return <main className="auth-wrap"><section className="auth-card"><div className="brand"><span className="brand-icon"><TrainFront/></span><div><b>Журнал ДЖД</b><small>Привязка аккаунта к журналу</small></div></div><h1>Выбери себя</h1><p className="muted">Если у тебя есть специальный код приглашения от первого ЛНП, введи его здесь. Иначе выбери свою фамилию и имя из списка проводников.</p><div className="stack"><label>Код приглашения второго ЛНП<input value={inviteInput} onChange={e=>setInviteInput(e.target.value.toUpperCase())} placeholder="КОД ОТ ПЕРВОГО ЛНП"/></label><button className="primary" disabled={inviteInput.trim().length<6} onClick={redeemInvite}>Применить приглашение ЛНП</button><div className="muted">Или привяжи обычный аккаунт проводника:</div><label>Проводник<select value={selectedPersonId} onChange={e=>setSelectedPersonId(e.target.value)}><option value="">Выбери себя</option>{people.filter(p=>!p.linkedUserId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="primary" disabled={!selectedPersonId} onClick={linkConductor}>Подтвердить выбор</button></div>{!people.some(p=>!p.linkedUserId)&&<p className="alert notice">Свободных записей пока нет. Попроси ЛНП добавить тебя в список проводников.</p>}{error&&<p className="alert error">{error}</p>}<button className="link" onClick={logout}>Выйти</button></section></main>;
 return <div className="app"><aside className="sidebar"><div className="brand"><span className="brand-icon"><TrainFront/></span><div><b>Журнал ДЖД</b><small>Учебный журнал</small></div></div><div className="nav-label">РАБОЧЕЕ МЕСТО</div><nav>{tabs.filter(t=>canTeach?(t.id!=='diary'):(t.id==='diary'||t.id==='other'||t.id==='chat')).map(t=><button key={t.id} className={tab===t.id?'active':''} onClick={()=>{setTab(t.id);setEditId('');}}><t.icon size={18}/>{t.label}</button>)}</nav><div className="side-bottom"><div className="user-mini"><div className="avatar">{initials(user.name)}</div><div><b>{user.name}</b><small>{user.role==='owner'?'ЛНП':'Пользователь'}</small></div></div><button className="logout" onClick={logout}><LogOut size={17}/> Выйти</button></div></aside>
 <main className="content"><header><div><div className="eyebrow">ДЕТСКАЯ ЖЕЛЕЗНАЯ ДОРОГА · ЭЛЕКТРОННЫЙ ЖУРНАЛ</div><h1>{tab==='diary'?'Мой дневник':tabs.find(t=>t.id===tab)?.label}</h1></div><div className="header-tools"><div className="top-user"><span className="online-dot"/>{user.name}</div></div></header>
 {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
 {tab==='chat'&&<div className="panel chat-panel"><div className="section-heading"><div><h3>Чаты</h3><p className="muted">Общение участников детской железной дороги</p></div><span className="pill">Сообщения сохраняются</span></div><div className="chat-room-switch"><button className={chatRoom==='students'?'active':''} onClick={()=>setChatRoom('students')}><Users size={15}/> Чат с проводниками</button>{canUseModeratorChat&&<button className={chatRoom==='moderators'?'active':''} onClick={()=>setChatRoom('moderators')}><ShieldCheck size={15}/> Чат ЛНП</button>}</div><div className="chat-room-description">{chatRoom==='moderators'?'Закрытая комната для двух аккаунтов ЛНП. Проводники не имеют доступа к этим сообщениям.':'Общий чат проводников и ЛНП. Все вошедшие участники могут читать и отправлять сообщения.'}</div><div className="chat-messages" aria-live="polite">{chatLoading?<div className="empty">Загружаем сообщения…</div>:chatMessages.length===0?<div className="empty chat-empty">Пока сообщений нет. Напиши первое сообщение!</div>:chatMessages.map(message=><div className={'chat-message '+(message.sender_id===current?'chat-message-own':'')} key={message.id}><div className="chat-message-head"><b>{message.sender_name}</b><span className="chat-role">{message.sender_role==='lnp'?'ЛНП':'Проводник'}</span><time>{new Date(message.created_at).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</time>{(message.sender_id===current||canTeach)&&<button type="button" className="chat-delete" title="Удалить сообщение" onClick={()=>void deleteChatMessage(message.id)}><Trash2 size={13}/></button>}</div><p>{message.body}</p></div>)}</div><form className="chat-compose" onSubmit={sendChatMessage}><textarea value={chatBody} onChange={e=>setChatBody(e.target.value.slice(0,2000))} placeholder={chatRoom==='moderators'?'Напиши сообщение для ЛНП…':'Напиши сообщение проводникам и ЛНП…'} rows={3} maxLength={2000}/><div className="chat-compose-footer"><small>{chatBody.length}/2000 символов</small><button className="primary" disabled={!chatBody.trim()||chatSending}>{chatSending?'Отправляем…':<><Send size={15}/> Отправить</>}</button></div></form></div>}
 {tab==='other'&&<div className="panel"><div className="section-heading"><div><h3>Дневники участников</h3><p className="muted">У каждого проводника и ЛНП есть отдельная персональная ссылка. Проводник открывает её без пароля: видит дневник, карточку формы и может отметить сдачу документов и получение формы.</p></div></div>{people.map(p=><div className="list-row" key={p.id}><div className="avatar">{initials(p.name)}</div><div className="grow"><b>{p.name}</b><small>Личный дневник проводника</small></div><a className="small-btn" href={'?diary='+encodeURIComponent(p.id)} target="_blank" rel="noreferrer">Открыть дневник</a><button className="secondary icon-btn" title="Скопировать ссылку" onClick={()=>{const url=window.location.origin+window.location.pathname+'?diary='+encodeURIComponent(p.id);void navigator.clipboard.writeText(url);flash('Ссылка на дневник '+p.name+' скопирована');}}><Link2 size={15}/></button></div>)}{!people.length&&<Empty text="Проводников пока нет"/>}</div>}
 {tab==='overview'&&<><div className="welcome"><div><span className="pill">ЭЛЕКТРОННЫЙ ЖУРНАЛ</span><h2>Здравствуйте, {user.name.split(' ')[0]}!</h2><p>Успеваемость, посещаемость, занятия и документы проводников.</p></div><BookOpen size={54}/></div><div className="stats"><Stat title="Проводники" value={people.length} icon={<Users/>}/><Stat title="Занятия" value={db.lessons.length} icon={<CalendarDays/>}/><Stat title="Мои оценки" value={myGrades.length} icon={<GraduationCap/>}/><Stat title="Задания" value={db.tasks.length} icon={<BookMarked/>}/></div><div className="panel"><h3>Ближайшие занятия</h3>{db.lessons.filter(l=>!l.isGradeColumn&&(!l.date||new Date(l.date)>=new Date())).slice(0,5).map(l=><div className="list-row" key={l.id}><div className="date-chip">{l.date?new Date(l.date).toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}):'Без даты'}</div><div className="grow"><b>{l.title}</b><small>{niceDate(l.date)} · {l.details||'Без описания'}</small></div></div>)}{!db.lessons.some(l=>!l.isGradeColumn)&&<Empty text="Занятий пока нет"/>}</div></>}
 {tab==='people'&&<div className="panel"><div className="section-heading"><div><h3>Редактор проводников и ЛНП</h3><p className="muted">Единый список участников. Здесь можно изменить имена, добавить проводника и оставить сообщение, которое появится в его аккаунте.</p></div><span className="pill">{db.users.length} участников</span></div>{canTeach&&<form className="add-person-form" onSubmit={addPerson}><input value={newPersonName} onChange={e=>setNewPersonName(e.target.value)} placeholder="Фамилия и имя нового проводника" required/><button className="primary">{editingPersonId?<Check size={16}/>:<Plus size={16}/>} {editingPersonId?'Сохранить имя':'Добавить проводника'}</button>{editingPersonId&&<button type="button" className="secondary" onClick={()=>{setEditingPersonId('');setNewPersonName('');}}>Отмена</button>}</form>}{db.users.map(p=>{const shown=p.role==='owner'?{...p,name:adminProfiles.find(a=>a.id===p.linkedUserId)?.display_name||p.name}:p;return <div className="list-row person-editor-row" key={p.id}><div className="avatar">{initials(shown.name)}</div><div className="grow"><b>{shown.name}</b><small>{p.role==='owner'?'ЛНП':'Проводник'}</small>{p.isSeniorConductor&&<small className="senior-conductor-badge">★ Старший проводник</small>}{p.role==='conductor'&&p.profileNote&&<small className="profile-note-preview">Сообщение в аккаунте: {p.profileNote}</small>}{canTeach&&p.role==='conductor'&&profileNoteEditingId===p.id&&<form className="profile-note-editor" onSubmit={saveProfileNote}><textarea value={profileNoteDraft} onChange={e=>setProfileNoteDraft(e.target.value)} placeholder="Например: подойти к инструктору перед следующей практикой" rows={2}/><div><button className="primary">Сохранить сообщение</button><button type="button" className="secondary" onClick={()=>{setProfileNoteEditingId('');setProfileNoteDraft('');}}>Отмена</button></div></form>}</div>{canTeach&&<div className="actions"><button className="secondary icon-btn" title="Изменить имя" onClick={()=>editPerson(shown)}><Pencil size={14}/></button>{p.role==='conductor'&&<button className="secondary icon-btn" title="Сообщение для аккаунта" onClick={()=>{setProfileNoteEditingId(profileNoteEditingId===p.id?'':p.id);setProfileNoteDraft(p.profileNote||'');}}><MessageSquareText size={14}/></button>}{p.role==='conductor'&&<button className="danger icon-btn" title="Удалить проводника" onClick={()=>removePerson(p.id)}><Trash2 size={14}/></button>}</div>}</div>})}</div>}
 {tab==='assignments'&&<PracticeAssignments conductors={people} lnps={adminProfiles.filter(person=>person.role==='lnp').map(person=>({...person,is_senior_conductor:!!db.users.find(item=>item.linkedUserId===person.id)?.isSeniorConductor}))} currentUserId={current} stats={assignmentStats}/>}
 {tab==='rating'&&<div className="panel rating-panel"><div className="section-heading"><div><h3>Рейтинг проводников</h3><p className="muted">Оцени каждый показатель от 1 до 100. Средний балл считается автоматически по заполненным оценкам из пяти показателей.</p></div><span className="pill">{people.length} проводников</span></div><div className="rating-people-grid">{people.map(person=>{const scores=db.ratingCriteria.map(criterion=>db.metricRatings.find(item=>item.conductorId===person.id&&item.criterionId===criterion.id)?.score).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value));const average=scores.length?scores.reduce((sum,value)=>sum+value,0)/scores.length:null;return {person,average};}).sort((a,b)=>(b.average??-1)-(a.average??-1)||a.person.name.localeCompare(b.person.name,'ru')).map(({person,average},index)=><article className="rating-person-card" key={person.id}><div className="rating-person-head"><div className="rating-person-name"><span className="rating-place">{index+1}</span><b>{person.name}</b></div><div className="rating-manual-field rating-average-field"><span>Средний балл</span><strong className="rating-average-value">{average===null?'—':average.toFixed(2)}</strong></div></div><div className="rating-criteria-grid">{db.ratingCriteria.map(criterion=>{const metric=db.metricRatings.find(item=>item.conductorId===person.id&&item.criterionId===criterion.id);return <label className="rating-manual-field rating-criterion-field" key={criterion.id}><span>{criterion.title}</span><ManualScoreInput value={metric?.score||null} onSave={raw=>saveMetricRating(person.id,criterion.id,raw)}/></label>;})}</div></article>)}</div>{!people.length&&<Empty text="Проводников пока нет"/>}</div>}
 {tab==='grades'&&<>{canTeach?<div className="panel"><div className="section-heading"><div><h3>Электронный журнал</h3><p className="muted">Один общий журнал. Нажми на ячейку, чтобы выставить оценку. Доступны оценки от 1 до 10, «Н», «—», «Зач» и «Незач».</p></div><span className="pill">{journalPeople.length} человек · {db.lessons.filter(l=>!l.isGradeColumn).length} занятий · {db.lessons.filter(l=>l.isGradeColumn).length} колонок</span></div><div className="grade-table-wrap"><table className="grade-table"><thead><tr><th>Ученик</th>{db.lessons.map(l=><th key={l.id} draggable={canTeach} onDragStart={e=>{e.dataTransfer.setData('text/plain',l.id);e.dataTransfer.effectAllowed='move';}} onDragOver={e=>{if(canTeach)e.preventDefault();}} onDrop={e=>{if(canTeach){e.preventDefault();reorderJournalColumn(e.dataTransfer.getData('text/plain'),l.id);}}} className={(l.isGradeColumn?'grade-only-heading ':'')+(canTeach?'draggable-column':'')}>{columnEditId===l.id?<input className="column-title-edit" autoFocus defaultValue={l.title} onBlur={e=>renameGradeColumn(l.id,e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter')renameGradeColumn(l.id,e.currentTarget.value);if(e.key==='Escape'){setColumnEditId('');setColumnTitle('');}}}/>:<><span>{l.isGradeColumn&&canTeach?<button className="column-title-button" onClick={()=>{setColumnEditId(l.id);setColumnTitle(l.title);}} title="Изменить название">{l.title}</button>:l.title}</span>{l.isGradeColumn&&canTeach&&<button className="delete-column-btn" title="Удалить колонку" onClick={()=>deleteGradeColumn(l.id)}><Trash2 size={13}/></button>}{!l.isGradeColumn&&<small>{l.date?new Date(l.date).toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}):'Без даты'}</small>}</>}</th>)}{!db.lessons.length&&<th>Добавь урок во вкладке «Уроки»</th>}<th>Средний балл</th><th>Пропуски</th></tr></thead><tbody>{journalPeople.map(p=>{const marks=db.grades.filter(g=>g.studentId===p.id&&g.lessonId);const scored=marks.filter(g=>(g.mark==='grade'||g.mark==='points')&&g.score!==null&&g.score!=='' );const numericScores=scored.map(g=>{if(g.mark==='points')return g.pointsGrade!==null&&g.pointsGrade!==undefined?Number(g.pointsGrade):null;const value=String(g.score).trim().replace(',','.');if(/^\d+(\.\d+)?$/.test(value))return Number(value);const fraction=value.match(/^(\d+)\/(\d+)$/);return fraction?(Number(fraction[1])+Number(fraction[2]))/2:null;}).filter((v):v is number=>v!==null&&Number.isFinite(v));const average=numericScores.length?(numericScores.reduce((sum,v)=>sum+v,0)/numericScores.length).toFixed(2):'—';const absences=marks.filter(g=>g.mark==='Н').length;return <tr key={p.id}><th><div className="student-cell"><span className="avatar">{initials(p.name)}</span>{p.name}</div></th>{db.lessons.map(l=>{const g=db.grades.find(x=>x.studentId===p.id&&x.lessonId===l.id);return <td key={l.id}><div className="matrix-cell-wrap"><button className={'matrix-cell '+(g?.mark==='Н'?'matrix-absent':g?'matrix-filled':'')} onClick={()=>editMatrixCell(p.id,l.id)} title={g?.comment?'Комментарий: '+g.comment:'Нажми, чтобы изменить'}>{g?<GradeValue value={g.mark==='Н'?'Н':g.mark==='cross'?'':g.mark==='points'?String(g.score)+' баллов':g.score} mark={g.mark} colorGrade={g.pointsGrade}/>:''}</button>{g?.comment&&<small className="matrix-comment" title={g.comment}>{g.comment}</small>}</div></td>})}{!db.lessons.length&&<td className="empty-cell">—</td>}<td className="summary-cell">{average}</td><td className="summary-cell">{absences}</td></tr>})}<tr className="homework-row"><th><div className="student-cell"><span className="homework-mark">ДЗ</span>Домашнее задание</div></th>{db.lessons.map(l=><td key={l.id}><div className="homework-cell"><div role="button" tabIndex={0} className="homework-cell-button" onClick={()=>openHomeworkCell(l.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')openHomeworkCell(l.id);}} title="Нажми, чтобы добавить или изменить домашнее задание">{(()=>{const t=db.tasks.find(x=>x.lessonId===l.id);return t?<div className="homework-entry"><b>{t.title}</b>{t.details&&<small>{t.details}</small>}{t.due&&<small>Срок: {new Date(t.due+'T12:00:00').toLocaleDateString('ru-RU')}</small>}</div>:null;})()}</div></div></td>)}{!db.lessons.length&&<td></td>}<td className="summary-cell"></td><td className="summary-cell"></td></tr></tbody></table></div><div className="grade-column-tools grade-column-tools-bottom"><div><b>Дополнительная колонка оценок</b><small>Создай новую колонку — она появится в журнале, её можно будет перетащить в любое место.</small></div><input value={columnTitle} onChange={e=>setColumnTitle(e.target.value)} placeholder="Название колонки"/><button className="secondary" onClick={addGradeColumn} disabled={columnTitle.length===0}>Добавить колонку</button></div><section className="conductors-below"><div className="section-heading"><div><h3>Проводники</h3><p className="muted">Список учеников этого журнала</p></div><span className="pill">{people.length} человек</span></div>{canTeach&&<form className="add-person-form" onSubmit={addPerson}><input value={newPersonName} onChange={e=>setNewPersonName(e.target.value)} placeholder="Фамилия и имя проводника" required/><button className="primary">{editingPersonId?'Сохранить':'Добавить проводника'}</button>{editingPersonId&&<button type="button" className="secondary" onClick={()=>{setEditingPersonId('');setNewPersonName('');}}>Отмена</button>}</form>}{people.map(p=><div className="list-row" key={p.id}><div className="avatar">{initials(p.name)}</div><div className="grow"><b>{p.name}</b></div>{canTeach&&<div className="actions"><button className="secondary icon-btn" onClick={()=>editPerson(p)} title="Изменить"><Pencil size={14}/></button><button className="danger icon-btn" onClick={()=>removePerson(p.id)} title="Удалить"><Trash2 size={14}/></button></div>}</div>)}{!people.length&&<Empty text="Проводников пока нет"/>}</section>{isPrimaryLnp&&lnpCount<2&&<section className="conductors-below"><div className="section-heading"><div><h3>Пригласить второго ЛНП</h3><p className="muted">Сейчас ЛНП: {lnpCount} из 2. Создай одноразовый код и отправь его второму ЛНП. После использования приглашение и эта функция исчезнут.</p></div></div><button className="primary" onClick={createInvite}>Создать код приглашения</button>{inviteCode&&<div className="invite-code"><b>{inviteCode}</b><button className="small-btn" onClick={()=>{void navigator.clipboard.writeText(inviteCode);flash('Код приглашения скопирован');}}>Скопировать код</button></div>}</section>}</div>:<div className="panel"><h3>Мои оценки</h3><GradeList items={myGrades} people={db.users}/></div>}</>}
 {tab==='diary'&&<>{user?.role==='conductor'&&db.users.find(person=>person.id===user.id)?.profileNote&&<section className="panel account-lnp-note"><h3>Сообщение от ЛНП</h3><p>{db.users.find(person=>person.id===user.id)?.profileNote}</p></section>}{user?.role==='conductor'&&<MyPracticeCard conductorId={user.id}/>}<div className="panel"><div className="section-heading"><div><h3>Мои оценки</h3><p className="muted">Все отметки по занятиям</p></div></div><GradeList items={myGrades} people={db.users}/></div><div className="panel"><h3>Мои занятия</h3>{db.lessons.filter(l=>!l.isGradeColumn).map(l=><div className="list-row" key={l.id}><div className="date-chip">{l.date?new Date(l.date).toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}):'Без даты'}</div><div className="grow"><b>{l.title}</b><small>{niceDate(l.date)} · {l.details||'Без описания'}</small></div></div>)}{!db.lessons.some(l=>!l.isGradeColumn)&&<Empty text="Занятий пока нет"/>}</div><div className="panel"><h3>Домашние задания</h3>{db.tasks.filter(t=>!db.lessons.find(l=>l.id===t.lessonId)?.isCompleted).map(t=><div className="list-row" key={t.id}><div className="grow"><b>{t.title}</b><small>{db.lessons.find(l=>l.id===t.lessonId)?.title||'Урок'} · {t.due?'Срок: '+new Date(t.due+'T12:00:00').toLocaleDateString('ru-RU')+' · ':''}{t.details}</small>{(t.attachments||[]).map(a=><button type="button" className="attachment-link" key={a.path} onClick={()=>void openTaskAttachment(a.path)}><FileText size={13}/>{a.name}</button>)}</div></div>)}{!db.tasks.filter(t=>!db.lessons.find(l=>l.id===t.lessonId)?.isCompleted).length&&<Empty text="Домашних заданий пока нет"/>}</div><div className="panel documents-panel"><div className="section-heading"><div><h3>Мои документы и форма</h3><p className="muted">Карточка доступна только для просмотра. Изменения вносит ЛНП.</p></div><span className="pill">Личная карточка</span></div>{(()=>{const d=db.documents.find(x=>x.studentId===user?.id)||emptyDocFor(user?.id||'');const confirmation=db.documentConfirmations.find(x=>x.conductorId===user?.id);return <article className="note document-card"><div className="doc-head"><b>{user?.name}</b><span className={'status '+(d.brought?'present':'late')}>{d.brought?'Документы собраны':'Документы не все'}</span></div><div className="document-statuses"><span className={'status '+(d.uniformIssued?'present':'late')}>{d.uniformIssued?'Форма выдана':'Форма не выдана'}</span><span className={'status '+(d.uniformReturned?'present':'late')}>{d.uniformReturned?'Форма возвращена':(d.uniformIssued?'Форма на руках':'Форма не выдавалась')}</span></div><p><b>Принёс:</b> {d.broughtList||'—'}</p><p><b>Выдали:</b> {d.issuedList||'—'}</p><p><b>Не хватает:</b> {d.missingList||'—'}</p><div className="document-times"><div><small>Когда забрать форму</small><b>{d.uniformPickupAt?dateOnly(d.uniformPickupAt):'Дата не назначена'}</b></div></div>{d.uniformNote&&<p><b>По форме:</b> {d.uniformNote}</p>}{d.comment&&<p><b>Комментарий:</b> {d.comment}</p>}<div className="student-document-confirmations"><b>Твои подтверждения</b><p>Отметь галочками, когда сдашь документы и заберёшь форму. ЛНП увидит эти отметки в твоей карточке.</p><label><input type="checkbox" checked={!!confirmation?.documentsSubmitted} disabled={savingDocumentConfirmation} onChange={e=>void updateStudentDocumentConfirmation('documents',e.target.checked)}/> Я сдал документы на форму</label><small>{confirmation?.documentsSubmittedAt?'Отмечено: '+niceDate(confirmation.documentsSubmittedAt):'Пока не отмечено'}</small><label><input type="checkbox" checked={!!confirmation?.uniformPickedUp} disabled={savingDocumentConfirmation} onChange={e=>void updateStudentDocumentConfirmation('uniform',e.target.checked)}/> Я забрал форму</label><small>{confirmation?.uniformPickedUpAt?'Отмечено: '+dateOnly(confirmation.uniformPickedUpAt):'Пока не отмечено'}</small>{savingDocumentConfirmation&&<small>Сохраняем отметку…</small>}</div></article>})()}</div></>}
 {tab==='attendance'&&<div className="panel"><h3>Журнал посещаемости</h3>{canTeach&&<><div className="form-grid"><label>Занятие<select value={attendanceLesson} onChange={e=>setAttendanceLesson(e.target.value)}><option value="">Выбери занятие</option>{db.lessons.filter(l=>!l.isGradeColumn).map(l=><option value={l.id} key={l.id}>{l.title} · {l.date?new Date(l.date).toLocaleDateString('ru-RU'):'без даты'}</option>)}</select></label><label>Проводник<select value={attendanceStudent} onChange={e=>setAttendanceStudent(e.target.value)}><option value="">Выбери проводника</option>{people.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label></div><div className="button-row"><button className="present" onClick={()=>markAttendance('present')}><Check size={16}/> Был</button><button className="absent" onClick={()=>markAttendance('absent')}><X size={16}/> Н</button><button className="late" onClick={()=>markAttendance('late')}>Опоздал</button></div></>}{(canTeach?db.attendance:myAttendance).map(a=><div className="list-row" key={a.id}><div className="grow"><b>{db.users.find(p=>p.id===a.studentId)?.name||'Проводник'}</b><small>{db.lessons.find(l=>l.id===a.lessonId)?.title||'Занятие'}</small></div><span className={'status '+a.status}>{a.status==='present'?'Был':a.status==='absent'?'Н':'Опоздал'}</span></div>)}{!db.attendance.length&&<Empty text="Отметок пока нет"/>}</div>}
 {tab==='schedule'&&<><div className="panel"><h3>{canTeach?(editId?'Изменить занятие':'Добавить занятие'):'График занятий'}</h3>{canTeach&&<form className="form-grid" onSubmit={saveLesson}><label>Тема урока / название созвона<input required value={lessonTitle} onChange={e=>setLessonTitle(e.target.value)} placeholder="Например: Ручные сигналы"/></label><label>Дата и время (можно указать позже)<input type="datetime-local" value={lessonDate} onChange={e=>setLessonDate(e.target.value)}/></label><label className="wide">Описание<textarea value={lessonDetails} onChange={e=>setLessonDetails(e.target.value)} placeholder="Тема и важные сведения"/></label><div className="form-actions"><button className="primary">{editId?'Сохранить':'Добавить в график'}</button>{editId&&<button type="button" className="secondary" onClick={()=>{setEditId('');setLessonTitle('');setLessonDate('');setLessonDetails('');}}>Отмена</button>}</div></form>}{db.lessons.filter(l=>!l.isGradeColumn).map(l=><div className="list-row" key={l.id}><div className="date-chip">{l.date?new Date(l.date).toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}):'Без даты'}</div><div className="grow"><b>{l.title}</b><small>{l.date?niceDate(l.date):'Дата и время уточняются'} · {l.details||'Без описания'} · {l.isCompleted?'Проведён':'Запланирован'}</small></div>{canTeach&&<><button className={l.isCompleted?'secondary':'small-btn'} onClick={()=>markLessonCompleted(l)}>{l.isCompleted?'Вернуть':'Проведён'}</button><Actions onEdit={()=>editLesson(l)} onDelete={()=>remove('lessons',l.id)}/></>}</div>)}{!db.lessons.some(l=>!l.isGradeColumn)&&<Empty text="График пока пуст"/>}</div><PracticeScheduleSummary conductors={people}/></>}

 {tab==='documents'&&<div className="panel documents-panel"><div className="section-heading"><div><h3>{canTeach?'Карточки документов и формы участников':'Мои документы и форма'}</h3><p className="muted">{canTeach?'Одна постоянная карточка на каждого проводника и каждого ЛНП. Оба ЛНП могут менять документы, выдачу и время получения формы.':'Здесь отображается твоя карточка документов и формы.'}</p></div><span className="pill">{canTeach?documentPeople.length+' участников':'Личная карточка'}</span></div>{canTeach&&docEditingStudent&&<form className="form-grid document-editor" onSubmit={saveDoc}><div className="wide document-editor-title"><div><b>{db.users.find(p=>p.id===docEditingStudent)?.name||'Проводник'}</b><small>Отметь выполненные пункты</small></div><button type="button" className="secondary icon-btn" onClick={cancelDocEdit}><X size={16}/></button></div><label className="check-label wide"><input type="checkbox" checked={docBrought} onChange={e=>setDocBrought(e.target.checked)}/> Документы на форму сдал</label><label className="check-label wide"><input type="checkbox" checked={docContractReceived} onChange={e=>setDocContractReceived(e.target.checked)}/> Договор забрал</label><label className="check-label wide"><input type="checkbox" checked={docUniformIssued} onChange={e=>setDocUniformIssued(e.target.checked)}/> Форму забрал</label><div className="form-actions wide"><button className="primary">Сохранить</button><button type="button" className="secondary" onClick={cancelDocEdit}>Отмена</button></div></form>}{canTeach?<div className="document-cards">{documentPeople.map(p=>{const d=db.documents.find(x=>x.studentId===p.id)||emptyDocFor(p.id);const confirmation=db.documentConfirmations.find(x=>x.conductorId===p.id);return <article className="note document-card" key={p.id}><div className="doc-head"><b>{p.name}</b></div><div className="document-confirmation-status"><p><span className={'status '+(d.brought?'present':'late')}>{d.brought?'✓ Документы на форму сдал':'○ Документы на форму не сданы'}</span></p><p><span className={'status '+(d.contractReceived?'present':'late')}>{d.contractReceived?'✓ Договор забрал':'○ Договор не забрал'}</span></p><p><span className={'status '+(d.uniformIssued?'present':'late')}>{d.uniformIssued?'✓ Форму забрал':'○ Форму не забрал'}</span></p></div><div className="document-confirmation-status"><b>Отметки ученика</b><p><span className={'status '+(confirmation?.documentsSubmitted?'present':'late')}>{confirmation?.documentsSubmitted?'Документы на форму сданы':'Документы не подтверждены'}</span>{confirmation?.documentsSubmittedAt&&<small>{niceDate(confirmation.documentsSubmittedAt)}</small>}</p><p><span className={'status '+(confirmation?.uniformPickedUp?'present':'late')}>{confirmation?.uniformPickedUp?'Ученик отметил, что форму забрал':'Получение формы не подтверждено'}</span>{confirmation?.uniformPickedUpAt&&<small>{dateOnly(confirmation.uniformPickedUpAt)}</small>}</p></div>{d.uniformNote&&<p><b>По форме:</b> {d.uniformNote}</p>}{d.comment&&<p><b>Комментарий:</b> {d.comment}</p>}<button type="button" className="secondary" onClick={()=>editDoc(d)}><Pencil size={14}/> Изменить карточку</button></article>})}</div>:<>{(()=>{const d=db.documents.find(x=>x.studentId===user?.id)||emptyDocFor(user?.id||'');const confirmation=db.documentConfirmations.find(x=>x.conductorId===user?.id);return <article className="note document-card"><div className="doc-head"><b>{user?.name}</b><span className={'status '+(d.brought?'present':'late')}>{d.brought?'Документы собраны':'Документы не все'}</span></div><div className="document-statuses"><span className={'status '+(d.uniformIssued?'present':'late')}>{d.uniformIssued?'Форма выдана':'Форма не выдана'}</span><span className={'status '+(d.uniformReturned?'present':'late')}>{d.uniformReturned?'Форма возвращена':(d.uniformIssued?'Форма на руках':'Форма не выдавалась')}</span></div><p><b>Принёс:</b> {d.broughtList||'—'}</p><p><b>Выдали:</b> {d.issuedList||'—'}</p><p><b>Не хватает:</b> {d.missingList||'—'}</p><div className="document-times"><div><small>Заберёшь форму</small><b>{d.uniformPickupAt?niceDate(d.uniformPickupAt):'Время не назначено'}</b></div></div>{d.uniformNote&&<p><b>По форме:</b> {d.uniformNote}</p>}{d.comment&&<p><b>Комментарий:</b> {d.comment}</p>}<div className="student-document-confirmations"><b>Твои подтверждения</b><p>Отметь галочками, когда сдашь документы и заберёшь форму. ЛНП увидит эти отметки в твоей карточке.</p><label><input type="checkbox" checked={!!confirmation?.documentsSubmitted} disabled={savingDocumentConfirmation} onChange={e=>void updateStudentDocumentConfirmation('documents',e.target.checked)}/> Я сдал документы на форму</label><small>{confirmation?.documentsSubmittedAt?'Отмечено: '+niceDate(confirmation.documentsSubmittedAt):'Пока не отмечено'}</small><label><input type="checkbox" checked={!!confirmation?.uniformPickedUp} disabled={savingDocumentConfirmation} onChange={e=>void updateStudentDocumentConfirmation('uniform',e.target.checked)}/> Я забрал форму</label><small>{confirmation?.uniformPickedUpAt?'Отмечено: '+niceDate(confirmation.uniformPickedUpAt):'Пока не отмечено'}</small>{savingDocumentConfirmation&&<small>Сохраняем отметку…</small>}</div></article>})()}</>}</div>}
 {tab==='notes'&&<div className="panel"><h3>Примечания преподавателей</h3>{canTeach&&<form className="form-grid" onSubmit={saveNote}><label>Проводник<select required value={noteStudent} onChange={e=>setNoteStudent(e.target.value)}><option value="">Выбери проводника</option>{people.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label className="wide">Примечание<textarea required value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Запись о занятии или рекомендации"/></label><button className="primary">Добавить примечание</button></form>}{(canTeach?db.notes:db.notes.filter(n=>n.studentId===user?.id)).map(n=><div className="note" key={n.id}><b>{db.users.find(p=>p.id===n.studentId)?.name||'Проводник'}</b><p>{n.body}</p><small>{niceDate(n.date)}</small>{canTeach&&<button className="danger" onClick={()=>remove('notes',n.id)}><Trash2 size={14}/> Удалить</button>}</div>)}{!db.notes.length&&<Empty text="Примечаний пока нет"/>}</div>}
 {homeworkCellLesson&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeHomeworkCell();}}><section className="grade-modal homework-modal"><div className="section-heading"><div><h3>{editId?'Изменить домашнее задание':'Домашнее задание'}</h3><p className="muted">{db.lessons.find(l=>l.id===homeworkCellLesson)?.title||'Урок'}</p></div><button className="secondary icon-btn" onClick={closeHomeworkCell}><X size={16}/></button></div><form className="form-grid" onSubmit={saveTask}><label className="wide">Задание<input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="Запиши домашнее задание" required/></label><label className="wide">Пояснение<textarea value={taskDetails} onChange={e=>setTaskDetails(e.target.value)} placeholder="Дополнительные условия (необязательно)"/></label><label>Срок выполнения<input type="date" value={taskDue} onChange={e=>setTaskDue(e.target.value)}/></label><label className="wide">Прикрепить файлы<input type="file" multiple onChange={e=>setTaskFiles(Array.from(e.target.files||[]))}/><small className="muted">Несколько файлов, до 50 МБ каждый.</small>{taskFiles.map(file=><small key={file.name+file.size}>{file.name} · {(file.size/1024/1024).toFixed(1)} МБ</small>)}</label><div className="form-actions"><button className="primary" disabled={!taskTitle.trim()}>{editId?'Сохранить':'Добавить ДЗ'}</button>{editId&&<button type="button" className="danger" disabled={deletingTaskId===editId} onClick={()=>void deleteHomeworkTask(editId)}>{deletingTaskId===editId?'Удаляем…':'Удалить ДЗ'}</button>}<button type="button" className="secondary" onClick={closeHomeworkCell}>Отмена</button></div></form></section></div>} {selectedCell&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!savingCell)setSelectedCell(null);}}><section className="grade-modal"><div className="section-heading"><div><h3>Отметка в журнале</h3><p className="muted">{journalPeople.find(p=>p.id===selectedCell.studentId)?.name} · {db.lessons.find(l=>l.id===selectedCell.lessonId)?.title}</p></div><button className="secondary icon-btn" disabled={savingCell} onClick={()=>setSelectedCell(null)}><X size={16}/></button></div>{pointsMode?<div className="points-mode-panel"><div className="points-mode-heading">Баллы</div><label className="modal-label">Количество баллов<input type="number" min="0" step="any" inputMode="decimal" disabled={savingCell} value={pointsInput} onChange={e=>setPointsInput(e.target.value)} placeholder="Например, 100"/></label><div className="points-mode-heading">Эквивалентная отметка</div><label className="modal-label">Какой отметке соответствуют эти баллы?<select disabled={savingCell} value={pointsGrade} onChange={e=>setPointsGrade(e.target.value)}>{Array.from({length:10},(_,i)=><option key={i+1} value={String(i+1)}>{i+1}</option>)}</select></label><div className="points-preview"><b>{pointsInput.trim()?pointsInput+' баллов':'Количество баллов не указано'}</b><span>В средний балл пойдёт отметка {pointsGrade}</span></div><div className="form-actions"><button type="button" className="primary" disabled={savingCell} onClick={saveMatrixCell}>{savingCell?'Сохраняем…':'Сохранить баллы'}</button><button type="button" className="secondary" disabled={savingCell} onClick={()=>setPointsMode(false)}>Обычные отметки</button></div></div>:<><div className="quick-grade-grid">{Array.from({length:10},(_,i)=><button type="button" key={i+1} disabled={savingCell} className={'quick-grade '+(cellValue===String(i+1)?'selected':'')} onClick={()=>chooseMatrixValue(String(i+1))}>{i+1}</button>)}</div><div className="quick-grade-special"><button type="button" disabled={savingCell} className={'quick-grade absent-choice '+(cellValue==='Н'?'selected':'')} onClick={()=>chooseMatrixValue('Н')}>Н</button><button type="button" disabled={savingCell} className={'quick-grade '+(cellValue==='—'?'selected':'')} onClick={()=>chooseMatrixValue('—')}>—</button><button type="button" disabled={savingCell} className={'quick-grade pass-choice '+(cellValue==='Зач'?'selected':'')} onClick={()=>chooseMatrixValue('Зач')}>Зач</button><button type="button" disabled={savingCell} className={'quick-grade fail-choice '+(cellValue==='Незач'?'selected':'')} onClick={()=>chooseMatrixValue('Незач')}>Незач</button><button type="button" className="quick-grade clear-choice" disabled={savingCell} onClick={()=>{setCellValue('');setCellComment('');}}>Убрать оценку</button></div><small className="muted grade-entry-hint">Выбирай одну оценку для этого проводника.</small><button type="button" className="points-mode-button" disabled={savingCell} onClick={()=>{setPointsMode(true);setPointsInput('');setPointsGrade('10');setCellValue('');}}>Баллы</button><div className="form-actions"><button type="button" className="primary" disabled={savingCell} onClick={saveMatrixCell}>{savingCell?'Сохраняем…':'Сохранить отметку'}</button></div></>}<label className="modal-label">Комментарий к отметке<textarea className="grade-comment-input" disabled={savingCell} value={cellComment} onChange={e=>setCellComment(e.target.value)} placeholder="Комментарий будет виден под отметкой в журнале и в дневнике проводника"/></label><div className="form-actions"><button type="button" className="secondary" disabled={savingCell} onClick={()=>setSelectedCell(null)}>Закрыть</button></div></section></div>}<footer>Журнал ДЖД · Сохранение в Supabase</footer></main></div>;
}


function ManualScoreInput({value,onSave}:{value:number|null;onSave:(raw:string)=>Promise<boolean>}){
 const [draft,setDraft]=useState(value&&value>0?String(value):'');
 useEffect(()=>{setDraft(value&&value>0?String(value):'');},[value]);
 const numericDraft=draft.trim()?Number(draft):0;
 const tone=draft.trim()===''?'rating-tone-empty':numericDraft<40?'rating-tone-low':numericDraft<70?'rating-tone-medium':'rating-tone-high';
 const width=Math.max(0,Math.min(100,Number.isFinite(numericDraft)?numericDraft:0));
 return <div className="rating-score-editor"><input className={'rating-manual-input '+tone} type="number" inputMode="numeric" min="1" max="100" step="1" placeholder="1–100" value={draft} onChange={event=>setDraft(event.target.value)} onBlur={()=>{void onSave(draft).then(ok=>{if(!ok)setDraft(value&&value>0?String(value):'');});}}/><div className="rating-score-track"><span className={tone} style={{width:width+'%'}}/></div></div>;
}

function PublicDiaryPage({data,error}:{data:PublicDiaryData|null;error:string}){
 const [confirmation,setConfirmation]=useState<DocumentConfirmation|null>(data?.documentConfirmation||null);
 const [documentCard,setDocumentCard]=useState<NonNullable<PublicDiaryData['document']>|null>(data?.document||null);
 const [saving,setSaving]=useState(false);
 const [feedback,setFeedback]=useState('');
 if(error)return <main className="auth-wrap"><section className="auth-card"><h1>Дневник недоступен</h1><p className="alert error">{error}</p><a className="link" href="/provodnik/">На главную</a></section></main>;
 if(!data)return <main className="auth-wrap"><section className="auth-card"><p>Загружаем дневник…</p></section></main>;
 const doc=documentCard;
 const changeConfirmation=async(field:'documents'|'uniform',checked:boolean)=>{
  if(saving)return;
  setSaving(true);setFeedback('');
  const {data:updated,error:saveError}=await supabase.rpc('update_public_document_confirmation',{p_conductor_id:data.person.id,p_field:field,p_checked:checked});
  if(saveError){setFeedback('Не удалось сохранить отметку. Попробуй ещё раз.');setSaving(false);return;}
  setConfirmation(updated as DocumentConfirmation);
  setDocumentCard(previous=>({brought:field==='documents'?checked:!!previous?.brought,broughtList:previous?.broughtList||'',issuedList:previous?.issuedList||'',missingList:previous?.missingList||'',comment:previous?.comment||'',uniformIssued:field==='uniform'?checked:!!previous?.uniformIssued,uniformReturned:!!previous?.uniformReturned,uniformPickupAt:previous?.uniformPickupAt||null,uniformNote:previous?.uniformNote||''}));
  setFeedback('Отметка сохранена');
  setSaving(false);
 };
 const current=confirmation||{conductorId:data.person.id,documentsSubmitted:false,documentsSubmittedAt:null,uniformPickedUp:false,uniformPickedUpAt:null};
 return <div className="app"><main className="content"><header><div><div className="eyebrow">ДЕТСКАЯ ЖЕЛЕЗНАЯ ДОРОГА</div><h1>{data.person.name}</h1></div></header><div className="welcome"><div><span className="pill">ЛИЧНЫЙ ДНЕВНИК</span><h2>{data.person.name}</h2><p>Оценки, занятия, домашние задания, документы и форма</p></div><BookOpen size={48}/></div><section className="panel"><h3>Оценки</h3>{data.grades.map(g=><div className="list-row" key={g.id}><div className="grow"><b>{data.lessons.find(l=>l.id===g.lessonId)?.title||'Занятие'}</b><small>{g.date?niceDate(g.date):''}</small>{g.isPoints&&<small className="points-equivalent">Эквивалент отметки: {g.pointsGrade}</small>}{g.comment&&<small className="grade-comment">Комментарий: {g.comment}</small>}</div><span className="grade grade-rendered"><GradeValue value={g.score+(g.isPoints?' баллов':'')} mark={g.score==='Н'?'Н':'grade'} colorGrade={g.pointsGrade}/></span></div>)}{!data.grades.length&&<Empty text="Оценок пока нет"/>}</section><section className="panel"><h3>Занятия</h3>{data.lessons.filter(l=>!l.isGradeColumn).map(l=><div className="list-row" key={l.id}><div className="date-chip">{l.date?new Date(l.date).toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}):'Без даты'}</div><div className="grow"><b>{l.title}</b><small>{niceDate(l.date)} · {l.details||'Без описания'}</small></div></div>)}{!data.lessons.some(l=>!l.isGradeColumn)&&<Empty text="Занятий пока нет"/>}</section><section className="panel"><h3>Домашние задания</h3>{data.homework.map(h=><div className="list-row" key={h.id}><div className="grow"><b>{h.title}</b><small>{data.lessons.find(l=>l.id===h.lessonId)?.title||'Урок'} · {h.due?'Срок: '+new Date(h.due+'T12:00:00').toLocaleDateString('ru-RU')+' · ':''}{h.details}</small></div></div>)}{!data.homework.length&&<Empty text="Домашних заданий пока нет"/>}</section><section className="panel documents-panel"><div className="section-heading"><div><h3>Мои документы и форма</h3><p className="muted">Карточка доступна для просмотра. Отметь галочками, когда сдашь документы и заберёшь форму.</p></div><span className="pill">Личная карточка</span></div>{doc?<article className="note document-card"><div className="doc-head"><b>{data.person.name}</b><span className={'status '+(doc.brought?'present':'late')}>{doc.brought?'Документы собраны':'Документы не все'}</span></div><div className="document-statuses"><span className={'status '+(doc.uniformIssued?'present':'late')}>{doc.uniformIssued?'Форма выдана':'Форма не выдана'}</span><span className={'status '+(doc.uniformReturned?'present':'late')}>{doc.uniformReturned?'Форма возвращена':(doc.uniformIssued?'Форма на руках':'Форма не выдавалась')}</span></div><p><b>Принёс:</b> {doc.broughtList||'—'}</p><p><b>Выдали:</b> {doc.issuedList||'—'}</p><p><b>Не хватает:</b> {doc.missingList||'—'}</p><div className="document-times"><div><small>Когда забрать форму</small><b>{doc.uniformPickupAt?dateOnly(doc.uniformPickupAt):'Дата не назначена'}</b></div></div>{doc.uniformNote&&<p><b>По форме:</b> {doc.uniformNote}</p>}{doc.comment&&<p><b>Комментарий:</b> {doc.comment}</p>}</article>:<div className="empty">ЛНП пока не заполнил карточку документов и формы.</div>}<div className="student-document-confirmations"><b>Твои подтверждения</b><p>Отметки сразу сохраняются и становятся видны ЛНП в твоей карточке.</p><label><input type="checkbox" checked={current.documentsSubmitted} disabled={saving} onChange={e=>void changeConfirmation('documents',e.target.checked)}/> Я сдал документы на форму</label><small>{current.documentsSubmittedAt?'Отмечено: '+niceDate(current.documentsSubmittedAt):'Пока не отмечено'}</small><label><input type="checkbox" checked={current.uniformPickedUp} disabled={saving} onChange={e=>void changeConfirmation('uniform',e.target.checked)}/> Я забрал форму</label><small>{current.uniformPickedUpAt?'Отмечено: '+dateOnly(current.uniformPickedUpAt):'Пока не отмечено'}</small>{saving&&<small>Сохраняем отметку…</small>}{feedback&&<small className={feedback.startsWith('Не удалось')?'alert error':'alert success'}>{feedback}</small>}</div></section><footer>Журнал ДЖД · Личный дневник по персональной ссылке</footer></main></div>;
}

function Stat({title,value,icon}:{title:string;value:number;icon:any}){return <div className="stat"><div className="stat-icon">{icon}</div><small>{title}</small><strong>{value}</strong></div>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}
function Actions({onEdit,onDelete}:{onEdit:()=>void;onDelete:()=>void}){return <div className="actions"><button className="secondary icon-btn" title="Изменить" onClick={onEdit}><Pencil size={14}/></button><button className="danger icon-btn" title="Удалить" onClick={onDelete}><Trash2 size={14}/></button></div>}
function GradeValue({value,mark='grade',colorGrade}:{value:string|number|null;mark?:Grade['mark'];colorGrade?:number|null}){
 const text=String(value??'');
 if(mark==='Н'||text==='Н')return <span className="grade-red">Н</span>;
 if(mark==='pass'||text.toLowerCase()==='зач'||text.toLowerCase()==='зачёт')return <span className="grade-green">Зачёт</span>;
 if(mark==='fail'||text.toLowerCase()==='незач'||text.toLowerCase()==='незачёт')return <span className="grade-red">Незачёт</span>;
 if(mark==='cross')return <span className="grade-neutral">—</span>;
 if(mark==='points')return <span className="grade-neutral">{text}</span>;
 const fraction=text.match(/^(\d+)\s*\/\s*(\d+)$/);
 const color=(n:number)=>n<=4?'grade-red':n<=7?'grade-yellow':'grade-green';
 if(fraction)return <span className="grade-fraction"><span className={color(Number(fraction[1]))}>{fraction[1]}</span><span className="grade-fraction-slash">/</span><span className={color(Number(fraction[2]))}>{fraction[2]}</span></span>;
 const numeric=Number(text.replace(',','.'));
 if(Number.isFinite(numeric)&&text.trim()!=='')return <span className={color(colorGrade??numeric)}>{text}</span>;
 return <span className="grade-neutral">{text}</span>;
}
function GradeList({items,people,editable=false,onEdit,onDelete}:{items:Grade[];people:User[];editable?:boolean;onEdit?:(g:Grade)=>void;onDelete?:(id:string)=>void}){return <>{items.map(g=><div className="list-row" key={g.id}><div className="grow"><b>{people.find(p=>p.id===g.studentId)?.name||g.subject}</b><small>{g.subject} · {niceDate(g.date)}</small>{g.mark==='points'&&<small className="points-equivalent">Эквивалент отметки: {g.pointsGrade}</small>}{g.comment&&<small className="grade-comment">Комментарий: {g.comment}</small>}</div><span className="grade grade-rendered"><GradeValue value={g.mark==='Н'?'Н':g.mark==='points'?String(g.score)+' баллов':g.score} mark={g.mark} colorGrade={g.pointsGrade}/></span>{editable&&<Actions onEdit={()=>onEdit?.(g)} onDelete={()=>onDelete?.(g.id)}/>}</div>)}{!items.length&&<Empty text="Оценок пока нет"/>}</>}