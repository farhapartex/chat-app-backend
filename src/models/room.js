import mongoose from 'mongoose';
import { VALIDATION_RULES, ROOM_TYPES } from '../utils/constants.js';

const roomSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Room name is required'],
        trim: true,
        minlength: [VALIDATION_RULES.ROOM_NAME.MIN_LENGTH, `Room name must be at least ${VALIDATION_RULES.ROOM_NAME.MIN_LENGTH} character long`],
        maxlength: [VALIDATION_RULES.ROOM_NAME.MAX_LENGTH, `Room name cannot exceed ${VALIDATION_RULES.ROOM_NAME.MAX_LENGTH} characters`],
        index: true
    },

    description: {
        type: String,
        maxlength: [VALIDATION_RULES.ROOM_DESCRIPTION.MAX_LENGTH, `Room description cannot exceed ${VALIDATION_RULES.ROOM_DESCRIPTION.MAX_LENGTH} characters`],
        default: '',
        trim: true
    },

    type: {
        type: String,
        enum: {
            values: Object.values(ROOM_TYPES),
            message: 'Room type must be either public or private'
        },
        default: ROOM_TYPES.PUBLIC,
        index: true
    },
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Room creator is required'],
        index: true
    },

    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }],

    admins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    maxMembers: {
        type: Number,
        default: 100,
        min: [2, 'Room must allow at least 2 members'],
        max: [1000, 'Room cannot exceed 1000 members'],
        validate: {
            validator: function (value) {
                return !this.members || this.members.length <= value;
            },
            message: 'Cannot set max members below current member count'
        }
    },

    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    settings: {
        allowFileSharing: {
            type: Boolean,
            default: true
        },

        allowImageSharing: {
            type: Boolean,
            default: true
        },

        maxMessageLength: {
            type: Number,
            default: VALIDATION_RULES.MESSAGE.MAX_LENGTH,
            min: 1,
            max: 10000
        },
        requireApprovalToJoin: {
            type: Boolean,
            default: false
        },

        muteAll: {
            type: Boolean,
            default: false
        },

        slowMode: {
            enabled: {
                type: Boolean,
                default: false
            },
            interval: {
                type: Number,
                default: 5,
                min: 1,
                max: 300
            }
        },
        profanityFilter: {
            type: Boolean,
            default: false
        },
        autoDeleteMessages: {
            enabled: {
                type: Boolean,
                default: false
            },
            afterDays: {
                type: Number,
                default: 30,
                min: 1,
                max: 365
            }
        }
    },
    tags: [{
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 20
    }],

    category: {
        type: String,
        enum: ['general', 'technology', 'gaming', 'music', 'sports', 'education', 'business', 'other'],
        default: 'general'
    },
    lastActivity: {
        type: Date,
        default: Date.now,
        index: true
    },

    messageCount: {
        type: Number,
        default: 0,
        min: 0
    },
    stats: {
        totalMessages: {
            type: Number,
            default: 0
        },

        peakConcurrentUsers: {
            type: Number,
            default: 0
        },

        totalJoins: {
            type: Number,
            default: 0
        }
    },

    // Room avatar/image
    avatar: {
        type: String,
        default: null,
        validate: {
            validator: function (v) {
                if (!v) return true;
                return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(v);
            },
            message: 'Room avatar must be a valid image URL'
        }
    }

}, {
    timestamps: true,
    toJSON: {
        transform: function (doc, ret) {
            delete ret.__v;
            return ret;
        }
    }
});


roomSchema.index({ name: 1 });
roomSchema.index({ type: 1 });
roomSchema.index({ creator: 1 });
roomSchema.index({ members: 1 });
roomSchema.index({ isActive: 1 });
roomSchema.index({ lastActivity: -1 });
roomSchema.index({ category: 1 });
roomSchema.index({ tags: 1 });
roomSchema.index({ type: 1, isActive: 1, lastActivity: -1 });
roomSchema.index({ category: 1, isActive: 1 });
roomSchema.index({ name: 'text', description: 'text' }); // Text search index


roomSchema.pre('save', function (next) {
    if (this.isNew && !this.members.includes(this.creator)) {
        this.members.push(this.creator);
    }

    if (this.isNew && !this.admins.includes(this.creator)) {
        this.admins.push(this.creator);
    }

    if (this.isNew && !this.avatar) {
        const encodedName = encodeURIComponent(this.name);
        this.avatar = `https://ui-avatars.com/api/?name=${encodedName}&background=random&color=fff&size=128&format=png`;
    }

    next();
});


roomSchema.methods.updateLastActivity = function () {
    this.lastActivity = new Date();
    return this.save();
};

roomSchema.methods.isMember = function (userId) {
    return this.members.some(memberId => memberId.toString() === userId.toString());
};


roomSchema.methods.isAdmin = function (userId) {
    return this.admins.some(adminId => adminId.toString() === userId.toString()) ||
        this.creator.toString() === userId.toString();
};


roomSchema.methods.isCreator = function (userId) {
    return this.creator.toString() === userId.toString();
};


