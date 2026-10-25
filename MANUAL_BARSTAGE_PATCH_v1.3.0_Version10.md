# Manual de uso — Barstage Patch v1.3.0

Barstage Patch es una app web/PWA para organizar mangueras (subsnakes), canales de entrada/salida, fallas, vista de escenario y hojas de lectura/impresión.

---

## 1) ¿Qué puedes hacer con la app?

- Crear shows con:
  - Nombre de show/gira
  - Artista
  - Ciudad/Lugar (opcional)
  - Fecha
- Crear y editar subsnakes:
  - Entradas (IN)
  - Salidas (OUT A-H)
  - Color y zona
- Marcar canales con **FALLA**.
- Buscar por texto (snake, fuente, destino, notas, etc.).
- Reordenar mangueras (botones ↑ ↓ o arrastrando).
- Duplicar y borrar subsnakes.
- Ver todo en **modo lectura** (tabla limpia para operación).
- Imprimir hoja completa o por manguera.
- Guardar/cargar archivo `.stagepatch`.
- Posicionar chips en plano de escenario (Stage View).
- Cargar y consultar Rider PDF.
- Compartir app o vista de lectura por link.
- Funciona como app instalable (PWA).

---

## 2) Pantalla de bienvenida

Al abrir, verás:

- **✨ Nuevo show**: empieza desde cero.
- **↺ Cargar último (backup local)**: recupera autoguardado local.
- **📂 Cargar archivo (.stagepatch)**: importa un archivo guardado.
- **📲 Instalar app**: instala en teléfono/PC (si el navegador lo permite).
- **🔗 Compartir app**: comparte el link de la aplicación.

---

## 3) Crear un show

En la parte superior completa:

- **Show / Gira**
- **Artista**
- **Ciudad / Lugar (opcional)**
- **Fecha**

Pulsa **Guardar show**.

> Esto actualiza la etiqueta de show y la info de impresión.

---

## 4) Crear un subsnake

Completa:

- **Nombre subsnake**
- **Entradas**
- **Salidas (A-H)**
- **Color**
- **Zona**

Pulsa **Crear subsnake**.

---

## 5) Gestión rápida de subsnakes

Cada subsnake tiene acciones:

- **↑ / ↓** mover orden
- **Editar** abrir editor
- **Dup** duplicar
- **X** eliminar

También puedes reordenar arrastrando y soltando (drag & drop).

---

## 6) Editor de subsnake

Dentro de **Editar**:

### Pestaña Entradas
Cada canal IN permite:
- Fuente
- Destino
- Tipo de micro
- Notas
- Toggle **FALLA**

### Pestaña Salidas
Cada salida OUT permite:
- Fuente
- Destino
- Notas
- Toggle **FALLA**

### Botones útiles por canal
- 📑 Copiar contenido
- ⬇ Pegar contenido
- ✖ Limpiar contenido

### Auto destino (Entradas)
Puedes autocompletar destinos por rango:
1. Elige sistema (ej. RIO IN, SD-RACK IN, etc.)
2. Pulsa **Auto destino entradas**
3. Indica:
   - número destino inicial
   - canal inicial
   - canal final

La app asigna secuencialmente (ej. RIO IN 01, 02, 03...).

---

## 7) Añadir/Quitar canales IN y OUT (v1.3.0)

Si tu versión ya tiene estos botones en editor:

- **+ Añadir IN**
- **- Quitar IN**
- **+ Añadir OUT**
- **- Quitar OUT**

Funcionamiento:
- Al añadir: defines cuántos sumar.
- Al quitar: elimina desde el final.
- Si hay datos en canales a borrar, pide confirmación.
- En OUT respeta límite **A-H (máx 8)**.

---

## 8) Modo lectura (operación)

Pulsa **🔒 Modo lectura** para cambiar de edición a lectura:

- Muestra tabla clara por manguera.
- Filtro por manguera específica.
- Botón de impresión de vista.

Ideal para técnicos en show sin riesgo de editar.

---

## 9) Buscador

En **Buscar** escribe cualquier texto:
- nombre de snake
- zona
- fuente
- destino
- tipo de micro
- notas
- “falla”

Verás resultados detallados con botón **Abrir** para ir directo al canal.

---

## 10) Guardar, importar y respaldo

### Guardar archivo
**Guardar (.stagepatch)**:
- En navegadores compatibles abre “Guardar como…”.
- Si no, descarga automática.

### Importar archivo
**Importar (.stagepatch)** carga datos guardados previamente.

### Backup local automático
La app guarda backup local cada ~10 segundos.

---

## 11) Stage View (plano de escenario)

Panel **Stage View (guía visual)**:

- **🖼 Cargar plano**: imagen del escenario.
- **🗑 Quitar plano**
- **+ Chip manual**: crea subsnake rápido.
- **Editar chips ON/OFF**
- **Plano Vertical/Horizontal** (rota solo imagen)
- **A- / A+** tamaño del chip seleccionado
- **Reset chips** reposiciona automáticamente

Interacciones:
- Click en chip: seleccionar
- Arrastrar: mover
- Pinch (touch): escalar
- Doble click: renombrar chip

---

## 12) Rider PDF

Botones:

- **📄 Cargar Rider PDF**
- **👁 Ver Rider**
- **🗑 Quitar Rider**

Notas:
- Se guarda localmente en IndexedDB del navegador.
- En móvil suele abrir en pestaña externa para mejor compatibilidad.

---

## 13) Compartir

### Compartir app
Botón en bienvenida: comparte URL de la app.

### Compartir vista de lectura
Desde modo lectura puedes compartir un link con el patch embebido para consulta.

---

## 14) Impresión

Opciones:
- **Todas las mangueras**
- **Solo una manguera**

Incluye:
- encabezado de show
- tablas de entradas/salidas
- estado (OK / FALLA)
- estilos optimizados para papel

---

## 15) Deshacer/Rehacer

- **↶ Deshacer**
- **↷ Rehacer**
- Atajos:
  - `Ctrl/Cmd + Z` → deshacer
  - `Ctrl/Cmd + Y` o `Ctrl/Cmd + Shift + Z` → rehacer

---

## 16) Instalación como app (PWA)

Si el navegador lo soporta:
- Pulsa **Instalar app**.
- Se comporta como app nativa (pantalla completa/ícono).

---

## 17) Buenas prácticas recomendadas

1. Define show antes de crear snakes.
2. Usa nombres claros por zona (ej. “Subsnake Batería L”).
3. Usa colores por sección (batería, voces, vientos).
4. Marca **FALLA** en canales fuera de servicio.
5. Guarda `.stagepatch` al finalizar cambios importantes.
6. Antes del show, usa modo lectura e imprime respaldo.

---

## 18) Solución de problemas

### “No veo mis datos”
- Usa **Cargar último (backup local)**.
- Verifica que estés en el mismo navegador/dispositivo.

### “No puedo editar”
- Revisa si estás en **Modo lectura**.
- Si abriste desde link compartido, puede estar forzado a solo lectura.

### “No se instaló la app”
- Depende del navegador y contexto HTTPS/PWA.
- Prueba en Chrome/Edge actualizados.

### “No abre Rider en móvil”
- La app intenta abrirlo en pestaña externa.
- Verifica permisos/popups del navegador.

---

## 19) Compatibilidad de archivos

- Extensión: `.stagepatch`
- Tipo: JSON
- Es compatible con versiones que mantengan el mismo esquema.

---

## 20) Versión

Documento para **Barstage Patch v1.3.0**.