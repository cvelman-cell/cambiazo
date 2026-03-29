# 🃏 CAMBIAZO! - Juego de Cartas Multijugador Online

Juego de cartas para 2-6 jugadores con gráfica pixel art, música chiptune y partidas en tiempo real.

## 🎮 Reglas Rápidas

- **104 cartas**: 8 colores × 13 valores (-1 a 11)
- Cada jugador recibe 9 cartas boca abajo (3×3)
- Voltea 2 cartas al inicio
- En tu turno: roba del mazo o del descarte, reemplaza una carta o descarta y voltea
- ¡Junta 3 del mismo color en línea para eliminarlas!
- 3 rondas, menor puntaje total gana
- Si cierras la ronda sin tener el menor puntaje: ¡tu score ×2!

## 🚀 Ejecutar Localmente

```bash
# Instalar dependencias
npm install

# Iniciar servidor
npm start

# Abrir en el navegador
# http://localhost:3000
```

## 🌐 Deploy en Render.com (GRATIS)

### Paso 1: Subir a GitHub
1. Crea un repositorio nuevo en github.com
2. Sube estos archivos:
```bash
git init
git add .
git commit -m "Cambiazo! v1.0"
git remote add origin https://github.com/TU_USUARIO/cambiazo.git
git push -u origin main
```

### Paso 2: Crear servicio en Render
1. Ve a [render.com](https://render.com) y crea una cuenta
2. Click **"New +"** → **"Web Service"**
3. Conecta tu repositorio de GitHub
4. Configuración:
   - **Name**: `cambiazo`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Click **"Create Web Service"**

### Paso 3: ¡Jugar!
- Tu juego estará en: `https://cambiazo.onrender.com`
- Comparte el link con amigos para jugar
- Funciona en Chrome desktop y móvil

## 📱 Compatibilidad
- Chrome (desktop y móvil)
- Firefox
- Safari (iOS)
- Edge

## 🛠️ Tecnologías
- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: HTML5 Canvas + Vanilla JavaScript
- **Gráficos**: Pixel Art renderizado por código
- **Música**: Chiptune generada con Web Audio API
- **Fuente**: Press Start 2P (Google Fonts)

## 📂 Estructura
```
cambiazo/
├── package.json      # Dependencias
├── server.js         # Servidor con lógica del juego
├── public/
│   └── index.html    # Cliente completo (CSS + JS integrado)
└── README.md         # Este archivo
```
