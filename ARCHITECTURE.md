# Booking-MCP System Architecture

## Overview
This project serves as the central orchestration layer (Backend Service) for Meital-Booking-DB. It provides an abstracted interface between external AI agents and the underlying Supabase PostgreSQL database.

## Design Philosophy (Repository Pattern)
To ensure long-term maintainability, this service implements a Repository Pattern. The AI agents do not query database tables directly. Instead, they interact with clean, business-logic-driven services.

### Core Architecture Components:
1.  **Service Layer (The Repository):** Logic-encapsulated functions (e.g., `BookingService.getAllUpcoming()`) that handle complex JOINs and data normalization.
2.  **Schema Mapping:** A translation layer that converts database-centric structures (foreign keys, normalized tables) into business-centric JSON objects.
3.  **Security Layer (RLS):** All interactions are bound by database-level Row Level Security policies defined in Supabase migrations.
4.  **Event-Driven Ready:** Designed for future Webhook integration to allow proactive data updates.

## Current Toolset
- `get_appointments`: Fetches flattened, joined appointment data.
- `find_free_slots`: Analyzes database gaps to identify availability.
- `daily_summary`: Aggregates business performance and health data.

## Goal
The goal is to maintain a "Stable Backend API" where business logic lives in the MCP server, and database schema changes do not break the AI agent's ability to operate.