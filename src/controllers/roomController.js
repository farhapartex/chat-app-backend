import { roomService } from '../services/roomService.js';
import { HTTP_STATUS } from '../utils/constants.js';
import { asyncHandler } from '../middleware/errorHandler.js';


export const createRoom = asyncHandler(async (req, res) => {
    const { name, description, type, maxMembers, category, tags } = req.body;

    const result = await roomService.createRoom(
        { name, description, type, maxMembers, category, tags },
        req.userId
    );

    res.status(HTTP_STATUS.CREATED).json(result);
});


export const getPublicRooms = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        category,
        search,
        sortBy = 'lastActivity',
        sortOrder = 'desc'
    } = req.query;

    const result = await roomService.getPublicRooms({
        page: parseInt(page),
        limit: parseInt(limit),
        category,
        search,
        sortBy,
        sortOrder
    });

    res.status(HTTP_STATUS.OK).json(result);
});


export const getUserRooms = asyncHandler(async (req, res) => {
    const result = await roomService.getUserRooms(req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const getRoomById = asyncHandler(async (req, res) => {
    const { roomId } = req.params;

    const result = await roomService.getRoomById(roomId, req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const updateRoom = asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const updates = req.body;

    const result = await roomService.updateRoom(roomId, updates, req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const deleteRoom = asyncHandler(async (req, res) => {
    const { roomId } = req.params;

    const result = await roomService.deleteRoom(roomId, req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const joinRoom = asyncHandler(async (req, res) => {
    const { roomId } = req.params;

    const result = await roomService.joinRoom(roomId, req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const leaveRoom = asyncHandler(async (req, res) => {
    const { roomId } = req.params;

    const result = await roomService.leaveRoom(roomId, req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const promoteToAdmin = asyncHandler(async (req, res) => {
    const { roomId, userId: targetUserId } = req.params;

    const result = await roomService.toggleRoomAdmin(
        roomId,
        targetUserId,
        req.userId,
        true // promote = true
    );

    res.status(HTTP_STATUS.OK).json(result);
});


export const demoteFromAdmin = asyncHandler(async (req, res) => {
    const { roomId, userId: targetUserId } = req.params;

    const result = await roomService.toggleRoomAdmin(
        roomId,
        targetUserId,
        req.userId,
        false // promote = false
    );

    res.status(HTTP_STATUS.OK).json(result);
});


export const removeUserFromRoom = asyncHandler(async (req, res) => {
    const { roomId, userId: targetUserId } = req.params;

    const result = await roomService.removeUserFromRoom(
        roomId,
        targetUserId,
        req.userId
    );

    res.status(HTTP_STATUS.OK).json(result);
});


export const searchRooms = asyncHandler(async (req, res) => {
    const { q: query, page = 1, limit = 20, category } = req.query;

    if (!query || query.trim().length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Search query is required'
        });
    }

    const result = await roomService.searchRooms(query, {
        page: parseInt(page),
        limit: parseInt(limit),
        category
    });

    res.status(HTTP_STATUS.OK).json(result);
});


export const getTrendingRooms = asyncHandler(async (req, res) => {
    const { hours = 24, limit = 10 } = req.query;

    const result = await roomService.getTrendingRooms(
        parseInt(hours),
        parseInt(limit)
    );

    res.status(HTTP_STATUS.OK).json(result);
});


export const getRoomCategories = asyncHandler(async (req, res) => {
    const result = await roomService.getRoomCategories();

    res.status(HTTP_STATUS.OK).json(result);
});


export const getRoomStats = asyncHandler(async (req, res) => {
    const { roomId } = req.params;

    const result = await roomService.getRoomStats(roomId, req.userId);

    res.status(HTTP_STATUS.OK).json(result);
});


export const getRoomMembers = asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const { Room } = await import('../models/Room.js');

    const room = await Room.findById(roomId)
        .populate({
            path: 'members',
            select: 'username avatar isOnline lastSeen createdAt',
            options: {
                skip: (parseInt(page) - 1) * parseInt(limit),
                limit: parseInt(limit),
                sort: { username: 1 }
            }
        });

    if (!room) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
            success: false,
            error: 'Room not found'
        });
    }

    if (room.type === 'private' && !room.isMember(req.userId)) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            error: 'Access denied'
        });
    }

    const totalMembers = room.members.length;
    const totalPages = Math.ceil(totalMembers / parseInt(limit));

    res.status(HTTP_STATUS.OK).json({
        success: true,
        members: room.members.map(member => ({
            ...member.getPublicProfile(),
            isAdmin: room.isAdmin(member._id),
            isCreator: room.isCreator(member._id)
        })),
        pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalMembers,
            hasNext: parseInt(page) < totalPages,
            hasPrev: parseInt(page) > 1,
            limit: parseInt(limit)
        }
    });
});


export const getRoomAdmins = asyncHandler(async (req, res) => {
    const { roomId } = req.params;

    const { Room } = await import('../models/Room.js');

    const room = await Room.findById(roomId)
        .populate('creator', 'username avatar isOnline lastSeen')
        .populate('admins', 'username avatar isOnline lastSeen');

    if (!room) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
            success: false,
            error: 'Room not found'
        });
    }

    if (room.type === 'private' && !room.isMember(req.userId)) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            error: 'Access denied'
        });
    }

    res.status(HTTP_STATUS.OK).json({
        success: true,
        creator: room.creator.getPublicProfile(),
        admins: room.admins.map(admin => admin.getPublicProfile())
    });
});


