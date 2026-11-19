'use strict';
const crypto = require('node:crypto');
const path = require('node:path');

// Separate from the legacy PC/game protocol. Profiles are display labels;
// routing and ownership always use the server-owned socket, never a supplied user id.
module.exports = function attachGameJoySessions(io, app) {
    const players = new Map();
    const maps = new Map();
    const obsVdoLinks = new Map();
    function unpublishMap(p) {
        if (maps.get(p.mapToken) === p) maps.delete(p.mapToken);
        p.mapToken = null;
    }
    function unpublishObsVdoLink(p) {
        if (obsVdoLinks.get(p.obsVdoToken) === p) obsVdoLinks.delete(p.obsVdoToken);
        p.obsVdoToken = null;
    }
    if (app) {
        app.get('/obs/map', (_req, res) => res.sendFile(path.join(__dirname, 'obs-map.html')));
        app.get('/obs/vdo', (_req, res) => res.sendFile(path.join(__dirname, 'obs-vdo.html')));
        app.get('/obs/vdo/current', (req, res) => {
            res.set('Cache-Control', 'no-store');
            const token = req.get('Authorization')?.replace(/^Bearer /, '');
            const player = obsVdoLinks.get(token);
            if (!player) return res.sendStatus(404);
            res.json({ streamId: player.vdoStreamId });
        });
        app.get('/obs/leaflet.js', (_req, res) => res.sendFile(require.resolve('leaflet/dist/leaflet.js')));
        app.get('/obs/leaflet.css', (_req, res) => res.sendFile(require.resolve('leaflet/dist/leaflet.css')));
        app.get('/obs/position', (req, res) => {
            res.set('Cache-Control', 'no-store');
            const token = req.get('Authorization')?.replace(/^Bearer /, '');
            const player = maps.get(token);
            if (!player) return res.sendStatus(404);
            const frame = player.lastFrame;
            const remainingMs = frame && 30000 - frame.ageMs - (Date.now() - frame.receivedAt);
            if (!frame || remainingMs <= 0) return res.sendStatus(204);
            res.json({ latitude: frame.latitude, longitude: frame.longitude, heading: frame.heading, remainingMs });
        });
    }
    const validNumber = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    const label = (v, fallback) => typeof v === 'string' ? v.replace(/[\x00-\x1f]/g, '').trim().slice(0, 80) || fallback : fallback;
    const avatarUrl = v => typeof v === 'string' && v.length <= 2048 && /^https:\/\//i.test(v) ? v : '';
    const send = (id, event, data) => io.to(id).emit(`gamejoy:${event}`, data);
    const profile = p => ({ id: p.id, name: p.name, channel: p.channel, avatar: p.avatar, busy: !!p.peer,
        vdoAvailable: typeof p.vdoStreamId === 'string' });
    function list() {
        const available = [...players.values()].filter(p => p.role === 'player' && (p.sharing || typeof p.vdoStreamId === 'string')).map(profile);
        for (const p of players.values()) if (p.role === 'controller') send(p.id, 'players', available);
    }
    function unpair(p, reason = 'Partida desconectada') {
        const peer = players.get(p.peer);
        p.peer = null;
        send(p.id, 'paired', { peer: null, reason });
        if (peer && peer.peer === p.id) {
            peer.peer = null;
            send(peer.id, 'reset', {});
            send(peer.id, 'paired', { peer: null, reason });
        }
        send(p.id, 'reset', {});
    }
    io.on('connection', socket => {
        socket.emit('gamejoy:hello', { version: 1 });
        socket.on('gamejoy:register', (data = {}) => {
            if (!data || !['player', 'controller'].includes(data.role)) return;
            const old = players.get(socket.id);
            if (old) { unpublishMap(old); unpublishObsVdoLink(old); unpair(old); }
            const p = { id: socket.id, role: data.role, name: label(data.name, 'Jugador'),
                channel: label(data.channel, ''), avatar: avatarUrl(data.avatar), sharing: false, peer: null, lastFrame: null, vdoStreamId: null,
                mapToken: null, obsVdoToken: null, lastInputAt: 0, lastLocationAt: 0, lastSelectAt: 0 };
            players.set(socket.id, p);
            socket.emit('gamejoy:ready', { version: 1 });
            list();
        });
        socket.on('gamejoy:channel', (data, ack) => {
            const p = players.get(socket.id);
            const channel = typeof data?.channel === 'string' ? data.channel.trim() : '';
            if (!p || p.role !== 'player' || !/^@[\w.-]{1,79}$/.test(channel)) {
                if (typeof ack === 'function') ack({ success: false });
                return;
            }
            p.channel = channel;
            list();
            const peer = players.get(p.peer);
            if (peer?.peer === p.id) send(peer.id, 'peer-profile', profile(p));
            if (typeof ack === 'function') ack({ success: true, channel });
        });
        socket.on('gamejoy:vdo', (data, ack) => {
            const p = players.get(socket.id);
            if (!p || p.role !== 'player') {
                if (typeof ack === 'function') ack({ success: false });
                return;
            }
            if (data?.active === true) {
                const streamId = typeof data.streamId === 'string' ? data.streamId.trim() : '';
                if (!/^[A-Za-z0-9_-]{16,64}$/.test(streamId)) {
                    if (typeof ack === 'function') ack({ success: false });
                    return;
                }
                p.vdoStreamId = streamId;
            } else {
                p.vdoStreamId = null;
                if (!p.sharing && p.peer) unpair(p, 'El jugador dejó de compartir vídeo');
            }
            list();
            const peer = players.get(p.peer);
            if (peer?.peer === p.id) send(peer.id, 'peer-profile', profile(p));
            if (typeof ack === 'function') ack({ success: true });
        });
        socket.on('gamejoy:vdo-link', (data, ack) => {
            const p = players.get(socket.id);
            const key = data?.key;
            if (!app || p?.role !== 'player' || typeof key !== 'string' || !/^[a-f0-9]{32}$/.test(key)) {
                if (typeof ack === 'function') ack({ success: false });
                return;
            }
            const token = crypto.createHash('sha256').update(key).digest('hex');
            const owner = obsVdoLinks.get(token);
            if (owner && owner !== p) {
                if (typeof ack === 'function') ack({ success: false });
                return;
            }
            unpublishObsVdoLink(p);
            p.obsVdoToken = token;
            obsVdoLinks.set(token, p);
            if (typeof ack === 'function') ack({ success: true, token });
        });
        socket.on('gamejoy:get-vdo', (data, ack) => {
            const controller = players.get(socket.id);
            const target = players.get(typeof data?.id === 'string' ? data.id : '');
            const allowed = controller?.role === 'controller' && target?.role === 'player' &&
                typeof target.vdoStreamId === 'string';
            if (typeof ack === 'function') ack(allowed ? { success: true, streamId: target.vdoStreamId } : { success: false });
        });
        socket.on('gamejoy:sharing', data => {
            const p = players.get(socket.id);
            if (!p || p.role !== 'player') return;
            p.sharing = data?.enabled === true;
            if (!p.sharing) {
                unpublishMap(p);
                p.lastFrame = null;
                unpair(p, 'El jugador dejó de compartir');
            }
            list();
        });
        socket.on('gamejoy:map-link', (data, ack) => {
            const p = players.get(socket.id);
            const key = data?.key;
            if (!app || p?.role !== 'player' || !p.sharing || typeof key !== 'string' || !/^[a-f0-9]{32}$/.test(key)) {
                if (typeof ack === 'function') ack({ success: false });
                return;
            }
            // The publisher keeps the key across reconnects. Viewers get only its digest.
            const token = crypto.createHash('sha256').update(key).digest('hex');
            unpublishMap(p);
            p.mapToken = token;
            maps.set(token, p);
            if (typeof ack === 'function') ack({ success: true, token });
        });
        socket.on('gamejoy:select', data => {
            const p = players.get(socket.id);
            if (!p || p.role !== 'controller') return;
            const id = typeof data?.id === 'string' ? data.id : '';
            if (!id) { unpair(p); list(); return; }
            const target = players.get(id);
            if (p.peer === id && target?.peer === p.id) return;
            if (Date.now() - p.lastSelectAt < 300) return;
            p.lastSelectAt = Date.now();
            if (!target || target.role !== 'player' || (!target.sharing && typeof target.vdoStreamId !== 'string') || target.peer) {
                send(p.id, 'error', { message: 'Ese jugador ya no está disponible' }); return;
            }
            unpair(p);
            p.peer = target.id; target.peer = p.id;
            send(p.id, 'paired', { peer: profile(target) });
            send(target.id, 'paired', { peer: profile(p) });
            if (target.lastFrame && Date.now() - target.lastFrame.receivedAt < 10000) {
                send(p.id, 'location', { ...target.lastFrame,
                    ageMs: target.lastFrame.ageMs + Date.now() - target.lastFrame.receivedAt });
            }
            list();
        });
        socket.on('gamejoy:leave', () => {
            const p = players.get(socket.id);
            if (p) { unpair(p); list(); }
        });
        socket.on('gamejoy:input', data => {
            const p = players.get(socket.id), target = players.get(p?.peer);
            if (!p || p.role !== 'controller' || !target || target.peer !== p.id || (!target.sharing && typeof target.vdoStreamId !== 'string')) return;
            if (!data || !['joystick', 'press', 'release'].includes(data.kind)) return;
            let input;
            if (data.kind === 'joystick') {
                if (!validNumber(data.x, -1, 1) || !validNumber(data.y, -1, 1)) return;
                input = { kind: 'joystick', x: data.x, y: data.y };
            } else {
                if (!['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'START', 'SELECT'].includes(data.button)) return;
                input = { kind: data.kind, button: data.button };
            }
            p.lastInputAt = Date.now();
            send(target.id, 'input', input);
        });
        socket.on('gamejoy:location', data => {
            const p = players.get(socket.id);
            if (!p || p.role !== 'player' || !p.sharing || !data) return;
            const now = Date.now();
            if (now - p.lastLocationAt < 80) return;
            if (!validNumber(data.latitude, -90, 90) || !validNumber(data.longitude, -180, 180) ||
                !validNumber(data.accuracy, 0, 100000) || !validNumber(data.ageMs, 0, 30000)) return;
            const heading = validNumber(data.heading, 0, 360) ? data.heading : null;
            p.lastLocationAt = now;
            p.lastFrame = { playerId: p.id, latitude: data.latitude, longitude: data.longitude,
                accuracy: data.accuracy, ageMs: data.ageMs, heading,
                headingAccurate: data.headingAccurate === true, receivedAt: now };
            const peer = players.get(p.peer);
            if (peer?.peer === p.id) send(peer.id, 'location', p.lastFrame);
        });
        socket.on('disconnect', () => {
            const p = players.get(socket.id);
            if (!p) return;
            unpublishMap(p); unpublishObsVdoLink(p);
            unpair(p, 'El otro jugador se desconectó');
            players.delete(socket.id); list();
        });
    });
    // Expire cached positions and release held controls when their stream stops.
    const timer = setInterval(() => {
        const now = Date.now();
        for (const p of players.values()) {
            if (p.lastFrame && now - p.lastLocationAt > 10000) {
                p.lastFrame = null;
                if (p.peer) send(p.peer, 'location-stopped', {});
            }
            if (p.role === 'controller' && p.peer && p.lastInputAt && now - p.lastInputAt > 2500) {
                send(p.peer, 'reset', {}); p.lastInputAt = 0;
            }
        }
    }, 1000);
    timer.unref?.();
    return () => clearInterval(timer);
};
