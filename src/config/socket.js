import { User } from '../models/user.js';
import { Room } from '../models/room.js';
import { messageService } from '../services/messageService.js';
import { roomService } from '../services/roomService.js';
import { authenticateSocket } from '../middleware/auth.js';
import { SOCKET_EVENTS, MESSAGE_TYPES } from '../utils/constants.js';

const onlineUsers = new Map();
const typingUsers = new Map();
const privateTyping = new Map();


const cleanupUserData = (userId, socketId) => {
    if (onlineUsers.has(userId)) {
        const userData = onlineUsers.get(userId);
        if (userData.socketId === socketId) {
            onlineUsers.delete(userId);
        }
    }

    for (const [roomId, typingSet] of typingUsers.entries()) {
        if (typingSet.has(userId)) {
            typingSet.delete(userId);
            if (typingSet.size === 0) {
                typingUsers.delete(roomId);
            }
        }
    }

    for (const [conversationKey, typingData] of privateTyping.entries()) {
        if (typingData.userId === userId) {
            privateTyping.delete(conversationKey);
        }
    }
};


const getConversationKey = (userId1, userId2) => {
    return [userId1, userId2].sort().join(':');
};


const broadcastUserStatus = (io, user, isOnline) => {
    const statusEvent = isOnline ? SOCKET_EVENTS.USER_ONLINE : SOCKET_EVENTS.USER_OFFLINE;

    io.emit(statusEvent, {
        userId: user._id,
        username: user.username,
        avatar: user.avatar,
        timestamp: new Date()
    });
};


const sendOnlineUsersList = (socket) => {
    const onlineUsersList = Array.from(onlineUsers.values())
        .filter(userData => userData.user._id.toString() !== socket.userId)
        .map(({ user }) => ({
            userId: user._id,
            username: user.username,
            avatar: user.avatar,
            lastSeen: user.lastSeen
        }));

    socket.emit(SOCKET_EVENTS.ONLINE_USERS, onlineUsersList);
};


const handleConnection = async (socket, io) => {
    try {
        console.log(`👤 User ${socket.user.username} connected (${socket.id})`);
        onlineUsers.set(socket.userId, {
            socketId: socket.id,
            user: socket.user,
            connectedAt: new Date(),
            rooms: new Set()
        });

        await User.findByIdAndUpdate(socket.userId, {
            isOnline: true,
            lastSeen: new Date()
        });

        broadcastUserStatus(io, socket.user, true);

        sendOnlineUsersList(socket);
        const userRooms = await Room.find({
            members: socket.userId,
            isActive: true
        }).select('_id name');

        for (const room of userRooms) {
            socket.join(room._id.toString());
            onlineUsers.get(socket.userId).rooms.add(room._id.toString());
            socket.to(room._id.toString()).emit(SOCKET_EVENTS.USER_ONLINE, {
                userId: socket.userId,
                username: socket.user.username,
                roomId: room._id,
                timestamp: new Date()
            });
        }

        socket.emit('connected', {
            success: true,
            user: socket.user.getPublicProfile(),
            timestamp: new Date()
        });

    } catch (error) {
        socket.emit(SOCKET_EVENTS.ERROR, {
            message: 'Connection failed',
            error: error.message
        });
    }
};


const handleDisconnection = async (socket, io) => {
    try {

        if (socket.userId && socket.user) {
            cleanupUserData(socket.userId, socket.id);
            await User.findByIdAndUpdate(socket.userId, {
                isOnline: false,
                lastSeen: new Date()
            });
            broadcastUserStatus(io, socket.user, false);
            const userData = onlineUsers.get(socket.userId);
            if (userData && userData.rooms) {
                for (const roomId of userData.rooms) {
                    socket.to(roomId).emit(SOCKET_EVENTS.USER_OFFLINE, {
                        userId: socket.userId,
                        username: socket.user.username,
                        roomId: roomId,
                        timestamp: new Date()
                    });
                }
            }
        }
    } catch (error) {
        console.error('Disconnection error:', error);
    }
};


