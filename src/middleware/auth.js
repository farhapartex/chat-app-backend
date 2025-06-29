import jwt from 'jsonwebtoken';
import { User } from '../models/user.js';
import { JWT_SECRET, ERROR_MESSAGES, HTTP_STATUS } from '../utils/constants.js';

const extractTokenFromRequest = (req) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7); // Remove 'Bearer ' prefix
    }

    if (req.query && req.query.token) {
        return req.query.token;
    }

    if (req.cookies && req.cookies.token) {
        return req.cookies.token;
    }

    return null;
};


const verifyToken = async (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw new Error(ERROR_MESSAGES.TOKEN_INVALID);
        }
        if (error.name === 'TokenExpiredError') {
            throw new Error(ERROR_MESSAGES.TOKEN_EXPIRED);
        }
        throw new Error(ERROR_MESSAGES.TOKEN_INVALID);
    }
};


const getUserFromToken = async (userId) => {
    const user = await User.findById(userId);

    if (!user) {
        throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    if (!user.isActive) {
        throw new Error('User account is deactivated');
    }

    return user;
};


export const authenticateToken = async (req, res, next) => {
    try {
        // Extract token from request
        const token = extractTokenFromRequest(req);

        if (!token) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                error: 'Authentication Required',
                message: ERROR_MESSAGES.TOKEN_REQUIRED,
                code: 'TOKEN_MISSING'
            });
        }

        const decoded = await verifyToken(token);
        const user = await getUserFromToken(decoded.userId);

        req.user = user;
        req.userId = user._id.toString();
        req.token = token;

        next();

    } catch (error) {
        console.error('Authentication error:', error.message);

        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
            error: 'Authentication Failed',
            message: error.message,
            code: 'AUTH_FAILED'
        });
    }
};


export const optionalAuth = async (req, res, next) => {
    try {
        const token = extractTokenFromRequest(req);

        if (token) {
            try {
                const decoded = await verifyToken(token);
                const user = await getUserFromToken(decoded.userId);

                req.user = user;
                req.userId = user._id.toString();
                req.token = token;
                req.isAuthenticated = true;

            } catch (error) {
                console.warn('Optional auth failed:', error.message);
                req.isAuthenticated = false;
            }
        } else {
            req.isAuthenticated = false;
        }

        next();

    } catch (error) {
        console.error('Optional auth error:', error);
        req.isAuthenticated = false;
        next();
    }
};

/**
 * Admin authentication middleware
 * Requires user to be authenticated and have admin privileges
 */
export const requireAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                error: 'Authentication Required',
                message: ERROR_MESSAGES.TOKEN_REQUIRED
            });
        }

        if (!req.user.isAdmin && !req.user.isSuperAdmin) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                error: 'Access Denied',
                message: 'Admin privileges required'
            });
        }

        next();

    } catch (error) {
        console.error('Admin auth error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            error: 'Authentication Error',
            message: ERROR_MESSAGES.SERVER_ERROR
        });
    }
};


export const requireRoomMember = (roomIdParam = 'roomId') => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    error: 'Authentication Required',
                    message: ERROR_MESSAGES.TOKEN_REQUIRED
                });
            }

            const roomId = req.params[roomIdParam];

            if (!roomId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    error: 'Bad Request',
                    message: 'Room ID is required'
                });
            }


            const { Room } = await import('../models/Room.js');
            const room = await Room.findById(roomId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    error: 'Not Found',
                    message: ERROR_MESSAGES.ROOM_NOT_FOUND
                });
            }

            if (!room.isMember(req.userId)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    error: 'Access Denied',
                    message: ERROR_MESSAGES.ROOM_ACCESS_DENIED
                });
            }

            req.room = room;

            next();

        } catch (error) {
            console.error('Room member auth error:', error);
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                error: 'Authorization Error',
                message: ERROR_MESSAGES.SERVER_ERROR
            });
        }
    };
};


