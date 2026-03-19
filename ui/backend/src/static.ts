import express from 'express';
import * as path from 'path';
import * as fs from 'fs';

export function serveStatic(app: express.Application) {
  const publicDir = path.join(__dirname, '..', 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    // SPA fallback
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next();
      const indexPath = path.join(publicDir, 'index.html');
      if (fs.existsSync(indexPath)) res.sendFile(indexPath);
      else next();
    });
    console.log('Serving frontend from', publicDir);
  }
}
