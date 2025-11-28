# TIF-IDE: Collaborative Web-based IDE

A collaborative, web-based Integrated Development Environment (IDE) built with Node.js, Express, Socket.IO, and Docker. This platform allows multiple users to collaborate in real-time on coding projects with a shared terminal environment.

## Features

- **Real-time Collaboration**: Multiple users can work together in the same coding environment
- **Web-based Terminal**: Interactive terminal running in Docker containers
- **File Management**: Create, edit, and manage files and directories
- **Multi-language Support**: Run code in various programming languages (Java, Python, C++, JavaScript, TypeScript)
- **User Authentication**: Secure login and signup system with password encryption
- **Room-based Collaboration**: Create and join coding rooms for team projects
- **File Download**: Download entire project folders as ZIP archives
- **Activity Tracking**: Monitor user activities and actions within the platform

## Tech Stack

- **Backend**: Node.js with Express.js (TypeScript)
- **Database**: SQLite with Drizzle ORM
- **Real-time Communication**: Socket.IO
- **Containerization**: Docker
- **Frontend**: HTML/CSS/JavaScript with Monaco Editor
- **Authentication**: JWT (JSON Web Tokens) with bcrypt password hashing

## Prerequisites

- Node.js (v20 or higher)
- Docker (for containerized terminal environments)
- npm or yarn package manager

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd tif-ide/server
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:
   Create a `.env` file in the server directory with the following variables:

```env
DATABASE_URL=db.sqlite
JWT_SECRET=your_jwt_secret_key
PORT=3000
```

4. Run database migrations:

```bash
npm run db:migrate
```

5. Create an admin user:

```bash
npm run create-admin
```

## Development

To run the development server with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000` by default.

## Production Build

1. Build the TypeScript code:

```bash
npm run build
```

2. Start the production server:

```bash
npm start
```

## Docker Deployment

The application can be deployed using Docker with the provided build script:

```bash
./build.sh
```

This script will:

1. Build the terminal Docker image if it doesn't exist
2. Start the application using Docker Compose

### Docker Configuration

- **Main Application**: Built from `Dockerfile`
- **Terminal Environment**: Built from `Dockerfile.terminal` (Ubuntu-based with multiple programming languages)
- **Docker Compose**: Configured in `docker-compose.yml`

## Project Structure

```
server/
├── src/
│   ├── db/           # Database schema and migrations
│   ├── routes/       # API routes (users, rooms, admin)
│   ├── sockets/      # Socket.IO real-time communication
│   ├── services/     # Business logic
│   ├── middleware/   # Authentication middleware
│   ├── lib/          # Utility functions
│   └── config.ts     # Application configuration
├── rooms/            # User-created project rooms
├── static/           # Frontend assets and Monaco Editor
├── drizzle/          # Database migrations
├── dist/             # Compiled JavaScript output
├── Dockerfile        # Main application Docker configuration
├── Dockerfile.terminal # Terminal environment Docker configuration
└── docker-compose.yml # Docker Compose configuration
```

## API Endpoints

### Authentication

- `POST /api/users/signup` - Create a new user account
- `POST /api/users/signin` - Login to existing account
- `POST /api/users/logout` - Logout (authenticated)
- `GET /api/users/me` - Get current user info (authenticated)

### Rooms

- `GET /api/rooms` - List all rooms
- `GET /api/rooms/check/:roomId` - Check if a room exists
- `GET /api/rooms/explore/:roomId` - Explore files in a room
- `GET /api/rooms/download/:roomId` - Download room as ZIP (authenticated)

### Admin (Admin-only)

- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:id` - Get user by ID
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/activities` - Get user activity logs

## Database Schema

The application uses SQLite with the following tables:

- `users`: User accounts with authentication details
- `rooms`: Project rooms created by users
- `contributors`: Many-to-many relationship between users and rooms
- `users_activity`: User activity tracking

## Scripts

- `npm run dev` - Start development server with auto-reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server
- `npm run db:generate` - Generate database migrations
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with initial data
- `npm run create-admin` - Create admin user account

## Terminal Features

The integrated terminal supports:

- Multiple programming languages (Java, Python, C++, JavaScript, TypeScript)
- Direct code execution within the IDE
- Full bash shell environment in Docker containers
- Real-time collaboration in terminal sessions

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.

## Authors

- Built with Node.js, Express, Socket.IO, and Docker
- Uses Drizzle ORM for database management
- Features Monaco Editor for code editing

```

This README provides a comprehensive overview of your collaborative IDE project. It covers the key features, technology stack, installation instructions, usage guidelines, API endpoints, and project structure. The document is organized to help both new developers and users understand and use the application effectively.
```
