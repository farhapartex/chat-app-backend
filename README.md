# Real-time Chat Application Backend

A modern, scalable real-time chat application backend built with Node.js, Express.js, Socket.io, and MongoDB. Features include instant messaging, user presence tracking, room management, and comprehensive API endpoints for building chat applications.

## 🚀 Features

- **Real-time Messaging**: Instant messaging with Socket.io WebSockets
- **Multiple Chat Rooms**: Create and join public/private chat rooms
- **Private Messaging**: Direct messaging between users
- **User Presence**: Online/offline status tracking and typing indicators
- **Message Management**: Edit, delete, pin messages with reactions
- **Room Administration**: Admin controls and member management
- **User Authentication**: Secure JWT-based authentication
- **Message Search**: Full-text search across conversations
- **File Sharing**: Framework ready for file and media sharing

## 🛠️ Technology Stack

### **Programming Language**
- **Node.js** (v18+) - JavaScript runtime for server-side development
- **ES6+ Modules** - Modern JavaScript with import/export syntax

### **Framework & Libraries**
- **Express.js** - Fast, unopinionated web framework for Node.js
- **Socket.io** - Real-time bidirectional event-based communication
- **Mongoose** - MongoDB object modeling for Node.js
- **JWT (jsonwebtoken)** - Secure token-based authentication
- **bcryptjs** - Password hashing and encryption

### **Database**
- **MongoDB** - NoSQL document database
- **MongoDB Atlas** - Cloud-hosted MongoDB service

### **Security & Middleware**
- **Helmet** - Security headers and protection
- **CORS** - Cross-Origin Resource Sharing configuration
- **Express Rate Limit** - API rate limiting and abuse prevention
- **Express Validator** - Request validation and sanitization

## 🏗️ Why NoSQL Database Design?

### **Document-Based Flexibility**
Traditional relational databases struggle with chat applications due to their rigid schema requirements. Our chat application benefits from MongoDB's flexible document structure:

```javascript
// Messages can have different types and metadata
{
  _id: ObjectId,
  content: "Hello world!",
  type: "text",                    // Can be 'text', 'image', 'file'
  sender: ObjectId,
  room: ObjectId,
  reactions: [                     // Dynamic array of reactions
    { user: ObjectId, emoji: "👍", createdAt: Date },
    { user: ObjectId, emoji: "❤️", createdAt: Date }
  ],
  metadata: {                      // Flexible metadata for different message types
    fileUrl: "https://...",        // Only for file messages
    fileName: "document.pdf",
    fileSize: 1024000
  }
}
```

### **Scalability & Performance**
- **Horizontal Scaling**: MongoDB easily scales across multiple servers
- **Embedded Documents**: Store related data together for faster reads
- **Flexible Indexing**: Create indexes on any field for optimized queries
- **Real-time Aggregation**: Perfect for chat statistics and analytics

### **Schema Evolution**
Chat applications evolve rapidly with new features:
- Add new message types without schema migrations
- Introduce new user preferences dynamically
- Extend room settings without database downtime
- Support different room types with varying properties

### **JSON-Native**
- **API Responses**: Direct JSON output without ORM conversion overhead
- **Real-time Data**: Socket.io naturally works with JSON objects
- **Frontend Integration**: Seamless data flow to React/Vue/Angular applications

## 📦 Prerequisites

- **Node.js** (v18.0.0 or higher)
- **MongoDB Atlas Account** (free tier available) or local MongoDB installation
- **npm** or **yarn** package manager
- **Git** for version control

## 🚀 Quick Setup

### 1. Clone the Repository
```bash
git clone https://github.com/farhapartex/chat-app-backend
cd chat-app-backend
```

### 2. Install Dependencies
```bash
# Using yarn (recommended)
yarn install
```

### 3. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your configuration
nano .env
```

**Required Environment Variables:**
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database (MongoDB Atlas recommended)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chatapp?retryWrites=true&w=majority

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

### 4. MongoDB Atlas Setup (Recommended)

#### Create MongoDB Atlas Account:
1. Visit [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Click "Try Free" and create your account
3. Create a new cluster (select M0 Sandbox - FREE)
4. Choose AWS provider and region closest to you

#### Configure Database Access:
1. **Database Access**: Create a database user with read/write permissions
2. **Network Access**: Add your IP address (or 0.0.0.0/0 for development)
3. **Connect**: Get your connection string and add it to `.env`

### 5. Start the Application

#### Development Mode:
```bash
# With hot reload
yarn dev
```

#### Production Mode:
```bash
yarn start
```

### 6. Verify Installation
```bash
# Test server health
curl http://localhost:5000/health

# Expected response:
{
  "status": "OK",
  "message": "Chat API is running",
  "database": "connected",
  "uptime": 5.2
}
```

## 🧪 Testing the API

### Register a New User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com", 
    "password": "password123",
    "bio": "Test user account"
  }'
```

### Login User
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Create a Chat Room
```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "General Discussion",
    "description": "Welcome to our general chat room!",
    "type": "public",
    "category": "general"
  }'
```

## 📁 Project Structure

```
chat-app-backend/
├── src/
│   ├── config/
│   │   ├── database.js          # MongoDB connection configuration
│   │   └── socket.js            # Socket.io real-time event handlers
│   ├── controllers/
│   │   ├── authController.js    # Authentication HTTP endpoints
│   │   ├── messageController.js # Message management endpoints
│   │   └── roomController.js    # Room management endpoints
│   ├── middleware/
│   │   ├── auth.js              # JWT authentication middleware
│   │   └── errorHandler.js     # Global error handling
│   ├── models/
│   │   ├── User.js              # User schema and methods
│   │   ├── Room.js              # Chat room schema and methods
│   │   └── Message.js           # Message schema and methods
│   ├── routes/
│   │   ├── auth.js              # Authentication routes
│   │   ├── messages.js          # Message routes
│   │   └── rooms.js             # Room routes
│   ├── services/
│   │   ├── authService.js       # Authentication business logic
│   │   ├── messageService.js    # Message business logic
│   │   └── roomService.js       # Room business logic
│   ├── utils/
│   │   └── constants.js         # Application constants
│   └── app.js                   # Express application setup
├── server.js                    # Server entry point
├── package.json                 # Dependencies and scripts
├── .env.example                 # Environment variables template
└── README.md                    # Project documentation
```

## 🔧 Available Scripts

```json
{
  "scripts": {
    "start": "node server.js",           # Production server
    "dev": "nodemon server.js",          # Development with hot reload
    "test": "jest",                      # Run tests (when implemented)
    "lint": "eslint src/",               # Code linting
    "format": "prettier --write src/"    # Code formatting
  }
}
```

## 🌐 API Overview

The application provides comprehensive REST API endpoints:

- **Authentication** (`/api/auth/*`) - User registration, login, profile management
- **Rooms** (`/api/rooms/*`) - Chat room creation, management, discovery
- **Messages** (`/api/messages/*`) - Message operations, search, history

For complete API documentation, start the server and visit the interactive endpoints or check the controller files.

## 🔒 Security Features

- **JWT Authentication** with secure token generation and validation
- **Password Hashing** using bcrypt with salt rounds
- **Rate Limiting** to prevent API abuse and spam
- **Input Validation** with comprehensive sanitization
- **CORS Protection** with configurable origins
- **Security Headers** via Helmet middleware
- **MongoDB Injection** protection through Mongoose


**Built with ❤️ using modern Node.js and NoSQL technologies**