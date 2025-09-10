# CityGen - Interactive 3D City Generator

## Overview

CityGen is an interactive web application that generates procedural 3D cities in real-time using HTML5 Canvas. Users can customize city parameters like size, building density, height variations, and street width through an intuitive interface. The application features smooth camera controls for panning and zooming, multiple city presets, and real-time rendering of complex urban environments.

The project now relies entirely on a TypeScript-based React implementation, replacing the legacy standalone HTML build.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React with TypeScript**: Component-based architecture using React 18 with TypeScript for type safety
- **Vite Build System**: Modern build tool with hot module replacement for fast development
- **Canvas-Based Rendering**: Custom city rendering engine using HTML5 Canvas 2D context for high-performance graphics
- **Component Structure**: Modular components including CityGenerator (main controller), ControlPanel (parameter controls), LoadingScreen, and Toast notifications
- **State Management**: React hooks for local state management with real-time parameter updates

### Styling and UI
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Shadcn/ui Components**: Pre-built accessible UI components with consistent design
- **Dark Theme**: Custom dark color scheme optimized for the 3D city visualization
- **Responsive Design**: Mobile-friendly interface with touch support for canvas interactions

### 3D Graphics Engine
- **Custom City Engine**: Procedural city generation algorithm that creates buildings based on grid layouts
- **Camera System**: Interactive camera controller supporting pan, zoom, and smooth animations
- **Building Generation**: Algorithm generates varied building heights, colors, and window patterns
- **Real-time Rendering**: Efficient canvas rendering with animation frame optimization

### Backend Architecture
- **Express.js Server**: RESTful API server with middleware for logging and error handling
- **Development Mode**: Vite integration for hot reloading in development
- **Static File Serving**: Production build serving with proper asset handling

### Database Integration
- **Drizzle ORM**: Type-safe database operations with PostgreSQL support
- **Database Schema**: User management schema with UUID primary keys
- **Connection Pooling**: Neon Database serverless PostgreSQL connection

### Parameter System
- **City Presets**: Predefined configurations (Modern, Classic, Futuristic, Organic)
- **Real-time Updates**: Immediate visual feedback when adjusting parameters
- **Parameter Validation**: TypeScript interfaces ensure type safety for city configurations

## External Dependencies

### Core Libraries
- **React Ecosystem**: React 18, React DOM, React Router (Wouter)
- **TypeScript**: Full TypeScript support across frontend and backend
- **Vite**: Build tool with React plugin and development server

### UI Framework
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Accessible component primitives for complex UI elements
- **Shadcn/ui**: Pre-built component library built on Radix UI
- **Lucide React**: Icon library for consistent iconography

### Backend Services
- **Express.js**: Web application framework
- **Drizzle ORM**: Type-safe database toolkit
- **Neon Database**: Serverless PostgreSQL database service

### Development Tools
- **ESBuild**: Fast JavaScript bundler for production builds
- **PostCSS**: CSS processing with Autoprefixer
- **TSX**: TypeScript execution for development server

### Query Management
- **TanStack Query**: Data fetching and caching library for API interactions
- **React Hook Form**: Form handling with validation
- **Zod**: Schema validation library integrated with Drizzle

The application prioritizes performance with efficient canvas rendering, smooth animations, and real-time parameter updates. The modular architecture allows for easy extension of city generation algorithms and new preset configurations.