roomSchema.methods.addMember = async function (userId) {
    if (!this.isMember(userId)) {
        if (this.members.length >= this.maxMembers) {
            throw new Error('Room has reached maximum capacity');
        }

        this.members.push(userId);
        this.stats.totalJoins += 1;

        if (this.members.length > this.stats.peakConcurrentUsers) {
            this.stats.peakConcurrentUsers = this.members.length;
        }
    }

    return this.save();
};


roomSchema.methods.removeMember = function (userId) {
    this.members = this.members.filter(
        memberId => memberId.toString() !== userId.toString()
    );

    this.admins = this.admins.filter(
        adminId => adminId.toString() !== userId.toString()
    );

    return this.save();
};


roomSchema.methods.addAdmin = function (userId) {
    if (!this.isMember(userId)) {
        throw new Error('User must be a member to become an admin');
    }

    if (!this.isAdmin(userId)) {
        this.admins.push(userId);
    }

    return this.save();
};

roomSchema.methods.removeAdmin = function (userId) {
    if (this.isCreator(userId)) {
        throw new Error('Cannot remove creator from admins');
    }

    this.admins = this.admins.filter(
        adminId => adminId.toString() !== userId.toString()
    );

    return this.save();
};


roomSchema.methods.updateSettings = function (newSettings) {
    // Merge new settings with existing settings
    this.settings = { ...this.settings.toObject(), ...newSettings };
    return this.save();
};


roomSchema.methods.incrementMessageCount = function () {
    this.messageCount += 1;
    this.stats.totalMessages += 1;
    this.lastActivity = new Date();
    return this.save();
};


roomSchema.methods.getStats = function () {
    return {
        memberCount: this.members.length,
        adminCount: this.admins.length,
        messageCount: this.messageCount,
        isActive: this.isActive,
        lastActivity: this.lastActivity,
        createdAt: this.createdAt,
        ...this.stats
    };
};


roomSchema.methods.getPublicInfo = function () {
    return {
        id: this._id,
        name: this.name,
        description: this.description,
        type: this.type,
        category: this.category,
        tags: this.tags,
        avatar: this.avatar,
        memberCount: this.members.length,
        maxMembers: this.maxMembers,
        isActive: this.isActive,
        lastActivity: this.lastActivity,
        createdAt: this.createdAt,
        creator: this.creator
    };
};


roomSchema.methods.canUserJoin = function (userId) {
    if (!this.isActive) {
        return { canJoin: false, reason: 'Room is not active' };
    }

    if (this.isMember(userId)) {
        return { canJoin: false, reason: 'User is already a member' };
    }

    if (this.members.length >= this.maxMembers) {
        return { canJoin: false, reason: 'Room is full' };
    }

    if (this.settings.requireApprovalToJoin && this.type === ROOM_TYPES.PRIVATE) {
        return { canJoin: false, reason: 'Room requires approval to join' };
    }

    return { canJoin: true };
};


roomSchema.statics.findPublicRooms = function (page = 1, limit = 20, filters = {}) {
    const query = {
        type: ROOM_TYPES.PUBLIC,
        isActive: true,
        ...filters
    };

    const skip = (page - 1) * limit;

    return this.find(query)
        .populate('creator', 'username avatar')
        .select('-members -admins') // Don't return full member lists for public queries
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(limit);
};


roomSchema.statics.searchRooms = function (searchTerm, limit = 20) {
    return this.find({
        $and: [
            { type: ROOM_TYPES.PUBLIC },
            { isActive: true },
            {
                $or: [
                    { name: { $regex: searchTerm, $options: 'i' } },
                    { description: { $regex: searchTerm, $options: 'i' } },
                    { tags: { $in: [new RegExp(searchTerm, 'i')] } }
                ]
            }
        ]
    })
        .populate('creator', 'username avatar')
        .select('-members -admins')
        .sort({ lastActivity: -1 })
        .limit(limit);
};


roomSchema.statics.findByCategory = function (category, limit = 20) {
    return this.find({
        category: category,
        type: ROOM_TYPES.PUBLIC,
        isActive: true
    })
        .populate('creator', 'username avatar')
        .select('-members -admins')
        .sort({ lastActivity: -1 })
        .limit(limit);
};


roomSchema.statics.getTrendingRooms = function (hours = 24, limit = 10) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.find({
        type: ROOM_TYPES.PUBLIC,
        isActive: true,
        lastActivity: { $gte: since }
    })
        .populate('creator', 'username avatar')
        .select('-members -admins')
        .sort({ messageCount: -1, lastActivity: -1 })
        .limit(limit);
};


roomSchema.statics.findUserRooms = function (userId) {
    return this.find({
        members: userId,
        isActive: true
    })
        .populate('creator', 'username avatar')
        .populate('members', 'username avatar isOnline')
        .sort({ lastActivity: -1 });
};


roomSchema.statics.findAdminRooms = function (userId) {
    return this.find({
        $or: [
            { creator: userId },
            { admins: userId }
        ],
        isActive: true
    })
        .populate('creator', 'username avatar')
        .sort({ lastActivity: -1 });
};

export const Room = mongoose.model('Room', roomSchema);