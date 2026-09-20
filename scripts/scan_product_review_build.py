"""Read-only build scan. Reports labels/counts only, never secret values."""
from pathlib import Path
import os, re, json, base64
root=Path(__file__).resolve().parents[1]
dist=root/'frontend/dist'
files=[p for p in dist.rglob('*') if p.is_file()]
private=[]
for folder,dirs,names in os.walk(root):
    dirs[:]=[d for d in dirs if d not in {'.git','node_modules','.vercel','dist'}]
    for name in names:
        if name=='.env' or name.startswith('.env.'):
            for line in (Path(folder)/name).read_text(encoding='utf-8-sig',errors='ignore').splitlines():
                m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$',line)
                if not m:continue
                key,value=m.groups();value=value.strip('"\'')
                if re.search(r'SERVICE|SECRET|PASSWORD|TOKEN|DATABASE_URL|PRIVATE',key,re.I) and len(value)>=8:
                    private.append((key,value.encode()))
for key,value in os.environ.items():
    if re.search(r'SERVICE_ROLE|DB_PASSWORD|DATABASE_URL|ADMIN_PASSWORD|SUPABASE_ACCESS_TOKEN',key,re.I) and len(value)>=8:private.append((key,value.encode()))
findings=[]
for p in files:
    data=p.read_bytes()
    for key,value in private:
        if value in data:findings.append({'file':str(p.relative_to(dist)),'kind':'private-value-match','label':key})
    text=data.decode('utf-8',errors='ignore')
    for pattern,label in [(r'sbp_[A-Za-z0-9]{20,}','management token'),(r'sb_secret_[A-Za-z0-9_-]{10,}','secret API key'),(r'postgres(?:ql)?://[^\s"\']+','database connection URL'),(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----','private key'),(r'\bDATABASE_URL\b','DATABASE_URL')]:
        if re.search(pattern,text):findings.append({'file':str(p.relative_to(dist)),'kind':label})
    for jwt in re.findall(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',text):
        try:
            payload=json.loads(base64.urlsafe_b64decode(jwt.split('.')[1]+'==='))
            if payload.get('role')!='anon':findings.append({'file':str(p.relative_to(dist)),'kind':'non-anon JWT'})
        except Exception:pass
print(json.dumps({'build_files_scanned':len(files),'private_values_checked':len(private),'findings':findings,'result':'PASS' if not findings else 'FAIL'},indent=2))
raise SystemExit(bool(findings))