const handleJoinRoom = async (socket, data, io) => {
    try {
        const { roomId } = data;

        if (!roomId) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Room ID is required' });
            return;
        }

        const roomResult = await roomService.getRoomById(roomId, socket.userId);

        if (!roomResult.success) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Room not found or access denied' });
            return;
        }

        const room = roomResult.room;

        socket.join(roomId);
        if (onlineUsers.has(socket.userId)) {
            onlineUsers.get(socket.userId).rooms.add(roomId);
        }

        socket.to(roomId).emit(SOCKET_EVENTS.USER_JOINED, {
            userId: socket.userId,
            username: socket.user.username,
            avatar: socket.user.avatar,
            roomId: roomId,
            timestamp: new Date()
        });

        socket.emit(SOCKET_EVENTS.ROOM_JOINED, {
            success: true,
            room: {
                id: room._id,
                name: room.name,
                description: room.description,
                type: room.type,
                memberCount: room.members?.length || 0,
                isAdmin: room.userPermissions?.isAdmin || false,
                settings: room.settings
            },
            timestamp: new Date()
        });

        const messagesResult = await messageService.getRoomMessages(roomId, socket.userId, {
            limit: 50
        });

        if (messagesResult.success) {
            socket.emit('room_messages', {
                roomId: roomId,
                messages: messagesResult.messages.reverse(), // Most recent first
                hasMore: messagesResult.pagination.hasNext
            });
        }

    } catch (error) {
        console.error('Error joining room:', error);
        socket.emit(SOCKET_EVENTS.ERROR, {
            message: 'Failed to join room',
            error: error.message
        });
    }
};


const handleLeaveRoom = async (socket, data) => {
    try {
        const { roomId } = data;

        if (!roomId) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Room ID is required' });
            return;
        }

        const room = await Room.findById(roomId);
        if (!room) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Room not found' });
            return;
        }

        socket.leave(roomId);

        if (onlineUsers.has(socket.userId)) {
            onlineUsers.get(socket.userId).rooms.delete(roomId);
        }

        if (typingUsers.has(roomId)) {
            typingUsers.get(roomId).delete(socket.userId);
            if (typingUsers.get(roomId).size === 0) {
                typingUsers.delete(roomId);
            } else {
                socket.to(roomId).emit(SOCKET_EVENTS.TYPING_STOP, {
                    userId: socket.userId,
                    username: socket.user.username,
                    roomId: roomId
                });
            }
        }

        socket.to(roomId).emit(SOCKET_EVENTS.USER_LEFT, {
            userId: socket.userId,
            username: socket.user.username,
            roomId: roomId,
            timestamp: new Date()
        });

        socket.emit(SOCKET_EVENTS.ROOM_LEFT, {
            success: true,
            roomId: roomId,
            timestamp: new Date()
        });

    } catch (error) {
        socket.emit(SOCKET_EVENTS.ERROR, {
            message: 'Failed to leave room',
            error: error.message
        });
    }
};


const handleSendMessage = async (socket, data, io) => {
    try {
        const { roomId, content, type = MESSAGE_TYPES.TEXT, replyTo, metadata } = data;

        if (!roomId || !content || !content.trim()) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Room ID and message content are required' });
            return;
        }

        const result = await messageService.createMessage({
            sender: socket.userId,
            room: roomId,
            content: content.trim(),
            type,
            isPrivate: false,
            replyTo,
            metadata: metadata || {}
        });

        if (!result.success) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: result.message || 'Failed to send message' });
            return;
        }

        const message = result.data;

        const messageData = {
            id: message._id,
            content: message.content,
            type: message.type,
            sender: {
                id: message.sender._id,
                username: message.sender.username,
                avatar: message.sender.avatar
            },
            roomId: roomId,
            replyTo: message.replyTo ? {
                id: message.replyTo._id,
                content: message.replyTo.content,
                sender: message.replyTo.sender
            } : null,
            metadata: message.metadata,
            reactions: [],
            timestamp: message.createdAt
        };

        socket.to(roomId).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, messageData);
        socket.emit(SOCKET_EVENTS.MESSAGE_SENT, {
            success: true,
            tempId: data.tempId, // Client-side temporary ID for message correlation
            message: messageData
        });

        if (typingUsers.has(roomId) && typingUsers.get(roomId).has(socket.userId)) {
            typingUsers.get(roomId).delete(socket.userId);
            socket.to(roomId).emit(SOCKET_EVENTS.TYPING_STOP, {
                userId: socket.userId,
                username: socket.user.username,
                roomId: roomId
            });
        }

    } catch (error) {
        socket.emit(SOCKET_EVENTS.ERROR, {
            message: 'Failed to send message',
            error: error.message
        });
    }
};


