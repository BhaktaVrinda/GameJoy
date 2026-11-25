const tokenPattern = /^[a-f0-9]{64}$/;

export async function resolveObsToken(kind) {
  // Los enlaces antiguos con #token siguen funcionando.
  const oldToken = location.hash.slice(1);
  if (tokenPattern.test(oldToken)) return { token: oldToken, message: '' };
  try {
    const response = await fetch(`/obs/session/token/${encodeURIComponent(kind)}`, {
      credentials: 'same-origin', cache: 'no-store'
    });
    if (response.status === 401) {
      try { globalThis.dispatchEvent?.(new CustomEvent('gamejoy:obs-auth-required')); } catch {}
      return { token: null, message: 'Inicia sesión en moneymaze.es/apps/gamejoy/obs/hud_menu.php' };
    }
    if (response.status === 404) {
      if (kind !== 'direct') {
        try {
          globalThis.dispatchEvent?.(new CustomEvent('gamejoy:obs-auth-required', {
            detail: { message: 'La sesión OBS no tiene este token. Vuelve a conectar OBS.' }
          }));
        } catch {}
      }
      return { token: null, message: 'Envía este token desde GameJoy y vuelve a conectar OBS' };
    }
    if (!response.ok) throw new Error('OBS session unavailable');
    const token = (await response.json()).token;
    if (typeof token !== 'string' || !tokenPattern.test(token)) throw new Error('Invalid OBS token');
    return { token, message: '' };
  } catch {
    return { token: null, message: 'No se pudo recuperar el token OBS' };
  }
}

export async function waitForObsToken(kind, onWaiting) {
  for (;;) {
    const access = await resolveObsToken(kind);
    if (access.token) return access;
    onWaiting(access.message);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
