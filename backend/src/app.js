const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const config = require('./config');
const authRoutes = require('./routes/auth');
const authenticate = require('./middleware/authenticate');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
const frontendPath = path.resolve(__dirname, '../../frontend');
const publicPage = (req, res, next) => res.sendFile(path.join(frontendPath, 'index.html'), error => error && next(error));

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || config.frontendOrigins.has(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10kb', strict: true }));
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get(['/', '/login', '/register'], publicPage);
app.get(['/dashboard', '/projects', '/project/:id', '/tasks', '/task/:id', '/assistant', '/profile'], authenticate, publicPage);
app.use(express.static(frontendPath, { index: false, dotfiles: 'ignore', fallthrough: true }));
app.use('/api', notFound);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
