# GameJoy HUD: directo y flecha

La fuente de OBS usa únicamente dos elementos activos:

- `arrow/`: flecha nueva 3D/SVG, sus ajustes y el movimiento remoto.
- `direct-view`: vídeo VDO Ninja del directo actual.

`gamejoy-overlay.js` recupera los tokens de flecha y directo de la sesión OBS. La flecha recibe el joystick mediante `settings/bus.js` y el directo consulta el stream actual cada segundo.

El mapa y los botones 3D no forman parte de esta implementación.
