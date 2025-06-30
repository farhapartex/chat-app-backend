import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import {
    register,
    login,
    getProfile,
    getUserProfile,
    updateProfile,
    changePassword,
    logout,
    searchUsers,
    getUserStats,
    blockUser,
    unblockUser,
    getBlockedUsers,
    refreshToken,
    verifyToken,
    getOnlineUsers,
    updatePreferences,
    uploadAvatar,
    deleteAccount,
    checkUsernameAvailability,
    checkEmailAvailability
} from '../controllers/authController.js';
import { authenticateToken, optionalAuth, updateLastSeen } from '../middleware/auth.js';
import { VALIDATION_RULES } from '../utils/constants.js';

const router = express.Router();

const validateRegistration = [
    body('username')
        .trim()
        .isLength({ min: VALIDATION_RULES.USERNAME.MIN_LENGTH, max: VALIDATION_RULES.USERNAME.MAX_LENGTH })
        .withMessage(`Username must be between ${VALIDATION_RULES.USERNAME.MIN_LENGTH} and ${VALIDATION_RULES.USERNAME.MAX_LENGTH} characters`)
        .matches(VALIDATION_RULES.USERNAME.PATTERN)
        .withMessage('Username can only contain letters, numbers, and underscores')
        .toLowerCase(),

    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

    body('password')
        .isLength({ min: VALIDATION_RULES.PASSWORD.MIN_LENGTH, max: VALIDATION_RULES.PASSWORD.MAX_LENGTH })
        .withMessage(`Password must be between ${VALIDATION_RULES.PASSWORD.MIN_LENGTH} and ${VALIDATION_RULES.PASSWORD.MAX_LENGTH} characters`),

    body('bio')
        .optional()
        .trim()
        .isLength({ max: VALIDATION_RULES.BIO.MAX_LENGTH })
        .withMessage(`Bio cannot exceed ${VALIDATION_RULES.BIO.MAX_LENGTH} characters`)
];

const validateLogin = [
    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
];


const validateProfileUpdate = [
    body('username')
        .optional()
        .trim()
        .isLength({ min: VALIDATION_RULES.USERNAME.MIN_LENGTH, max: VALIDATION_RULES.USERNAME.MAX_LENGTH })
        .withMessage(`Username must be between ${VALIDATION_RULES.USERNAME.MIN_LENGTH} and ${VALIDATION_RULES.USERNAME.MAX_LENGTH} characters`)
        .matches(VALIDATION_RULES.USERNAME.PATTERN)
        .withMessage('Username can only contain letters, numbers, and underscores')
        .toLowerCase(),

    body('bio')
        .optional()
        .trim()
        .isLength({ max: VALIDATION_RULES.BIO.MAX_LENGTH })
        .withMessage(`Bio cannot exceed ${VALIDATION_RULES.BIO.MAX_LENGTH} characters`),

    body('avatar')
        .optional()
        .trim()
        .isURL()
        .withMessage('Avatar must be a valid URL')
        .matches(/\.(jpg|jpeg|png|gif|webp)$/i)
        .withMessage('Avatar must be a valid image URL'),

    body('preferences')
        .optional()
        .isObject()
        .withMessage('Preferences must be an object')
];


const validatePasswordChange = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),

    body('newPassword')
        .isLength({ min: VALIDATION_RULES.PASSWORD.MIN_LENGTH, max: VALIDATION_RULES.PASSWORD.MAX_LENGTH })
        .withMessage(`New password must be between ${VALIDATION_RULES.PASSWORD.MIN_LENGTH} and ${VALIDATION_RULES.PASSWORD.MAX_LENGTH} characters`)
];


