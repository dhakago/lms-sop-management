import subprocess, sys, os
PSQL=['psql','-h','/tmp','-p','54329','-U','postgres','-v','ON_ERROR_STOP=1','-q','-t','-A']
def sh(db, sql, check=True):
    r=subprocess.run(PSQL+['-d',db,'-c',sql],capture_output=True,text=True)
    return r
def file(db, f):
    r=subprocess.run(PSQL+['-d',db,'-f',f],capture_output=True,text=True)
    if r.returncode: print(r.stderr); sys.exit(1)
db='lmstest'
subprocess.run(['dropdb','-h','/tmp','-p','54329','-U','postgres','--if-exists',db])
subprocess.run(['createdb','-h','/tmp','-p','54329','-U','postgres',db],check=True)
d=os.path.dirname(os.path.abspath(__file__))
file(db,d+'/shim.sql'); 
for m in sorted(os.listdir(d+'/../migrations')): file(db,d+'/../migrations/'+m)
file(db,d+'/fixtures.sql')
U={'dhaka':'01','ayu':'02','intan':'03','dimas':'04','fajar':'05','rudi':'06','dua':'07','anon':None}
def q(who, sql, role='authenticated'):
    sub = "00000000-0000-0000-0000-0000000000"+U[who] if U[who] else ''
    s=f"set role {role}; select set_config('request.jwt.claim.sub','{sub}',false); {sql}"
    r=subprocess.run(PSQL+['-d',db,'-c',s],capture_output=True,text=True)
    return r
fails=0
def expect(name, who, sql, want=None, err=False, role='authenticated'):
    global fails
    r=q(who,sql,role)
    out=[l for l in r.stdout.strip().split('\n') if l][-1] if r.stdout.strip() else ''
    if err:
        ok = r.returncode!=0
        got='ERROR' if ok else out
    else:
        ok = r.returncode==0 and out==str(want); got=out if r.returncode==0 else r.stderr.strip().split('\n')[0]
    print(('OK  ' if ok else 'FAIL'), name, '' if ok else f'(want {want!r}, got {got!r})')
    if not ok: fails+=1
exec(open(d+'/cases.py').read())
print('GAGAL:',fails); sys.exit(1 if fails else 0)
