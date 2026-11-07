import { createClient } from '@supabase/supabase-js';

const cors = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-mywii-game-key',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
const json = (statusCode, data) => ({ statusCode, headers: cors, body: JSON.stringify(data) });
const fail = (status, message) => json(status, { error: message });
const client = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configuration Supabase manquante dans Netlify.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};
const now = () => new Date().toISOString();
const safe = (s, max = 1000) => String(s ?? '').trim().slice(0, max);

async function authUser(supabase, event) {
  const h = event.headers?.authorization || event.headers?.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
async function profile(s, uid) {
  const { data } = await s.from('profiles').select('*').eq('id', uid).maybeSingle();
  return data;
}
async function requireUser(s, event) {
  const u = await authUser(s, event);
  if (!u) throw Object.assign(new Error('Connexion requise.'), { status: 401 });
  return u;
}
async function requireAdmin(s, u) {
  const p = await profile(s, u.id);
  if (!p?.is_admin) throw Object.assign(new Error('Accès administrateur refusé.'), { status: 403 });
  return p;
}
async function body(event) {
  try { return JSON.parse(event.body || '{}'); } catch { throw Object.assign(new Error('JSON invalide.'), { status: 400 }); }
}
async function run(event) {
  const url = new URL(event.rawUrl || `https://mywii.invalid${event.path || '/'}`);
  const path = url.pathname.replace(/^.*?\/api\/?/, '').replace(/\/$/, '');
  const method = event.httpMethod;
  if (method === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  // Public browser configuration must not require the private service-role key.
  if (path === 'config' && method === 'GET') return json(200, {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
  const s = client();

  // Public catalogue and approved downloads
  if (path === 'games' && method === 'GET') {
    const { data, error } = await s.from('games').select('id,title,description,genre,version,is_multiplayer,created_at,profiles(username)').eq('status','approved').order('created_at',{ascending:false});
    if (error) throw error;
    return json(200,{ games:(data||[]).map(g=>({...g,uploader:g.profiles?.username||'Joueur'})) });
  }
  const download = path.match(/^games\/([0-9a-f-]+)\/download$/i);
  if (download && method === 'GET') {
    const { data:g,error } = await s.from('games').select('storage_path,title,status').eq('id',download[1]).maybeSingle();
    if (error || !g || g.status !== 'approved') return fail(404,'Jeu introuvable ou non publié.');
    const { data, error:e } = await s.storage.from('games').createSignedUrl(g.storage_path,60,{download:`${g.title.replace(/[^a-z0-9_-]/gi,'_')}.exe`});
    if (e) throw e;
    return { statusCode:302,headers:{...cors,Location:data.signedUrl},body:'' };
  }

  // Public competitive rankings: available even without signing in.
  if (path === 'leaderboards' && method === 'GET') {
    const gameId = url.searchParams.get('game_id') || null;
    const period = ['all','week','month'].includes(url.searchParams.get('period')) ? (url.searchParams.get('period') || 'all') : 'all';
    const { data, error } = await s.rpc('mywii_leaderboards', { p_game_id: gameId, p_period: period, p_limit: 10 });
    if (error) throw error;
    return json(200, { leaderboards: data || [], period });
  }
  if (path === 'player-leaderboard' && method === 'GET') {
    const period = ['all','week','month'].includes(url.searchParams.get('period')) ? (url.searchParams.get('period') || 'all') : 'all';
    const { data, error } = await s.rpc('mywii_player_leaderboard', { p_period: period, p_limit: 50 });
    if (error) throw error;
    return json(200, { players: data || [], period });
  }

  const user = await requireUser(s,event);
  const p = await profile(s,user.id);

  if (path === 'profile' && method === 'GET') return json(200,{profile:p});
  if (path === 'profile' && method === 'PATCH') {
    const d=await body(event); const username=safe(d.username,20); const bio=safe(d.bio,160);
    if (!/^[A-Za-z0-9_ -]{3,20}$/.test(username)) return fail(400,'Pseudo : 3 à 20 caractères.');
    const {data,error}=await s.from('profiles').update({username,bio,updated_at:now()}).eq('id',user.id).select().single();
    if(error) return fail(409,'Pseudo déjà utilisé ou profil invalide.');
    return json(200,{profile:data});
  }
  if (path.startsWith('profile/') && method === 'GET') {
    const username=decodeURIComponent(path.slice(8));
    const {data:target}=await s.from('profiles').select('id,username,bio,created_at').ilike('username',username).maybeSingle();
    if(!target) return fail(404,'Profil introuvable.');
    const [{data:scores},{count:published},{data:friends}] = await Promise.all([
      s.from('scores').select('game_id,score,games(title)').eq('user_id',target.id),
      s.from('games').select('id',{count:'exact',head:true}).eq('uploader',target.id).eq('status','approved'),
      s.from('friendships').select('id').or(`and(user_id.eq.${target.id},friend_id.eq.${user.id},status.eq.accepted),and(user_id.eq.${user.id},friend_id.eq.${target.id},status.eq.accepted)`)
    ]);
    const best={}; for(const x of scores||[]) best[x.game_id]=Math.max(best[x.game_id]??-Infinity,Number(x.score));
    const trophies=[]; if((scores||[]).length) trophies.push('Premier score'); if(Object.keys(best).length>=3)trophies.push('Joueur polyvalent'); if((scores||[]).length>=10)trophies.push('Compétiteur'); if((published||0)>0)trophies.push('Créateur');
    return json(200,{profile:target,stats:{games_played:Object.keys(best).length,total_scores:(scores||[]).length,published_games:published||0,best_scores:Object.entries(best).map(([game_id,score])=>({game_id,score,title:scores.find(x=>String(x.game_id)===game_id)?.games?.title||'Jeu'}))},trophies,is_friend:(friends||[]).length>0});
  }

  // Developer dashboard: publish, edit, rotate integration key, view pending moderation
  if (path === 'my-games' && method === 'GET') {
    const {data,error}=await s.from('games').select('id,title,description,genre,version,status,created_at,score_limit,storage_path').eq('uploader',user.id).order('created_at',{ascending:false});
    if(error) throw error;
    return json(200,{games:data||[]});
  }
  if (path === 'games' && method === 'POST') {
    const d=await body(event);
    const title=safe(d.title,60), description=safe(d.description,3000), genre=safe(d.genre||'Autre',40), version=safe(d.version||'1.0',20), storage_path=safe(d.storage_path,240), is_multiplayer=d.is_multiplayer!==false;
    if(!title || !storage_path.startsWith(`${user.id}/`) || !storage_path.toLowerCase().endsWith('.exe')) return fail(400,'Informations ou chemin de fichier invalides.');
    const score_limit=Number(d.score_limit||1000000000);
    if(!Number.isFinite(score_limit)||score_limit<=0) return fail(400,'Limite de score invalide.');
    const rawKey=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    const {data,error}=await s.from('games').insert({title,description,genre,version,storage_path,uploader:user.id,status:'pending',score_limit,is_multiplayer,api_key_hash:await sha256(rawKey)}).select('id,title,status').single();
    if(error) throw error;
    return json(201,{game:data,integration_key:rawKey,message:'Jeu envoyé en modération. Copie ta clé maintenant : elle ne sera plus affichée.'});
  }
  const gameId = path.match(/^games\/([0-9a-f-]+)$/i);
  if(gameId && method==='DELETE'){
    const {data:g,error:readError}=await s.from('games').select('id,storage_path').eq('id',gameId[1]).eq('uploader',user.id).maybeSingle();
    if(readError)throw readError;if(!g)return fail(404,'Jeu introuvable ou non autorisé.');
    const {error:storageError}=await s.storage.from('games').remove([g.storage_path]);if(storageError)throw storageError;
    const {error}=await s.from('games').delete().eq('id',gameId[1]).eq('uploader',user.id);if(error)throw error;return json(200,{ok:true});
  }
  if(gameId && method==='PATCH'){
    const d=await body(event); const changes={};
    if(d.title!==undefined) changes.title=safe(d.title,60);
    if(d.description!==undefined) changes.description=safe(d.description,3000);
    if(d.genre!==undefined) changes.genre=safe(d.genre,40);
    if(d.version!==undefined) changes.version=safe(d.version,20);
    if(d.score_limit!==undefined){const n=Number(d.score_limit);if(!Number.isFinite(n)||n<=0)return fail(400,'Limite de score invalide.');changes.score_limit=n;}
    if(d.is_multiplayer!==undefined) changes.is_multiplayer=!!d.is_multiplayer;
    const {data,error}=await s.from('games').update(changes).eq('id',gameId[1]).eq('uploader',user.id).select('id,title,description,genre,version,status,score_limit,is_multiplayer').maybeSingle();
    if(error) throw error; if(!data)return fail(404,'Jeu introuvable ou non autorisé.'); return json(200,{game:data});
  }
  const rotate=path.match(/^games\/([0-9a-f-]+)\/rotate-key$/i);
  if(rotate&&method==='POST'){
    const rawKey=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    const {data,error}=await s.from('games').update({api_key_hash:await sha256(rawKey)}).eq('id',rotate[1]).eq('uploader',user.id).select('id').maybeSingle();
    if(error)throw error;if(!data)return fail(404,'Jeu introuvable.');return json(200,{integration_key:rawKey});
  }
  if(path==='admin/pending'&&method==='GET'){
    await requireAdmin(s,user);
    const {data,error}=await s.from('games').select('id,title,description,genre,version,created_at,profiles(username)').eq('status','pending').order('created_at');
    if(error)throw error;return json(200,{games:data||[]});
  }
  const moderate=path.match(/^admin\/games\/([0-9a-f-]+)$/i);
  if(moderate&&method==='PATCH'){
    await requireAdmin(s,user);const d=await body(event);if(!['approved','rejected'].includes(d.status))return fail(400,'Statut invalide.');
    const {data,error}=await s.from('games').update({status:d.status}).eq('id',moderate[1]).select('id,status').single();if(error)throw error;return json(200,{game:data});
  }

  // Friend system
  if(path==='friends'&&method==='GET'){
    const {data,error}=await s.from('friendships').select('id,user_id,friend_id,status,created_at').or(`user_id.eq.${user.id},friend_id.eq.${user.id}`).order('created_at',{ascending:false});if(error)throw error;
    const ids=[...new Set((data||[]).map(x=>x.user_id===user.id?x.friend_id:x.user_id))];let names={};if(ids.length){const {data:ps}=await s.from('profiles').select('id,username').in('id',ids);for(const x of ps||[])names[x.id]=x.username;}
    return json(200,{friends:(data||[]).map(x=>({...x,other_id:x.user_id===user.id?x.friend_id:x.user_id,username:names[x.user_id===user.id?x.friend_id:x.user_id]||'Joueur'}))});
  }
  if(path==='friends/request'&&method==='POST'){
    const d=await body(event);const target=safe(d.username,20);const {data:other}=await s.from('profiles').select('id').ilike('username',target).maybeSingle();if(!other)return fail(404,'Joueur introuvable.');if(other.id===user.id)return fail(400,'Tu ne peux pas t’ajouter toi-même.');
    const {data:existing}=await s.from('friendships').select('id,status').or(`and(user_id.eq.${user.id},friend_id.eq.${other.id}),and(user_id.eq.${other.id},friend_id.eq.${user.id})`).maybeSingle();
    if(existing)return fail(409,'Une demande ou une amitié existe déjà.');const {error}=await s.from('friendships').insert({user_id:user.id,friend_id:other.id,status:'pending'});if(error)throw error;return json(201,{ok:true});
  }
  const friendAction=path.match(/^friends\/([0-9a-f-]+)$/i);
  if(friendAction&&method==='POST'){
    const {data,error}=await s.from('friendships').update({status:'accepted'}).eq('id',friendAction[1]).eq('friend_id',user.id).eq('status','pending').select('id').maybeSingle();if(error)throw error;if(!data)return fail(404,'Demande introuvable.');return json(200,{ok:true});
  }
  if(friendAction&&method==='DELETE'){
    const {error}=await s.from('friendships').delete().eq('id',friendAction[1]).or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);if(error)throw error;return json(200,{ok:true});
  }

  // Private direct messages; only accepted friends can read/write
  const dm=path.match(/^dms\/([0-9a-f-]+)$/i);
  if(dm&&method==='GET'){
    const other=dm[1];if(!(await areFriends(s,user.id,other)))return fail(403,'Ajoute ce joueur en ami pour discuter.');
    const {data,error}=await s.from('direct_messages').select('id,sender_id,body,created_at').or(`and(sender_id.eq.${user.id},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${user.id})`).order('created_at').limit(100);if(error)throw error;return json(200,{messages:data||[]});
  }
  if(dm&&method==='POST'){
    const other=dm[1];if(!(await areFriends(s,user.id,other)))return fail(403,'Ajoute ce joueur en ami pour discuter.');const d=await body(event),message=safe(d.body,1000);if(!message)return fail(400,'Message vide.');
    const {data,error}=await s.from('direct_messages').insert({sender_id:user.id,recipient_id:other,body:message}).select('id').single();if(error)throw error;return json(201,{ok:true,id:data.id});
  }

  // Friend sessions / rooms
  if(path==='rooms'&&method==='GET'){
    const {data,error}=await s.from('room_members').select('room_id,rooms(id,name,invite_code,is_private,owner_id,profiles(username))').eq('user_id',user.id);if(error)throw error;
    return json(200,{rooms:(data||[]).map(x=>({...x.rooms,owner:x.rooms?.profiles?.username||'Joueur'})).filter(Boolean)});
  }
  if(path==='rooms'&&method==='POST'){
    const d=await body(event),name=safe(d.name,40);if(!name)return fail(400,'Nom du salon obligatoire.');const invite_code=crypto.randomUUID().slice(0,8).toUpperCase();
    const {data,error}=await s.from('rooms').insert({name,owner_id:user.id,invite_code,is_private:!!d.private}).select('id,name,invite_code').single();if(error)throw error;
    const {error:memberError}=await s.from('room_members').insert({room_id:data.id,user_id:user.id});if(memberError)throw memberError;return json(201,{room:data});
  }
  if(path==='rooms/join'&&method==='POST'){
    const d=await body(event),code=safe(d.invite_code,20).toUpperCase();const {data:r}=await s.from('rooms').select('id').eq('invite_code',code).maybeSingle();if(!r)return fail(404,'Invitation inconnue.');
    const {error}=await s.from('room_members').upsert({room_id:r.id,user_id:user.id},{onConflict:'room_id,user_id'});if(error)throw error;return json(200,{ok:true,room_id:r.id});
  }
  const roomMessages=path.match(/^rooms\/([0-9a-f-]+)\/messages$/i);
  if(roomMessages&&['GET','POST'].includes(method)){
    const rid=roomMessages[1];const {data:member}=await s.from('room_members').select('room_id').eq('room_id',rid).eq('user_id',user.id).maybeSingle();if(!member)return fail(403,'Tu ne fais pas partie de ce salon.');
    if(method==='GET'){const {data,error}=await s.from('room_messages').select('id,user_id,body,created_at,profiles(username)').eq('room_id',rid).order('created_at').limit(100);if(error)throw error;return json(200,{messages:(data||[]).map(m=>({...m,username:m.profiles?.username||'Joueur'}))});}
    const d=await body(event),message=safe(d.body,1000);if(!message)return fail(400,'Message vide.');const {error}=await s.from('room_messages').insert({room_id:rid,user_id:user.id,body:message});if(error)throw error;return json(201,{ok:true});
  }

  // Score submission. A score requires a signed-in MyWii player, a game key,
  // per-game score ceiling, and a server-side cooldown. Game-specific verification
  // is still required for strong anti-cheat guarantees.
  if(path==='scores'&&method==='POST'){
    const d=await body(event),gid=d.game_id,score=Number(d.score),key=event.headers?.['x-mywii-game-key']||event.headers?.['X-MyWii-Game-Key']||'';
    if(!gid||!Number.isFinite(score)||score<0)return fail(400,'Score invalide.');
    const {data:g}=await s.from('games').select('id,score_limit,api_key_hash,status,is_multiplayer').eq('id',gid).maybeSingle();if(!g||g.status!=='approved'||!g.is_multiplayer||!g.api_key_hash||await sha256(String(key))!==g.api_key_hash)return fail(403,'Clé de jeu invalide.');
    if(score>Number(g.score_limit))return fail(400,'Score supérieur à la limite configurée.');
    const {data:last}=await s.from('scores').select('created_at').eq('game_id',gid).eq('user_id',user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(last&&Date.now()-new Date(last.created_at).getTime()<5000)return fail(429,'Attends 5 secondes avant un nouveau score.');
    const {error}=await s.from('scores').insert({game_id:gid,user_id:user.id,score,proof:safe(d.proof,500)});if(error)throw error;return json(201,{ok:true});
  }
  if(path==='trophies'&&method==='GET'){
    const {data:scores}=await s.from('scores').select('id,game_id,score').eq('user_id',user.id);const {count:games}=await s.from('games').select('id',{count:'exact',head:true}).eq('uploader',user.id).eq('status','approved');const n=scores?.length||0;
    const trophies=[{id:'first_score',name:'Premier score',icon:'🥉',unlocked:n>=1},{id:'ten_scores',name:'Compétiteur',icon:'🏆',unlocked:n>=10},{id:'multi_game',name:'Joueur polyvalent',icon:'🎮',unlocked:new Set((scores||[]).map(x=>x.game_id)).size>=3},{id:'creator',name:'Créateur',icon:'🛠️',unlocked:(games||0)>=1}];return json(200,{trophies});
  }
  return fail(404,'Route API inconnue.');
}
async function areFriends(s,a,b){const {data}=await s.from('friendships').select('id').eq('status','accepted').or(`and(user_id.eq.${a},friend_id.eq.${b}),and(user_id.eq.${b},friend_id.eq.${a})`).maybeSingle();return !!data;}
async function sha256(value){const bytes=new TextEncoder().encode(value);const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
// Netlify Functions v2 uses the standard Fetch API: Request in, Response out.
export default async (request) => {
  try {
    const headers = Object.fromEntries(request.headers.entries());
    const event = {
      rawUrl: request.url,
      path: new URL(request.url).pathname,
      httpMethod: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? null : await request.text()
    };
    const result = await run(event);
    if (result instanceof Response) return result;
    const responseHeaders = new Headers(result.headers || {});
    return new Response(result.body ?? '', {
      status: result.statusCode || 200,
      headers: responseHeaders
    });
  } catch (e) {
    console.error('MyWii API:', e);
    const result = fail(e.status || 500, e.status ? e.message : 'Erreur serveur. Vérifie la configuration Supabase et les tables SQL.');
    return new Response(result.body, { status: result.statusCode, headers: result.headers });
  }
};
