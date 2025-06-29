import dotenv from 'dotenv';

dotenv.config();


export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = process.env.PORT || 5000;
export const MONGODB_URI = process.env.MONGODB_URI || '';
export const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
export const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
export const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
export const SOCKET_CORS_ORIGIN = process.env.SOCKET_CORS_ORIGIN || 'http://localhost:3000';

export const MESSAGE_TYPES = {
    TEXT: 'text',
    IMAGE: 'image',
    FILE: 'file',
    SYSTEM: 'system'
};

export const ROOM_TYPES = {
    PUBLIC: 'public',
    PRIVATE: 'private'
};

export const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024; // 5MB
export const ALLOWED_FILE_TYPES = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,application/pdf').split(',');

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const SOCKET_EVENTS = {
    CONNECTION: 'connection',
    DISCONNECT: 'disconnect',
    JOIN_ROOM: 'join_room',
    LEAVE_ROOM: 'leave_room',
    ROOM_JOINED: 'room_joined',
    ROOM_LEFT: 'room_left',
    SEND_MESSAGE: 'send_message',
    MESSAGE_RECEIVED: 'message_received',
    MESSAGE_SENT: 'message_sent',
    SEND_PRIVATE_MESSAGE: 'send_private_message',
    PRIVATE_MESSAGE_RECEIVED: 'private_message_received',
    PRIVATE_MESSAGE_SENT: 'private_message_sent',
    USER_JOINED: 'user_joined',
    USER_LEFT: 'user_left',
    USER_ONLINE: 'user_online',
    USER_OFFLINE: 'user_offline',
    ONLINE_USERS: 'online_users',
    TYPING_START: 'typing_start',
    TYPING_STOP: 'typing_stop',
    ERROR: 'error'
};

export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
};

export const VALIDATION_RULES = {
    USERNAME: {
        MIN_LENGTH: 3,
        MAX_LENGTH: 30,
        PATTERN: /^[a-zA-Z0-9_]+$/
    },
    PASSWORD: {
        MIN_LENGTH: 6,
        MAX_LENGTH: 128
    },
    MESSAGE: {
        MAX_LENGTH: 5000
    },
    ROOM_NAME: {
        MIN_LENGTH: 1,
        MAX_LENGTH: 50
    },
    ROOM_DESCRIPTION: {
        MAX_LENGTH: 500
    },
    BIO: {
        MAX_LENGTH: 500
    }
};

export const ERROR_MESSAGES = {
    INVALID_CREDENTIALS: 'Invalid email or password',
    TOKEN_REQUIRED: 'Access token is required',
    TOKEN_INVALID: 'Invalid access token',
    TOKEN_EXPIRED: 'Access token has expired',
    ACCESS_DENIED: 'Access denied',
    USER_NOT_FOUND: 'User not found',
    USERNAME_TAKEN: 'Username is already taken',
    EMAIL_TAKEN: 'Email is already registered',
    ROOM_NOT_FOUND: 'Room not found',
    ROOM_ACCESS_DENIED: 'You do not have access to this room',
    ROOM_FULL: 'Room has reached maximum capacity',
    ALREADY_MEMBER: 'You are already a member of this room',
    NOT_MEMBER: 'You are not a member of this room',
    CREATOR_CANNOT_LEAVE: 'Room creator cannot leave while other members are present',
    MESSAGE_NOT_FOUND: 'Message not found',
    MESSAGE_EMPTY: 'Message content cannot be empty',
    MESSAGE_TOO_LONG: 'Message exceeds maximum length',
    MESSAGE_EDIT_DENIED: 'You can only edit your own messages',
    MESSAGE_DELETE_DENIED: 'You can only delete your own messages',
    MESSAGE_TOO_OLD: 'Message is too old to edit',
    VALIDATION_ERROR: 'Validation error',
    SERVER_ERROR: 'Internal server error',
    NOT_FOUND: 'Resource not found',
    BAD_REQUEST: 'Bad request'
};

export const SUCCESS_MESSAGES = {
    USER_REGISTERED: 'User registered successfully',
    USER_LOGGED_IN: 'User logged in successfully',
    USER_LOGGED_OUT: 'User logged out successfully',
    PROFILE_UPDATED: 'Profile updated successfully',
    ROOM_CREATED: 'Room created successfully',
    ROOM_UPDATED: 'Room updated successfully',
    ROOM_DELETED: 'Room deleted successfully',
    ROOM_JOINED: 'Joined room successfully',
    ROOM_LEFT: 'Left room successfully',
    MESSAGE_SENT: 'Message sent successfully',
    MESSAGE_EDITED: 'Message edited successfully',
    MESSAGE_DELETED: 'Message deleted successfully',
    MESSAGES_MARKED_READ: 'Messages marked as read'
};