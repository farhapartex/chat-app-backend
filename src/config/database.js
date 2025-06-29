import mongoose from "mongoose";
import { NODE_ENV, MONGODB_URI } from "../utils/constants";

const connectionOptions = {
    maxPoolSize: 10,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    bufferMaxEntries: 0,
    bufferCommands: false,
    autoCreate: true,
    autoIndex: NODE_ENV === "development",
}

export const connectDB = async () => {
    try {
        mongoose.set("strictQuery", false);
        if (!MONGODB_URI) {
            throw new Error("MONGODB_URI is not defined. Please set it in your environment variables.");
        }
        const connection = await mongoose.connect(MONGODB_URI, connectionOptions);
        console.log(`MongoDB connected: ${connection.connection.host}`);
        setupConnectionEventHandlers();
    } catch (error) {
        if (NODE_ENV === 'production') {
            console.log('Retrying database connection in 5 seconds...');
            setTimeout(connectDB, 5000);
        } else {
            throw error;
        }
    }

}

export const closeDatabase = async () => {
    try {
        await mongoose.connection.close();
    } catch (error) {
        console.error('Error closing database connection:', error.message);
    }
};

export const isDatabaseConnected = () => {
    return mongoose.connection.readyState === 1;
};

export const getDatabaseStatus = () => {
    const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };

    return states[mongoose.connection.readyState] || 'unknown';
};

export const getDatabaseHealth = async () => {
    try {
        const adminDb = mongoose.connection.db.admin();
        const result = await adminDb.ping();

        return {
            status: 'healthy',
            connected: isDatabaseConnected(),
            readyState: getDatabaseStatus(),
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name,
            ping: result.ok === 1 ? 'success' : 'failed'
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            connected: false,
            error: error.message
        };
    }
};

const setupConnectionEventHandlers = () => {
    const db = mongoose.connection;

    db.on('connected', () => {
        console.log('MongoDB connected successfully');
    });

    db.on('error', () => {
        console.log('Failed to connect MongoDB!');
    });

    db.on('disconnected', () => {
        console.log('MongoDB disconnected');
    });

    db.on('reconnected', () => {
        console.log('MongoDB reconnected');
    });

    db.on('close', () => {
        console.log('MongoDB connection closed');
    });

    process.on('SIGINT', async () => {
        await closeDatabase();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await closeDatabase();
        process.exit(0);
    });
}