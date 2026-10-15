"""Start the local game in the background, reusing it if already running."""
import argparse
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8765)
parser.add_argument('--no-browser', action='store_true')
args = parser.parse_args()
url = f'http://127.0.0.1:{args.port}/'
opener = build_opener(ProxyHandler({}))


def ready():
    try:
        with opener.open(url, timeout=1) as response:
            if '<title>猫猫对对碰</title>' not in response.read().decode('utf-8'):
                raise RuntimeError(f'Port {args.port} is used by another app.')
            return True
    except URLError:
        return False


if not ready():
    with (ROOT / 'server.stdout.log').open('ab') as out, (ROOT / 'server.stderr.log').open('ab') as err:
        process = subprocess.Popen(
            [sys.executable, '-m', 'http.server', str(args.port), '--bind',
             '127.0.0.1', '--directory', str(ROOT / 'app')],
            cwd=ROOT, stdin=subprocess.DEVNULL, stdout=out, stderr=err,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        )
    for attempt in range(25):
        if process.poll() is not None:
            raise RuntimeError('Server exited. Check server.stderr.log.')
        if ready():
            break
        time.sleep(0.2)
    else:
        process.terminate()
        raise RuntimeError('Server did not become ready. Check server.stderr.log.')
print(f'Game is running: {url}')
if not args.no_browser:
    webbrowser.open(url)
