'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: client } = require('socket.io-client');
const attach = require('./gamejoy-sessions');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout = 2000) {
    const deadline = Date.now() + timeout;
    while (!check()) { if (Date.now() > deadline) throw new Error('Timed out waiting for event'); await pause(10); }
}

test('pairs isolate commands, position and heading; revoke, switch and disconnect clear state', async () => {
    const server = http.createServer();
    const io = new Server(server);
    const stop = attach(io);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const sockets = [];
    async function connect(role, name) {
        const s = client(`http://127.0.0.1:${server.address().port}`, { autoConnect: false, reconnection: false });
        sockets.push(s);
        const events = [];
        s.onAny((event, data) => events.push({ event, data }));
        const p = { s, events, all: event => events.filter(e => e.event === `gamejoy:${event}`),
            last: event => events.filter(e => e.event === `gamejoy:${event}`).at(-1)?.data };
        s.connect();
        await until(() => s.connected);
        s.emit('gamejoy:register', { role, name, channel: '@test' });
        await until(() => p.last('ready'));
        return p;
    }
    const frame = { latitude: 40.4, longitude: -3.7, accuracy: 5, ageMs: 20, heading: 123, headingAccurate: true };
    try {
        const a = await connect('player', 'A');
        const b = await connect('player', 'B');
        const c = await connect('controller', 'C');
        const d = await connect('controller', 'D');
        assert.deepEqual(c.last('players'), []);
        a.s.emit('gamejoy:sharing', { enabled: true });
        b.s.emit('gamejoy:sharing', { enabled: true });
        await until(() => c.last('players')?.length === 2);
        c.s.emit('gamejoy:select', { id: a.s.id });
        await until(() => c.last('paired')?.peer?.id === a.s.id);
        d.s.emit('gamejoy:select', { id: a.s.id });
        await until(() => d.last('error'));
        assert.equal(a.last('paired').peer.id, c.s.id);
        const pairsBefore = c.all('paired').length;
        const accepted = await a.s.timeout(1000).emitWithAck('gamejoy:channel', { channel: '@transmisor', id: b.s.id });
        assert.equal(accepted.success, true);
        await until(() => c.last('peer-profile')?.channel === '@transmisor');
        assert.equal(c.last('players').find(p => p.id === a.s.id).channel, '@transmisor');
        assert.equal(c.last('players').find(p => p.id === b.s.id).channel, '@test');
        assert.equal(c.last('players').find(p => p.id === a.s.id).busy, true);
        assert.equal(c.all('paired').length, pairsBefore);
        const rejected = await c.s.timeout(1000).emitWithAck('gamejoy:channel', { channel: '@controlador', id: a.s.id });
        assert.equal(rejected.success, false);
        const invalid = await a.s.timeout(1000).emitWithAck('gamejoy:channel', { channel: '' });
        assert.equal(invalid.success, false);
        assert.equal(c.last('players').find(p => p.id === a.s.id).channel, '@transmisor');
        c.s.emit('gamejoy:input', { kind: 'press', button: 'A', targetId: b.s.id });
        await until(() => a.last('input'));
        assert.equal(a.last('input').button, 'A');
        assert.equal(b.all('input').length, 0);
        a.s.emit('gamejoy:location', { ...frame, playerId: b.s.id });
        await until(() => c.last('location'));
        assert.equal(c.last('location').playerId, a.s.id);
        assert.equal(c.last('location').heading, 123);
        assert.equal(d.all('location').length, 0);
        assert.equal(b.all('location').length, 0);
        c.s.emit('gamejoy:location', frame);
        await pause(100);
        assert.equal(a.all('location').length, 0);
        const before = c.all('location').length;
        a.s.emit('gamejoy:location', { ...frame, latitude: 999 });
        await pause(100);
        assert.equal(c.all('location').length, before);
        await pause(350);
        c.s.emit('gamejoy:select', { id: b.s.id });
        await until(() => c.last('paired')?.peer?.id === b.s.id);
        assert.equal(a.last('paired').peer, null);
        assert.ok(a.last('reset'));
        a.s.emit('gamejoy:location', frame);
        b.s.emit('gamejoy:location', { ...frame, heading: 270 });
        await until(() => c.last('location')?.playerId === b.s.id);
        assert.equal(c.all('location').length, before + 1);
        assert.equal(c.last('location').heading, 270);
        const inputs = b.all('input').length;
        d.s.emit('gamejoy:input', { kind: 'press', button: 'B', targetId: b.s.id });
        await pause(100);
        assert.equal(b.all('input').length, inputs);
        b.s.emit('gamejoy:sharing', { enabled: false });
        await until(() => c.last('paired')?.peer === null);
        await until(() => c.last('players')?.length === 1);
        await pause(350);
        c.s.emit('gamejoy:select', { id: a.s.id });
        await until(() => c.last('paired')?.peer?.id === a.s.id);
        const resetCount = a.all('reset').length;
        c.s.emit('gamejoy:input', { kind: 'joystick', x: 1, y: 0 });
        await until(() => a.all('reset').length > resetCount, 4500);
        c.s.disconnect();
        await until(() => a.last('paired')?.peer === null);
        assert.equal(a.last('paired').reason, 'El otro jugador se desconectó');
    } finally {
        sockets.forEach(s => s.disconnect());
        stop();
        await new Promise(resolve => io.close(resolve));
    }
});
