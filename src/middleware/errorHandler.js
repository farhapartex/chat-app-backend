import mongoose from 'mongoose';
import { HTTP_STATUS, ERROR_MESSAGES, NODE_ENV } from '../utils/constants.js';


const handleValidationError = (error) => {
    const errors = {};

    Object.keys(error.errors).forEach(key => {
        errors[key] = error.errors[key].message;
    });

    return {
        status: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        error: 'Validation Error',
        message: 'Please check your input data',
        details: errors
    };
};


const handleDuplicateKeyError = (error) => {
    const field = Object.keys(error.keyValue)[0];
    const value = error.keyValue[field];

    let message = `${field} '${value}' already exists`;

    if (field === 'email') {
        message = ERROR_MESSAGES.EMAIL_TAKEN;
    } else if (field === 'username') {
        message = ERROR_MESSAGES.USERNAME_TAKEN;
    }

    return {
        status: HTTP_STATUS.CONFLICT,
        error: 'Duplicate Entry',
        message: message,
        field: field
    };
};


const handleCastError = (error) => {
    const message = `Invalid ${error.path}: ${error.value}`;

    return {
        status: HTTP_STATUS.BAD_REQUEST,
        error: 'Invalid Data',
        message: message
    };
};


const handleJWTError = (error) => {
    if (error.name === 'JsonWebTokenError') {
        return {
            status: HTTP_STATUS.UNAUTHORIZED,
            error: 'Authentication Failed',
            message: ERROR_MESSAGES.TOKEN_INVALID
        };
    }

    if (error.name === 'TokenExpiredError') {
        return {
            status: HTTP_STATUS.UNAUTHORIZED,
            error: 'Authentication Failed',
            message: ERROR_MESSAGES.TOKEN_EXPIRED
        };
    }

    return {
        status: HTTP_STATUS.UNAUTHORIZED,
        error: 'Authentication Failed',
        message: ERROR_MESSAGES.TOKEN_INVALID
    };
};


const handleSocketError = (error) => {
    return {
        status: HTTP_STATUS.BAD_REQUEST,
        error: 'Socket Error',
        message: error.message || 'Socket connection error'
    };
};


const handleFileUploadError = (error) => {
    if (error.code === 'LIMIT_FILE_SIZE') {
        return {
            status: HTTP_STATUS.BAD_REQUEST,
            error: 'File Too Large',
            message: 'File size exceeds the allowed limit'
        };
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
        return {
            status: HTTP_STATUS.BAD_REQUEST,
            error: 'Too Many Files',
            message: 'Too many files uploaded'
        };
    }

    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return {
            status: HTTP_STATUS.BAD_REQUEST,
            error: 'Invalid File Field',
            message: 'Unexpected file field'
        };
    }

    return {
        status: HTTP_STATUS.BAD_REQUEST,
        error: 'File Upload Error',
        message: error.message || 'File upload failed'
    };
};


const handleCustomError = (error) => {
    if (error.statusCode) {
        return {
            status: error.statusCode,
            error: error.name || 'Application Error',
            message: error.message
        };
    }

    switch (error.message) {
        case ERROR_MESSAGES.USER_NOT_FOUND:
            return {
                status: HTTP_STATUS.NOT_FOUND,
                error: 'User Not Found',
                message: ERROR_MESSAGES.USER_NOT_FOUND
            };

        case ERROR_MESSAGES.ROOM_NOT_FOUND:
            return {
                status: HTTP_STATUS.NOT_FOUND,
                error: 'Room Not Found',
                message: ERROR_MESSAGES.ROOM_NOT_FOUND
            };

        case ERROR_MESSAGES.MESSAGE_NOT_FOUND:
            return {
                status: HTTP_STATUS.NOT_FOUND,
                error: 'Message Not Found',
                message: ERROR_MESSAGES.MESSAGE_NOT_FOUND
            };

        case ERROR_MESSAGES.INVALID_CREDENTIALS:
            return {
                status: HTTP_STATUS.UNAUTHORIZED,
                error: 'Authentication Failed',
                message: ERROR_MESSAGES.INVALID_CREDENTIALS
            };

        case ERROR_MESSAGES.ACCESS_DENIED:
            return {
                status: HTTP_STATUS.FORBIDDEN,
                error: 'Access Denied',
                message: ERROR_MESSAGES.ACCESS_DENIED
            };

        default:
            return {
                status: HTTP_STATUS.BAD_REQUEST,
                error: 'Application Error',
                message: error.message
            };
    }
};


const logError = (error, req) => {
    const errorInfo = {
        timestamp: new Date().toISOString(),
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        },
        request: {
            method: req.method,
            url: req.originalUrl,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            userId: req.userId || 'anonymous'
        }
    };

    if (NODE_ENV === 'production') {
        console.error('Application Error:', JSON.stringify(errorInfo, null, 2));
        // TODO: Send to logging service (e.g., Winston, Sentry, etc.)
    } else {
        console.error('Application Error:', error);
    }
};


export const errorHandler = (error, req, res, next) => {
    logError(error, req);

    let errorResponse;

    // Handle different types of errors
    if (error instanceof mongoose.Error.ValidationError) {
        errorResponse = handleValidationError(error);
    } else if (error.code === 11000) { // MongoDB duplicate key error
        errorResponse = handleDuplicateKeyError(error);
    } else if (error instanceof mongoose.Error.CastError) {
        errorResponse = handleCastError(error);
    } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        errorResponse = handleJWTError(error);
    } else if (error.code && error.code.startsWith('LIMIT_')) {
        errorResponse = handleFileUploadError(error);
    } else if (error.message && error.message.includes('Socket')) {
        errorResponse = handleSocketError(error);
    } else {
        errorResponse = handleCustomError(error);
    }

    // Default to internal server error if no specific handler matched
    if (!errorResponse) {
        errorResponse = {
            status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
            error: 'Internal Server Error',
            message: NODE_ENV === 'development' ? error.message : ERROR_MESSAGES.SERVER_ERROR
        };
    }

    // Add request ID if available
    if (req.id) {
        errorResponse.requestId = req.id;
    }

    if (NODE_ENV === 'development' && error.stack) {
        errorResponse.stack = error.stack;
    }

    res.status(errorResponse.status).json(errorResponse);
};


export const notFoundHandler = (req, res) => {
    res.status(HTTP_STATUS.NOT_FOUND).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
    });
};


export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};


export class AppError extends Error {
    constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST, isOperational = true) {
        super(message);

        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.name = this.constructor.name;

        Error.captureStackTrace(this, this.constructor);
    }
}


export const createValidationError = (message, details = {}) => {
    const error = new AppError(message, HTTP_STATUS.UNPROCESSABLE_ENTITY);
    error.details = details;
    return error;
};


export const createNotFoundError = (resource = 'Resource') => {
    return new AppError(`${resource} not found`, HTTP_STATUS.NOT_FOUND);
};


export const createForbiddenError = (message = ERROR_MESSAGES.ACCESS_DENIED) => {
    return new AppError(message, HTTP_STATUS.FORBIDDEN);
};


export const createUnauthorizedError = (message = ERROR_MESSAGES.TOKEN_REQUIRED) => {
    return new AppError(message, HTTP_STATUS.UNAUTHORIZED);
};