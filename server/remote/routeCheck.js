const { execFile } = require('child_process');

/**
 * Can a phone on the home network get answers at all? A VPN / proxy in TUN mode
 * (Karing, Clash, sing-box, some VPN clients) may take part of the home network
 * into its tunnel — even single addresses, changing over time: the phone's
 * request reaches the PC, the reply goes into the tunnel and never comes back.
 *
 * Windows tells which adapter it would use for each address of the home /24
 * (Find-NetRoute, one PowerShell run for all 254, ~3 s); any address routed
 * elsewhere than the adapter that owns the home address is the problem.
 *
 * check(lan) → null | { adapter, lanAdapter, address, count }
 * The result is cached for a minute and refreshed in the background; the first
 * call waits for it.
 */
const TTL = 60 * 1000;
let cached = null;     // { key, at, value }
let running = null;    // promise of the check in progress

function scan(home) {
    const prefix = home.address.split('.').slice(0, 3).join('.');
    const ps = `$o=@(); foreach($i in 1..254){ $ip='${prefix}.'+$i; if($ip -eq '${home.address}'){continue}; `
        + `$a=(Find-NetRoute -RemoteIPAddress $ip -ErrorAction SilentlyContinue | Select-Object -First 1).InterfaceAlias; `
        + `if($a -and $a -ne '${home.name.replace(/'/g, "''")}'){ $o += $a } }; $o -join [char]10`;
    return new Promise((resolve) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 30000, windowsHide: true },
            (err, stdout) => {
                if (err) return resolve(null);
                const hits = String(stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                if (!hits.length) return resolve(null);
                const byAdapter = hits.reduce((m, a) => m.set(a, (m.get(a) || 0) + 1), new Map());
                const [adapter, count] = [...byAdapter.entries()].sort((a, b) => b[1] - a[1])[0];
                resolve({ adapter, lanAdapter: home.name, address: home.address, count });
            });
    });
}

async function check(lan) {
    if (process.platform !== 'win32') return null;
    const home = (lan || []).find(a => !a.virtual && /^192\.168\./.test(a.address)) || (lan || []).find(a => !a.virtual);
    if (!home) return null;
    const key = `${home.name}|${home.address}`;
    const fresh = cached && cached.key === key && Date.now() - cached.at < TTL;
    if (fresh) return cached.value;
    if (!running) {
        running = scan(home).then(value => { cached = { key, at: Date.now(), value }; return value; })
            .finally(() => { running = null; });
    }
    // Stale but known: answer now, the new result comes with the next call.
    if (cached && cached.key === key) return cached.value;
    return running;
}

module.exports = { check };
