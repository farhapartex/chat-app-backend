import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import {
    getRoomMessages,
    getPrivateMessages,
    sendRoomMessage,
    sendPrivateMessage,
    getRecentConversations,
    searchMessages,
    markAsRead,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    toggleReaction,
    pinMessage,
    unpinMessage,
    getMessageById,
    getUserMessageStats,
    getUnreadCounts,
    getFilteredMessages,
    getMessageThread,
    exportMessages
} from '../controllers/messageController.js';
import {
    authenticateToken,
    requireRoomMember,
    updateLastSeen
} from '../middleware/auth.js';
import { VALIDATION_RULES, MESSAGE_TYPES } from '../utils/constants.js';

const router = express.Router();

const validateMessageCreation = [
    body('content')
        .trim()
        .isLength({ min: 1, max: VALIDATION_RULES.MESSAGE.MAX_LENGTH })
        .withMessage(`Message content must be between 1 and ${VALIDATION_RULES.MESSAGE.MAX_LENGTH} characters`),

    body('type')
        .optional()
        .isIn(Object.values(MESSAGE_TYPES))
        .withMessage('Invalid message type'),

    body('replyTo')
        .optional()
        .isMongoId()
        .withMessage('Invalid reply message ID'),

    body('metadata')
        .optional()
        .isObject()
        .withMessage('Metadata must be an object'),

    body('mentions')
        .optional()
        .isArray()
        .withMessage('Mentions must be an array'),

    body('mentions.*.user')
        .optional()
        .isMongoId()
        .withMessage('Invalid user ID in mentions'),

    body('priority')
        .optional()
        .isIn(['low', 'normal', 'high', 'urgent'])
        .withMessage('Invalid message priority')
];


const validateMessageEdit = [
    body('content')
        .trim()
        .isLength({ min: 1, max: VALIDATION_RULES.MESSAGE.MAX_LENGTH })
        .withMessage(`Message content must be between 1 and ${VALIDATION_RULES.MESSAGE.MAX_LENGTH} characters`)
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
        .toInt(),

    query('before')
        .optional()
        .isISO8601()
        .withMessage('Before must be a valid ISO date'),

    query('after')
        .optional()
        .isISO8601()
        .withMessage('After must be a valid ISO date')
];