const validateUserSearch = [
    query('q')
        .trim()
        .isLength({ min: 1 })
        .withMessage('Search query is required'),

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


const validateUsernameCheck = [
    param('username')
        .trim()
        .isLength({ min: VALIDATION_RULES.USERNAME.MIN_LENGTH, max: VALIDATION_RULES.USERNAME.MAX_LENGTH })
        .withMessage(`Username must be between ${VALIDATION_RULES.USERNAME.MIN_LENGTH} and ${VALIDATION_RULES.USERNAME.MAX_LENGTH} characters`)
        .matches(VALIDATION_RULES.USERNAME.PATTERN)
        .withMessage('Username can only contain letters, numbers, and underscores')
        .toLowerCase()
];


const validateEmailCheck = [
    param('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
];


const validateAvatarUpload = [
    body('avatarUrl')
        .trim()
        .isURL()
        .withMessage('Avatar URL must be a valid URL')
        .matches(/\.(jpg|jpeg|png|gif|webp)$/i)
        .withMessage('Avatar must be a valid image URL')
];


const validateAccountDeletion = [
    body('password')
        .notEmpty()
        .withMessage('Password confirmation is required')
];


const validatePreferences = [
    body('preferences')
        .isObject()
        .withMessage('Preferences must be an object'),

    body('preferences.notifications')
        .optional()
        .isObject()
        .withMessage('Notifications preferences must be an object'),

    body('preferences.theme')
        .optional()
        .isIn(['light', 'dark', 'auto'])
        .withMessage('Theme must be light, dark, or auto'),

    body('preferences.language')
        .optional()
        .matches(/^[a-z]{2}$/)
        .withMessage('Language must be a valid 2-letter code')
];

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
    //const errors = validationResult(req);

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

router.post('/register',
    validateRegistration,
    handleValidationErrors,
    register
);


router.post('/login',
    validateLogin,
    handleValidationErrors,
    login
);


router.get('/check-username/:username',
    validateUsernameCheck,
    handleValidationErrors,
    checkUsernameAvailability
);


router.get('/check-email/:email',
    validateEmailCheck,
    handleValidationErrors,
    checkEmailAvailability
);


router.get('/profile',
    authenticateToken,
    updateLastSeen,
    getProfile
);


router.put('/profile',
    authenticateToken,
    validateProfileUpdate,
    handleValidationErrors,
    updateLastSeen,
    updateProfile
);


router.post('/change-password',
    authenticateToken,
    validatePasswordChange,
    handleValidationErrors,
    changePassword
);


router.post('/logout',
    authenticateToken,
    logout
);


router.post('/refresh',
    authenticateToken,
    refreshToken
);


router.get('/verify',
    authenticateToken,
    verifyToken
);


router.get('/stats',
    authenticateToken,
    updateLastSeen,
    getUserStats
);


router.patch('/preferences',
    authenticateToken,
    validatePreferences,
    handleValidationErrors,
    updatePreferences
);


router.post('/avatar',
    authenticateToken,
    validateAvatarUpload,
    handleValidationErrors,
    uploadAvatar
);


router.delete('/account',
    authenticateToken,
    validateAccountDeletion,
    handleValidationErrors,
    deleteAccount
);


router.get('/users/search',
    authenticateToken,
    validateUserSearch,
    handleValidationErrors,
    updateLastSeen,
    searchUsers
);


router.get('/online-users',
    authenticateToken,
    updateLastSeen,
    getOnlineUsers
);


router.get('/users/:userId',
    optionalAuth,
    ...validateObjectId('userId'),
    handleValidationErrors,
    getUserProfile
);


router.post('/users/:userId/block',
    authenticateToken,
    ...validateObjectId('userId'),
    handleValidationErrors,
    blockUser
);

router.delete('/users/:userId/block',
    authenticateToken,
    ...validateObjectId('userId'),
    handleValidationErrors,
    unblockUser
);


router.get('/blocked-users',
    authenticateToken,
    updateLastSeen,
    getBlockedUsers
);


router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Auth endpoint not found',
        message: `Authentication route ${req.method} ${req.originalUrl} not found`
    });
});

export default router;