# App.N.O.A

NOA es una aplicación estática. Para ejecutarla no hace falta compilar ni instalar dependencias de Node:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abre `http://127.0.0.1:8000/`. El service worker requiere HTTP en localhost o HTTPS; en GitHub Pages se publica el contenido del repositorio, incluido `sw.js`, bajo la subruta del proyecto. Después de la primera carga completa, la aplicación puede recargarse sin conexión. La IA y las fuentes externas requieren sus servicios y configuración correspondientes.

## Pruebas de regresión

Requisitos: Node.js 20 o posterior y Chromium. Las dependencias de desarrollo están fijadas en `package-lock.json`:

```sh
npm ci
npx playwright install chromium
npm test
```

Si existe `/usr/bin/chromium`, las pruebas lo usan automáticamente y puedes omitir la descarga del navegador. Para otro ejecutable, usa `CHROMIUM_PATH=/ruta/a/chromium npm test`. En una máquina sin las bibliotecas del navegador, instala las dependencias del sistema siguiendo la documentación de Playwright (`npx playwright install --with-deps chromium`).

La suite inicia su propio servidor en `127.0.0.1:8022`, publica la aplicación en `/App.N.O.A/` y abre un contexto de navegador nuevo por prueba. Utiliza únicamente preguntas aritméticas e historial sintéticos; no usa IA, credenciales ni datos personales. El almacenamiento local, las cachés y los service workers de cada prueba quedan aislados del navegador del usuario.

Se comprueban los cuatro formatos, puntuación y crédito parcial, resultados v23, Calibrator, navegación inmediata de borradores, recuperación tras recargar, revisión v22, pendientes, finalización única, reinicio de sesión, preguntas manuales, consola, aislamiento de cachés y recarga offline. El caso de las ventanas de Calibrator ejecuta sus motores con historial sintético; no simula trece exámenes completos desde la interfaz. La subruta se prueba localmente; esto no valida un despliegue público concreto en GitHub Pages.

`npm run test:headed` muestra el navegador y `npm run test:report` abre el informe. Los resultados incluyen estados JSON; los fallos conservan captura y traza. `test-results/` y `playwright-report/` están ignorados por Git. La suite no modifica archivos de la aplicación.
