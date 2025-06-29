import { authService } from '../services/authService.js';
import { HTTP_STATUS } from '../utils/constants.js';
import { asyncHandler } from '../middleware/errorHandler.js';


export const register = asyncHandler(async (req, res) => {
    const { username, email, password, bio } = req.body;

    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

    const result = await authService.register(
        { username, email, password, bio },
        ipAddress
    );

    if (result.token) {
        res.cookie('authToken', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
    }

    res.status(HTTP_STATUS.CREATED).json(result);
});


export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

    const result = await authService.login({ email, password }, ipAddress);

    if (result.token) {
        res.cookie('authToken', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
    }

    res.status(HTTP_STATUS.OK).json(result);
});


export const getProfile = asyncHandler(async (req, res) => {
    const result = await authService.getProfile(req.userId, true);

    res.status(HTTP_STATUS.OK).json(result);
});


export const getUserProfile = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const isOwnProfile = req.userId === userId;

    const result = await authService.getProfile(userId, isOwnProfile);

    res.status(HTTP_STATUS.OK).json(result);
});


export const updateProfile = asyncHandler(async (req, res) => {
    const { username, bio, avatar, preferences } = req.body;

    const result = await authService.updateProfile(req.userId, {
        username,
        bio,
        avatar,
        preferences
    });

    res.status(HTTP_STATUS.OK).json(result);
});


export const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const result = await authService.changePassword(
        req.userId,
        currentPassword,
        newPassword
    );

    res.status(HTTP_STATUS.OK).json(result);
});


export const logout = asyncHandler(async (req, res) => {
    const result = await authService.logout(req.userId);
    res.clearCookie('authToken');

    res.status(HTTP_STATUS.OK).json(result);
});


export const searchUsers = asyncHandler(async (req, res) => {
    const { q: searchTerm, limit = 20 } = req.query;

    const result = await authService.searchUsers(
        searchTerm,
        req.userId,
        parseInt(limit)
    );

    res.status(HTTP_STATUS.OK).json(result);
});


export const getUserStats = asyncHandler(async (req, res) => {
    const result = await authService.getUserStats(req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const blockUser = asyncHandler(async (req, res) => {
    const { userId: targetUserId } = req.params;

    const result = await authService.toggleUserBlock(
        req.userId,
        targetUserId,
        true // block = true
    );

    res.status(HTTP_STATUS.OK).json(result);
});


export const unblockUser = asyncHandler(async (req, res) => {
    const { userId: targetUserId } = req.params;

    const result = await authService.toggleUserBlock(
        req.userId,
        targetUserId,
        false // block = false
    );

    res.status(HTTP_STATUS.OK).json(result);
});


export const getBlockedUsers = asyncHandler(async (req, res) => {
    const result = await authService.getBlockedUsers(req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const refreshToken = asyncHandler(async (req, res) => {
    const token = authService.generateToken(req.userId);
    res.cookie('authToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Token refreshed successfully',
        token
    });
});


export const verifyToken = asyncHandler(async (req, res) => {
    const result = await authService.getProfile(req.userId, true);

    res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Token is valid',
        user: result.user
    });
});


export const getOnlineUsers = asyncHandler(async (req, res) => {
    const { User } = await import('../models/User.js');

    const onlineUsers = await User.find({
        isOnline: true,
        isActive: true,
        _id: { $ne: req.userId }
    })
        .select('username avatar lastSeen')
        .limit(50)
        .sort({ lastSeen: -1 });

    res.status(HTTP_STATUS.OK).json({
        success: true,
        users: onlineUsers.map(user => user.getPublicProfile()),
        count: onlineUsers.length
    });
});


export const updatePreferences = asyncHandler(async (req, res) => {
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Invalid preferences data'
        });
    }

    const result = await authService.updateProfile(req.userId, { preferences });

    res.status(HTTP_STATUS.OK).json(result);
});


export const uploadAvatar = asyncHandler(async (req, res) => {
    const { avatarUrl } = req.body;

    if (!avatarUrl) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Avatar URL is required'
        });
    }

    const result = await authService.updateProfile(req.userId, {
        avatar: avatarUrl
    });

    res.status(HTTP_STATUS.OK).json(result);
});


export const deleteAccount = asyncHandler(async (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Password confirmation is required'
        });
    }

    const { User } = await import('../models/User.js');
    const user = await User.findById(req.userId).select('+password');
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            error: 'Invalid password'
        });
    }

    await User.findByIdAndUpdate(req.userId, {
        isActive: false,
        isOnline: false,
        deletedAt: new Date()
    });

    res.clearCookie('authToken');

    res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Account deactivated successfully'
    });
});


export const checkUsernameAvailability = asyncHandler(async (req, res) => {
    const { username } = req.params;

    if (!username || username.length < 3) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Username must be at least 3 characters long'
        });
    }

    const { User } = await import('../models/User.js');

    const existingUser = await User.findOne({
        username: username.toLowerCase(),
        isActive: true
    });

    res.status(HTTP_STATUS.OK).json({
        success: true,
        available: !existingUser,
        username: username.toLowerCase()
    });
});


export const checkEmailAvailability = asyncHandler(async (req, res) => {
    const { email } = req.params;

    if (!email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Invalid email format'
        });
    }

    const { User } = await import('../models/User.js');

    const existingUser = await User.findOne({
        email: email.toLowerCase(),
        isActive: true
    });

    res.status(HTTP_STATUS.OK).json({
        success: true,
        available: !existingUser,
        email: email.toLowerCase()
    });
});