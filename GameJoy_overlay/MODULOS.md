# GameJoy HUD: directo, flecha y botones

La fuente de OBS usa tres elementos activos:

- `arrow/`: flecha nueva 3D/SVG, sus ajustes y el movimiento remoto.
- `direct-view`: video VDO Ninja del directo actual.
- `buttons-3d.js`: cuatro botones 3D, iluminacion y animacion al recibir pulsaciones.

`gamejoy-overlay.js` recupera los tokens de flecha, botones y directo de la sesion OBS. La flecha recibe el joystick y los botones reciben los eventos remotos mediante `settings/bus.js`.

El mapa no forma parte de esta implementacion.