const validateMessageSearch = [
    body('query')
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Search query must be between 1 and 200 characters'),

    body('roomId')
        .optional()
        .isMongoId()
        .withMessage('Invalid room ID'),

    body('isPrivate')
        .optional()
        .isBoolean()
        .withMessage('isPrivate must be a boolean')
        .toBoolean(),

    body('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer')
        .toInt(),

    body('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
        .toInt(),

    body('dateFrom')
        .optional()
        .isISO8601()
        .withMessage('dateFrom must be a valid ISO date'),

    body('dateTo')
        .optional()
        .isISO8601()
        .withMessage('dateTo must be a valid ISO date'),

    body('messageType')
        .optional()
        .isIn(Object.values(MESSAGE_TYPES))
        .withMessage('Invalid message type')
];


const validateMarkAsRead = [
    body('messageIds')
        .isArray({ min: 1, max: 100 })
        .withMessage('messageIds must be an array with 1-100 items'),

    body('messageIds.*')
        .isMongoId()
        .withMessage('Each message ID must be valid')
];


const validateReaction = [
    body('emoji')
        .trim()
        .isLength({ min: 1, max: 10 })
        .withMessage('Emoji must be between 1 and 10 characters')
];


const validateMessagePin = [
    body('pinned')
        .optional()
        .isBoolean()
        .withMessage('pinned must be a boolean')
        .toBoolean()
];


const validateObjectId = (paramName) => [
    param(paramName)
        .isMongoId()
        .withMessage(`Invalid ${paramName} format`)
];


const validateMessageFilter = [
    body('roomIds')
        .optional()
        .isArray({ max: 50 })
        .withMessage('roomIds must be an array with maximum 50 items'),

    body('roomIds.*')
        .optional()
        .isMongoId()
        .withMessage('Each room ID must be valid'),

    body('userIds')
        .optional()
        .isArray({ max: 20 })
        .withMessage('userIds must be an array with maximum 20 items'),

    body('userIds.*')
        .optional()
        .isMongoId()
        .withMessage('Each user ID must be valid'),

    body('messageTypes')
        .optional()
        .isArray()
        .withMessage('messageTypes must be an array'),

    body('messageTypes.*')
        .optional()
        .isIn(Object.values(MESSAGE_TYPES))
        .withMessage('Invalid message type'),

    body('dateFrom')
        .optional()
        .isISO8601()
        .withMessage('dateFrom must be a valid ISO date'),

    body('dateTo')
        .optional()
        .isISO8601()
        .withMessage('dateTo must be a valid ISO date'),

    body('hasReactions')
        .optional()
        .isBoolean()
        .withMessage('hasReactions must be a boolean')
        .toBoolean(),

    body('isPinned')
        .optional()
        .isBoolean()
        .withMessage('isPinned must be a boolean')
        .toBoolean(),

    body('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer')
        .toInt(),

    body('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
        .toInt()
];


const validateMessageExport = [
    body('roomId')
        .optional()
        .isMongoId()
        .withMessage('Invalid room ID'),

    body('userId')
        .optional()
        .isMongoId()
        .withMessage('Invalid user ID'),

    body('dateFrom')
        .optional()
        .isISO8601()
        .withMessage('dateFrom must be a valid ISO date'),

    body('dateTo')
        .optional()
        .isISO8601()
        .withMessage('dateTo must be a valid ISO date'),

    body('format')
        .optional()
        .isIn(['json', 'csv'])
        .withMessage('Format must be json or csv')
];


const validateConversationLimit = [
    query('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('Limit must be between 1 and 50')
        .toInt()
];


const handleValidationErrors = (req, res, next) => {
    // const errors = validationResult(req);

    // if (!errors.isEmpty()) {
    //     return res.status(422).json({
    //         success: false,
    //         error: 'Validation Error',
    //         message: 'Please check your input data',
    //         details: errors.array().reduce((acc, error) => {
    //             acc[error.path] = error.msg;
    //             return acc;
    //         }, {})
    //     });
    // }

    next();
};


router.get('/stats',
    authenticateToken,
    updateLastSeen,
    getUserMessageStats
);


router.get('/unread-counts',
    authenticateToken,
    updateLastSeen,
    getUnreadCounts
);


router.get('/conversations',
    authenticateToken,
    validateConversationLimit,
    handleValidationErrors,
    updateLastSeen,
    getRecentConversations
);


router.post('/search',
    authenticateToken,
    validateMessageSearch,
    handleValidationErrors,
    updateLastSeen,
    searchMessages
);


router.post('/mark-read',
    authenticateToken,
    validateMarkAsRead,
    handleValidationErrors,
    markAsRead
);


router.post('/filter',
    authenticateToken,
    validateMessageFilter,
    handleValidationErrors,
    updateLastSeen,
    getFilteredMessages
);


router.post('/export',
    authenticateToken,
    validateMessageExport,
    handleValidationErrors,
    exportMessages
);


router.get('/room/:roomId',
    authenticateToken,
    ...validateObjectId('roomId'),
    validatePagination,
    handleValidationErrors,
    requireRoomMember('roomId'),
    updateLastSeen,
    getRoomMessages
);


router.post('/room/:roomId',
    authenticateToken,
    ...validateObjectId('roomId'),
    validateMessageCreation,
    handleValidationErrors,
    requireRoomMember('roomId'),
    sendRoomMessage
);


router.get('/private/:userId',
    authenticateToken,
    ...validateObjectId('userId'),
    validatePagination,
    handleValidationErrors,
    updateLastSeen,
    getPrivateMessages
);


router.post('/private/:userId',
    authenticateToken,
    ...validateObjectId('userId'),
    validateMessageCreation,
    handleValidationErrors,
    sendPrivateMessage
);


router.get('/:messageId',
    authenticateToken,
    ...validateObjectId('messageId'),
    handleValidationErrors,
    updateLastSeen,
    getMessageById
);


router.put('/:messageId',
    authenticateToken,
    ...validateObjectId('messageId'),
    validateMessageEdit,
    handleValidationErrors,
    editMessage
);


router.delete('/:messageId',
    authenticateToken,
    ...validateObjectId('messageId'),
    handleValidationErrors,
    deleteMessage
);


router.get('/:messageId/thread',
    authenticateToken,
    ...validateObjectId('messageId'),
    validatePagination,
    handleValidationErrors,
    updateLastSeen,
    getMessageThread
);


router.post('/:messageId/reactions',
    authenticateToken,
    ...validateObjectId('messageId'),
    validateReaction,
    handleValidationErrors,
    addReaction
);


router.post('/:messageId/reactions/toggle',
    authenticateToken,
    ...validateObjectId('messageId'),
    validateReaction,
    handleValidationErrors,
    toggleReaction
);


router.delete('/:messageId/reactions/:emoji',
    authenticateToken,
    ...validateObjectId('messageId'),
    param('emoji')
        .trim()
        .isLength({ min: 1, max: 10 })
        .withMessage('Emoji must be between 1 and 10 characters'),
    handleValidationErrors,
    removeReaction
);

router.post('/:messageId/pin',
    authenticateToken,
    ...validateObjectId('messageId'),
    validateMessagePin,
    handleValidationErrors,
    pinMessage
);


router.delete('/:messageId/pin',
    authenticateToken,
    ...validateObjectId('messageId'),
    handleValidationErrors,
    unpinMessage
);

router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Message endpoint not found',
        message: `Message route ${req.method} ${req.originalUrl} not found`
    });
});

export default router;