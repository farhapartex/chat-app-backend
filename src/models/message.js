import mongoose from 'mongoose';
import { VALIDATION_RULES, MESSAGE_TYPES } from '../utils/constants.js';

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Message sender is required'],
        index: true
    },

    room: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: function () {
            return !this.isPrivate;
        },
        index: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: function () {
            return this.isPrivate;
        },
        index: true
    },
    content: {
        type: String,
        required: [true, 'Message content is required'],
        trim: true,
        maxlength: [VALIDATION_RULES.MESSAGE.MAX_LENGTH, `Message cannot exceed ${VALIDATION_RULES.MESSAGE.MAX_LENGTH} characters`]
    },

    type: {
        type: String,
        enum: {
            values: Object.values(MESSAGE_TYPES),
            message: 'Invalid message type'
        },
        default: MESSAGE_TYPES.TEXT,
        index: true
    },
    isPrivate: {
        type: Boolean,
        default: false,
        index: true
    },
    isEdited: {
        type: Boolean,
        default: false
    },

    editedAt: {
        type: Date,
        default: null
    },

    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    },

    deletedAt: {
        type: Date,
        default: null
    },

    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
        index: true
    },
    reactions: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        emoji: {
            type: String,
            required: true,
            maxlength: 10 // Support for Unicode emojis
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    readBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
    metadata: {
        fileUrl: {
            type: String,
            validate: {
                validator: function (v) {
                    if (!v) return true;
                    return /^https?:\/\/.+/.test(v);
                },
                message: 'File URL must be a valid HTTP/HTTPS URL'
            }
        },

        fileName: {
            type: String,
            maxlength: 255
        },

        fileSize: {
            type: Number,
            min: 0,
            max: 100 * 1024 * 1024 // 100MB max
        },

        mimeType: {
            type: String,
            maxlength: 100
        },
        imageWidth: {
            type: Number,
            min: 1
        },
        imageHeight: {
            type: Number,
            min: 1
        },
        systemType: {
            type: String,
            enum: ['user_joined', 'user_left', 'room_created', 'settings_changed', 'user_promoted', 'user_demoted']
        },
        extra: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal'
    },
    mentions: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        startIndex: Number,
        length: Number
    }],
    flags: {
        isSpam: {
            type: Boolean,
            default: false
        },

        isPinned: {
            type: Boolean,
            default: false
        },

        isAnnouncement: {
            type: Boolean,
            default: false
        },

        containsProfanity: {
            type: Boolean,
            default: false
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


messageSchema.index({ sender: 1 });
messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, createdAt: -1 });
messageSchema.index({ isPrivate: 1 });
messageSchema.index({ isDeleted: 1 });
messageSchema.index({ createdAt: -1 });
messageSchema.index({ type: 1 });
messageSchema.index({ replyTo: 1 });


messageSchema.index({ room: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ sender: 1, recipient: 1, isPrivate: 1, createdAt: -1 });
messageSchema.index({ sender: 1, isDeleted: 1, createdAt: -1 });

messageSchema.index({ content: 'text' });


messageSchema.pre('save', function (next) {
    if (this.isPrivate && this.room) {
        this.room = undefined;
    }

    if (!this.isPrivate && this.recipient) {
        this.recipient = undefined;
    }

    // Set system message type if it's a system message
    if (this.type === MESSAGE_TYPES.SYSTEM && !this.metadata.systemType) {
        this.metadata.systemType = 'general';
    }

    next();
});


messageSchema.methods.markAsRead = function (userId) {
    // Check if user already marked this as read
    const existingRead = this.readBy.find(read =>
        read.user.toString() === userId.toString()
    );

    if (!existingRead) {
        this.readBy.push({ user: userId, readAt: new Date() });
    }

    return this.save();
};


messageSchema.methods.isReadBy = function (userId) {
    return this.readBy.some(read =>
        read.user.toString() === userId.toString()
    );
};


messageSchema.methods.addReaction = function (userId, emoji) {
    // Check if user already reacted with this emoji
    const existingReaction = this.reactions.find(
        reaction => reaction.user.toString() === userId.toString() &&
            reaction.emoji === emoji
    );

    if (!existingReaction) {
        this.reactions.push({
            user: userId,
            emoji,
            createdAt: new Date()
        });
    }

    return this.save();
};


