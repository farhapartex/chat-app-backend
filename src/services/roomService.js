import { Room } from '../models/Room.js';
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';
import {
    ROOM_TYPES,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    VALIDATION_RULES,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
} from '../utils/constants.js';
import { AppError } from '../middleware/errorHandler.js';

class RoomService {
    validateRoomInput({ name, description, type, maxMembers }) {
        const errors = {};

        if (!name || name.trim().length === 0) {
            errors.name = 'Room name is required';
        } else if (name.trim().length < VALIDATION_RULES.ROOM_NAME.MIN_LENGTH) {
            errors.name = `Room name must be at least ${VALIDATION_RULES.ROOM_NAME.MIN_LENGTH} character long`;
        } else if (name.trim().length > VALIDATION_RULES.ROOM_NAME.MAX_LENGTH) {
            errors.name = `Room name cannot exceed ${VALIDATION_RULES.ROOM_NAME.MAX_LENGTH} characters`;
        }

        if (description && description.length > VALIDATION_RULES.ROOM_DESCRIPTION.MAX_LENGTH) {
            errors.description = `Room description cannot exceed ${VALIDATION_RULES.ROOM_DESCRIPTION.MAX_LENGTH} characters`;
        }

        if (type && !Object.values(ROOM_TYPES).includes(type)) {
            errors.type = 'Invalid room type';
        }

        if (maxMembers !== undefined) {
            if (typeof maxMembers !== 'number' || maxMembers < 2 || maxMembers > 1000) {
                errors.maxMembers = 'Max members must be between 2 and 1000';
            }
        }

        if (Object.keys(errors).length > 0) {
            const error = new AppError(ERROR_MESSAGES.VALIDATION_ERROR, 422);
            error.details = errors;
            throw error;
        }
    }


    async createRoom({ name, description = '', type = ROOM_TYPES.PUBLIC, maxMembers = 100, category = 'general', tags = [] }, creatorId) {
        try {
            this.validateRoomInput({ name, description, type, maxMembers });

            const creator = await User.findById(creatorId);
            if (!creator) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            const normalizedName = name.trim();
            const normalizedDescription = description.trim();
            const normalizedTags = tags.filter(tag => tag && tag.trim()).map(tag => tag.trim().toLowerCase());

            // Here I am not allowing duplicates room name)
            const existingRoom = await Room.findOne({
                name: { $regex: `^${normalizedName}$`, $options: 'i' },
                creator: creatorId,
                isActive: true
            });

            if (existingRoom) {
                throw new AppError('You already have a room with this name', 409);
            }

            const room = new Room({
                name: normalizedName,
                description: normalizedDescription,
                type,
                creator: creatorId,
                members: [creatorId],
                admins: [creatorId],
                maxMembers,
                category,
                tags: normalizedTags,
                isActive: true,
                lastActivity: new Date()
            });

            await room.save();

            await User.findByIdAndUpdate(creatorId, {
                $addToSet: { joinedRooms: room._id }
            });

            await room.populate('creator', 'username avatar');

            return {
                success: true,
                message: SUCCESS_MESSAGES.ROOM_CREATED,
                room: room.getPublicInfo()
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to create room', 500);
        }
    }


    async getPublicRooms({
        page = 1,
        limit = DEFAULT_PAGE_SIZE,
        category = null,
        search = null,
        sortBy = 'lastActivity',
        sortOrder = 'desc'
    } = {}) {
        try {
            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit)));
            const skip = (pageNum - 1) * limitNum;

            // Build query
            const query = {
                type: ROOM_TYPES.PUBLIC,
                isActive: true
            };

            if (category && category !== 'all') {
                query.category = category;
            }

            if (search && search.trim()) {
                const searchRegex = new RegExp(search.trim(), 'i');
                query.$or = [
                    { name: searchRegex },
                    { description: searchRegex },
                    { tags: { $in: [searchRegex] } }
                ];
            }

            const sortObj = {};
            sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;
            const [rooms, total] = await Promise.all([
                Room.find(query)
                    .populate('creator', 'username avatar')
                    .select('-members -admins') // exclude members and admins from public info
                    .sort(sortObj)
                    .skip(skip)
                    .limit(limitNum),

                Room.countDocuments(query)
            ]);

