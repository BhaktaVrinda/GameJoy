# GameJoy HUD modular

Cada carpeta activa es una miniaplicación autónoma. En OBS se usa el HUD compuesto en `/obs/overlay`; la flecha, el mapa y los botones 3D se cargan dentro de esa fuente. La carpeta `controls`, `No usado` y el módulo de misiones quedan fuera del despliegue activo.

| Módulo | Archivos | Función |
| --- | --- | --- |
| Flechas | `arrow/index.html`, `arrow/view.html`, `arrow/logic.js`, `arrow/renderer.js`, `arrow/config.js`, `arrow/settings.html`, `arrow/settings.js` | Vista 3D/SVG, configuración persistente y movimiento; ajustes con **F**. |
| Mapa | `map/index.html`, `map/view.html`, `map/view.js`, `map/config.js`, `map/drag.js`, `map/settings.html`, `map/settings.js` | Minimapa, zoom, punto azul, arrastre y animaciones; ajustes con **M**. |
| Botones 3D | `index.html`, `buttons-3d.js` | Cuatro botones 3D, iluminación y animación al recibir la pulsación remota. |
| Comunicación común | `settings/bus.js` | `BroadcastChannel` para que los módulos se comuniquen sin que `index.html` conozca su lógica. |
| Paneles comunes | `settings/panel.css`, `settings/panel.js`, `settings/frame.js`, `settings/standalone-frame.js` | Estilo, arrastre y posición de los paneles, tanto dentro de un módulo como en el HUD compuesto. |
| Composición | `index.html`, `gamejoy-overlay.js` | Agrupa mapa, flecha nueva/clásica, botones 3D y directo; recupera los tokens de la sesión OBS. |

Los módulos se comunican mediante `BroadcastChannel` (`settings/bus.js`). El render 3D recibe `controls:remote-action` desde `gamejoy-overlay.js`. El fondo es `Imagen/madrid-calle-completa.webp` y se sustituye por el iframe de VDO cuando hay directo activo. La tecla **C** alterna entre la flecha nueva y la clásica.
