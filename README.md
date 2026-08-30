# IBVAP

Intelligent Border Video Analytics Platform.

## Architecture overview

IBVAP is designed around a clean separation of concerns:

- React frontend for operator experience and monitoring
- Node.js + Express backend for authentication, coordination, admin, and API services
- Python AI engine for video ingestion, computer vision, tracking, context analysis, and risk scoring
- SQL database for persistent application state
- Redis for transient runtime cache, streams, and rate-limiting
- Local storage for evidence snapshots and clips
- Docker and monitoring services for deployment and observability

## Core design principle

Detection -> Context -> Behavior -> Risk -> Action

A raw detection is never treated as an immediate critical security alert. The AI engine adds context, behavior, and temporal confirmation before risk scoring and alerts.

## Recommended service boundaries

- Frontend: React + Vite + Tailwind, not business logic heavy
- Backend: main application API, auth, RBAC, camera metadata, event orchestration
- AI Engine: video processing, CV models, tracking, OCR, scene understanding
- Database: persistent metadata and records
- Redis: temporary state, queues, live session data
- Storage: evidence media only, not primary app data

## High-level flow

CCTV / RTSP -> AI Engine -> Backend -> SQL / Redis -> Frontend Dashboard

The AI engine emits structured event data: detections, track activity, risk, and evidence references. The backend stores metadata in SQL, transient/session state in Redis, and exposes APIs/WebSockets to the frontend.

## Folder structure

- frontend/: React application shell
- backend/: main Node.js API backend
- ai_engine/: Python AI and CV processing service
- database/: schema and migration planning
- storage/: evidence media storage
- infra/: infrastructure and observability scaffolding
- docs/: architecture and operational docs
- scripts/: automation scripts

## Important guardrails

- No direct YOLO/OpenCV inference inside Node.js
- No Redis as the primary database
- No evidence media inside the SQL database
- No facial recognition as a critical requirement
- Use environment variables for secrets and configuration
- Keep each component modular and scalable without overengineering

## Next step

This repository is intentionally scaffolded only for architecture planning. Actual feature implementation will begin only after the user confirms: START BUILDING