const handleSendPrivateMessage = async (socket, data, io) => {
    try {
        const { recipientId, content, type = MESSAGE_TYPES.TEXT, replyTo, metadata } = data;
        if (!recipientId || !content || !content.trim()) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Recipient ID and message content are required' });
            return;
        }

        if (recipientId === socket.userId) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Cannot send message to yourself' });
            return;
        }

        const result = await messageService.createMessage({
            sender: socket.userId,
            recipient: recipientId,
            content: content.trim(),
            type,
            isPrivate: true,
            replyTo,
            metadata: metadata || {}
        });

        if (!result.success) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: result.message || 'Failed to send private message' });
            return;
        }

        const message = result.data;

        const messageData = {
            id: message._id,
            content: message.content,
            type: message.type,
            sender: {
                id: message.sender._id,
                username: message.sender.username,
                avatar: message.sender.avatar
            },
            recipientId: recipientId,
            replyTo: message.replyTo ? {
                id: message.replyTo._id,
                content: message.replyTo.content,
                sender: message.replyTo.sender
            } : null,
            metadata: message.metadata,
            reactions: [],
            timestamp: message.createdAt,
            isPrivate: true
        };

        const recipientData = onlineUsers.get(recipientId);
        if (recipientData) {
            io.to(recipientData.socketId).emit(SOCKET_EVENTS.PRIVATE_MESSAGE_RECEIVED, messageData);
        }

        socket.emit(SOCKET_EVENTS.PRIVATE_MESSAGE_SENT, {
            success: true,
            tempId: data.tempId,
            message: messageData
        });

        const conversationKey = getConversationKey(socket.userId, recipientId);
        if (privateTyping.has(conversationKey)) {
            privateTyping.delete(conversationKey);
            if (recipientData) {
                io.to(recipientData.socketId).emit(SOCKET_EVENTS.TYPING_STOP, {
                    userId: socket.userId,
                    username: socket.user.username,
                    isPrivate: true
                });
            }
        }

    } catch (error) {
        socket.emit(SOCKET_EVENTS.ERROR, {
            message: 'Failed to send private message',
            error: error.message
        });
    }
};


const handleTypingStart = (socket, data, io) => {
    try {
        const { roomId, isPrivate = false, recipientId } = data;

        if (isPrivate && recipientId) {
            const conversationKey = getConversationKey(socket.userId, recipientId);
            privateTyping.set(conversationKey, {
                userId: socket.userId,
                username: socket.user.username,
                startTime: Date.now()
            });

            const recipientData = onlineUsers.get(recipientId);
            if (recipientData) {
                io.to(recipientData.socketId).emit(SOCKET_EVENTS.TYPING_START, {
                    userId: socket.userId,
                    username: socket.user.username,
                    isPrivate: true
                });
            }
        } else if (roomId) {
            if (!typingUsers.has(roomId)) {
                typingUsers.set(roomId, new Set());
            }

            typingUsers.get(roomId).add(socket.userId);

            socket.to(roomId).emit(SOCKET_EVENTS.TYPING_START, {
                userId: socket.userId,
                username: socket.user.username,
                roomId: roomId
            });
        }
    } catch (error) {
        console.error('Error handling typing start:', error);
    }
};


