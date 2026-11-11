"""Unpacks .crx files (never runs anything) and prints a manifest report.
Usage: python -I unpack.py <downloads_dir>
Each <downloads_dir>/<name>/pkg.crx is extracted to <downloads_dir>/<name>/x/ with path-traversal protection."""
import io, json, os, struct, sys, zipfile

base = os.path.abspath(sys.argv[1])
for name in sorted(os.listdir(base)):
    pkg = os.path.join(base, name, 'pkg.crx')
    if not os.path.isfile(pkg):
        continue
    data = open(pkg, 'rb').read()
    assert data[:4] == b'Cr24', f'{name}: not a CRX'
    ver = struct.unpack('<I', data[4:8])[0]
    start = 12 + struct.unpack('<I', data[8:12])[0] if ver == 3 else 16 + struct.unpack('<I', data[8:12])[0] + struct.unpack('<I', data[12:16])[0]
    out = os.path.join(base, name, 'x')
    os.makedirs(out, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(data[start:])) as z:
        for m in z.infolist():
            dest = os.path.abspath(os.path.join(out, m.filename))
            if not dest.startswith(out + os.sep) and dest != out:
                print('  skipped suspicious path', m.filename)
                continue
            if m.is_dir():
                os.makedirs(dest, exist_ok=True)
            else:
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, 'wb') as f:
                    f.write(z.read(m))
    mf = json.load(open(os.path.join(out, 'manifest.json'), encoding='utf-8-sig'))
    print(f'=== {name}: {mf.get("name")} v{mf.get("version")} (manifest v{mf.get("manifest_version")}) ===')
    print('  permissions:', mf.get('permissions'))
    print('  optional_permissions:', mf.get('optional_permissions'))
    print('  host_permissions:', mf.get('host_permissions'))
    for cs in mf.get('content_scripts', []):
        sizes = [(j, os.path.getsize(os.path.join(out, j))) for j in cs.get('js', []) if os.path.exists(os.path.join(out, j))]
        print('  content_script matches:', cs.get('matches'), '| world:', cs.get('world'), '| run_at:', cs.get('run_at'), '| js:', sizes)
    print('  background:', mf.get('background'))
    print('  action/side_panel:', mf.get('action'), mf.get('side_panel'))
    print('  commands:', mf.get('commands'))
    print('  externally_connectable:', mf.get('externally_connectable'))
    print('  web_accessible_resources:', mf.get('web_accessible_resources'))
    print('  csp:', mf.get('content_security_policy'))
    print('  update_url/homepage:', mf.get('update_url'), mf.get('homepage_url'))
    n = sum(len(f) for _, _, f in os.walk(out))
    print('  files:', n)
