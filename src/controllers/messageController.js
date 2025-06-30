import { messageService } from '../services/messageService.js';
import { HTTP_STATUS } from '../utils/constants.js';
import { asyncHandler } from '../middleware/errorHandler.js';


export const getRoomMessages = asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const { page, limit, before, after } = req.query;

    const result = await messageService.getRoomMessages(roomId, req.userId, {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        before,
        after
    });

    res.status(HTTP_STATUS.OK).json(result);
});


export const getPrivateMessages = asyncHandler(async (req, res) => {
    const { userId: otherUserId } = req.params;
    const { page, limit, before, after } = req.query;

    const result = await messageService.getPrivateMessages(req.userId, otherUserId, {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        before,
        after
    });

    res.status(HTTP_STATUS.OK).json(result);
});


export const sendRoomMessage = asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const { content, type, replyTo, metadata, mentions, priority } = req.body;

    const result = await messageService.createMessage({
        sender: req.userId,
        room: roomId,
        content,
        type,
        isPrivate: false,
        replyTo,
        metadata,
        mentions,
        priority
    });

    res.status(HTTP_STATUS.CREATED).json(result);
});


export const sendPrivateMessage = asyncHandler(async (req, res) => {
    const { userId: recipientId } = req.params;
    const { content, type, replyTo, metadata, priority } = req.body;

    const result = await messageService.createMessage({
        sender: req.userId,
        recipient: recipientId,
        content,
        type,
        isPrivate: true,
        replyTo,
        metadata,
        priority
    });

    res.status(HTTP_STATUS.CREATED).json(result);
});


export const getRecentConversations = asyncHandler(async (req, res) => {
    const { limit = 20 } = req.query;

    const result = await messageService.getRecentConversations(
        req.userId,
        parseInt(limit)
    );

    res.status(HTTP_STATUS.OK).json(result);
});


export const searchMessages = asyncHandler(async (req, res) => {
    const {
        query,
        roomId,
        isPrivate = false,
        page = 1,
        limit = 20,
        dateFrom,
        dateTo,
        messageType
    } = req.body;

    if (!query || query.trim().length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Search query is required'
        });
    }

    const result = await messageService.searchMessages({
        query,
        roomId,
        userId: req.userId,
        isPrivate,
        page: parseInt(page),
        limit: parseInt(limit),
        dateFrom,
        dateTo,
        messageType
    });

    res.status(HTTP_STATUS.OK).json(result);
});


export const markAsRead = asyncHandler(async (req, res) => {
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Message IDs array is required'
        });
    }

    const result = await messageService.markAsRead(messageIds, req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const editMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Message content is required'
        });
    }

    const result = await messageService.editMessage(messageId, content, req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const deleteMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { Message, Room } = await import('../models/Message.js');
    const message = await Message.findById(messageId);

    let isAdmin = false;
    if (message && message.room) {
        const room = await Room.findById(message.room);
        isAdmin = room ? room.isAdmin(req.userId) : false;
    }

    const result = await messageService.deleteMessage(messageId, req.userId, isAdmin);

    res.status(HTTP_STATUS.OK).json(result);
});


export const addReaction = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji || emoji.trim().length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Emoji is required'
        });
    }

    const result = await messageService.addReaction(messageId, emoji, req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const removeReaction = asyncHandler(async (req, res) => {
    const { messageId, emoji } = req.params;

    const result = await messageService.removeReaction(messageId, emoji, req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const toggleReaction = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji || emoji.trim().length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Emoji is required'
        });
    }

    const result = await messageService.toggleReaction(messageId, emoji, req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const pinMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { pinned = true } = req.body;

    const result = await messageService.togglePin(messageId, req.userId, pinned);

    res.status(HTTP_STATUS.OK).json(result);
});


export const unpinMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;

    const result = await messageService.togglePin(messageId, req.userId, false);

    res.status(HTTP_STATUS.OK).json(result);
});


export const getMessageById = asyncHandler(async (req, res) => {
    const { messageId } = req.params;

    const { Message } = await import('../models/Message.js');

    const message = await Message.findById(messageId)
        .populate('sender', 'username avatar')
        .populate('replyTo', 'content sender type')
        .populate({
            path: 'replyTo',
            populate: {
                path: 'sender',
                select: 'username avatar'
            }
        });

    if (!message) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
            success: false,
            error: 'Message not found'
        });
    }

    if (message.isDeleted) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
            success: false,
            error: 'Message has been deleted'
        });
    }

    // Check access permissions
    if (message.isPrivate) {
        if (message.sender._id.toString() !== req.userId.toString() &&
            message.recipient?.toString() !== req.userId.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: 'Access denied'
            });
        }
    } else if (message.room) {
        const { Room } = await import('../models/Room.js');
        const room = await Room.findById(message.room);
        if (!room || !room.isMember(req.userId)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: 'Access denied'
            });
        }
    }

    res.status(HTTP_STATUS.OK).json({
        success: true,
        message
    });
});


