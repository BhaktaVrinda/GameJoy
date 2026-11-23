'use strict';
const crypto = require('node:crypto');
const path = require('node:path');

// Separate from the legacy PC/game protocol. Profiles are display labels;
// routing and ownership always use the server-owned socket, never a supplied user id.
const readAccount = require('./gamejoy-authority');
module.exports = function attachGameJoySessions(io, app, authority = readAccount) {
    const players = new Map();
    const maps = new Map();
    const obsVdoLinks = new Map();
    const obsArrowPositions = new Map();
    const obsInputRoom = token => `obs-input:${token}`;
    function publishObsInput(p, x, y) {
        if (!p) return;
        const active = Math.hypot(x, y) > 0.1;
        p.obsInputState = { x, y, active, receivedAt: Date.now() };
        for (const token of new Set([p.mapToken, p.obsVdoToken])) {
            if (token && (maps.get(token) === p || obsVdoLinks.get(token) === p)) {
                io.to(obsInputRoom(token)).emit('gamejoy:obs-input', { x, y, active });
            }
        }
    }
    function publishObsButton(p, button, pressed) {
        if (!p || !p.obsButtons) return;
        if (pressed) p.obsButtons.add(button);
        else p.obsButtons.delete(button);
        for (const token of new Set([p.mapToken, p.obsVdoToken])) {
            if (token && (maps.get(token) === p || obsVdoLinks.get(token) === p)) {
                io.to(obsInputRoom(token)).emit('gamejoy:obs-button', { button, pressed });
            }
        }
    }
    function clearObsButtons(p) {
        if (!p?.obsButtons) return;
        for (const button of [...p.obsButtons]) publishObsButton(p, button, false);
    }
    function obsButtonsSnapshot(p) {
        return p?.peer && p.obsButtons ? [...p.obsButtons] : [];
    }
    function clearObsInput(p) { publishObsInput(p, 0, 0); }
    function obsInputSnapshot(p) {
        const state = p?.obsInputState;
        if (!state || !p.peer || Date.now() - state.receivedAt > 1800) return { x: 0, y: 0, active: false };
        return { x: state.x, y: state.y, active: state.active };
    }
    function setObsArrowPosition(socket, data, onlyIfMissing = false) {
        const token = socket.obsArrowToken;
        if (!token || socket.obsInputRoom !== obsInputRoom(token)) return;
        const saved = obsArrowPositions.get(token);
        if (onlyIfMissing && saved) {
            socket.emit('gamejoy:obs-arrow-position', { ...saved, initialized: true });
            return;
        }
        if (typeof data?.x !== 'number' || !Number.isFinite(data.x) || data.x < -100 || data.x > 100 ||
            typeof data?.y !== 'number' || !Number.isFinite(data.y) || data.y < -100 || data.y > 100) return;
        const position = { x: Math.round(data.x), y: Math.round(data.y) };
        obsArrowPositions.set(token, position);
        io.to(obsInputRoom(token)).emit('gamejoy:obs-arrow-position', { ...position, initialized: true });
    }
    function unpublishMap(p, forget = false) {
        if (p.mapToken && maps.get(p.mapToken) === p) {
            publishObsInput(p, 0, 0);
            io.to(obsInputRoom(p.mapToken)).emit('gamejoy:obs-stopped', {});
            if (forget) maps.delete(p.mapToken);
        }
        if (forget) p.mapToken = null;
    }
    function unpublishObsVdoLink(p) {
        if (p.obsVdoToken && obsVdoLinks.get(p.obsVdoToken) === p) {
            publishObsInput(p, 0, 0);
            io.to(obsInputRoom(p.obsVdoToken)).emit('gamejoy:obs-stopped', {});
            obsVdoLinks.delete(p.obsVdoToken);
        }
        p.obsVdoToken = null;
    }
    if (app) {
        app.get('/obs/map', (_req, res) => res.sendFile(path.join(__dirname, 'obs-map.html')));
        app.get('/obs/arrow', (_req, res) => res.sendFile(path.join(__dirname, 'obs-arrow.html')));
        app.get('/obs/buttons', (_req, res) => res.sendFile(path.join(__dirname, 'obs-buttons.html')));
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
            if (!player) return res.sendStatus(204);
            const frame = player.lastFrame;
            const remainingMs = frame && 30000 - frame.ageMs - (Date.now() - frame.receivedAt);
            if (!frame || remainingMs <= 0) return res.sendStatus(204);
            res.json({ latitude: frame.latitude, longitude: frame.longitude, heading: frame.heading, remainingMs });
        });
    }
    const validNumber = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    const label = (v, fallback) => typeof v === 'string' ? v.replace(/[\x00-\x1f]/g, '').trim().slice(0, 80) || fallback : fallback;
    const avatarUrl = v => typeof v === 'string' && v.length <= 2048 && /^https:\/\//i.test(v) ? v : '';
    const stableOverlayToken = userId => userId
        ? crypto.createHash('sha256').update(`gamejoy-overlay:${userId}`).digest('hex')
        : null;
    const send = (id, event, data) => io.to(id).emit(`gamejoy:${event}`, data);
    const profile = p => ({ id: p.id, userId: p.userId, name: p.name, channel: p.channel, avatar: p.avatar, busy: !!p.peer,
        vdoAvailable: typeof p.vdoStreamId === 'string', sharingLocation: p.sharing === true,
        vdoOrientation: p.vdoOrientation ?? null });
    const peerProfile = p => ({ ...profile(p), vdoStreamId: p.vdoStreamId });
    function list() {
        // Send connected player profiles so Android can match each user to a
        // saved YouTube video_id; the client hides cards without that ID.
        const available = [...players.values()].filter(p => p.role === 'player').map(profile);
        for (const p of players.values()) if (p.role === 'controller') send(p.id, 'players', available);
    }
    function unpair(p, reason = 'Partida desconectada') {
        const peer = players.get(p.peer);
        clearObsInput(p);
        clearObsInput(peer);
        clearObsButtons(p);
        clearObsButtons(peer);
        p.peer = null;
        send(p.id, 'paired', { peer: null, reason });
        if (peer && peer.peer === p.id) {
            peer.peer = null;
            send(peer.id, 'reset', {});
            send(peer.id, 'paired', { peer: null, reason });
        }
        send(p.id, 'reset', {});
    }
    function permitted(controller, target) {
        const now = Date.now();
        if (!controller || !target || controller.validUntil <= now || target.validUntil <= now) return false;
        if (!controller.automatic) return true;
        return controller.target === target.userId && typeof target.vdoStreamId === 'string';
    }

    function checkPair(p) {
        const peer = players.get(p.peer);
        if (!peer) return;
        const allowed = p.role === 'controller' ? permitted(p, peer) : permitted(peer, p);
        if (!allowed) {
            unpair(p, 'El turno o la transmisión ha terminado');
            list();
        }
    }

    function sendTurn(p) {
        if (p.role === 'controller') send(p.id, 'turn', {
            automatic: p.automatic,
            targetUserId: p.validUntil > Date.now() && p.automatic ? p.target : null
        });
    }

    async function refresh(p) {
        if (p.refreshing) return;
        p.refreshing = true;
        const started = Date.now();
        try {
            const account = await authority(p.token, p.role);
            if (players.get(p.id) !== p) return;
            if (account.userId !== p.userId) throw new Error('Cuenta incorrecta');
            const modeChanged = p.automatic !== account.automatic;
            p.automatic = account.automatic;
            p.target = account.target;
            p.validUntil = started + 3500;
            if (modeChanged && p.peer && p.role === 'controller') { unpair(p); list(); }
        } catch (error) {
            if (players.get(p.id) !== p) return;
            if (error.invalidSession) {
                unpublishMap(p, true); unpublishObsVdoLink(p); unpair(p, 'Sesión caducada');
                players.delete(p.id); list();
                send(p.id, 'auth-error', { retry: false, message: 'Vuelve a iniciar sesión' });
                return;
            }
            p.validUntil = 0;
            p.target = null;
        } finally {
            p.refreshing = false;
        }
        checkPair(p);
        sendTurn(p);
    }

    io.on('connection', socket => {
        socket.emit('gamejoy:hello', { version: 1 });
        socket.on('gamejoy:obs-subscribe', (data = {}) => {
            if (socket.obsInputRoom) {
                socket.leave(socket.obsInputRoom);
                socket.obsInputRoom = null;
                socket.obsArrowToken = null;
            }
            const token = typeof data?.token === 'string' ? data.token : '';
            const validToken = /^[a-f0-9]{64}$/.test(token);
            const target = validToken ? (maps.get(token) || obsVdoLinks.get(token)) : null;
            if (!validToken || (target && target.role !== 'player')) {
                socket.emit('gamejoy:obs-error', { message: 'Overlay no disponible' });
                return;
            }
            const room = obsInputRoom(token);
            socket.join(room);
            socket.obsInputRoom = room;
            socket.obsArrowToken = token;
            socket.emit('gamejoy:obs-ready', {});
            socket.emit('gamejoy:obs-input', target ? obsInputSnapshot(target) : { x: 0, y: 0, active: false });
            socket.emit('gamejoy:obs-buttons', { buttons: target ? obsButtonsSnapshot(target) : [] });
            const arrowPosition = obsArrowPositions.get(token);
            socket.emit('gamejoy:obs-arrow-position', arrowPosition
                ? { ...arrowPosition, initialized: true }
                : { x: 0, y: 0, initialized: false });
        });
        socket.on('gamejoy:obs-arrow-position-set', data => setObsArrowPosition(socket, data));
        socket.on('gamejoy:obs-arrow-position-seed', data => setObsArrowPosition(socket, data, true));
        let registration = 0;
        socket.on('gamejoy:register', async (data = {}) => {
            if (!data || !['player', 'controller'].includes(data.role)) return;
            const attempt = ++registration;
            const old = players.get(socket.id);
            if (old) {
                unpublishMap(old, true); unpublishObsVdoLink(old); unpair(old);
                players.delete(socket.id); list();
            }
            const token = data.sessionToken;
            const started = Date.now();
            let account;
            try {
                if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
                    throw Object.assign(new Error(), { invalidSession: true });
                }
                account = await authority(token, data.role);
                if (account.userId !== data.userId) throw Object.assign(new Error(), { invalidSession: true });
            } catch (error) {
                if (attempt === registration && socket.connected) {
                    send(socket.id, 'auth-error', { retry: !error.invalidSession, message: 'No se pudo verificar la sesión. Reintenta o inicia sesión de nuevo.' });
                }
                return;
            }
            if (!socket.connected || registration !== attempt) return;
            const p = { id: socket.id, role: data.role, userId: account.userId, token, automatic: account.automatic,
                target: account.target, validUntil: started + 3500, lastChecked: started,
                name: label(data.name, 'Jugador'), channel: account.channel, avatar: avatarUrl(data.avatar),
                sharing: false, peer: null, lastFrame: null, vdoStreamId: null,
                mapToken: null, obsVdoToken: null, obsInputState: null, obsButtons: new Set(), lastInputAt: 0, lastLocationAt: 0, lastSelectAt: 0 };
            players.set(socket.id, p);
            const userOverlayToken = p.role === 'player' ? stableOverlayToken(p.userId) : null;
            if (userOverlayToken) {
                p.mapToken = userOverlayToken;
                maps.set(userOverlayToken, p);
            }
            socket.emit('gamejoy:ready', { version: 2 });
            sendTurn(p);
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
            if (peer?.peer === p.id) send(peer.id, 'peer-profile', peerProfile(p));
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
                p.vdoOrientation = ['portrait', 'landscape'].includes(data.orientation) ? data.orientation : null;
            } else {
                p.vdoStreamId = null;
                p.vdoOrientation = null;
                if (p.peer && (!p.sharing || players.get(p.peer)?.automatic)) unpair(p, 'El jugador dejó de compartir vídeo');
            }
            list();
            const peer = players.get(p.peer);
            if (peer?.peer === p.id) send(peer.id, 'peer-profile', peerProfile(p));
            if (typeof ack === 'function') ack({ success: true });
        });
        socket.on('gamejoy:vdo-link', (data, ack) => {
            const p = players.get(socket.id);
            const key = data?.key;
            if (!app || p?.role !== 'player' || typeof key !== 'string' || !/^[a-f0-9]{32}$/.test(key)) {
                if (typeof ack === 'function') ack({ success: false });
                return;
            }
            const token = stableOverlayToken(p.userId) || crypto.createHash('sha256').update(key).digest('hex');
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
                typeof target.vdoStreamId === 'string' && permitted(controller, target) &&
                (!controller.automatic || controller.peer === target.id && target.peer === controller.id);
            if (typeof ack === 'function') {
                if (!allowed) return ack({ success: false });
                const reply = { success: true, streamId: target.vdoStreamId };
                if (target.vdoOrientation) reply.vdoOrientation = target.vdoOrientation;
                ack(reply);
            }
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
            if (p.mapToken && p.mapToken !== token) unpublishMap(p, true);
            p.mapToken = token;
            maps.set(token, p);
            if (typeof ack === 'function') ack({ success: true, token });
        });
        socket.on('gamejoy:select', data => {
            const p = players.get(socket.id);
            if (!p || p.role !== 'controller') return;
            const id = typeof data?.id === 'string' ? data.id : '';
            if (!id) { unpair(p); list(); return; }
            let target = players.get(id);
            if (p.automatic && p.target) {
                const matches = [...players.values()].filter(player =>
                    player.role === 'player' && player.userId === p.target && player.vdoStreamId &&
                    (!player.peer || player.peer === p.id));
                target = matches.length === 1 && matches[0].id === id ? matches[0] : null;
            }
            if (!permitted(p, target) || (data.targetUserId != null &&
                (!p.automatic || data.targetUserId !== p.target))) {
                checkPair(p);
                send(p.id, 'error', { message: 'Jugador no autorizado para este turno' });
                return;
            }
            if (p.peer === id && target?.peer === p.id) return;
            if (Date.now() - p.lastSelectAt < 300) return;
            p.lastSelectAt = Date.now();
            if (!target || target.role !== 'player' || (!target.sharing && typeof target.vdoStreamId !== 'string') || target.peer) {
                send(p.id, 'error', { message: 'Ese jugador ya no está disponible' }); return;
            }
            unpair(p);
            p.peer = target.id; target.peer = p.id;
            clearObsInput(target);
            clearObsButtons(target);
            send(p.id, 'paired', { peer: peerProfile(target) });
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
            if (!permitted(p, target)) { checkPair(p); return; }
            if (p.automatic && data?.targetId && data.targetId !== target.id) return;
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
            if (input.kind === 'joystick') publishObsInput(target, input.x, input.y);
            else if (['A', 'B', 'X', 'Y'].includes(input.button)) {
                publishObsButton(target, input.button, input.kind === 'press');
            }
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
            unpublishMap(p, true); unpublishObsVdoLink(p);
            unpair(p, 'El otro jugador se desconectó');
            players.delete(socket.id); list();
        });
    });
    // Expire cached positions and release held controls when their stream stops.
    const timer = setInterval(() => {
        const now = Date.now();
        for (const p of players.values()) {
            checkPair(p);
            if (now - p.lastChecked >= 2000) {
                p.lastChecked = now;
                void refresh(p);
            }
            if (p.lastFrame && now - p.lastLocationAt > 10000) {
                p.lastFrame = null;
                if (p.peer) send(p.peer, 'location-stopped', {});
            }
            if (p.role === 'controller' && p.peer && p.lastInputAt && now - p.lastInputAt > 2500) {
                const target = players.get(p.peer);
                send(p.peer, 'reset', {});
                clearObsInput(target);
                clearObsButtons(target);
                p.lastInputAt = 0;
            }
        }
    }, 250);
    timer.unref?.();
    return () => clearInterval(timer);
};
