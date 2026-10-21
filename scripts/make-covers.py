#!/usr/bin/env python3
"""Build data/documents.json and cover thumbnails for the /boker grid.

Documents are the archive posts whose content on trondworren.net was a scanned
document: a first-page image plus (usually) a Google Drive PDF. Input is the
indexed list (docs-raw.json); covers are only generated when missing, so the
script is cheap to re-run. Output: covers/<id>-360.webp, covers/<id>-720.webp.
"""
import json, os, re, sys, io, urllib.request, urllib.parse, concurrent.futures as cf
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
raw = json.load(open(sys.argv[1]))
os.makedirs(os.path.join(ROOT, 'covers'), exist_ok=True)

def make(o):
    if not o['pages']:
        return None
    did = f"{o['m']}-{o['i']}"
    out = {w: os.path.join(ROOT, 'covers', f'{did}-{w}.webp') for w in (360, 720)}
    if not all(os.path.exists(p) for p in out.values()):
        try:
            req = urllib.request.Request(urllib.parse.quote(o['pages'][0], safe=':/%?=&'), headers={'User-Agent': 'Mozilla/5.0 trondw-archive'})
            im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read())).convert('RGB')
        except Exception as e:
            print('skip', did, e); return None
        for w, p in out.items():
            c = im.copy(); c.thumbnail((w, w * 3)); c.save(p, 'WEBP', quality=72, method=6)
    w, h = Image.open(out[360]).size
    pdf = next((i for i, code in o.get('driveCheck', []) if code == 200), None)
    return {'id': did, 'm': o['m'], 'i': o['i'], 'd': o['d'], 't': o['t'], 'w': w, 'h': h, 'pdf': pdf}

with cf.ThreadPoolExecutor(6) as ex:
    docs = [d for d in ex.map(make, raw) if d]
docs.sort(key=lambda d: (d['d'], d['i']), reverse=True)
json.dump(docs, open(os.path.join(ROOT, 'data', 'documents.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(docs), 'documents,', sum(1 for d in docs if d['pdf']), 'with viewable PDF')