const handleTypingStop = (socket, data, io) => {
    try {
        const { roomId, isPrivate = false, recipientId } = data;

        if (isPrivate && recipientId) {
            const conversationKey = getConversationKey(socket.userId, recipientId);
            privateTyping.delete(conversationKey);

            const recipientData = onlineUsers.get(recipientId);
            if (recipientData) {
                io.to(recipientData.socketId).emit(SOCKET_EVENTS.TYPING_STOP, {
                    userId: socket.userId,
                    username: socket.user.username,
                    isPrivate: true
                });
            }
        } else if (roomId) {
            if (typingUsers.has(roomId)) {
                typingUsers.get(roomId).delete(socket.userId);

                if (typingUsers.get(roomId).size === 0) {
                    typingUsers.delete(roomId);
                }

                socket.to(roomId).emit(SOCKET_EVENTS.TYPING_STOP, {
                    userId: socket.userId,
                    username: socket.user.username,
                    roomId: roomId
                });
            }
        }
    } catch (error) {
        console.error('Error handling typing stop:', error);
    }
};


const handleMessageReaction = async (socket, data, io) => {
    try {
        const { messageId, emoji, action = 'toggle' } = data;

        if (!messageId || !emoji) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Message ID and emoji are required' });
            return;
        }

        let result;
        if (action === 'toggle') {
            result = await messageService.toggleReaction(messageId, emoji, socket.userId);
        } else if (action === 'add') {
            result = await messageService.addReaction(messageId, emoji, socket.userId);
        } else if (action === 'remove') {
            result = await messageService.removeReaction(messageId, emoji, socket.userId);
        } else {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid reaction action' });
            return;
        }

        if (!result.success) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: result.message });
            return;
        }

        const { Message } = await import('../models/Message.js');
        const message = await Message.findById(messageId);

        if (!message) return;

        const reactionData = {
            messageId: messageId,
            emoji: emoji,
            action: result.added ? 'added' : 'removed',
            user: {
                id: socket.userId,
                username: socket.user.username
            },
            reactions: result.reactions,
            timestamp: new Date()
        };

        if (message.isPrivate) {
            const otherUserId = message.sender.toString() === socket.userId
                ? message.recipient.toString()
                : message.sender.toString();

            const otherUserData = onlineUsers.get(otherUserId);
            if (otherUserData) {
                io.to(otherUserData.socketId).emit('message_reaction', reactionData);
            }
        } else {
            socket.to(message.room.toString()).emit('message_reaction', reactionData);
        }

        socket.emit('reaction_updated', {
            success: true,
            ...reactionData
        });

    } catch (error) {
        socket.emit(SOCKET_EVENTS.ERROR, {
            message: 'Failed to process reaction',
            error: error.message
        });
    }
};


const handleMessageEdit = async (socket, data, io) => {
    try {
        const { messageId, content } = data;

        if (!messageId || !content || !content.trim()) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Message ID and content are required' });
            return;
        }

        const result = await messageService.editMessage(messageId, content.trim(), socket.userId);

        if (!result.success) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: result.message });
            return;
        }

        const message = result.data;

        const editData = {
            messageId: messageId,
            content: message.content,
            editedAt: message.editedAt,
            editor: {
                id: socket.userId,
                username: socket.user.username
            },
            timestamp: new Date()
        };

        if (message.isPrivate) {
            const otherUserId = message.sender._id.toString() === socket.userId
                ? message.recipient.toString()
                : message.sender._id.toString();

            const otherUserData = onlineUsers.get(otherUserId);
            if (otherUserData) {
                io.to(otherUserData.socketId).emit('message_edited', editData);
            }
        } else {
            socket.to(message.room.toString()).emit('message_edited', editData);
        }

        socket.emit('message_edit_confirmed', {
            success: true,
            ...editData
        });

    } catch (error) {
        console.error('Error handling message edit:', error);
        socket.emit(SOCKET_EVENTS.ERROR, {
            message: 'Failed to edit message',
            error: error.message
        });
    }
};


