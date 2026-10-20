"""Build public ZIPs from an explicit allowlist, without local Git history."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / 'chrome-extension'
OUTPUT = ROOT / 'dist'


def public_files():
    files = [ROOT / name for name in ('README.md', 'LICENSE', 'custom-instructions.md', '.gitignore', '.gitattributes')]
    for directory, suffixes in [('chrome-extension', {'.js', '.html', '.css', '.json'}),
                                ('tests', {'.js', '.py'}), ('docs', {'.md'}), ('scripts', {'.py'})]:
        files.extend(path for path in sorted((ROOT / directory).iterdir()) if path.is_file() and path.suffix in suffixes)
    files.append(ROOT / '.github/workflows/checks.yml')
    return files


def validate(files):
    manifest = json.loads((EXTENSION / 'manifest.json').read_text())
    version = manifest['version']
    if f'（{version}）' not in (ROOT / 'README.md').read_text():
        raise ValueError('README and manifest versions differ')
    references = [manifest['background']['service_worker'], manifest['action']['default_popup'], manifest['options_ui']['page']]
    references.extend(script for entry in manifest['content_scripts'] for script in entry['js'])
    for page in EXTENSION.glob('*.html'):
        references.extend(re.findall(r'(?:src|href)="([^"#]+\.(?:js|css))"', page.read_text()))
    for reference in references:
        if not (EXTENSION / reference).is_file():
            raise ValueError(f'Missing extension asset: {reference}')
    patterns = [r'/' + 'home' + r'/[^/\s]+/', r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
                r'\bAKIA[0-9A-Z]{16}\b', r'\bgh[pousr]_[A-Za-z0-9]{30,}\b',
                r'\bgithub_pat_[A-Za-z0-9_]{40,}\b']
    for path in files:
        content = path.read_text()
        if any(re.search(pattern, content) for pattern in patterns):
            raise ValueError(f'Possible private data in {path.relative_to(ROOT)}; inspect before packaging')
    return version


def write_zip(path, entries):
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for source, target in entries:
            entry = zipfile.ZipInfo(target, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, source.read_bytes())


def main():
    files = public_files()
    version = validate(files)
    OUTPUT.mkdir(exist_ok=True)
    prefix = f'chatgpt-voicevox-{version}'
    extension_zip = OUTPUT / f'{prefix}-extension.zip'
    source_zip = OUTPUT / f'{prefix}-source.zip'
    extension_entries = [(path, path.relative_to(EXTENSION).as_posix()) for path in files if path.parent == EXTENSION]
    extension_entries.extend((ROOT / name, name) for name in ('LICENSE', 'README.md'))
    write_zip(extension_zip, extension_entries)
    write_zip(source_zip, [(path, f'{prefix}/{path.relative_to(ROOT).as_posix()}') for path in files])
    checksums = []
    for path in (extension_zip, source_zip):
        checksums.append(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}')
        print(f'{path.relative_to(ROOT)} ({path.stat().st_size} bytes)')
    (OUTPUT / 'SHA256SUMS.txt').write_text('\n'.join(checksums) + '\n')
    print('PASS: assets, version and private-data pattern checks; ZIPs contain allowlisted files only')


if __name__ == '__main__':
    main()
