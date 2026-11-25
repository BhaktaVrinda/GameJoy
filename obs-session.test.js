'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const attachObsSession = require('./obs-session');

test('OBS connects once and each clean overlay URL gets only its own database token', async () => {
    const tokens = { map: 'a'.repeat(64), arrow: 'b'.repeat(64),
        buttons: 'c'.repeat(64), direct: 'd'.repeat(64) };
    const ticket = 'e'.repeat(64);
    const app = express();
    let consumed = false;
    attachObsSession(app, { consume: async supplied => {
        assert.equal(supplied, ticket);
        if (consumed) throw new Error('Ticket already used');
        consumed = true;
        return { success: true, user_id: '1'.repeat(32), username: 'Jugador', tokens };
    } });
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        assert.equal((await fetch(base + '/obs/session/token/map')).status, 401);
        const bad = await fetch(base + '/obs/connect', {
            method: 'POST', redirect: 'manual', body: new URLSearchParams({ ticket: 'bad' })
        });
        assert.equal(bad.status, 400);
        const login = await fetch(base + '/obs/connect', {
            method: 'POST', redirect: 'manual', body: new URLSearchParams({ ticket })
        });
        assert.equal(login.status, 303);
        assert.equal(login.headers.get('location'), '/obs/overlay');
        assert.match(login.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
        assert.doesNotMatch(login.headers.get('location'), new RegExp(ticket));
        const cookie = login.headers.get('set-cookie').split(';', 1)[0];
        const session = await fetch(base + '/obs/session', { headers: { Cookie: cookie } });
        assert.deepEqual((await session.json()).available,
            { map: true, arrow: true, buttons: true, direct: true });
        for (const [kind, token] of Object.entries(tokens)) {
            const result = await fetch(base + '/obs/session/token/' + kind,
                { headers: { Cookie: cookie } });
            assert.equal(result.status, 200);
            assert.deepEqual(await result.json(), { token });
        }
        const replay = await fetch(base + '/obs/connect', {
            method: 'POST', redirect: 'manual', body: new URLSearchParams({ ticket })
        });
        assert.equal(replay.headers.get('location'), '/obs/ready?error=connect');
        await fetch(base + '/obs/session/logout', { method: 'POST', headers: { Cookie: cookie } });
        assert.equal((await fetch(base + '/obs/session/token/map',
            { headers: { Cookie: cookie } })).status, 401);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('an overlay waits for the login session before requesting its token', async () => {
    const originalFetch = globalThis.fetch;
    const originalLocation = globalThis.location;
    const originalSetTimeout = globalThis.setTimeout;
    let requests = 0;
    try {
        globalThis.location = { hash: '' };
        globalThis.fetch = async url => {
            assert.equal(url, '/obs/session/token/map');
            requests += 1;
            return requests === 1 ? { status: 401 }
                : { status: 200, ok: true, json: async () => ({ token: 'a'.repeat(64) }) };
        };
        globalThis.setTimeout = callback => { queueMicrotask(callback); return 1; };
        const source = fs.readFileSync(path.join(__dirname, 'obs-session-token.js'));
        const { waitForObsToken } = await import(`data:text/javascript;base64,${source.toString('base64')}`);
        const messages = [];
        const access = await waitForObsToken('map', message => messages.push(message));
        assert.equal(access.token, 'a'.repeat(64));
        assert.equal(requests, 2);
        assert.match(messages[0], /hud_menu\.php/);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalLocation === undefined) delete globalThis.location;
        else globalThis.location = originalLocation;
        globalThis.setTimeout = originalSetTimeout;
    }
});
