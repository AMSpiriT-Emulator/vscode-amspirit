import * as http from 'http';
import * as cp from 'child_process';

export class EmulatorClient {
    constructor(public readonly port: number = 8765) {}

    async ping(): Promise<boolean> {
        try {
            await this.get('/api/state', 2000);
            return true;
        } catch {
            return false;
        }
    }

    async injectBasic(source: string, resetFirst: boolean, runAfter: boolean): Promise<void> {
        const qs = [resetFirst && 'reset=1', runAfter && 'run=1'].filter(Boolean).join('&');
        const path = `/api/basic${qs ? '?' + qs : ''}`;
        const body = await this.post(path, source, 'text/plain; charset=utf-8', 5000);
        let parsed: { ok?: boolean };
        try { parsed = JSON.parse(body); } catch { parsed = {}; }
        if (!parsed.ok) throw new Error('Emulator rejected BASIC injection');
    }

    private get(path: string, timeoutMs: number): Promise<string> {
        return new Promise((resolve, reject) => {
            const req = http.get(
                { hostname: '127.0.0.1', port: this.port, path, timeout: timeoutMs },
                (res) => {
                    let data = '';
                    res.on('data', (chunk: string) => (data += chunk));
                    res.on('end', () => resolve(data));
                }
            );
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
    }

    private post(
        path: string, body: string, contentType: string, timeoutMs: number
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const buf = Buffer.from(body, 'utf-8');
            const req = http.request(
                {
                    hostname: '127.0.0.1',
                    port: this.port,
                    path,
                    method: 'POST',
                    timeout: timeoutMs,
                    headers: {
                        'Content-Type': contentType,
                        'Content-Length': buf.length,
                    },
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk: string) => (data += chunk));
                    res.on('end', () => resolve(data));
                }
            );
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            req.write(buf);
            req.end();
        });
    }
}

export function spawnEmulator(
    binaryPath: string,
    port: number,
    extraArgs: string[]
): cp.ChildProcess {
    const args = ['--web-ui', '--web-port', String(port), ...extraArgs];
    return cp.spawn(binaryPath, args, { stdio: 'ignore', detached: false });
}