const handleMessageDelete = async (socket, data, io) => {
    try {
        const { messageId } = data;

        if (!messageId) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Message ID is required' });
            return;
        }

        const { Message } = await import('../models/Message.js');
        const message = await Message.findById(messageId);

        if (!message) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Message not found' });
            return;
        }

        let isAdmin = false;
        if (message.room) {
            const room = await Room.findById(message.room);
            isAdmin = room ? room.isAdmin(socket.userId) : false;
        }

        const result = await messageService.deleteMessage(messageId, socket.userId, isAdmin);

        if (!result.success) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: result.message });
            return;
        }

        const deleteData = {
            messageId: messageId,
            deletedBy: {
                id: socket.userId,
                username: socket.user.username
            },
            timestamp: new Date()
        };

        if (message.isPrivate) {
            const otherUserId = message.sender.toString() === socket.userId
                ? message.recipient.toString()
                : message.sender.toString();

            const otherUserData = onlineUsers.get(otherUserId);
            if (otherUserData) {
                io.to(otherUserData.socketId).emit('message_deleted', deleteData);
            }
        } else {
            socket.to(message.room.toString()).emit('message_deleted', deleteData);
        }

        socket.emit('message_delete_confirmed', {
            success: true,
            ...deleteData
        });

    } catch (error) {
        socket.emit(SOCKET_EVENTS.ERROR, {
            message: 'Failed to delete message',
            error: error.message
        });
    }
};


const handleMarkAsRead = async (socket, data) => {
    try {
        const { messageIds } = data;

        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Message IDs array is required' });
            return;
        }

        const result = await messageService.markAsRead(messageIds, socket.userId);

        socket.emit('messages_marked_read', {
            success: result.success,
            messageIds: messageIds,
            timestamp: new Date()
        });

    } catch (error) {
        socket.emit(SOCKET_EVENTS.ERROR, {
            message: 'Failed to mark messages as read',
            error: error.message
        });
    }
};


const cleanupTypingIndicators = () => {
    const now = Date.now();
    const TYPING_TIMEOUT = 10000;

    for (const [roomId, users] of typingUsers.entries()) {
        if (users.size === 0) {
            typingUsers.delete(roomId);
        }
    }

    for (const [conversationKey, typingData] of privateTyping.entries()) {
        if (now - typingData.startTime > TYPING_TIMEOUT) {
            privateTyping.delete(conversationKey);
        }
    }
};