export const requireRoomAdmin = (roomIdParam = 'roomId') => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    error: 'Authentication Required',
                    message: ERROR_MESSAGES.TOKEN_REQUIRED
                });
            }

            const roomId = req.params[roomIdParam];

            if (!roomId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    error: 'Bad Request',
                    message: 'Room ID is required'
                });
            }

            const { Room } = await import('../models/Room.js');
            const room = await Room.findById(roomId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    error: 'Not Found',
                    message: ERROR_MESSAGES.ROOM_NOT_FOUND
                });
            }

            if (!room.isAdmin(req.userId)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    error: 'Access Denied',
                    message: 'Room admin privileges required'
                });
            }

            req.room = room;

            next();

        } catch (error) {
            console.error('Room admin auth error:', error);
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                error: 'Authorization Error',
                message: ERROR_MESSAGES.SERVER_ERROR
            });
        }
    };
};


export const rateLimitByUser = (authenticatedLimit = 200, guestLimit = 50) => {
    const userRequests = new Map();
    const WINDOW_MS = 15 * 60 * 1000;

    return (req, res, next) => {
        const userId = req.userId || req.ip;
        const limit = req.userId ? authenticatedLimit : guestLimit;
        const now = Date.now();

        for (const [key, data] of userRequests.entries()) {
            if (now - data.windowStart > WINDOW_MS) {
                userRequests.delete(key);
            }
        }

        let userData = userRequests.get(userId);
        if (!userData || now - userData.windowStart > WINDOW_MS) {
            userData = { count: 0, windowStart: now };
            userRequests.set(userId, userData);
        }

        if (userData.count >= limit) {
            return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                error: 'Rate Limit Exceeded',
                message: 'Too many requests, please try again later',
                retryAfter: Math.ceil((userData.windowStart + WINDOW_MS - now) / 1000)
            });
        }
        userData.count++;

        next();
    };
};

export const authenticateSocket = async (socket, next) => {
    try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        const decoded = await verifyToken(token);
        const user = await getUserFromToken(decoded.userId);

        // Set user context on socket
        socket.userId = user._id.toString();
        socket.user = user;
        socket.token = token;

        next();

    } catch (error) {
        console.error('Socket authentication error:', error.message);
        next(new Error(`Authentication error: ${error.message}`));
    }
};

/**
 * Middleware to check if user owns a resource
 * Generic middleware that can be used for messages, rooms, etc.
 */
export const requireOwnership = (Model, resourceIdParam = 'id', ownerField = 'sender') => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    error: 'Authentication Required',
                    message: ERROR_MESSAGES.TOKEN_REQUIRED
                });
            }

            const resourceId = req.params[resourceIdParam];

            if (!resourceId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    error: 'Bad Request',
                    message: 'Resource ID is required'
                });
            }

            const resource = await Model.findById(resourceId);

            if (!resource) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    error: 'Not Found',
                    message: 'Resource not found'
                });
            }

            const ownerId = resource[ownerField];
            if (!ownerId || ownerId.toString() !== req.userId) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    error: 'Access Denied',
                    message: 'You do not own this resource'
                });
            }

            req.resource = resource;

            next();

        } catch (error) {
            console.error('Ownership check error:', error);
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                error: 'Authorization Error',
                message: ERROR_MESSAGES.SERVER_ERROR
            });
        }
    };
};

/**
 * Middleware to refresh user's last seen timestamp
 * Should be used on authenticated routes to track user activity
 */
export const updateLastSeen = async (req, res, next) => {
    if (req.user && req.userId) {
        try {
            User.findByIdAndUpdate(req.userId, {
                lastSeen: new Date()
            }).exec().catch(error => {
                console.error('Failed to update last seen:', error);
            });
        } catch (error) {
            console.error('Update last seen error:', error);
        }
    }

    next();
};


export const generateToken = (userId, expiresIn = '7d') => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn });
};


export const decodeToken = (token) => {
    try {
        return jwt.decode(token);
    } catch (error) {
        return null;
    }
};


export const isTokenExpired = (token) => {
    try {
        const decoded = jwt.decode(token);
        if (!decoded || !decoded.exp) return true;

        return Date.now() >= decoded.exp * 1000;
    } catch (error) {
        return true;
    }
};