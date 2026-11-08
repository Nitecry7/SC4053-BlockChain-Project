"""Phase 2: mechanical checks of docs/report/AI_AUDIT_REPORT.md (and docs/report/README.md).
Run from the repo root. Prints a findings list; exit code 0 always (it is a report, not a gate)."""
import os, re, subprocess, sys, unicodedata
from collections import defaultdict

ROOT = os.getcwd()
REPORT = 'docs/report/AI_AUDIT_REPORT.md'
FILES = [REPORT, 'docs/report/README.md']

def git(*a):
    return subprocess.run(['git', *a], capture_output=True, text=True)

def slug(h):
    h = re.sub(r'<[^>]+>', '', h).strip().lower()
    h = h.replace('`', '')
    h = ''.join(c for c in h if c.isalnum() or c in ' -_')
    return h.replace(' ', '-')

anchor_cache = {}
def anchors(path):
    if path in anchor_cache:
        return anchor_cache[path]
    s = set()
    try:
        text = open(path, encoding='utf-8').read()
    except Exception:
        anchor_cache[path] = None
        return None
    counts = defaultdict(int)
    infence = False
    for line in text.splitlines():
        if line.startswith('```'):
            infence = not infence
            continue
        if infence:
            continue
        m = re.match(r'^(#{1,6})\s+(.*)', line)
        if m:
            base = slug(m.group(2))
            n = counts[base]; counts[base] += 1
            s.add(base if n == 0 else f'{base}-{n}')
        for a in re.findall(r'<a\s+(?:id|name)="([^"]+)"', line):
            s.add(a)
    anchor_cache[path] = s
    return s

findings = []
def find(kind, where, msg):
    findings.append((kind, where, msg))

# ---------- 1. links and anchors ----------
link_re = re.compile(r'(?<!\!)\[(?:[^\]]*)\]\(([^)\s]+)\)|\!\[[^\]]*\]\(([^)\s]+)\)')
nlinks = 0
for f in FILES:
    base = os.path.dirname(f)
    for i, line in enumerate(open(f, encoding='utf-8'), 1):
        for m in link_re.finditer(line):
            t = m.group(1) or m.group(2)
            if re.match(r'^[a-z]+://', t) or t.startswith('mailto:'):
                continue
            nlinks += 1
            path, _, frag = t.partition('#')
            target = f if path == '' else os.path.normpath(os.path.join(base, path))
            if path and not os.path.exists(target):
                find('BROKEN-LINK', f'{f}:{i}', t)
                continue
            if frag:
                if os.path.isdir(target) or not target.endswith('.md'):
                    find('ANCHOR-ON-NON-MD', f'{f}:{i}', t)
                    continue
                a = anchors(target)
                if a is None or frag not in a:
                    find('BROKEN-ANCHOR', f'{f}:{i}', t)
print(f'links checked: {nlinks}')

# ---------- 2. commit hashes ----------
text = open(REPORT, encoding='utf-8').read()
lines = text.splitlines()
hash_re = re.compile(r'`([0-9a-f]{7,40})`|(?<![0-9A-Za-z/._-])([0-9a-f]{7})(?![0-9A-Za-z_-])')
seen = {}
for i, line in enumerate(lines, 1):
    for m in hash_re.finditer(line):
        h = m.group(1) or m.group(2)
        if not re.search(r'[a-f]', h) or not re.search(r'[0-9]', h):
            continue  # pure digits or pure letters: not a hash
        seen.setdefault(h, []).append(i)
