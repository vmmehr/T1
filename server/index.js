import cors from 'cors';
import express from 'express';

import { allowedOrigins, port } from './config.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import commentsRouter from './routes/comments.js';
import decisionItemsRouter from './routes/decisionItems.js';
import decisionsRouter from './routes/decisions.js';
import profilesRouter from './routes/profiles.js';
import tasksRouter from './routes/tasks.js';

const app = express();

// Do not advertise the framework in responses.
app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser / same-origin requests (no Origin header).
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
  }),
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/decision-items', decisionItemsRouter);
app.use('/api/decisions', decisionsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/comments', commentsRouter);

app.use((error, _req, res, next) => {
  void next;
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
