# Multi-stage build for 5G Core UI

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine AS runtime
WORKDIR /app

# Install backend production deps
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy backend build
COPY --from=backend-builder /app/backend/dist ./dist

# Copy frontend build into backend's public folder
RUN mkdir -p public
COPY --from=frontend-builder /app/frontend/dist ./public

# Backend will serve frontend static files
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
