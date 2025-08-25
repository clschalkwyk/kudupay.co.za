# ---- Build stage: compile TypeScript ----
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy sources and tsconfig
COPY tsconfig.json ./
COPY src ./src

# Build to dist/
RUN npm run build

# ---- Runtime stage: AWS Lambda Node.js 20 base ----
FROM public.ecr.aws/lambda/nodejs:20

# Set workdir to Lambda task directory (already default)
WORKDIR /var/task

# Copy only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS
COPY --from=build /app/dist ./dist

# If you read config from .env at runtime, you can COPY it as well (optional)
# COPY .env ./.env

# Tell Lambda which handler to invoke: file.functionName
# Here we point to dist/lambda.js and its exported 'handler'
CMD ["dist/lambda.handler"]
