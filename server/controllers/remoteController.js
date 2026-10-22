const { ipcMain } = require('electron');
const qrcode = require('qrcode-generator');
const devices = require('../remote/devices');
const remote = require('../remote/server');

/**
 * Desktop side of the phone access: switch the server on / off, pair a device by
 * QR code, rename / limit / revoke devices. (Never reachable from a remote device
 * itself — see remote/policy.)
 */
function qrSvg(text) {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
}

function register() {
    // + routeWarning: a VPN / TUN adapter that swallows the replies to the phone.
    ipcMain.handle('remote:status', async () => {
        const st = remote.status();
        const routeWarning = st.running ? await require('../remote/routeCheck').check(devices.lanAddresses()).catch(() => null) : null;
        return { ...st, routeWarning };
    });

    ipcMain.handle('remote:setSettings', async (_, { enabled, port }) => {
        const before = devices.settings();
        const s = devices.setSettings({ enabled, port });
        if (!s.enabled) remote.stop();
        else if (!remote.status().running || before.port !== s.port) await remote.start(s.port);
        return remote.status();
    });

    // A one-time pairing link (10 minutes) as a QR code, for each address of this PC.
    ipcMain.handle('remote:createCode', (_, { access = 'full', name = '' } = {}) => {
        const st = remote.status();
        if (!st.running) throw new Error('Сначала включите доступ из сети');
        const { code, expiresIn } = devices.createCode({ access, name });
        return {
            expiresIn,
            links: st.urls.map(u => {
                const link = `${u.url}/pair?c=${code}`;
                return { ...u, link, qr: qrSvg(link) };
            }),
        };
    });

    ipcMain.handle('remote:updateDevice', (_, { id, name, access }) => devices.update(id, { name, access }));
    ipcMain.handle('remote:revoke', (_, { id }) => devices.revoke(id));
}

// On app start: bring the server up if it was on.
async function startIfEnabled() {
    const s = devices.settings();
    const port = Number(process.env.DARKFRAME_REMOTE_PORT) || s.port;
    if (s.enabled || process.env.DARKFRAME_REMOTE_PORT) await remote.start(port);
}

module.exports = { register, startIfEnabled };
