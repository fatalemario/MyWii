"""Serveur web MyWii : comptes, catalogue PC, salons et classements.
Prototype communautaire. Les jeux envoyes restent en attente de moderation.
"""
import os, re, sqlite3, secrets, uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from flask import Flask, request, jsonify, session, send_from_directory, render_template
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('MYWII_DATA', ROOT / 'mywii_data'))
UPLOADS = DATA / 'uploads'
UPLOADS.mkdir(parents=True, exist_ok=True)
DB = DATA / 'mywii.sqlite3'
MAX_UPLOAD = 500 * 1024 * 1024
app = Flask(__name__, template_folder='web_templates', static_folder='web_static')
app.secret_key = os.environ.get('MYWII_SECRET', 'CHANGE-ME-before-public-hosting-' + secrets.token_hex(24))
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'


def db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with db() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE, password TEXT, created TEXT);
        CREATE TABLE IF NOT EXISTS games(id INTEGER PRIMARY KEY, title TEXT, description TEXT, genre TEXT, version TEXT, filename TEXT, uploader INTEGER, status TEXT DEFAULT 'pending', created TEXT, FOREIGN KEY(uploader) REFERENCES users(id));
        CREATE TABLE IF NOT EXISTS rooms(id INTEGER PRIMARY KEY, name TEXT, owner INTEGER, invite_code TEXT UNIQUE, private INTEGER DEFAULT 0, created TEXT);
        CREATE TABLE IF NOT EXISTS room_members(room_id INTEGER, user_id INTEGER, UNIQUE(room_id,user_id));
        CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, room_id INTEGER, user_id INTEGER, body TEXT, created TEXT);
        CREATE TABLE IF NOT EXISTS scores(id INTEGER PRIMARY KEY, game_id INTEGER, user_id INTEGER, score REAL, proof TEXT, created TEXT);
        CREATE TABLE IF NOT EXISTS game_keys(game_id INTEGER PRIMARY KEY, api_key TEXT);
        ''')


def current_user():
    if not session.get('uid'): return None
    with db() as c: return c.execute('SELECT id,username FROM users WHERE id=?', (session['uid'],)).fetchone()


def login_required(fn):
    @wraps(fn)
    def inner(*a, **kw):
        if not current_user(): return jsonify(error='Connexion requise'), 401
        return fn(*a, **kw)
    return inner


def stamp(): return datetime.now(timezone.utc).isoformat(timespec='seconds')

@app.get('/')
def home(): return render_template('index.html')

@app.get('/api/me')
def me():
    u=current_user(); return jsonify(user=dict(u) if u else None)

@app.post('/api/register')
def register():
    d=request.get_json(silent=True) or {}; name=str(d.get('username','')).strip(); pw=str(d.get('password',''))
    if not re.fullmatch(r'[A-Za-z0-9_ -]{3,20}', name): return jsonify(error='Pseudo : 3 à 20 caractères (lettres, chiffres, espaces, _ ou -).'),400
    if len(pw)<8: return jsonify(error='Mot de passe : 8 caractères minimum.'),400
    try:
        with db() as c: cur=c.execute('INSERT INTO users(username,password,created) VALUES(?,?,?)',(name,generate_password_hash(pw),stamp())); session['uid']=cur.lastrowid
    except sqlite3.IntegrityError: return jsonify(error='Ce pseudo est déjà utilisé.'),409
    return jsonify(user={'username':name})

@app.post('/api/login')
def login():
    d=request.get_json(silent=True) or {}
    with db() as c: u=c.execute('SELECT * FROM users WHERE username=? COLLATE NOCASE',(str(d.get('username','')).strip(),)).fetchone()
    if not u or not check_password_hash(u['password'],str(d.get('password',''))): return jsonify(error='Identifiants incorrects.'),401
    session.clear(); session['uid']=u['id']; return jsonify(user={'username':u['username']})

@app.post('/api/logout')
def logout(): session.clear(); return jsonify(ok=True)

@app.get('/api/games')
def games():
    with db() as c: rows=c.execute("SELECT g.id,g.title,g.description,g.genre,g.version,g.created,u.username uploader FROM games g JOIN users u ON u.id=g.uploader WHERE g.status='approved' ORDER BY g.created DESC").fetchall()
    return jsonify(games=[dict(x) for x in rows])

@app.post('/api/games')
@login_required
def upload_game():
    u=current_user(); title=request.form.get('title','').strip(); desc=request.form.get('description','').strip(); genre=request.form.get('genre','Autre').strip(); version=request.form.get('version','1.0').strip(); f=request.files.get('game')
    if not title or len(title)>60 or not f: return jsonify(error='Titre et fichier du jeu obligatoires.'),400
    original=secure_filename(f.filename or '')
    if not original.lower().endswith('.exe'): return jsonify(error='Seuls les jeux Windows .exe sont acceptés pour le moment.'),400
    if not f.filename or len(desc)>3000: return jsonify(error='Description trop longue.'),400
    stored=uuid.uuid4().hex+'.exe'; f.save(UPLOADS/stored); game_key=secrets.token_urlsafe(32)
    with db() as c:
        cur=c.execute("INSERT INTO games(title,description,genre,version,filename,uploader,status,created) VALUES(?,?,?,?,?,?,'pending',?)",(title,desc,genre,version,stored,u['id'],stamp())); gid=cur.lastrowid
        c.execute('INSERT INTO game_keys(game_id,api_key) VALUES(?,?)',(gid,game_key))
    return jsonify(ok=True,game_id=gid,integration_key=game_key,message='Jeu reçu : il sera visible après modération. Conserve ta clé d’intégration : elle ne sera plus affichée.'),201


@app.post('/api/admin/moderate')
def moderate_game():
    admin_key=os.environ.get('MYWII_ADMIN_KEY','')
    if not admin_key or not secrets.compare_digest(request.headers.get('X-MyWii-Admin-Key',''),admin_key):
        return jsonify(error='Accès administrateur refusé.'),403
    d=request.get_json(silent=True) or {}; gid=d.get('game_id'); status=d.get('status')
    if status not in ('approved','rejected'): return jsonify(error='Statut invalide.'),400
    with db() as c:
        cur=c.execute('UPDATE games SET status=? WHERE id=?',(status,gid))
        if cur.rowcount==0: return jsonify(error='Jeu introuvable.'),404
    return jsonify(ok=True,status=status)

@app.get('/api/games/<int:gid>/download')
def download_game(gid):
    with db() as c: g=c.execute("SELECT filename FROM games WHERE id=? AND status='approved'",(gid,)).fetchone()
    if not g: return jsonify(error='Jeu introuvable ou non publié.'),404
    return send_from_directory(UPLOADS,g['filename'],as_attachment=True,download_name='MyWii_Game.exe')

@app.post('/api/rooms')
@login_required
def create_room():
    u=current_user(); d=request.get_json(silent=True) or {}; name=str(d.get('name','')).strip()
    if not name or len(name)>40: return jsonify(error='Nom du salon : 1 à 40 caractères.'),400
    code=secrets.token_urlsafe(8)
    with db() as c:
        cur=c.execute('INSERT INTO rooms(name,owner,invite_code,private,created) VALUES(?,?,?,?,?)',(name,u['id'],code,int(bool(d.get('private'))),stamp())); rid=cur.lastrowid
        c.execute('INSERT INTO room_members(room_id,user_id) VALUES(?,?)',(rid,u['id']))
    return jsonify(room={'id':rid,'name':name,'invite_code':code}),201

@app.get('/api/rooms')
@login_required
def list_rooms():
    u=current_user()
    with db() as c: rows=c.execute('SELECT r.id,r.name,r.private,r.invite_code,u.username owner FROM rooms r JOIN users u ON u.id=r.owner JOIN room_members m ON m.room_id=r.id WHERE m.user_id=? ORDER BY r.created DESC',(u['id'],)).fetchall()
    return jsonify(rooms=[dict(x) for x in rows])

@app.post('/api/rooms/join')
@login_required
def join_room():
    u=current_user(); code=str((request.get_json(silent=True) or {}).get('invite_code','')).strip()
    with db() as c:
        r=c.execute('SELECT id FROM rooms WHERE invite_code=?',(code,)).fetchone()
        if not r: return jsonify(error='Invitation inconnue.'),404
        c.execute('INSERT OR IGNORE INTO room_members(room_id,user_id) VALUES(?,?)',(r['id'],u['id']))
    return jsonify(ok=True,room_id=r['id'])

@app.get('/api/rooms/<int:rid>/messages')
@login_required
def get_messages(rid):
    u=current_user()
    with db() as c:
        if not c.execute('SELECT 1 FROM room_members WHERE room_id=? AND user_id=?',(rid,u['id'])).fetchone(): return jsonify(error='Accès refusé.'),403
        after=request.args.get('after',0,type=int)
        rows=c.execute('SELECT m.id,m.body,m.created,u.username FROM messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=? AND m.id>? ORDER BY m.id LIMIT 100',(rid,after)).fetchall()
    return jsonify(messages=[dict(x) for x in rows])

@app.post('/api/rooms/<int:rid>/messages')
@login_required
def post_message(rid):
    u=current_user(); body=str((request.get_json(silent=True) or {}).get('body','')).strip()
    if not body or len(body)>1000: return jsonify(error='Message vide ou trop long (1000 caractères max).'),400
    with db() as c:
        if not c.execute('SELECT 1 FROM room_members WHERE room_id=? AND user_id=?',(rid,u['id'])).fetchone(): return jsonify(error='Accès refusé.'),403
        cur=c.execute('INSERT INTO messages(room_id,user_id,body,created) VALUES(?,?,?,?)',(rid,u['id'],body,stamp()))
    return jsonify(ok=True,id=cur.lastrowid),201

@app.get('/api/leaderboards')
def leaderboards():
    gid=request.args.get('game_id',type=int)
    sql='''SELECT s.game_id,g.title,u.username,MAX(s.score) best_score FROM scores s JOIN games g ON g.id=s.game_id JOIN users u ON u.id=s.user_id WHERE g.status='approved' '''
    args=[]
    if gid: sql+=' AND s.game_id=?'; args.append(gid)
    sql+=' GROUP BY s.game_id,s.user_id ORDER BY s.game_id,best_score DESC LIMIT 300'
    with db() as c: rows=c.execute(sql,args).fetchall()
    return jsonify(leaderboards=[dict(x) for x in rows])

@app.post('/api/scores')
def submit_score():
    d=request.get_json(silent=True) or {}; gid=d.get('game_id'); key=request.headers.get('X-MyWii-Game-Key',''); player=d.get('username'); score=d.get('score')
    try: score=float(score)
    except (ValueError,TypeError): return jsonify(error='Score invalide.'),400
    with db() as c:
        g=c.execute("SELECT id FROM games WHERE id=? AND status='approved'",(gid,)).fetchone()
        k=c.execute('SELECT api_key FROM game_keys WHERE game_id=?',(gid,)).fetchone()
        if not g or not k or not secrets.compare_digest(k['api_key'],key): return jsonify(error='Jeu ou clé de classement invalide.'),403
        u=c.execute('SELECT id FROM users WHERE username=? COLLATE NOCASE',(str(player or ''),)).fetchone()
        if not u: return jsonify(error='Joueur MyWii inconnu.'),404
        c.execute('INSERT INTO scores(game_id,user_id,score,proof,created) VALUES(?,?,?,?,?)',(gid,u['id'],score,str(d.get('proof',''))[:500],stamp()))
    return jsonify(ok=True)

if __name__=='__main__':
    init_db()
    print('MyWii Web demarre sur http://127.0.0.1:5000')
    app.run(host='127.0.0.1',port=int(os.environ.get('PORT','5000')),debug=False)
