import jwt from 'jsonwebtoken';
import { User } from '../models/user.js';
import {
    JWT_SECRET,
    JWT_EXPIRES_IN,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    VALIDATION_RULES
} from '../utils/constants.js';
import { AppError } from '../middleware/errorHandler.js';

class AuthService {
    generateToken(userId, expiresIn = JWT_EXPIRES_IN) {
        try {
            return jwt.sign({ userId: userId.toString() }, JWT_SECRET, { expiresIn });
        } catch (error) {
            throw new AppError('Failed to generate authentication token', 500);
        }
    }


    verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                throw new AppError(ERROR_MESSAGES.TOKEN_INVALID, 401);
            }
            if (error.name === 'TokenExpiredError') {
                throw new AppError(ERROR_MESSAGES.TOKEN_EXPIRED, 401);
            }
            throw new AppError(ERROR_MESSAGES.TOKEN_INVALID, 401);
        }
    }


    validateRegistrationInput({ username, email, password, bio = '' }) {
        const errors = {};
        if (!username || username.trim().length === 0) {
            errors.username = 'Username is required';
        } else if (username.length < VALIDATION_RULES.USERNAME.MIN_LENGTH) {
            errors.username = `Username must be at least ${VALIDATION_RULES.USERNAME.MIN_LENGTH} characters long`;
        } else if (username.length > VALIDATION_RULES.USERNAME.MAX_LENGTH) {
            errors.username = `Username cannot exceed ${VALIDATION_RULES.USERNAME.MAX_LENGTH} characters`;
        } else if (!VALIDATION_RULES.USERNAME.PATTERN.test(username)) {
            errors.username = 'Username can only contain letters, numbers, and underscores';
        }

        if (!email || email.trim().length === 0) {
            errors.email = 'Email is required';
        } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
            errors.email = 'Please enter a valid email address';
        }

        if (!password || password.length === 0) {
            errors.password = 'Password is required';
        } else if (password.length < VALIDATION_RULES.PASSWORD.MIN_LENGTH) {
            errors.password = `Password must be at least ${VALIDATION_RULES.PASSWORD.MIN_LENGTH} characters long`;
        } else if (password.length > VALIDATION_RULES.PASSWORD.MAX_LENGTH) {
            errors.password = 'Password is too long';
        }

        if (bio && bio.length > VALIDATION_RULES.BIO.MAX_LENGTH) {
            errors.bio = `Bio cannot exceed ${VALIDATION_RULES.BIO.MAX_LENGTH} characters`;
        }

        if (Object.keys(errors).length > 0) {
            const error = new AppError(ERROR_MESSAGES.VALIDATION_ERROR, 422);
            error.details = errors;
            throw error;
        }
    }

    async register({ username, email, password, bio = '' }, ipAddress = null) {
        try {
            this.validateRegistrationInput({ username, email, password, bio });

            const normalizedUsername = username.toLowerCase().trim();
            const normalizedEmail = email.toLowerCase().trim();

            const existingUser = await User.findOne({
                $or: [
                    { email: normalizedEmail },
                    { username: normalizedUsername }
                ]
            });

            if (existingUser) {
                if (existingUser.email === normalizedEmail) {
                    throw new AppError(ERROR_MESSAGES.EMAIL_TAKEN, 409);
                }
                if (existingUser.username === normalizedUsername) {
                    throw new AppError(ERROR_MESSAGES.USERNAME_TAKEN, 409);
                }
            }

            const user = new User({
                username: normalizedUsername,
                email: normalizedEmail,
                password,
                bio: bio.trim(),
                isOnline: true,
                lastLoginAt: new Date(),
                lastLoginIP: ipAddress,
                loginCount: 1
            });

            await user.save();

            const token = this.generateToken(user._id);
            return {
                success: true,
                message: SUCCESS_MESSAGES.USER_REGISTERED,
                user: user.getPrivateProfile(),
                token
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (error.code === 11000) {
                const field = Object.keys(error.keyValue)[0];
                if (field === 'email') {
                    throw new AppError(ERROR_MESSAGES.EMAIL_TAKEN, 409);
                }
                if (field === 'username') {
                    throw new AppError(ERROR_MESSAGES.USERNAME_TAKEN, 409);
                }
            }

            throw new AppError('Registration failed', 500);
        }
    }


    async login({ email, password }, ipAddress = null) {
        try {
            if (!email || !password) {
                throw new AppError('Email and password are required', 400);
            }

            const normalizedEmail = email.toLowerCase().trim();

            const user = await User.findOne({ email: normalizedEmail }).select('+password');

            if (!user) {
                throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, 401);
            }

            if (!user.isActive) {
                throw new AppError('Your account has been deactivated. Please contact support.', 403);
            }

            const isPasswordValid = await user.comparePassword(password);

            if (!isPasswordValid) {
                throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, 401);
            }

            await user.setOnlineStatus(true, ipAddress);
            const token = this.generateToken(user._id);

            return {
                success: true,
                message: SUCCESS_MESSAGES.USER_LOGGED_IN,
                user: user.getPrivateProfile(),
                token
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Login failed', 500);
        }
    }


    async getProfile(userId, isOwnProfile = false) {
        try {
            const user = await User.findById(userId);

            if (!user) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            if (!user.isActive) {
                throw new AppError('User account is not active', 404);
            }

            return {
                success: true,
                user: isOwnProfile ? user.getPrivateProfile() : user.getPublicProfile()
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to get user profile', 500);
        }
    }


    async updateProfile(userId, updates) {
        try {
            const allowedUpdates = ['username', 'bio', 'avatar', 'preferences'];
            const filteredUpdates = {};

            Object.keys(updates).forEach(key => {
                if (allowedUpdates.includes(key) && updates[key] !== undefined) {
                    filteredUpdates[key] = updates[key];
                }
            });

            if (filteredUpdates.username) {
                const normalizedUsername = filteredUpdates.username.toLowerCase().trim();

                if (!VALIDATION_RULES.USERNAME.PATTERN.test(normalizedUsername)) {
                    throw new AppError('Username can only contain letters, numbers, and underscores', 400);
                }

                if (normalizedUsername.length < VALIDATION_RULES.USERNAME.MIN_LENGTH ||
                    normalizedUsername.length > VALIDATION_RULES.USERNAME.MAX_LENGTH) {
                    throw new AppError(`Username must be between ${VALIDATION_RULES.USERNAME.MIN_LENGTH} and ${VALIDATION_RULES.USERNAME.MAX_LENGTH} characters`, 400);
                }

                const existingUser = await User.findOne({
                    username: normalizedUsername,
                    _id: { $ne: userId }
                });

                if (existingUser) {
                    throw new AppError(ERROR_MESSAGES.USERNAME_TAKEN, 409);
                }

                filteredUpdates.username = normalizedUsername;
            }

            if (filteredUpdates.bio && filteredUpdates.bio.length > VALIDATION_RULES.BIO.MAX_LENGTH) {
                throw new AppError(`Bio cannot exceed ${VALIDATION_RULES.BIO.MAX_LENGTH} characters`, 400);
            }

            if (filteredUpdates.avatar && filteredUpdates.avatar.trim() !== '') {
                const avatarUrl = filteredUpdates.avatar.trim();
                if (!/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(avatarUrl)) {
                    throw new AppError('Avatar must be a valid image URL', 400);
                }
            }

            const user = await User.findByIdAndUpdate(
                userId,
                {
                    ...filteredUpdates,
                    updatedAt: new Date()
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!user) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            return {
                success: true,
                message: SUCCESS_MESSAGES.PROFILE_UPDATED,
                user: user.getPrivateProfile()
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (error.name === 'ValidationError') {
                const validationErrors = {};
                Object.keys(error.errors).forEach(key => {
                    validationErrors[key] = error.errors[key].message;
                });
                const validationError = new AppError(ERROR_MESSAGES.VALIDATION_ERROR, 422);
                validationError.details = validationErrors;
                throw validationError;
            }

            throw new AppError('Failed to update profile', 500);
        }
    }

    async changePassword(userId, currentPassword, newPassword) {
        try {
            if (!currentPassword || !newPassword) {
                throw new AppError('Current password and new password are required', 400);
            }

            if (newPassword.length < VALIDATION_RULES.PASSWORD.MIN_LENGTH) {
                throw new AppError(`New password must be at least ${VALIDATION_RULES.PASSWORD.MIN_LENGTH} characters long`, 400);
            }

            const user = await User.findById(userId).select('+password');

            if (!user) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            const isCurrentPasswordValid = await user.comparePassword(currentPassword);

            if (!isCurrentPasswordValid) {
                throw new AppError('Current password is incorrect', 400);
            }

            user.password = newPassword;
            await user.save();

            return {
                success: true,
                message: 'Password changed successfully'
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to change password', 500);
        }
    }

    async logout(userId) {
        try {
            await User.findByIdAndUpdate(userId, {
                isOnline: false,
                lastSeen: new Date()
            });

            return {
                success: true,
                message: SUCCESS_MESSAGES.USER_LOGGED_OUT
            };

        } catch (error) {
            throw new AppError('Logout failed', 500);
        }
    }

    async searchUsers(searchTerm, currentUserId, limit = 20) {
        try {
            if (!searchTerm || searchTerm.trim().length === 0) {
                return {
                    success: true,
                    users: [],
                    total: 0
                };
            }

            const searchRegex = new RegExp(searchTerm.trim(), 'i');

            const users = await User.find({
                $and: [
                    {
                        $or: [
                            { username: searchRegex },
                            { email: searchRegex }
                        ]
                    },
                    { _id: { $ne: currentUserId } },
                    { isActive: true }
                ]
            })
                .select('username email avatar bio isOnline lastSeen createdAt')
                .limit(limit)
                .sort({ username: 1 });

            return {
                success: true,
                users: users.map(user => user.getPublicProfile()),
                total: users.length
            };

        } catch (error) {
            throw new AppError('User search failed', 500);
        }
    }


    async getUserStats(userId) {
        try {
            const user = await User.findById(userId);

            if (!user) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            const { Room } = await import('../models/room.js');
            const { Message } = await import('../models/message.js');

            const [joinedRoomsCount, messagesCount, createdRoomsCount] = await Promise.all([
                Room.countDocuments({ members: userId, isActive: true }),
                Message.countDocuments({ sender: userId, isDeleted: false }),
                Room.countDocuments({ creator: userId, isActive: true })
            ]);

            return {
                success: true,
                stats: {
                    joinedRooms: joinedRoomsCount,
                    messagesSent: messagesCount,
                    roomsCreated: createdRoomsCount,
                    accountAge: Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)), // days
                    loginCount: user.loginCount,
                    lastLoginAt: user.lastLoginAt,
                    isOnline: user.isOnline,
                    lastSeen: user.lastSeen
                }
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to get user statistics', 500);
        }
    }

    async toggleUserBlock(userId, targetUserId, block = true) {
        try {
            if (userId.toString() === targetUserId.toString()) {
                throw new AppError('You cannot block yourself', 400);
            }

            const user = await User.findById(userId);
            const targetUser = await User.findById(targetUserId);

            if (!user || !targetUser) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            if (block) {
                await user.blockUser(targetUserId);
            } else {
                await user.unblockUser(targetUserId);
            }

            return {
                success: true,
                message: block ? 'User blocked successfully' : 'User unblocked successfully',
                blocked: block
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Failed to ${block ? 'block' : 'unblock'} user`, 500);
        }
    }

    async getBlockedUsers(userId) {
        try {
            const user = await User.findById(userId)
                .populate('blockedUsers', 'username avatar')
                .select('blockedUsers');

            if (!user) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            return {
                success: true,
                blockedUsers: user.blockedUsers.map(blockedUser => ({
                    id: blockedUser._id,
                    username: blockedUser.username,
                    avatar: blockedUser.avatar
                }))
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to get blocked users', 500);
        }
    }
}


export const authService = new AuthService();