messageSchema.methods.removeReaction = function (userId, emoji) {
    this.reactions = this.reactions.filter(
        reaction => !(reaction.user.toString() === userId.toString() &&
            reaction.emoji === emoji)
    );

    return this.save();
};


messageSchema.methods.toggleReaction = async function (userId, emoji) {
    const existingReaction = this.reactions.find(
        reaction => reaction.user.toString() === userId.toString() &&
            reaction.emoji === emoji
    );

    if (existingReaction) {
        await this.removeReaction(userId, emoji);
        return { added: false, message: this };
    } else {
        await this.addReaction(userId, emoji);
        return { added: true, message: this };
    }
};


messageSchema.methods.softDelete = function (deletedBy = null) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = deletedBy;
    this.content = 'This message has been deleted';

    if (this.metadata) {
        this.metadata.fileUrl = null;
        this.metadata.fileName = null;
    }

    return this.save();
};


messageSchema.methods.editContent = function (newContent) {
    if (this.isDeleted) {
        throw new Error('Cannot edit deleted message');
    }

    this.content = newContent.trim();
    this.isEdited = true;
    this.editedAt = new Date();

    return this.save();
};


messageSchema.methods.setPinned = function (pinned = true) {
    this.flags.isPinned = pinned;
    return this.save();
};


messageSchema.methods.canUserEdit = function (userId) {
    if (this.sender.toString() !== userId.toString()) {
        return false;
    }

    if (this.isDeleted) {
        return false;
    }

    if (this.type === MESSAGE_TYPES.SYSTEM) {
        return false;
    }

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (this.createdAt < fifteenMinutesAgo) {
        return false;
    }

    return true;
};


messageSchema.methods.canUserDelete = function (userId, isAdmin = false) {
    if (this.isDeleted) {
        return false;
    }

    if (this.sender.toString() === userId.toString()) {
        return true;
    }

    // Admins can delete any message
    if (isAdmin) {
        return true;
    }

    return false;
};


messageSchema.methods.getReactionSummary = function () {
    const summary = {};

    this.reactions.forEach(reaction => {
        summary[reaction.emoji] = (summary[reaction.emoji] || 0) + 1;
    });

    return summary;
};


messageSchema.statics.findWithPagination = async function (query, page = 1, limit = 50, sort = { createdAt: -1 }) {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
        this.find(query)
            .populate('sender', 'username avatar')
            .populate('replyTo', 'content sender type')
            .populate({
                path: 'replyTo',
                populate: {
                    path: 'sender',
                    select: 'username avatar'
                }
            })
            .sort(sort)
            .skip(skip)
            .limit(limit),

        this.countDocuments(query)
    ]);

    return {
        messages,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalMessages: total,
            hasNext: page < Math.ceil(total / limit),
            hasPrev: page > 1,
            limit
        }
    };
};


messageSchema.statics.searchMessages = function (searchTerm, filters = {}, limit = 50) {
    const query = {
        $text: { $search: searchTerm },
        isDeleted: false,
        ...filters
    };

    return this.find(query, { score: { $meta: 'textScore' } })
        .populate('sender', 'username avatar')
        .populate('room', 'name')
        .populate('recipient', 'username avatar')
        .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
        .limit(limit);
};


messageSchema.statics.getRecentRoomMessages = function (roomId, limit = 50) {
    return this.find({
        room: roomId,
        isDeleted: false
    })
        .populate('sender', 'username avatar')
        .populate('replyTo', 'content sender')
        .sort({ createdAt: -1 })
        .limit(limit);
};


messageSchema.statics.getPrivateConversation = function (userId1, userId2, limit = 50) {
    return this.find({
        $and: [
            { isPrivate: true },
            { isDeleted: false },
            {
                $or: [
                    { sender: userId1, recipient: userId2 },
                    { sender: userId2, recipient: userId1 }
                ]
            }
        ]
    })
        .populate('sender', 'username avatar')
        .populate('replyTo', 'content sender')
        .sort({ createdAt: -1 })
        .limit(limit);
};


messageSchema.statics.getUnreadCount = function (userId) {
    return this.countDocuments({
        $and: [
            { recipient: userId },
            { isPrivate: true },
            { isDeleted: false },
            { 'readBy.user': { $ne: userId } }
        ]
    });
};

export const Message = mongoose.model('Message', messageSchema);