# Actualización del servidor GameJoy

Sube estos cuatro archivos a la raíz del repositorio `BhaktaVrinda/GameJoy`, rama `main`:

- `server.js`
- `gamejoy-sessions.js`
- `gamejoy-sessions.test.js`
- `package.json`

Después, en el servicio de Render que utiliza `https://gamejoy.onrender.com`, despliega el último commit si no comienza automáticamente.

Comprobación: `https://gamejoy.onrender.com/gamejoy-health` debe devolver `{"protocol":1}`.

El cambio incorpora el protocolo `gamejoy:*` para partidas entre móviles. Los eventos del servidor anterior para PC y el otro juego se conservan. El nuevo APK requiere este servidor actualizado en ambos móviles.

## Uso con dos móviles

1. En el móvil de la persona que se mueve, inicia sesión, selecciona **Ver**, inicia el overlay y pulsa **Compartir mi ubicación y jugar**.
2. En el móvil del controlador, inicia sesión, selecciona **Controlar**, inicia el overlay y pulsa **Controlar y ver ubicación** en el jugador elegido.
3. El mapa del controlador recibe la posición y orientación del otro móvil; sus comandos llegan exclusivamente al jugador seleccionado.
4. **Dejar de compartir ubicación**, **Desconectar partida** o detener el overlay corta la conexión. El jugador deja de recibir los botones que estuvieran pulsados.

## Comprobaciones realizadas

- Compilación Android `:app:assembleDebug` correcta.
- Prueba local con cuatro clientes Socket.IO: selección exclusiva, aislamiento de comandos y ubicaciones, orientación, cambio de jugador, datos inválidos, revocación, desconexión y liberación automática de entradas.
- Pendiente: despliegue en Render y recorrido completo con dos móviles reales.

## Detalles del protocolo

Los nombres y canales son etiquetas tomadas del perfil de la app; el protocolo de sockets no verifica actualmente las credenciales de PHP. El emparejamiento y la propiedad de los datos se asocian al identificador de conexión asignado por el servidor. Al activar compartir, cualquier controlador de este servidor puede seleccionar al jugador disponible. Una pareja admite un único controlador. Las coordenadas no se escriben en base de datos ni en los logs del módulo.

Las partidas están en memoria en un único proceso Node. Para múltiples instancias se necesitaría un registro compartido de sesiones. Tras reiniciar el servidor o reconectar, hay que seleccionar de nuevo al jugador.

Para repetir la prueba: `npm install` y `npm test`.
