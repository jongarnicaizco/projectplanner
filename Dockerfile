FROM node:22-slim

WORKDIR /app

# Copiar archivos de dependencias primero (para mejor cache)
# Esto permite que Docker cachee esta capa si package.json no cambia
COPY package*.json ./

# Instalar dependencias
# Usar npm ci para instalación reproducible (más rápido y confiable)
RUN npm ci --only=production || npm install --production

# Copiar código de la aplicación
# Esta capa solo se reconstruye si el código cambia
COPY . .

# Exponer puerto (Cloud Run usa PORT automáticamente)
EXPOSE 8080

# Comando para iniciar la aplicación
CMD ["node", "index.js"]

