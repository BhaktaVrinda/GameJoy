'use strict';

const endpoint = 'https://moneymaze.es/apps/gamejoy/comando/procesar_comando.php';
const validId = value => typeof value === 'string' && /^[0-9a-f]{32}$/i.test(value);

async function readAccount(token, role) {
    const response = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ action: role === 'controller' ? 'turn' : 'profile', session_token: token }),
        redirect: 'error',
        signal: AbortSignal.timeout(1800)
    });
    if (!response.ok) {
        const error = new Error('Perfil no disponible');
        error.invalidSession = response.status === 401;
        throw error;
    }
    const account = await response.json();
    if (!validId(account.user_id) || typeof account.channel_handle !== 'string' ||
        typeof account.automatic !== 'boolean' ||
        (account.target !== null && (!validId(account.target?.user_id) || !account.target.channel_handle))) {
        throw new Error('Respuesta de autorización inválida');
    }
    return { userId: account.user_id, channel: account.channel_handle, automatic: account.automatic,
        target: account.target?.user_id ?? null };
}

module.exports = readAccount;