export const checkCanJoinRoom = asyncHandler(async (req, res) => {
    const { roomId } = req.params;

    const { Room } = await import('../models/Room.js');

    const room = await Room.findById(roomId);

    if (!room) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
            success: false,
            error: 'Room not found'
        });
    }

    const canJoinResult = room.canUserJoin(req.userId);

    res.status(HTTP_STATUS.OK).json({
        success: true,
        canJoin: canJoinResult.canJoin,
        reason: canJoinResult.reason || null,
        isMember: room.isMember(req.userId),
        roomInfo: room.getPublicInfo()
    });
});


export const getRoomsByCategory = asyncHandler(async (req, res) => {
    const { category } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!category) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: 'Category is required'
        });
    }

    const result = await roomService.getPublicRooms({
        page: parseInt(page),
        limit: parseInt(limit),
        category
    });

    res.status(HTTP_STATUS.OK).json(result);
});


export const getRecommendedRooms = asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;
    const { Room } = await import('../models/Room.js');

    const userRooms = await Room.find({ members: req.userId }, '_id');
    const userRoomIds = userRooms.map(room => room._id);

    const recommendedRooms = await Room.find({
        type: 'public',
        isActive: true,
        _id: { $nin: userRoomIds },
        lastActivity: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    })
        .populate('creator', 'username avatar')
        .select('-members -admins')
        .sort({ messageCount: -1, members: -1 })
        .limit(parseInt(limit));

    res.status(HTTP_STATUS.OK).json({
        success: true,
        rooms: recommendedRooms.map(room => room.getPublicInfo())
    });
});


export const inviteUserToRoom = asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const { userId: targetUserId, message } = req.body;

    res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Room invitation feature will be implemented in future updates',
        roomId,
        targetUserId,
        inviteMessage: message
    });
});


export const getRoomActivity = asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const { limit = 20 } = req.query;

    const { Room } = await import('../models/Room.js');
    const { Message } = await import('../models/Message.js');

    const room = await Room.findById(roomId);
    if (!room) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
            success: false,
            error: 'Room not found'
        });
    }

    if (room.type === 'private' && !room.isMember(req.userId)) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            error: 'Access denied'
        });
    }

    const systemMessages = await Message.find({
        room: roomId,
        type: 'system',
        isDeleted: false
    })
        .populate('sender', 'username avatar')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit));

    res.status(HTTP_STATUS.OK).json({
        success: true,
        activities: systemMessages.map(msg => ({
            id: msg._id,
            type: msg.metadata?.systemType || 'general',
            message: msg.content,
            user: msg.sender,
            timestamp: msg.createdAt
        }))
    });
});