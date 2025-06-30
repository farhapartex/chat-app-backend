import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import {
    createRoom,
    getPublicRooms,
    getUserRooms,
    getRoomById,
    updateRoom,
    deleteRoom,
    joinRoom,
    leaveRoom,
    promoteToAdmin,
    demoteFromAdmin,
    removeUserFromRoom,
    searchRooms,
    getTrendingRooms,
    getRoomCategories,
    getRoomStats,
    getRoomMembers,
    getRoomAdmins,
    checkCanJoinRoom,
    getRoomsByCategory,
    getRecommendedRooms,
    inviteUserToRoom,
    getRoomActivity
} from '../controllers/roomController.js';
import {
    authenticateToken,
    requireRoomMember,
    requireRoomAdmin,
    updateLastSeen
} from '../middleware/auth.js';
import { VALIDATION_RULES, ROOM_TYPES } from '../utils/constants.js';

const router = express.Router();


const validateRoomCreation = [
    body('name')
        .trim()
        .isLength({ min: VALIDATION_RULES.ROOM_NAME.MIN_LENGTH, max: VALIDATION_RULES.ROOM_NAME.MAX_LENGTH })
        .withMessage(`Room name must be between ${VALIDATION_RULES.ROOM_NAME.MIN_LENGTH} and ${VALIDATION_RULES.ROOM_NAME.MAX_LENGTH} characters`),

    body('description')
        .optional()
        .trim()
        .isLength({ max: VALIDATION_RULES.ROOM_DESCRIPTION.MAX_LENGTH })
        .withMessage(`Room description cannot exceed ${VALIDATION_RULES.ROOM_DESCRIPTION.MAX_LENGTH} characters`),

    body('type')
        .optional()
        .isIn(Object.values(ROOM_TYPES))
        .withMessage('Room type must be public or private'),

    body('maxMembers')
        .optional()
        .isInt({ min: 2, max: 1000 })
        .withMessage('Max members must be between 2 and 1000')
        .toInt(),

    body('category')
        .optional()
        .isIn(['general', 'technology', 'gaming', 'music', 'sports', 'education', 'business', 'other'])
        .withMessage('Invalid room category'),

    body('tags')
        .optional()
        .isArray({ max: 10 })
        .withMessage('Tags must be an array with maximum 10 items'),

    body('tags.*')
        .optional()
        .trim()
        .isLength({ min: 1, max: 20 })
        .withMessage('Each tag must be between 1 and 20 characters')
];


const validateRoomUpdate = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: VALIDATION_RULES.ROOM_NAME.MIN_LENGTH, max: VALIDATION_RULES.ROOM_NAME.MAX_LENGTH })
        .withMessage(`Room name must be between ${VALIDATION_RULES.ROOM_NAME.MIN_LENGTH} and ${VALIDATION_RULES.ROOM_NAME.MAX_LENGTH} characters`),

    body('description')
        .optional()
        .trim()
        .isLength({ max: VALIDATION_RULES.ROOM_DESCRIPTION.MAX_LENGTH })
        .withMessage(`Room description cannot exceed ${VALIDATION_RULES.ROOM_DESCRIPTION.MAX_LENGTH} characters`),

    body('maxMembers')
        .optional()
        .isInt({ min: 2, max: 1000 })
        .withMessage('Max members must be between 2 and 1000')
        .toInt(),

    body('category')
        .optional()
        .isIn(['general', 'technology', 'gaming', 'music', 'sports', 'education', 'business', 'other'])
        .withMessage('Invalid room category'),

    body('tags')
        .optional()
        .isArray({ max: 10 })
        .withMessage('Tags must be an array with maximum 10 items'),

    body('tags.*')
        .optional()
        .trim()
        .isLength({ min: 1, max: 20 })
        .withMessage('Each tag must be between 1 and 20 characters'),

    body('settings')
        .optional()
        .isObject()
        .withMessage('Settings must be an object'),

    body('avatar')
        .optional()
        .trim()
        .isURL()
        .withMessage('Avatar must be a valid URL')
        .matches(/\.(jpg|jpeg|png|gif|webp)$/i)
        .withMessage('Avatar must be a valid image URL')
];


const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer')
        .toInt(),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
        .toInt()
];


const validateRoomSearch = [
    query('q')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Search query must be between 1 and 100 characters'),

    ...validatePagination,

    query('category')
        .optional()
        .isIn(['general', 'technology', 'gaming', 'music', 'sports', 'education', 'business', 'other', 'all'])
        .withMessage('Invalid category')
];


const validatePublicRoomsQuery = [
    ...validatePagination,

    query('category')
        .optional()
        .isIn(['general', 'technology', 'gaming', 'music', 'sports', 'education', 'business', 'other', 'all'])
        .withMessage('Invalid category'),

    query('search')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Search term must be between 1 and 100 characters'),

    query('sortBy')
        .optional()
        .isIn(['lastActivity', 'createdAt', 'memberCount', 'messageCount', 'name'])
        .withMessage('Invalid sort field'),

    query('sortOrder')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Sort order must be asc or desc')
];


