import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import morgan from 'morgan';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/room.js';
import messageRoutes from './routes/messages.js';
import { errorHandler } from './middleware/errorHandler.js';
import {
    CORS_ORIGIN,
    RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS,
    NODE_ENV
} from './utils/constants.js';

const app = express();

// Helmet helps secure Express apps by setting various HTTP headers
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", "ws:", "wss:"], // Allow WebSocket connections
        },
    },
}));

const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
    message: {
        error: 'Too Many Requests',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);

// CORS configuration
app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
}));

app.use(compression());

if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

app.use(express.json({
    limit: '10mb',
    type: 'application/json'
}));

app.use(express.urlencoded({
    extended: true,
    limit: '10mb',
    type: 'application/x-www-form-urlencoded'
}));


// basic system APIs
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Chat API is running',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: NODE_ENV,
        version: process.env.npm_package_version || '1.0.0'
    });
});

app.get('/api', (req, res) => {
    res.status(200).json({
        name: 'Chat App API',
        version: '1.0.0',
        description: 'Real-time chat application backend',
        endpoints: {
            auth: '/api/auth',
            rooms: '/api/rooms',
            messages: '/api/messages'
        },
        websocket: {
            namespace: '/',
            events: [
                'join_room',
                'leave_room',
                'send_message',
                'send_private_message',
                'typing_start',
                'typing_stop'
            ]
        }
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/messages', messageRoutes);

app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
    });
});

app.use(errorHandler);

export default app;