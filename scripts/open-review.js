import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function openReviewPage(file) {
  if (process.env.CI || (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)) return false;
  const url = pathToFileURL(path.resolve(file)).href;
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  return new Promise(resolve => {
    const child = spawn(command, args, { shell: false, stdio: 'ignore', windowsHide: true });
    const timer = setTimeout(() => { child.kill('SIGKILL'); child.unref(); finish(false); }, 5_000);
    const finish = opened => { clearTimeout(timer); resolve(opened); };
    child.once('error', () => finish(false));
    child.once('exit', code => finish(code === 0));
  });
}
