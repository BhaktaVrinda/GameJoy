'use strict';

const crypto = require('node:crypto');
const https = require('node:https');
const path = require('node:path');
const express = require('express');

const TICKET_ENDPOINT = process.env.GAMEJOY_OBS_TICKET_ENDPOINT ||
    'https://moneymaze.es/apps/gamejoy/obs/consumir_ticket.php';
const COOKIE_NAME = 'gamejoy_obs_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const KINDS = ['map', 'arrow', 'buttons', 'direct'];

function consumeAtIonos(ticket) {
    const url = new URL(TICKET_ENDPOINT);
    if (url.protocol !== 'https:' || url.username || url.password) {
        return Promise.reject(new Error('Invalid OBS ticket endpoint'));
    }
    const body = new URLSearchParams({ ticket }).toString();
    return new Promise((resolve, reject) => {
        let responseText = '';
        let responseBytes = 0;
        const request = https.request(url, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
                'Cache-Control': 'no-store'
            }
        }, response => {
            response.setEncoding('utf8');
            response.on('data', chunk => {
                responseBytes += Buffer.byteLength(chunk, 'utf8');
                if (responseBytes > 8192) return request.destroy(new Error('OBS ticket response too large'));
                responseText += chunk;
            });
            response.on('end', () => {
                let result;
                try { result = JSON.parse(responseText); }
                catch { return reject(new Error('Invalid OBS ticket response')); }
                if (response.statusCode !== 200 || result?.success !== true) {
                    return reject(new Error('OBS ticket rejected'));
                }
                resolve(result);
            });
            response.on('error', reject);
        });
        request.setTimeout(8000, () => request.destroy(new Error('OBS ticket timed out')));
        request.on('error', reject);
        request.end(body);
    });
}

function sessionCookie(value, maxAgeSeconds) {
    return `${COOKIE_NAME}=${value}; Path=/obs; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

module.exports = function attachObsSession(app, options = {}) {
    const consume = options.consume || consumeAtIonos;
    const sessions = new Map();

    function getSession(req) {
        const match = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([a-f0-9]{64})(?:;|$)`)
            .exec(req.headers.cookie || '');
        if (!match) return null;
        const session = sessions.get(match[1]);
        if (!session) return null;
        if (session.expiresAt <= Date.now()) {
            sessions.delete(match[1]);
            return null;
        }
        return { id: match[1], ...session };
    }

    function privateResponse(_req, res, next) {
        res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff' });
        next();
    }

    app.use(['/obs/connect', '/obs/ready', '/obs/session'], privateResponse);
    app.get('/obs/ready', (_req, res) => {
        res.type('html').sendFile(path.join(__dirname, 'obs-ready.html'));
    });
    app.post('/obs/connect', express.urlencoded({ extended: false, limit: '2kb' }), async (req, res) => {
        const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket : '';
        if (!TOKEN_PATTERN.test(ticket)) return res.status(400).send('Código OBS inválido.');
        try {
            const account = await consume(ticket);
            if (account?.success !== true || !/^[a-f0-9]{32}$/.test(account.user_id || '')) {
                throw new Error('Invalid OBS account');
            }
            const tokens = {};
            for (const kind of KINDS) {
                const token = account.tokens?.[kind];
                tokens[kind] = typeof token === 'string' && TOKEN_PATTERN.test(token) ? token : null;
            }
            const previous = getSession(req);
            if (previous) sessions.delete(previous.id);
            const id = crypto.randomBytes(32).toString('hex');
            sessions.set(id, { username: String(account.username || 'GameJoy').slice(0, 80),
                tokens, expiresAt: Date.now() + SESSION_MS });
            res.set('Set-Cookie', sessionCookie(id, Math.floor(SESSION_MS / 1000)));
            res.redirect(303, '/obs/ready');
        } catch {
            res.redirect(303, '/obs/ready?error=connect');
        }
    });

    app.get('/obs/session', (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).json({ success: false });
        const available = {};
        for (const kind of KINDS) available[kind] = !!session.tokens[kind];
        res.json({ success: true, username: session.username, available });
    });

    app.get('/obs/session/token/:kind', (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).json({ success: false });
        if (!KINDS.includes(req.params.kind)) return res.sendStatus(404);
        const token = session.tokens[req.params.kind];
        if (!token) return res.status(404).json({ success: false });
        res.json({ token });
    });

    app.post('/obs/session/logout', (req, res) => {
        const session = getSession(req);
        if (session) sessions.delete(session.id);
        res.set('Set-Cookie', sessionCookie('', 0));
        res.json({ success: true });
    });

    return { sessions };
};