print(f'distinct hash-like tokens: {len(seen)}')
months = {m: n for n, m in enumerate(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], 1)}
hash_rows = []
for h, where in sorted(seen.items(), key=lambda kv: kv[1][0]):
    r = git('cat-file', '-t', h)
    if r.returncode != 0:
        find('UNKNOWN-HASH', f'{REPORT}:{where[0]}', h)
        continue
    d = git('show', '-s', '--format=%ad|%s', '--date=format:%d %b', h).stdout.strip()
    date, _, subj = d.partition('|')
    hash_rows.append((h, where, date, subj[:70]))
    # date stated near the hash on the same line?
    for ln in where:
        L = lines[ln - 1]
        pos = L.find(h)
        window = L[max(0, pos - 60): pos + 80]
        for dm in re.finditer(r'\b(\d{1,2}) (Oct|Nov)\b', window):
            stated = f'{int(dm.group(1)):02d} {dm.group(2)}'
            if stated != date and abs(window.find(dm.group(0)) - window.find(h)) < 40:
                find('DATE-NEAR-HASH', f'{REPORT}:{ln}', f'{h} committed {date}, text says "{dm.group(0)}" nearby (check which it refers to)')

# ---------- 3. issue references ----------
issue_dir = 'docs/ai-audit/issues'
issue_files = os.listdir(issue_dir)
def issue_file(iid):
    pre = iid.lower() + '-'
    hits = [f for f in issue_files if f.lower().startswith(pre)]
    return hits[0] if hits else None
ids = set(re.findall(r'\b(P2-0\d\d)\b', text)) | set(re.findall(r'(?<![\w-])(00[1-9])(?![\w])', text))
for iid in sorted(ids):
    if not issue_file(iid):
        find('ISSUE-NO-FILE', REPORT, iid)
print(f'issue ids referenced: {len(ids)}; issue files on disk: {len(issue_files)}')
for f in sorted(issue_files):
    m = re.match(r'(p2-\d{3}|\d{3})-', f)
    if m and m.group(1).upper() not in {i.upper() for i in ids}:
        find('ISSUE-NOT-IN-REPORT', issue_dir, f)

# severity in inventory vs issue file
inv = text[text.index('### 5.1 Inventory'):text.index('### 5.2')]
for row in inv.splitlines():
    if not row.startswith('| ['):
        continue
    cells = [c.strip() for c in row.strip('|').split('|')]
    sev, status = cells[4], cells[5]
    for iid in re.findall(r'\[(P2-0\d\d|00\d)\]', cells[0]):
        fn = issue_file(iid)
        if not fn:
            continue
        body = open(os.path.join(issue_dir, fn), encoding='utf-8').read()
        m = re.search(r'\*\*Severity:?\*\*:?\s*([^\n]+)', body) or re.search(r'Severity[^:\n]*:\s*([^\n]+)', body)
        hash_rows.append((f'SEV {iid}', [0], sev, (m.group(1).strip() if m else 'NO SEVERITY LINE')[:110]))

# ---------- 4. markers ----------
markers = []
for i, line in enumerate(lines, 1):
    for m in re.finditer(r'\[(P2 to confirm[^\]]*|P2 to add[^\]]*|P1 \+ P2 to confirm[^\]]*)\]', line):
        sec = ''
        for j in range(i - 1, -1, -1):
            if lines[j].startswith('#'):
                sec = lines[j].lstrip('# ').strip(); break
        markers.append((i, m.group(1), sec))
print(f'markers: {len(markers)}')

# ---------- output ----------
out = sys.argv[1] if len(sys.argv) > 1 else 'phase2-out'
os.makedirs(out, exist_ok=True)
with open(os.path.join(out, 'findings.txt'), 'w', encoding='utf-8') as fh:
    for k, w, msg in findings:
        fh.write(f'{k}\t{w}\t{msg}\n')
with open(os.path.join(out, 'hashes.txt'), 'w', encoding='utf-8') as fh:
    for h, where, date, subj in hash_rows:
        fh.write(f'{h}\tlines {",".join(map(str, where))}\t{date}\t{subj}\n')
with open(os.path.join(out, 'markers.txt'), 'w', encoding='utf-8') as fh:
    for i, mk, sec in markers:
        fh.write(f'{i}\t[{mk}]\t{sec}\n')
print(f'findings: {len(findings)}')
for k, w, msg in findings:
    print(f'  {k}  {w}  {msg}')
