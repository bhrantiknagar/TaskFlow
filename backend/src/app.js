const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const config = require('./config');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const dashboardRoutes = require('./routes/dashboard');
const aiRoutes = require('./routes/ai');
const authenticate = require('./middleware/authenticate');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
const frontendSourcePath = path.resolve(__dirname, '../../frontend');
const frontendBuildPath = path.join(frontendSourcePath, 'dist');
const frontendPath = fs.existsSync(path.join(frontendBuildPath, 'index.html'))
  ? frontendBuildPath
  : fs.existsSync(path.join(frontendSourcePath, 'index.html'))
    ? frontendSourcePath
    : null;
const publicPage = (req, res, next) => {
  if (!frontendPath) return res.status(404).json({ error: 'The TaskFlow frontend is hosted separately.' });
  return res.sendFile(path.join(frontendPath, 'index.html'), error => error && next(error));
};
 
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ 
  origin(origin, callback) {
    callback(null, !origin || config.frontendOrigins.has(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10kb', strict: true }));
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  
if (frontendPath) {
  app.get(['/', '/login', '/register'], publicPage);
  app.get(['/dashboard', '/projects', '/project/:id', '/tasks', '/task/:id', '/assistant', '/profile'], authenticate, publicPage);
  app.use(express.static(frontendPath, { index: false, dotfiles: 'ignore', fallthrough: true }));
} else {
  app.get('/', (req, res) => res.json({ service: 'TaskFlow API', health: '/api/health' }));
}
app.use('/api', notFound);
app.use(notFound);
app.use(errorHandler);
 
module.exports = app;
 