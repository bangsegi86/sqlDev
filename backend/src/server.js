import express from 'express';
import cors from 'cors';
import connectionsRouter from './routes/connections.js';
import oracleRouter from './routes/oracle.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

app.use('/api/connections', connectionsRouter);
app.use('/api/oracle', oracleRouter);

app.use((err, req, res, _next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`SQLDev backend running on http://localhost:${PORT}`));
