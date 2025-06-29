import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { VALIDATION_RULES } from '../utils/constants.js';

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [VALIDATION_RULES.USERNAME.MIN_LENGTH, `Username must be at least ${VALIDATION_RULES.USERNAME.MIN_LENGTH} characters long`],
        maxlength: [VALIDATION_RULES.USERNAME.MAX_LENGTH, `Username cannot exceed ${VALIDATION_RULES.USERNAME.MAX_LENGTH} characters`],
        match: [VALIDATION_RULES.USERNAME.PATTERN, 'Username can only contain letters, numbers, and underscores'],
        lowercase: true
    },

    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
    },

    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [VALIDATION_RULES.PASSWORD.MIN_LENGTH, `Password must be at least ${VALIDATION_RULES.PASSWORD.MIN_LENGTH} characters long`],
        maxlength: [VALIDATION_RULES.PASSWORD.MAX_LENGTH, 'Password is too long'],
        select: false
    },

    avatar: {
        type: String,
        default: null,
        validate: {
            validator: function (v) {
                if (!v) return true;
                return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(v);
            },
            message: 'Avatar must be a valid image URL'
        }
    },

    bio: {
        type: String,
        maxlength: [VALIDATION_RULES.BIO.MAX_LENGTH, `Bio cannot exceed ${VALIDATION_RULES.BIO.MAX_LENGTH} characters`],
        default: '',
        trim: true
    },

    isOnline: {
        type: Boolean,
        default: false,
        index: true
    },

    lastSeen: {
        type: Date,
        default: Date.now,
        index: true
    },

    // Relationships
    joinedRooms: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room'
    }],

    blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],

    // User preferences
    preferences: {
        notifications: {
            email: {
                type: Boolean,
                default: true
            },
            push: {
                type: Boolean,
                default: true
            },
            sound: {
                type: Boolean,
                default: true
            }
        },
        theme: {
            type: String,
            enum: ['light', 'dark', 'auto'],
            default: 'auto'
        },
        language: {
            type: String,
            default: 'en',
            match: /^[a-z]{2}$/
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    loginCount: {
        type: Number,
        default: 0
    },
    lastLoginAt: {
        type: Date,
        default: null
    },
    lastLoginIP: {
        type: String,
        default: null
    }

}, {
    timestamps: true,
    toJSON: {
        transform: function (doc, ret) {
            // Remove sensitive fields when converting to JSON
            delete ret.password;
            delete ret.__v;
            return ret;
        }
    },
    toObject: {
        transform: function (doc, ret) {
            delete ret.password;
            delete ret.__v;
            return ret;
        }
    }
});


// Indexes for performance optimization
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ isOnline: 1 });
userSchema.index({ lastSeen: -1 });
userSchema.index({ createdAt: -1 });

// Compound indexes for common queries
userSchema.index({ isOnline: 1, lastSeen: -1 });
userSchema.index({ username: 1, isActive: 1 });

/**
 * Pre-save middleware
 * Hash password before saving to database
 */
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});


userSchema.pre('save', function (next) {
    if (this.isNew && !this.avatar) {
        // Generate a default avatar URL using a service like Gravatar or UI Avatars
        const encodedUsername = encodeURIComponent(this.username);
        this.avatar = `https://ui-avatars.com/api/?name=${encodedUsername}&background=random&color=fff&size=128`;
    }
    next();
});


userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('Password comparison failed');
    }
};


userSchema.methods.getPublicProfile = function () {
    return {
        id: this._id,
        username: this.username,
        avatar: this.avatar,
        bio: this.bio,
        isOnline: this.isOnline,
        lastSeen: this.lastSeen,
        createdAt: this.createdAt,
        isVerified: this.isVerified
    };
};


userSchema.methods.getPrivateProfile = function () {
    return {
        id: this._id,
        username: this.username,
        email: this.email,
        avatar: this.avatar,
        bio: this.bio,
        isOnline: this.isOnline,
        lastSeen: this.lastSeen,
        joinedRooms: this.joinedRooms,
        preferences: this.preferences,
        isActive: this.isActive,
        isVerified: this.isVerified,
        loginCount: this.loginCount,
        lastLoginAt: this.lastLoginAt,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};


userSchema.methods.hasBlocked = function (userId) {
    return this.blockedUsers.some(blockedId => blockedId.toString() === userId.toString());
};


userSchema.methods.blockUser = function (userId) {
    if (!this.hasBlocked(userId)) {
        this.blockedUsers.push(userId);
    }
    return this.save();
};

userSchema.methods.unblockUser = function (userId) {
    this.blockedUsers = this.blockedUsers.filter(
        blockedId => blockedId.toString() !== userId.toString()
    );
    return this.save();
};

userSchema.methods.updateLastSeen = function () {
    this.lastSeen = new Date();
    return this.save();
};


userSchema.methods.setOnlineStatus = async function (isOnline, ipAddress = null) {
    this.isOnline = isOnline;
    this.lastSeen = new Date();

    if (isOnline) {
        this.loginCount += 1;
        this.lastLoginAt = new Date();
        if (ipAddress) {
            this.lastLoginIP = ipAddress;
        }
    }

    return this.save();
};


userSchema.statics.findByUsernamePattern = function (pattern, limit = 10) {
    const regex = new RegExp(pattern, 'i');
    return this.find({
        username: regex,
        isActive: true
    })
        .select('username avatar isOnline lastSeen')
        .limit(limit)
        .sort({ username: 1 });
};


userSchema.statics.getOnlineUsersCount = function () {
    return this.countDocuments({ isOnline: true, isActive: true });
};


userSchema.statics.getRecentlyActiveUsers = function (hours = 24, limit = 20) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.find({
        lastSeen: { $gte: since },
        isActive: true
    })
        .select('username avatar isOnline lastSeen')
        .sort({ lastSeen: -1 })
        .limit(limit);
};

export const User = mongoose.model('User', userSchema);