            return {
                success: true,
                rooms: rooms.map(room => ({
                    ...room.getPublicInfo(),
                    creator: room.creator
                })),
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalRooms: total,
                    hasNext: pageNum < Math.ceil(total / limitNum),
                    hasPrev: pageNum > 1,
                    limit: limitNum
                }
            };

        } catch (error) {
            throw new AppError('Failed to get public rooms', 500);
        }
    }

    async getUserRooms(userId) {
        try {
            const rooms = await Room.find({
                members: userId,
                isActive: true
            })
                .populate('creator', 'username avatar')
                .populate('members', 'username avatar isOnline lastSeen')
                .sort({ lastActivity: -1 });

            return {
                success: true,
                rooms: rooms.map(room => ({
                    ...room.toJSON(),
                    memberCount: room.members.length,
                    isAdmin: room.isAdmin(userId),
                    isCreator: room.isCreator(userId)
                }))
            };

        } catch (error) {
            throw new AppError('Failed to get user rooms', 500);
        }
    }

    async getRoomById(roomId, userId = null) {
        try {
            const room = await Room.findById(roomId)
                .populate('creator', 'username avatar')
                .populate('members', 'username avatar isOnline lastSeen')
                .populate('admins', 'username avatar');

            if (!room) {
                throw new AppError(ERROR_MESSAGES.ROOM_NOT_FOUND, 404);
            }

            if (!room.isActive) {
                throw new AppError('Room is not active', 404);
            }

            // Check access permissions for private rooms
            if (room.type === ROOM_TYPES.PRIVATE && userId) {
                if (!room.isMember(userId)) {
                    throw new AppError(ERROR_MESSAGES.ROOM_ACCESS_DENIED, 403);
                }
            }

            // Prepare room data with user-specific information
            const roomData = {
                ...room.toJSON(),
                stats: room.getStats()
            };

            if (userId) {
                roomData.userPermissions = {
                    isMember: room.isMember(userId),
                    isAdmin: room.isAdmin(userId),
                    isCreator: room.isCreator(userId),
                    canJoin: room.canUserJoin(userId)
                };
            }

            return {
                success: true,
                room: roomData
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to get room details', 500);
        }
    }


    async joinRoom(roomId, userId) {
        try {
            const [room, user] = await Promise.all([
                Room.findById(roomId),
                User.findById(userId)
            ]);

            if (!room) {
                throw new AppError(ERROR_MESSAGES.ROOM_NOT_FOUND, 404);
            }

            if (!user) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            if (!room.isActive) {
                throw new AppError('Room is not active', 400);
            }

            // Check if user can join
            const canJoinResult = room.canUserJoin(userId);
            if (!canJoinResult.canJoin) {
                throw new AppError(canJoinResult.reason, 400);
            }

            await room.addMember(userId);
            await User.findByIdAndUpdate(userId, {
                $addToSet: { joinedRooms: roomId }
            });
            await room.updateLastActivity();
            const systemMessage = new Message({
                room: roomId,
                sender: userId,
                content: `${user.username} joined the room`,
                type: 'system',
                metadata: {
                    systemType: 'user_joined'
                }
            });
            await systemMessage.save();

            return {
                success: true,
                message: SUCCESS_MESSAGES.ROOM_JOINED,
                room: await this.getRoomById(roomId, userId)
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to join room', 500);
        }
    }


    async leaveRoom(roomId, userId) {
        try {
            const [room, user] = await Promise.all([
                Room.findById(roomId),
                User.findById(userId)
            ]);

            if (!room) {
                throw new AppError(ERROR_MESSAGES.ROOM_NOT_FOUND, 404);
            }

            if (!user) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            if (!room.isMember(userId)) {
                throw new AppError(ERROR_MESSAGES.NOT_MEMBER, 400);
            }

            if (room.isCreator(userId) && room.members.length > 1) {
                throw new AppError(ERROR_MESSAGES.CREATOR_CANNOT_LEAVE, 400);
            }

            await room.removeMember(userId);
            await User.findByIdAndUpdate(userId, {
                $pull: { joinedRooms: roomId }
            });

            const systemMessage = new Message({
                room: roomId,
                sender: userId,
                content: `${user.username} left the room`,
                type: 'system',
                metadata: {
                    systemType: 'user_left'
                }
            });
            await systemMessage.save();
            if (room.members.length === 0) {
                room.isActive = false;
                await room.save();
            }

            return {
                success: true,
                message: SUCCESS_MESSAGES.ROOM_LEFT
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to leave room', 500);
        }
    }


    async updateRoom(roomId, updates, userId) {
        try {
            const room = await Room.findById(roomId);

            if (!room) {
                throw new AppError(ERROR_MESSAGES.ROOM_NOT_FOUND, 404);
            }

            if (!room.isAdmin(userId)) {
                throw new AppError('Only room admins can update room settings', 403);
            }

            const allowedUpdates = ['name', 'description', 'maxMembers', 'settings', 'category', 'tags', 'avatar'];
            const filteredUpdates = {};

            Object.keys(updates).forEach(key => {
                if (allowedUpdates.includes(key) && updates[key] !== undefined) {
                    filteredUpdates[key] = updates[key];
                }
            });

            if (filteredUpdates.name || filteredUpdates.description || filteredUpdates.maxMembers) {
                this.validateRoomInput({
                    name: filteredUpdates.name || room.name,
                    description: filteredUpdates.description || room.description,
                    maxMembers: filteredUpdates.maxMembers || room.maxMembers
                });
            }
            if (filteredUpdates.tags) {
                filteredUpdates.tags = filteredUpdates.tags
                    .filter(tag => tag && tag.trim())
                    .map(tag => tag.trim().toLowerCase());
            }

            const updatedRoom = await Room.findByIdAndUpdate(
                roomId,
                {
                    ...filteredUpdates,
                    lastActivity: new Date()
                },
                {
                    new: true,
                    runValidators: true
                }
            ).populate('creator', 'username avatar');

            const systemMessage = new Message({
                room: roomId,
                sender: userId,
                content: 'Room settings have been updated',
                type: 'system',
                metadata: {
                    systemType: 'settings_changed'
                }
            });
            await systemMessage.save();

            return {
                success: true,
                message: SUCCESS_MESSAGES.ROOM_UPDATED,
                room: updatedRoom
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to update room', 500);
        }
    }


    async toggleRoomAdmin(roomId, targetUserId, adminUserId, promote = true) {
        // Promote or demote a user to/from admin in a room
        try {
            const [room, targetUser] = await Promise.all([
                Room.findById(roomId),
                User.findById(targetUserId)
            ]);

            if (!room) {
                throw new AppError(ERROR_MESSAGES.ROOM_NOT_FOUND, 404);
            }

            if (!targetUser) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            // Only room creator can promote/demote admins
            if (!room.isCreator(adminUserId)) {
                throw new AppError('Only room creator can manage admins', 403);
            }

            if (!room.isMember(targetUserId)) {
                throw new AppError('User must be a room member to become admin', 400);
            }

            if (promote) {
                await room.addAdmin(targetUserId);
            } else {
                await room.removeAdmin(targetUserId);
            }

            const systemMessage = new Message({
                room: roomId,
                sender: adminUserId,
                content: `${targetUser.username} has been ${promote ? 'promoted to' : 'demoted from'} admin`,
                type: 'system',
                metadata: {
                    systemType: promote ? 'user_promoted' : 'user_demoted'
                }
            });
            await systemMessage.save();

            return {
                success: true,
                message: `User ${promote ? 'promoted to' : 'demoted from'} admin successfully`
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Failed to ${promote ? 'promote' : 'demote'} user`, 500);
        }
    }


    async removeUserFromRoom(roomId, targetUserId, adminUserId) {
        try {
            const [room, targetUser] = await Promise.all([
                Room.findById(roomId),
                User.findById(targetUserId)
            ]);

            if (!room) {
                throw new AppError(ERROR_MESSAGES.ROOM_NOT_FOUND, 404);
            }

            if (!targetUser) {
                throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND, 404);
            }

            if (!room.isAdmin(adminUserId)) {
                throw new AppError('Only room admins can remove users', 403);
            }

            if (!room.isMember(targetUserId)) {
                throw new AppError('User is not a member of this room', 400);
            }

            if (room.isCreator(targetUserId)) {
                throw new AppError('Cannot remove room creator', 400);
            }

            await room.removeMember(targetUserId);
            await User.findByIdAndUpdate(targetUserId, {
                $pull: { joinedRooms: roomId }
            });

            const systemMessage = new Message({
                room: roomId,
                sender: adminUserId,
                content: `${targetUser.username} has been removed from the room`,
                type: 'system',
                metadata: {
                    systemType: 'user_removed'
                }
            });
            await systemMessage.save();

            return {
                success: true,
                message: 'User removed from room successfully'
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to remove user from room', 500);
        }
    }


    async deleteRoom(roomId, userId) {
        try {
            const room = await Room.findById(roomId);

            if (!room) {
                throw new AppError(ERROR_MESSAGES.ROOM_NOT_FOUND, 404);
            }

            if (!room.isCreator(userId)) {
                throw new AppError('Only room creator can delete the room', 403);
            }

            await User.updateMany(
                { joinedRooms: roomId },
                { $pull: { joinedRooms: roomId } }
            );

            await Message.updateMany(
                { room: roomId },
                {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: userId
                }
            );

            await Room.findByIdAndDelete(roomId);

            return {
                success: true,
                message: SUCCESS_MESSAGES.ROOM_DELETED
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to delete room', 500);
        }
    }


    async searchRooms(query, { page = 1, limit = DEFAULT_PAGE_SIZE, category = null } = {}) {
        try {
            if (!query || query.trim().length === 0) {
                return {
                    success: true,
                    rooms: [],
                    pagination: {
                        currentPage: 1,
                        totalPages: 0,
                        totalRooms: 0,
                        hasNext: false,
                        hasPrev: false,
                        limit
                    }
                };
            }

            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit)));
            const skip = (pageNum - 1) * limitNum;

            const searchRegex = new RegExp(query.trim(), 'i');

            const searchQuery = {
                $and: [
                    { type: ROOM_TYPES.PUBLIC },
                    { isActive: true },
                    {
                        $or: [
                            { name: searchRegex },
                            { description: searchRegex },
                            { tags: { $in: [searchRegex] } }
                        ]
                    }
                ]
            };

            if (category && category !== 'all') {
                searchQuery.$and.push({ category });
            }

            const [rooms, total] = await Promise.all([
                Room.find(searchQuery)
                    .populate('creator', 'username avatar')
                    .select('-members -admins')
                    .sort({ lastActivity: -1 })
                    .skip(skip)
                    .limit(limitNum),

                Room.countDocuments(searchQuery)
            ]);

            return {
                success: true,
                rooms: rooms.map(room => room.getPublicInfo()),
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalRooms: total,
                    hasNext: pageNum < Math.ceil(total / limitNum),
                    hasPrev: pageNum > 1,
                    limit: limitNum
                }
            };

        } catch (error) {
            throw new AppError('Room search failed', 500);
        }
    }


    async getTrendingRooms(hours = 24, limit = 10) {
        try {
            const since = new Date(Date.now() - hours * 60 * 60 * 1000);

            const rooms = await Room.find({
                type: ROOM_TYPES.PUBLIC,
                isActive: true,
                lastActivity: { $gte: since }
            })
                .populate('creator', 'username avatar')
                .select('-members -admins')
                .sort({ messageCount: -1, lastActivity: -1 })
                .limit(limit);

            return {
                success: true,
                rooms: rooms.map(room => room.getPublicInfo())
            };

        } catch (error) {
            throw new AppError('Failed to get trending rooms', 500);
        }
    }


    async getRoomCategories() {
        try {
            const categories = await Room.aggregate([
                {
                    $match: {
                        type: ROOM_TYPES.PUBLIC,
                        isActive: true
                    }
                },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                },
                {
                    $sort: { count: -1 }
                }
            ]);

            return {
                success: true,
                categories: categories.map(cat => ({
                    name: cat._id,
                    count: cat.count
                }))
            };

        } catch (error) {
            throw new AppError('Failed to get room categories', 500);
        }
    }


    async getRoomStats(roomId, userId) {
        try {
            const room = await Room.findById(roomId);

            if (!room) {
                throw new AppError(ERROR_MESSAGES.ROOM_NOT_FOUND, 404);
            }

            if (room.type === ROOM_TYPES.PRIVATE && !room.isMember(userId)) {
                throw new AppError(ERROR_MESSAGES.ROOM_ACCESS_DENIED, 403);
            }

            const [recentMessages, activeMembers] = await Promise.all([
                Message.countDocuments({
                    room: roomId,
                    isDeleted: false,
                    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                }),

                User.countDocuments({
                    _id: { $in: room.members },
                    lastSeen: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                })
            ]);

            return {
                success: true,
                stats: {
                    ...room.getStats(),
                    recentMessages24h: recentMessages,
                    activeMembersWeek: activeMembers
                }
            };

        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Failed to get room statistics', 500);
        }
    }
}


export const roomService = new RoomService();