export const initializeSocket = (io) => {
    io.use(authenticateSocket);

    io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
        handleConnection(socket, io);

        socket.on(SOCKET_EVENTS.JOIN_ROOM, (data) => handleJoinRoom(socket, data, io));
        socket.on(SOCKET_EVENTS.LEAVE_ROOM, (data) => handleLeaveRoom(socket, data));

        socket.on(SOCKET_EVENTS.SEND_MESSAGE, (data) => handleSendMessage(socket, data, io));
        socket.on(SOCKET_EVENTS.SEND_PRIVATE_MESSAGE, (data) => handleSendPrivateMessage(socket, data, io));

        socket.on('edit_message', (data) => handleMessageEdit(socket, data, io));
        socket.on('delete_message', (data) => handleMessageDelete(socket, data, io));
        socket.on('message_reaction', (data) => handleMessageReaction(socket, data, io));
        socket.on('mark_as_read', (data) => handleMarkAsRead(socket, data));

        socket.on(SOCKET_EVENTS.TYPING_START, (data) => handleTypingStart(socket, data, io));
        socket.on(SOCKET_EVENTS.TYPING_STOP, (data) => handleTypingStop(socket, data, io));

        socket.on('get_online_users', () => sendOnlineUsersList(socket));
        socket.on('ping', () => socket.emit('pong', { timestamp: new Date() }));
        socket.on(SOCKET_EVENTS.DISCONNECT, () => handleDisconnection(socket, io));

        socket.on('error', (error) => {
            console.error('Socket error:', error);
            socket.emit(SOCKET_EVENTS.ERROR, {
                message: 'Socket error occurred',
                error: error.message
            });
        });

        socket.on('room_created', async (data) => {
            try {
                const { roomId } = data;
                const room = await Room.findById(roomId).populate('creator', 'username avatar');

                if (room && room.type === 'public') {
                    socket.broadcast.emit('new_room_available', {
                        room: room.getPublicInfo(),
                        creator: room.creator,
                        timestamp: new Date()
                    });
                }
            } catch (error) {
                console.error('Error handling room creation notification:', error);
            }
        });


        socket.on('update_status', async (data) => {
            try {
                const { status, customMessage } = data;
                await User.findByIdAndUpdate(socket.userId, {
                    'preferences.status': status,
                    'preferences.customMessage': customMessage || ''
                });

                const userRooms = await Room.find({ members: socket.userId }, '_id');

                for (const room of userRooms) {
                    socket.to(room._id.toString()).emit('user_status_updated', {
                        userId: socket.userId,
                        username: socket.user.username,
                        status: status,
                        customMessage: customMessage,
                        timestamp: new Date()
                    });
                }

                socket.emit('status_updated', {
                    success: true,
                    status: status,
                    customMessage: customMessage
                });

            } catch (error) {
                socket.emit(SOCKET_EVENTS.ERROR, {
                    message: 'Failed to update status',
                    error: error.message
                });
            }
        });


        socket.on('call_initiate', (data) => {
            const { recipientId, callType, offer } = data;
            const recipientData = onlineUsers.get(recipientId);

            if (recipientData) {
                io.to(recipientData.socketId).emit('call_incoming', {
                    callerId: socket.userId,
                    callerName: socket.user.username,
                    callType: callType,
                    offer: offer,
                    timestamp: new Date()
                });
            } else {
                socket.emit('call_failed', {
                    reason: 'User is not online',
                    recipientId: recipientId
                });
            }
        });

        socket.on('call_answer', (data) => {
            const { callerId, answer } = data;
            const callerData = onlineUsers.get(callerId);

            if (callerData) {
                io.to(callerData.socketId).emit('call_answered', {
                    answer: answer,
                    timestamp: new Date()
                });
            }
        });

        socket.on('call_end', (data) => {
            const { participantId } = data;
            const participantData = onlineUsers.get(participantId);

            if (participantData) {
                io.to(participantData.socketId).emit('call_ended', {
                    endedBy: socket.userId,
                    timestamp: new Date()
                });
            }
        });

        socket.on('file_share', async (data) => {
            try {
                const { roomId, fileName, fileUrl, fileSize, mimeType, recipientId } = data;

                const messageData = {
                    sender: socket.userId,
                    content: `📎 ${fileName}`,
                    type: MESSAGE_TYPES.FILE,
                    metadata: {
                        fileUrl: fileUrl,
                        fileName: fileName,
                        fileSize: fileSize,
                        mimeType: mimeType
                    }
                };

                if (roomId) {
                    messageData.room = roomId;
                    messageData.isPrivate = false;
                } else if (recipientId) {
                    messageData.recipient = recipientId;
                    messageData.isPrivate = true;
                } else {
                    socket.emit(SOCKET_EVENTS.ERROR, { message: 'Room ID or recipient ID is required' });
                    return;
                }

                const result = await messageService.createMessage(messageData);

                if (result.success) {
                    const message = result.data;
                    const fileMessageData = {
                        id: message._id,
                        content: message.content,
                        type: message.type,
                        sender: {
                            id: socket.userId,
                            username: socket.user.username,
                            avatar: socket.user.avatar
                        },
                        metadata: message.metadata,
                        timestamp: message.createdAt
                    };

                    if (roomId) {
                        fileMessageData.roomId = roomId;
                        socket.to(roomId).emit('file_shared', fileMessageData);
                    } else if (recipientId) {
                        fileMessageData.recipientId = recipientId;
                        const recipientData = onlineUsers.get(recipientId);
                        if (recipientData) {
                            io.to(recipientData.socketId).emit('file_shared', fileMessageData);
                        }
                    }

                    socket.emit('file_share_confirmed', {
                        success: true,
                        message: fileMessageData
                    });
                }

            } catch (error) {
                socket.emit(SOCKET_EVENTS.ERROR, {
                    message: 'Failed to share file',
                    error: error.message
                });
            }
        });


        socket.on('search_messages', async (data) => {
            try {
                const { query, roomId, limit = 20 } = data;

                if (!query || query.trim().length < 2) {
                    socket.emit('search_results', { messages: [], total: 0 });
                    return;
                }

                const searchParams = {
                    query: query.trim(),
                    userId: socket.userId,
                    limit: parseInt(limit)
                };

                if (roomId) {
                    searchParams.roomId = roomId;
                }

                const result = await messageService.searchMessages(searchParams);

                socket.emit('search_results', {
                    query: query,
                    messages: result.messages || [],
                    total: result.pagination?.totalMessages || 0,
                    timestamp: new Date()
                });

            } catch (error) {
                socket.emit(SOCKET_EVENTS.ERROR, {
                    message: 'Search failed',
                    error: error.message
                });
            }
        });

        socket.on('get_room_members', async (data) => {
            try {
                const { roomId } = data;

                const room = await Room.findById(roomId)
                    .populate('members', 'username avatar isOnline lastSeen')
                    .populate('creator', 'username avatar');

                if (!room) {
                    socket.emit(SOCKET_EVENTS.ERROR, { message: 'Room not found' });
                    return;
                }

                if (!room.isMember(socket.userId)) {
                    socket.emit(SOCKET_EVENTS.ERROR, { message: 'Access denied' });
                    return;
                }

                const members = room.members.map(member => ({
                    ...member.getPublicProfile(),
                    isAdmin: room.isAdmin(member._id),
                    isCreator: room.isCreator(member._id),
                    isCurrentlyOnline: onlineUsers.has(member._id.toString())
                }));

                socket.emit('room_members', {
                    roomId: roomId,
                    members: members,
                    memberCount: members.length,
                    timestamp: new Date()
                });

            } catch (error) {
                console.error('Error getting room members:', error);
                socket.emit(SOCKET_EVENTS.ERROR, {
                    message: 'Failed to get room members',
                    error: error.message
                });
            }
        });


        socket.on('activity_update', async () => {
            try {
                await User.findByIdAndUpdate(socket.userId, { lastSeen: new Date() });
                if (onlineUsers.has(socket.userId)) {
                    onlineUsers.get(socket.userId).lastActivity = new Date();
                }
            } catch (error) {
                console.error('Error updating user activity:', error);
            }
        });
    });

    const cleanupInterval = setInterval(cleanupTypingIndicators, 30000);

    process.on('SIGINT', () => {
        clearInterval(cleanupInterval);
    });

    process.on('SIGTERM', () => {
        clearInterval(cleanupInterval);
    });

    io.engine.on('connection_error', (err) => {
        console.error('Socket.io connection error:', err);
    });

};


export const getOnlineUsers = () => {
    return Array.from(onlineUsers.values()).map(({ user, connectedAt }) => ({
        userId: user._id,
        username: user.username,
        avatar: user.avatar,
        connectedAt
    }));
};


export const getOnlineUsersCount = () => {
    return onlineUsers.size;
};


export const isUserOnline = (userId) => {
    return onlineUsers.has(userId);
};


export const getTypingUsers = (roomId) => {
    const typingSet = typingUsers.get(roomId);
    return typingSet ? Array.from(typingSet) : [];
};


export const broadcastSystemMessage = (io, message, type = 'info') => {
    io.emit('system_message', {
        message,
        type,
        timestamp: new Date()
    });
};


export const sendNotificationToUser = (io, userId, notification) => {
    const userData = onlineUsers.get(userId);
    if (userData) {
        io.to(userData.socketId).emit('notification', {
            ...notification,
            timestamp: new Date()
        });
    }
};


export const broadcastToRoom = (io, roomId, event, data) => {
    io.to(roomId).emit(event, {
        ...data,
        timestamp: new Date()
    });
};


export { onlineUsers };