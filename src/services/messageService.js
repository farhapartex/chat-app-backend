import { Message } from '../models/message.js';
import { Room } from '../models/room.js';
import { User } from '../models/user.js';
import {
    MESSAGE_TYPES,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    VALIDATION_RULES,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
} from '../utils/constants.js';
import { AppError } from '../middleware/errorHandler.js';

class MessageService {

    validateMessageInput({ content, type = MESSAGE_TYPES.TEXT, replyTo = null }) {
        const errors = {};

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            errors.content = 'Message content is required';
        } else if (content.length > VALIDATION_RULES.MESSAGE.MAX_LENGTH) {
            errors.content = `Message cannot exceed ${VALIDATION_RULES.MESSAGE.MAX_LENGTH} characters`;
        }

        if (!Object.values(MESSAGE_TYPES).includes(type)) {
            errors.type = 'Invalid message type';
        }

        if (replyTo && typeof replyTo !== 'string') {
            errors.replyTo = 'Invalid reply reference';
        }

        if (Object.keys(errors).length > 0) {
            const error = new AppError(ERROR_MESSAGES.VALIDATION_ERROR, 422);
            error.details = errors;
            throw error;
        }
    }

    async createMessage({
        sender,
        room = null,
        recipient = null,
        content,
        type = MESSAGE_TYPES.TEXT,
        isPrivate = false,
        replyTo = null,
        metadata = {},
        mentions = [],
        priority = 'normal'
    }) {
        try {
            this.validateMessageInput({ content, type, replyTo });
            const senderUser = await User.findById(sender);
            if (!senderUser) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            const messageData = {
                sender,
                content: content.trim(),
                type,
                isPrivate,
                metadata,
                mentions,
                priority
            };

            if (!isPrivate) {
                if (!room) {
                    throw new AppError('Room ID is required for room messages', 400);
                }

                const roomDoc = await Room.findById(room);
                if (!roomDoc) {
                    throw new AppError(ERROR_MESSAGES.ROOM_NOT_FOUND, 404);
                }

                if (!roomDoc.isActive) {
                    throw new AppError('Cannot send messages to inactive room', 400);
                }

                if (!roomDoc.isMember(sender)) {
                    throw new AppError(ERROR_MESSAGES.ROOM_ACCESS_DENIED, 403);
                }

                // Check if room is muted
                if (roomDoc.settings.muteAll && !roomDoc.isAdmin(sender)) {
                    throw new AppError('Room is currently muted', 403);
                }

                messageData.room = room;
                await roomDoc.incrementMessageCount();
            }
            else {
                if (!recipient) {
                    throw new AppError('Recipient ID is required for private messages', 400);
                }

                if (sender.toString() === recipient.toString()) {
                    throw new AppError('Cannot send private message to yourself', 400);
                }

                const recipientUser = await User.findById(recipient);
                if (!recipientUser) {
                    throw new AppError('Recipient not found', 404);
                }

                if (recipientUser.hasBlocked(sender)) {
                    throw new AppError('Cannot send message to this user', 403);
                }

                if (senderUser.hasBlocked(recipient)) {
                    throw new AppError('Cannot send message to blocked user', 403);
                }

                messageData.recipient = recipient;
            }

            if (replyTo) {
                const parentMessage = await Message.findById(replyTo);
                if (!parentMessage) {
                    throw new AppError('Parent message not found', 404);
                }

                if (parentMessage.isDeleted) {
                    throw new AppError('Cannot reply to deleted message', 400);
                }

                if (!isPrivate && parentMessage.room?.toString() !== room.toString()) {
                    throw new AppError('Can only reply to messages in the same room', 400);
                }

                if (isPrivate) {
                    const isValidPrivateReply =
                        (parentMessage.sender.toString() === sender.toString() && parentMessage.recipient?.toString() === recipient.toString()) ||
                        (parentMessage.recipient?.toString() === sender.toString() && parentMessage.sender.toString() === recipient.toString());

                    if (!isValidPrivateReply) {
                        throw new AppError('Can only reply to messages in the same conversation', 400);
                    }
                }

                messageData.replyTo = replyTo;
            }

            const message = new Message(messageData);
            await message.save();

            await message.populate([
                { path: 'sender', select: 'username avatar' },
                { path: 'replyTo', select: 'content sender type', populate: { path: 'sender', select: 'username avatar' } }
            ]);

            return {
                success: true,
                message: SUCCESS_MESSAGES.MESSAGE_SENT,
                data: message
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to create message', 500);
        }
    }


    async getRoomMessages(roomId, userId, {
        page = 1,
        limit = DEFAULT_PAGE_SIZE,
        before = null,
        after = null
    } = {}) {
        try {
            // Verify user is member of the room
            const room = await Room.findById(roomId);
            if (!room) {
                throw new AppError(ERROR_MESSAGES.ROOM_NOT_FOUND, 404);
            }

            if (!room.isMember(userId)) {
                throw new AppError(ERROR_MESSAGES.ROOM_ACCESS_DENIED, 403);
            }

            const query = {
                room: roomId,
                isDeleted: false
            };

            if (before) {
                query.createdAt = { $lt: new Date(before) };
            }
            if (after) {
                query.createdAt = { $gt: new Date(after) };
            }

            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit)));
            const skip = (pageNum - 1) * limitNum;
            const result = await Message.findWithPagination(
                query,
                pageNum,
                limitNum,
                { createdAt: before ? -1 : 1 }
            );

            if (before && result.messages.length > 0) {
                result.messages.reverse();
            }

            return {
                success: true,
                ...result
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to get room messages', 500);
        }
    }


    async getPrivateMessages(userId1, userId2, {
        page = 1,
        limit = DEFAULT_PAGE_SIZE,
        before = null,
        after = null
    } = {}) {
        try {
            const [user1, user2] = await Promise.all([
                User.findById(userId1),
                User.findById(userId2)
            ]);

            if (!user1 || !user2) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            if (user1.hasBlocked(userId2) || user2.hasBlocked(userId1)) {
                return {
                    success: true,
                    messages: [],
                    pagination: {
                        currentPage: 1,
                        totalPages: 0,
                        totalMessages: 0,
                        hasNext: false,
                        hasPrev: false,
                        limit
                    }
                };
            }

            const query = {
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
            };

            if (before) {
                query.$and.push({ createdAt: { $lt: new Date(before) } });
            }
            if (after) {
                query.$and.push({ createdAt: { $gt: new Date(after) } });
            }

            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit)));

            const result = await Message.findWithPagination(
                query,
                pageNum,
                limitNum,
                { createdAt: before ? -1 : 1 }
            );

            if (before && result.messages.length > 0) {
                result.messages.reverse();
            }

            return {
                success: true,
                ...result
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to get private messages', 500);
        }
    }


    async getRecentConversations(userId, limit = 20) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            const conversations = await Message.aggregate([
                {
                    $match: {
                        $and: [
                            { isPrivate: true },
                            { isDeleted: false },
                            {
                                $or: [
                                    { sender: userId },
                                    { recipient: userId }
                                ]
                            }
                        ]
                    }
                },
                {
                    $addFields: {
                        otherUser: {
                            $cond: {
                                if: { $eq: ["$sender", userId] },
                                then: "$recipient",
                                else: "$sender"
                            }
                        }
                    }
                },
                {
                    $sort: { createdAt: -1 }
                },
                {
                    $group: {
                        _id: "$otherUser",
                        lastMessage: { $first: "$$ROOT" },
                        unreadCount: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ["$sender", userId] },
                                            { $not: { $in: [userId, "$readBy.user"] } }
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "_id",
                        foreignField: "_id",
                        as: "user"
                    }
                },
                {
                    $unwind: "$user"
                },
                {
                    $match: {
                        "user.isActive": true
                    }
                },
                {
                    $project: {
                        user: {
                            _id: "$user._id",
                            username: "$user.username",
                            avatar: "$user.avatar",
                            isOnline: "$user.isOnline",
                            lastSeen: "$user.lastSeen"
                        },
                        lastMessage: {
                            _id: "$lastMessage._id",
                            content: "$lastMessage.content",
                            type: "$lastMessage.type",
                            createdAt: "$lastMessage.createdAt",
                            sender: "$lastMessage.sender",
                            isEdited: "$lastMessage.isEdited"
                        },
                        unreadCount: 1
                    }
                },
                {
                    $sort: { "lastMessage.createdAt": -1 }
                },
                {
                    $limit: limit
                }
            ]);

            return {
                success: true,
                conversations
            };

        } catch (error) {
            throw new AppError('Failed to get recent conversations', 500);
        }
    }

    async searchMessages({
        query,
        roomId = null,
        userId,
        isPrivate = false,
        page = 1,
        limit = DEFAULT_PAGE_SIZE,
        dateFrom = null,
        dateTo = null,
        messageType = null
    }) {
        try {
            if (!query || query.trim().length === 0) {
                return {
                    success: true,
                    messages: [],
                    pagination: {
                        currentPage: 1,
                        totalPages: 0,
                        totalMessages: 0,
                        hasNext: false,
                        hasPrev: false,
                        limit
                    }
                };
            }

            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit)));

            const searchRegex = new RegExp(query.trim(), 'i');

            let searchConditions = {
                content: searchRegex,
                isDeleted: false
            };

            if (dateFrom || dateTo) {
                searchConditions.createdAt = {};
                if (dateFrom) searchConditions.createdAt.$gte = new Date(dateFrom);
                if (dateTo) searchConditions.createdAt.$lte = new Date(dateTo);
            }

            if (messageType && Object.values(MESSAGE_TYPES).includes(messageType)) {
                searchConditions.type = messageType;
            }

            if (isPrivate) {
                searchConditions.isPrivate = true;
                searchConditions.$or = [
                    { sender: userId },
                    { recipient: userId }
                ];
            }
            else if (roomId) {
                const room = await Room.findById(roomId);
                if (!room || !room.isMember(userId)) {
                    throw new AppError(ERROR_MESSAGES.ROOM_ACCESS_DENIED, 403);
                }

                searchConditions.room = roomId;
                searchConditions.isPrivate = false;
            }
            else {
                const userRooms = await Room.find({ members: userId, isActive: true }, '_id');
                const roomIds = userRooms.map(room => room._id);

                searchConditions.$or = [
                    { room: { $in: roomIds }, isPrivate: false },
                    {
                        isPrivate: true,
                        $or: [
                            { sender: userId },
                            { recipient: userId }
                        ]
                    }
                ];
            }

            const result = await Message.findWithPagination(
                searchConditions,
                pageNum,
                limitNum,
                { createdAt: -1 }
            );

            for (let message of result.messages) {
                await message.populate([
                    { path: 'room', select: 'name type' },
                    { path: 'recipient', select: 'username avatar' }
                ]);
            }

            return {
                success: true,
                ...result
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Message search failed', 500);
        }
    }

    async markAsRead(messageIds, userId) {
        try {
            if (!Array.isArray(messageIds) || messageIds.length === 0) {
                throw new AppError('Message IDs are required', 400);
            }

            const result = await Message.updateMany(
                {
                    _id: { $in: messageIds },
                    'readBy.user': { $ne: userId },
                    $or: [
                        { recipient: userId },
                        { room: { $exists: true } }
                    ]
                },
                {
                    $push: {
                        readBy: {
                            user: userId,
                            readAt: new Date()
                        }
                    }
                }
            );

            return {
                success: true,
                message: SUCCESS_MESSAGES.MESSAGES_MARKED_READ,
                modifiedCount: result.modifiedCount
            };

        } catch (error) {
            throw new AppError('Failed to mark messages as read', 500);
        }
    }

    async editMessage(messageId, newContent, userId) {
        try {
            if (!newContent || newContent.trim().length === 0) {
                throw new AppError(ERROR_MESSAGES.MESSAGE_EMPTY, 400);
            }

            if (newContent.length > VALIDATION_RULES.MESSAGE.MAX_LENGTH) {
                throw new AppError(ERROR_MESSAGES.MESSAGE_TOO_LONG, 400);
            }

            const message = await Message.findById(messageId)
                .populate('sender', 'username avatar');

            if (!message) {
                throw new AppError(ERROR_MESSAGES.MESSAGE_NOT_FOUND, 404);
            }

            if (!message.canUserEdit(userId)) {
                if (message.sender._id.toString() !== userId.toString()) {
                    throw new AppError(ERROR_MESSAGES.MESSAGE_EDIT_DENIED, 403);
                }
                if (message.isDeleted) {
                    throw new AppError('Cannot edit deleted message', 400);
                }
                if (message.type === MESSAGE_TYPES.SYSTEM) {
                    throw new AppError('Cannot edit system messages', 400);
                }
                throw new AppError(ERROR_MESSAGES.MESSAGE_TOO_OLD, 400);
            }

            await message.editContent(newContent.trim());

            return {
                success: true,
                message: SUCCESS_MESSAGES.MESSAGE_EDITED,
                data: message
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to edit message', 500);
        }
    }


    async deleteMessage(messageId, userId, isAdmin = false) {
        try {
            const message = await Message.findById(messageId);

            if (!message) {
                throw new AppError(ERROR_MESSAGES.MESSAGE_NOT_FOUND, 404);
            }

            if (!message.canUserDelete(userId, isAdmin)) {
                throw new AppError(ERROR_MESSAGES.MESSAGE_DELETE_DENIED, 403);
            }

            await message.softDelete(userId);

            return {
                success: true,
                message: SUCCESS_MESSAGES.MESSAGE_DELETED
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to delete message', 500);
        }
    }


    async addReaction(messageId, emoji, userId) {
        try {
            if (!emoji || emoji.trim().length === 0) {
                throw new AppError('Emoji is required', 400);
            }

            const message = await Message.findById(messageId)
                .populate('sender', 'username avatar');

            if (!message) {
                throw new AppError(ERROR_MESSAGES.MESSAGE_NOT_FOUND, 404);
            }

            if (message.isDeleted) {
                throw new AppError('Cannot react to deleted message', 400);
            }

            if (message.isPrivate) {
                if (message.sender._id.toString() !== userId.toString() &&
                    message.recipient?.toString() !== userId.toString()) {
                    throw new AppError('Cannot react to this message', 403);
                }
            } else if (message.room) {
                const room = await Room.findById(message.room);
                if (!room || !room.isMember(userId)) {
                    throw new AppError(ERROR_MESSAGES.ROOM_ACCESS_DENIED, 403);
                }
            }

            await message.addReaction(userId, emoji.trim());

            return {
                success: true,
                message: 'Reaction added successfully',
                reactions: message.getReactionSummary()
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to add reaction', 500);
        }
    }


    async removeReaction(messageId, emoji, userId) {
        try {
            const message = await Message.findById(messageId);

            if (!message) {
                throw new AppError(ERROR_MESSAGES.MESSAGE_NOT_FOUND, 404);
            }

            await message.removeReaction(userId, emoji);

            return {
                success: true,
                message: 'Reaction removed successfully',
                reactions: message.getReactionSummary()
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to remove reaction', 500);
        }
    }


    async toggleReaction(messageId, emoji, userId) {
        try {
            const message = await Message.findById(messageId)
                .populate('sender', 'username avatar');

            if (!message) {
                throw new AppError(ERROR_MESSAGES.MESSAGE_NOT_FOUND, 404);
            }

            if (message.isDeleted) {
                throw new AppError('Cannot react to deleted message', 400);
            }

            if (message.isPrivate) {
                if (message.sender._id.toString() !== userId.toString() &&
                    message.recipient?.toString() !== userId.toString()) {
                    throw new AppError('Cannot react to this message', 403);
                }
            } else if (message.room) {
                const room = await Room.findById(message.room);
                if (!room || !room.isMember(userId)) {
                    throw new AppError(ERROR_MESSAGES.ROOM_ACCESS_DENIED, 403);
                }
            }

            const result = await message.toggleReaction(userId, emoji.trim());

            return {
                success: true,
                message: result.added ? 'Reaction added successfully' : 'Reaction removed successfully',
                added: result.added,
                reactions: message.getReactionSummary()
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to toggle reaction', 500);
        }
    }


    async togglePin(messageId, userId, pinned = true) {
        try {
            const message = await Message.findById(messageId);

            if (!message) {
                throw new AppError(ERROR_MESSAGES.MESSAGE_NOT_FOUND, 404);
            }

            if (message.isDeleted) {
                throw new AppError('Cannot pin deleted message', 400);
            }

            if (message.room) {
                const room = await Room.findById(message.room);
                if (!room || !room.isAdmin(userId)) {
                    throw new AppError('Only room admins can pin messages', 403);
                }
            } else if (message.isPrivate) {
                if (message.sender.toString() !== userId.toString()) {
                    throw new AppError('Only message sender can pin private messages', 403);
                }
            }

            await message.setPinned(pinned);

            return {
                success: true,
                message: pinned ? 'Message pinned successfully' : 'Message unpinned successfully',
                pinned
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Failed to ${pinned ? 'pin' : 'unpin'} message`, 500);
        }
    }


    async getUserMessageStats(userId) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            const [
                totalSent,
                totalReceived,
                totalRooms,
                totalPrivate,
                todayMessages,
                weekMessages
            ] = await Promise.all([
                Message.countDocuments({ sender: userId, isDeleted: false }),
                Message.countDocuments({ recipient: userId, isDeleted: false }),
                Message.countDocuments({ sender: userId, isPrivate: false, isDeleted: false }),
                Message.countDocuments({ sender: userId, isPrivate: true, isDeleted: false }),
                Message.countDocuments({
                    sender: userId,
                    isDeleted: false,
                    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                }),
                Message.countDocuments({
                    sender: userId,
                    isDeleted: false,
                    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                })
            ]);

            return {
                success: true,
                stats: {
                    totalMessagesSent: totalSent,
                    totalMessagesReceived: totalReceived,
                    roomMessages: totalRooms,
                    privateMessages: totalPrivate,
                    messagesToday: todayMessages,
                    messagesThisWeek: weekMessages
                }
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to get message statistics', 500);
        }
    }


    async getUnreadCounts(userId) {
        try {
            const unreadPrivate = await Message.countDocuments({
                recipient: userId,
                isPrivate: true,
                isDeleted: false,
                'readBy.user': { $ne: userId }
            });

            const userRooms = await Room.find({ members: userId, isActive: true });
            let unreadRooms = 0;

            for (const room of userRooms) {
                const unreadInRoom = await Message.countDocuments({
                    room: room._id,
                    sender: { $ne: userId },
                    isDeleted: false,
                    'readBy.user': { $ne: userId }
                });
                unreadRooms += unreadInRoom;
            }

            return {
                success: true,
                unreadCounts: {
                    private: unreadPrivate,
                    rooms: unreadRooms,
                    total: unreadPrivate + unreadRooms
                }
            };

        } catch (error) {
            throw new AppError('Failed to get unread counts', 500);
        }
    }
}


export const messageService = new MessageService();