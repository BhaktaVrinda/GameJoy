'use strict';

// Separate from the legacy PC/game protocol. Profiles are display labels;
// routing and ownership always use the server-owned socket, never a supplied user id.
module.exports = function attachGameJoySessions(io) {
    const players = new Map();
    const validNumber = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    const label = (v, fallback) => typeof v === 'string' ? v.replace(/[\x00-\x1f]/g, '').trim().slice(0, 80) || fallback : fallback;
    const send = (id, event, data) => io.to(id).emit(`gamejoy:${event}`, data);
    const profile = p => ({ id: p.id, name: p.name, channel: p.channel, busy: !!p.peer });
    function list() {
        const available = [...players.values()].filter(p => p.role === 'player' && p.sharing).map(profile);
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
            if (old) unpair(old);
            const p = { id: socket.id, role: data.role, name: label(data.name, 'Jugador'),
                channel: label(data.channel, ''), sharing: false, peer: null, lastFrame: null,
                lastInputAt: 0, lastLocationAt: 0, lastSelectAt: 0 };
            players.set(socket.id, p);
            socket.emit('gamejoy:ready', { version: 1 });
            list();
        });
        socket.on('gamejoy:sharing', data => {
            const p = players.get(socket.id);
            if (!p || p.role !== 'player') return;
            p.sharing = data?.enabled === true;
            if (!p.sharing) { p.lastFrame = null; unpair(p, 'El jugador dejó de compartir'); }
            list();
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
            if (!target || target.role !== 'player' || !target.sharing || target.peer) {
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
            if (!p || p.role !== 'controller' || !target || target.peer !== p.id || !target.sharing) return;
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
