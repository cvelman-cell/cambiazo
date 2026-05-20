# CAMBIAZO V2 - INSTRUCCIONES DE ACTUALIZACIÓN

## ✅ Archivos actualizados listos:
- server.js (29KB) - Con cartas especiales y 8 jugadores
- index.html (47KB) - UI completa optimizada
- package.json - Dependencias

## 🎮 NUEVAS CARACTERÍSTICAS:

### Cartas Especiales (18 nuevas cartas):
- 🧨 **DINAMITA** (4 cartas) - Elimina fila o columna completa
- 🎨 **CAMBIO COLOR** (4 cartas) - Cambia el color de cualquier carta en juego
- 👁️ **OJO CERRADO** (2 cartas) - Mezcla y voltea las cartas de un rival
- 🔄 **INTERCAMBIO** (4 cartas) - Intercambia una carta tuya con otra de cualquier jugador

### Mejoras visuales:
- Carta robada movida al LADO IZQUIERDO (era abajo centro)
- Cartas del jugador 20% más pequeñas para acomodar hasta 8 jugadores
- Límite de jugadores: 2-8 (era 2-6)
- Animaciones específicas para cada carta especial
- UI modal interactiva para activar cada carta especial

## 📦 INSTRUCCIONES DE DEPLOY:

### 1. Actualizar en GitHub:
```bash
# Reemplaza estos 3 archivos en tu repo:
- server.js (raíz)
- public/index.html
- package.json (raíz)
```

**Pasos en GitHub:**
1. Ve a github.com/cvelman-cell/cambiazo
2. Click en **server.js** → lápiz ✏️ → reemplaza contenido → Commit
3. Click en **public/** → **index.html** → lápiz ✏️ → reemplaza → Commit  
4. Click en **package.json** → lápiz ✏️ → reemplaza → Commit

### 2. Redesplegar en Render:
1. Ve a dashboard.render.com
2. Click en tu proyecto "My project" → servicio cambiazo
3. Click **"Manual Deploy"** → **"Deploy latest commit"**
4. Espera 2-3 minutos hasta que diga **"Live"**

### 3. ¡Probar!
- Abre https://cambiazo-wpxc.onrender.com
- Prueba con 2+ jugadores
- Espera a robar una carta especial (18 de 122 cartas totales)
- Música electro house a 128 BPM funcionando

## 🎯 CÓMO USAR LAS CARTAS ESPECIALES:

Cuando robas una carta especial, aparece un modal interactivo automáticamente:

- **Dinamita**: Selecciona qué fila o columna eliminar de TU matriz
- **Cambio Color**: 1) Elige jugador y carta, 2) Elige nuevo color
- **Ojo Cerrado**: Selecciona un rival, sus cartas se mezclan y voltean boca abajo
- **Intercambio**: 1) Elige tu carta, 2) Elige rival y su carta

Todas las cartas especiales se usan inmediatamente y terminan tu turno.

## ⚠️ IMPORTANTE:
- El código está optimizado (225 líneas el cliente)
- Todas las reglas originales se mantienen
- Compatible con Chrome desktop y móvil
- Servidor gratuito de Render se duerme tras 15 min sin uso (normal)

¡Listo para jugar con las cartas especiales!