export const getUserMessageStats = asyncHandler(async (req, res) => {
    const result = await messageService.getUserMessageStats(req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const getUnreadCounts = asyncHandler(async (req, res) => {
    const result = await messageService.getUnreadCounts(req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const getFilteredMessages = asyncHandler(async (req, res) => {
    const {
        roomIds = [],
        userIds = [],
        messageTypes = [],
        dateFrom,
        dateTo,
        hasReactions = null,
        isPinned = null,
        page = 1,
        limit = 50
    } = req.body;

    const { Message } = await import('../models/Message.js');

    const query = {
        isDeleted: false
    };

    // Filter by rooms (check user membership)
    if (roomIds.length > 0) {
        const { Room } = await import('../models/Room.js');
        const userRooms = await Room.find({
            _id: { $in: roomIds },
            members: req.userId
        }, '_id');
        const accessibleRoomIds = userRooms.map(room => room._id);

        query.$or = [
            { room: { $in: accessibleRoomIds }, isPrivate: false },
            {
                isPrivate: true,
                $or: [
                    { sender: req.userId },
                    { recipient: req.userId }
                ]
            }
        ];
    } else {
        // Default: only accessible messages
        const userRooms = await Room.find({ members: req.userId }, '_id');
        const roomIds = userRooms.map(room => room._id);

        query.$or = [
            { room: { $in: roomIds }, isPrivate: false },
            {
                isPrivate: true,
                $or: [
                    { sender: req.userId },
                    { recipient: req.userId }
                ]
            }
        ];
    }

    if (userIds.length > 0) {
        if (query.$or) {
            query.$and = [
                { $or: query.$or },
                { sender: { $in: userIds } }
            ];
            delete query.$or;
        } else {
            query.sender = { $in: userIds };
        }
    }

    if (messageTypes.length > 0) {
        query.type = { $in: messageTypes };
    }

    if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    if (hasReactions === true) {
        query['reactions.0'] = { $exists: true };
    } else if (hasReactions === false) {
        query.reactions = { $size: 0 };
    }

    if (isPinned !== null) {
        query['flags.isPinned'] = isPinned;
    }

    const result = await Message.findWithPagination(
        query,
        parseInt(page),
        parseInt(limit),
        { createdAt: -1 }
    );

    res.status(HTTP_STATUS.OK).json({
        success: true,
        ...result
    });
});


export const getMessageThread = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const { Message } = await import('../models/Message.js');
    const parentMessage = await Message.findById(messageId);

    if (!parentMessage) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
            success: false,
            error: 'Parent message not found'
        });
    }

    if (parentMessage.isPrivate) {
        if (parentMessage.sender.toString() !== req.userId.toString() &&
            parentMessage.recipient?.toString() !== req.userId.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: 'Access denied'
            });
        }
    } else if (parentMessage.room) {
        const { Room } = await import('../models/Room.js');
        const room = await Room.findById(parentMessage.room);
        if (!room || !room.isMember(req.userId)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: 'Access denied'
            });
        }
    }

    const result = await Message.findWithPagination(
        {
            replyTo: messageId,
            isDeleted: false
        },
        parseInt(page),
        parseInt(limit),
        { createdAt: 1 }
    );

    res.status(HTTP_STATUS.OK).json({
        success: true,
        parentMessage,
        ...result
    });
});


export const exportMessages = asyncHandler(async (req, res) => {
    const {
        roomId,
        userId: otherUserId,
        dateFrom,
        dateTo,
        format = 'json'
    } = req.body;

    let messages = [];

    if (roomId) {
        const result = await messageService.getRoomMessages(roomId, req.userId, {
            page: 1,
            limit: 10000,
            ...(dateFrom && { after: dateFrom }),
            ...(dateTo && { before: dateTo })
        });
        messages = result.messages;
    } else if (otherUserId) {
        const result = await messageService.getPrivateMessages(req.userId, otherUserId, {
            page: 1,
            limit: 10000,
            ...(dateFrom && { after: dateFrom }),
            ...(dateTo && { before: dateTo })
        });
        messages = result.messages;
    } else {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Either roomId or userId must be provided'
        });
    }

    const exportData = {
        exportedAt: new Date().toISOString(),
        exportedBy: req.userId,
        totalMessages: messages.length,
        dateRange: {
            from: dateFrom || null,
            to: dateTo || null
        },
        messages: messages.map(msg => ({
            id: msg._id,
            content: msg.content,
            type: msg.type,
            sender: {
                id: msg.sender._id,
                username: msg.sender.username
            },
            timestamp: msg.createdAt,
            isEdited: msg.isEdited,
            editedAt: msg.editedAt,
            reactions: msg.reactions,
            replyTo: msg.replyTo ? {
                id: msg.replyTo._id,
                content: msg.replyTo.content
            } : null
        }))
    };

    if (format === 'csv') {
        const csvData = messages.map(msg => ({
            timestamp: msg.createdAt.toISOString(),
            sender: msg.sender.username,
            content: msg.content.replace(/,/g, ';'), // Escape commas
            type: msg.type,
            edited: msg.isEdited ? 'Yes' : 'No'
        }));

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="messages.csv"');

        const csvHeaders = 'timestamp,sender,content,type,edited\n';
        const csvRows = csvData.map(row =>
            `${row.timestamp},${row.sender},"${row.content}",${row.type},${row.edited}`
        ).join('\n');

        res.send(csvHeaders + csvRows);
    } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="messages.json"');
        res.json(exportData);
    }
});