const validateTrendingQuery = [
    query('hours')
        .optional()
        .isInt({ min: 1, max: 168 }) // Max 1 week
        .withMessage('Hours must be between 1 and 168')
        .toInt(),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('Limit must be between 1 and 50')
        .toInt()
];


const validateObjectId = (paramName) => [
    param(paramName)
        .isMongoId()
        .withMessage(`Invalid ${paramName} format`)
];


const validateRoomInvitation = [
    body('userId')
        .isMongoId()
        .withMessage('Invalid user ID format'),

    body('message')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Invitation message cannot exceed 500 characters')
];


const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(422).json({
            success: false,
            error: 'Validation Error',
            message: 'Please check your input data',
            details: errors.array().reduce((acc, error) => {
                acc[error.path] = error.msg;
                return acc;
            }, {})
        });
    }

    next();
};


router.get('/',
    validatePublicRoomsQuery,
    handleValidationErrors,
    getPublicRooms
);


router.get('/search',
    validateRoomSearch,
    handleValidationErrors,
    searchRooms
);


router.get('/trending',
    validateTrendingQuery,
    handleValidationErrors,
    getTrendingRooms
);


router.get('/categories',
    getRoomCategories
);


router.get('/category/:category',
    param('category')
        .isIn(['general', 'technology', 'gaming', 'music', 'sports', 'education', 'business', 'other'])
        .withMessage('Invalid category'),
    validatePagination,
    handleValidationErrors,
    getRoomsByCategory
);


router.post('/',
    authenticateToken,
    validateRoomCreation,
    handleValidationErrors,
    createRoom
);


router.get('/my-rooms',
    authenticateToken,
    updateLastSeen,
    getUserRooms
);


router.get('/recommended',
    authenticateToken,
    query('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('Limit must be between 1 and 50')
        .toInt(),
    handleValidationErrors,
    updateLastSeen,
    getRecommendedRooms
);


router.get('/:roomId',
    authenticateToken,
    ...validateObjectId('roomId'),
    handleValidationErrors,
    updateLastSeen,
    getRoomById
);


router.put('/:roomId',
    authenticateToken,
    ...validateObjectId('roomId'),
    validateRoomUpdate,
    handleValidationErrors,
    requireRoomAdmin('roomId'),
    updateRoom
);


router.delete('/:roomId',
    authenticateToken,
    ...validateObjectId('roomId'),
    handleValidationErrors,
    deleteRoom
);


router.get('/:roomId/stats',
    authenticateToken,
    ...validateObjectId('roomId'),
    handleValidationErrors,
    updateLastSeen,
    getRoomStats
);


router.get('/:roomId/activity',
    authenticateToken,
    ...validateObjectId('roomId'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
        .toInt(),
    handleValidationErrors,
    updateLastSeen,
    getRoomActivity
);


router.get('/:roomId/can-join',
    authenticateToken,
    ...validateObjectId('roomId'),
    handleValidationErrors,
    checkCanJoinRoom
);


router.post('/:roomId/join',
    authenticateToken,
    ...validateObjectId('roomId'),
    handleValidationErrors,
    joinRoom
);


router.post('/:roomId/leave',
    authenticateToken,
    ...validateObjectId('roomId'),
    handleValidationErrors,
    requireRoomMember('roomId'),
    leaveRoom
);


router.get('/:roomId/members',
    authenticateToken,
    ...validateObjectId('roomId'),
    validatePagination,
    handleValidationErrors,
    updateLastSeen,
    getRoomMembers
);


router.delete('/:roomId/members/:userId',
    authenticateToken,
    ...validateObjectId('roomId'),
    ...validateObjectId('userId'),
    handleValidationErrors,
    requireRoomAdmin('roomId'),
    removeUserFromRoom
);


router.post('/:roomId/invite',
    authenticateToken,
    ...validateObjectId('roomId'),
    validateRoomInvitation,
    handleValidationErrors,
    requireRoomMember('roomId'),
    inviteUserToRoom
);


router.get('/:roomId/admins',
    authenticateToken,
    ...validateObjectId('roomId'),
    handleValidationErrors,
    updateLastSeen,
    getRoomAdmins
);


router.post('/:roomId/admins/:userId',
    authenticateToken,
    ...validateObjectId('roomId'),
    ...validateObjectId('userId'),
    handleValidationErrors,
    promoteToAdmin
);


router.delete('/:roomId/admins/:userId',
    authenticateToken,
    ...validateObjectId('roomId'),
    ...validateObjectId('userId'),
    handleValidationErrors,
    demoteFromAdmin
);


router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Room endpoint not found',
        message: `Room route ${req.method} ${req.originalUrl} not found`
    });
});

export default router;