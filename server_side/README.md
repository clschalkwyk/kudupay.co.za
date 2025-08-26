KuduQ Consumer – Chalice API Overview

This repository contains an AWS Chalice application that powers parts of the KuduPay platform. It exposes a small HTTP API and an SQS event consumer to handle payments and messaging workflows.

Location
- Chalice app entrypoint: kuduq-consumer\app.py
- Supporting modules: kuduq-consumer\chalicelib\
    - mailer.py – SMTP email utility
    - parsemessage.py – SQS message schema parsing
    - rapydmoney.py – Rapyd Money API client

Key Features
- HTTP endpoints via API Gateway + Lambda (Chalice)
- SQS queue consumer for platform events
- SMTP-based transactional emails (welcome and magic-link)
- Rapyd Money integration for balance checks, transfers, and minting

Quick Start
- Requirements: Python 3.10+, pip, AWS credentials with permission to deploy Chalice apps.
- Install dependencies:
    - make install
    - or: python -m pip install --upgrade pip && python -m pip install -r kuduq-consumer\requirements.txt
- Run locally:
    - make local (default port 8000)
    - Example: curl http://127.0.0.1:8000/pings
- Deploy to AWS:
    - make deploy             (default stage: dev)
    - make deploy STAGE=prod  (or any configured stage)
- Utility targets:
    - make logs / make tail
    - make url (prints the API Gateway URL for current stage)
    - make delete (remove the deployed app for current stage)

Environment Configuration
Environment variables are primarily defined per stage in kuduq-consumer\.chalice\config.json. Relevant keys include:
- LOG_LEVEL, APP_ENV
- SQS_QUEUE_NAME (e.g., "kuduq.fifo")
- SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, FRONTEND_URL
- RAPYD_MONEY_API_TOKEN, RAPYD_MONEY_BASE_URL
- DB_TABLE_NAME, DB_TABLE_REGION

Note: app.py also calls load_dotenv(), so a .env file in kuduq-consumer can supply values during local runs. Do not commit real secrets.

HTTP API Endpoints (kuduq-consumer\app.py)
- GET /pings
    - Simple health check.
    - Response: { "message": "pong" }

- POST /can-pay
    - Purpose: Check if a student can pay a given amount.
    - Body (JSON): { "studentId": string, "amount_cents": integer }
    - Logic: Fetches balance via RapydMoney; compares to amount.
    - Response:
        - { "result": true } on sufficient funds
        - { "result": false, "message": "Insufficient funds" } or { "result": false, "message": "User not found" }

- POST /pay-user
    - Purpose: Pay a merchant from a student’s balance.
    - Body (JSON): { "merchantId": string, "studentId": string, "idempotency_key": string, "amount_cents": integer }
    - Response (examples):
        - { "result": true,  "message": "Sponsor user transfer successful" }
        - { "result": false, "message": "Sponsor transfer failed" }

- POST /fund-user
    - Purpose: Mint funds to a sponsor account.
    - Body (JSON): { "sponsorId": string, "amount_cents": integer }
    - Response (current implementation): { "message": "User can pay" } on processed path; { "message": "User cannot pay" } if missing sponsorId.

- POST /sponsor-user
    - Purpose: Transfer funds from a sponsor to a student.
    - Body (JSON): { "sponsorId": string, "studentId": string, "idempotency_key": string, "amount_cents": integer }
    - Response (examples):
        - { "result": true,  "message": "Sponsor user transfer successful" }
        - { "result": false, "message": "Sponsor transfer failed" }

SQS Event Consumer
- Decorator: @app.on_sqs_message(queue=QUEUE_NAME, batch_size=10)
- QUEUE_NAME comes from the stage environment (SQS_QUEUE_NAME in .chalice/config.json).
- Processes each message as JSON. If the body contains an SNS-wrapped payload with a top-level "Message" field, it attempts to parse the inner JSON.
- Supported event types (via parse_sqs_message):
    - USER_REGISTERED
        - Sends a welcome email via SMTPMailer.
        - Registers the user with Rapyd Money and activates pay.
    - STUDENT_MAGIC_LINK_REQUESTED
        - Sends a magic-link email with the provided token.

Testing Locally
- The HTTP endpoints are available via chalice local. Example:
    - curl -X POST http://127.0.0.1:8000/can-pay -H "Content-Type: application/json" -d "{\"studentId\":\"user-123\",\"amount_cents\":5000}"
- SQS triggers are not invoked by chalice local; test them by deploying and sending messages to the configured SQS queue in AWS, or by writing unit tests that call handle_my_queue directly.

Project Layout
- Makefile – helper targets for local run, deploy, logs, etc.
- kuduq-consumer\app.py – Chalice routes and SQS handler
- kuduq-consumer\chalicelib\* – helpers (Rapyd, mailer, message parsing, DynamoDB)
- kuduq-consumer\.chalice\config.json – Chalice stage config and env vars

Dependencies
- See kuduq-consumer\requirements.txt. Core libs include: chalice, boto3, python-dotenv, pydantic, requests.

Security Note
- Ensure secrets are provided via environment variables or secure secret stores. Avoid committing real credentials or tokens to source control.
