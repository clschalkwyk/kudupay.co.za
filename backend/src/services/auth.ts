import {v4 as uuidv4} from 'uuid';
import bcrypt from 'bcrypt';
import jwt, {Secret, SignOptions} from 'jsonwebtoken';
import {Request} from 'express';
import {DynamoDBInterface, DynamoItem} from "./dynamo.db";
import SqsService from './sqs';

require('dotenv').config();

const DB_TABLE_NAME = process.env.DB_TABLE_NAME || 'users';
const DB_TABLE_REGION = process.env.DB_TABLE_REGION || 'af-south-1';

export enum Roles {
    STUDENT = 'student',
    SPONSOR = 'sponsor',
    MERCHANT = 'merchant',
    ADMIN = 'admin'
}

// User interface based on the project requirements
export interface iUser {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    password_hash?: string;
    studentNumber?: string;
    role: 'student' | 'sponsor' | 'merchant' | 'admin';
    sponsorType?: 'parent' | 'ngo' | 'government' | 'corporate';
    pin?: number;
    is_active: boolean;
    created_at: string;
}

// Registration request interface
export interface iRegisterRequest {
    firstName: string;
    lastName: string;
    email: string;
    studentNumber?: string;
    password?: string;
    role: 'student' | 'sponsor' | 'merchant' | 'admin';
    sponsorType?: 'parent' | 'ngo' | 'government' | 'corporate';
}

// Login request interface
export interface iLoginRequest {
    email: string;
    password?: string;
}

// JWT payload interface
export interface iJWTPayload {
    userId: string;
    email: string;
    role: string;
}

// In-memory user storage (replace with database in production)
const users: iUser[] = [];
const blacklistedTokens: Set<string> = new Set();

// JWT secret (should be in environment variables)
const JWT_SECRET: string = (process.env.JWT_SECRET as string || 'kudupay-secret-key-2025');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h' ;
const SALT_ROUNDS = 12;

/**
 * Generate a unique user ID
 */
function generateUserId(): string {
    return uuidv4();
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate password strength
 */
function isValidPassword(password: string | undefined): boolean {
    if (!password) return false;
    // At least 8 characters, contains letters and numbers
    return password.length >= 8 && /[A-Za-z]/.test(<string>password) && /\d/.test(<string>password);
}

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password: string | undefined): Promise<string> {
    return await bcrypt.hash(<string>password, SALT_ROUNDS);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password: string, hash: string | undefined): Promise<boolean> {
    return await bcrypt.compare(password, <string>hash);
}

/**
 * Generate JWT token
 */
export function generateToken(payload: iJWTPayload): string {
    return jwt.sign(payload, JWT_SECRET, <SignOptions>{expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): iJWTPayload | null {
    try {
        if (blacklistedTokens.has(token)) {
            return null;
        }
        return jwt.verify(token, JWT_SECRET) as iJWTPayload;
    } catch (error) {
        return null;
    }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    return null;
}

/**
 * Register a new user
 */
export async function registerUser(userData: iRegisterRequest): Promise<{
    user: Omit<iUser, 'password_hash'>,
    token: string
} | { error: string }> {
    try {
        // Validate input data
        if (!userData.firstName || userData.firstName.trim().length < 2) {
            return {error: 'First name must be at least 2 characters long'};
        }

        if (!userData.lastName || userData.lastName.trim().length < 2) {
            return {error: 'Last name must be at least 2 characters long'};
        }

        if (!isValidEmail(userData.email)) {
            return {error: 'Invalid email format'};
        }

        if (!['student', 'sponsor', 'merchant', 'admin'].includes(userData.role)) {
            return {error: 'Invalid role specified'};
        }

        if (userData.role != Roles.STUDENT && !isValidPassword(userData.password)) {
            return {error: 'Password must be at least 8 characters long and contain letters and numbers'};
        }

        // Check if user already exists
        const existingUser = await findUserByEmail(userData.email);
        if (existingUser) {
            return {error: 'User with this email already exists'};
        }

        let password_hash;
        if (userData.role != Roles.STUDENT) {
            // Hash password
            password_hash = await hashPassword(userData.password);
        }

        // Create new user
        const newUser: iUser = {
            id: generateUserId(),
            firstName: userData.firstName.trim(),
            lastName: userData.lastName.trim(),
            email: userData.email.toLowerCase(),
            studentNumber: userData.studentNumber ?? 'N/A',
            password_hash,
            role: userData.role,
            sponsorType: userData.role === Roles.SPONSOR ? (userData.sponsorType || 'parent') : undefined,
            is_active: true,
            created_at: new Date().toISOString()
        };

        console.log({DB_TABLE_NAME})

        // Save user (in production, save to database)
        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        const item: DynamoItem = {
            Pk: `${newUser.role.toUpperCase()}#${newUser.id}`,
            Sk: `USER`,
            ...newUser
        }
        await db.putItem(item);

        // After successful DB write, publish registration event to SQS (non-blocking)
        try {
            const queueUrl = process.env.SQS_QUEUE_URL;
            if (queueUrl) {
                const sqs = new SqsService();
                const event = {
                    eventType: 'USER_REGISTERED',
                    timestamp: new Date().toISOString(),
                    user: {
                        id: newUser.id,
                        email: newUser.email,
                        role: newUser.role,
                        firstName: newUser.firstName,
                        lastName: newUser.lastName,
                        studentNumber: newUser.studentNumber ?? null,
                        is_active: newUser.is_active,
                        created_at: newUser.created_at
                    },
                    keys: {
                        Pk: item.Pk,
                        Sk: item.Sk
                    },
                    table: DB_TABLE_NAME,
                    source: 'auth.registerUser'
                };
                // For FIFO queues, set group and stable deduplication id
                await sqs.send(event, { groupId: 'user-registrations', deduplicationId: newUser.id });
            } else {
                console.warn('SQS_QUEUE_URL not set. Skipping user registration SQS notification.');
            }
        } catch (sqsErr) {
            console.error('Failed to publish USER_REGISTERED event to SQS:', sqsErr);
        }



        // Generate JWT token
        const token = generateToken({
            userId: newUser.id,
            email: newUser.email,
            role: newUser.role
        });

        // Return user data without password hash
        const {password_hash: _, ...userWithoutPassword} = newUser;

        return {user: userWithoutPassword, token};
    } catch (error) {
        console.error('Registration error:', error);
        return {error: 'Registration failed. Please try again.'};
    }
}

/**
 * Login user with email and password
 */
export async function loginUser(credentials: iLoginRequest): Promise<{
    user: Omit<iUser, 'password_hash'>,
    token: string
} | { error: string }> {
    try {
        // Validate input
        if (!credentials.email) {
            return {error: 'Email is required'};
        }

        // Find user by email
        const user = await findUserByEmail(credentials.email);
        if (!user) {
            return {error: 'Invalid email or password'};
        }

        // Check if user is active
        if (!user.is_active) {
            return {error: 'Account is deactivated. Please contact support.'};
        }

        // Handle authentication based on user role
        if (user.role === Roles.STUDENT) {
            // Students don't have passwords, so we just verify they exist and are active
            // Additional verification could be added here (e.g., student number)

            // send magic link for login via SQS event (no direct SMTP)
            console.log("this is a student login");
            // generate login magic token with 15min timeout
            const magicToken = await generateMagicLinkTokenForStudent(credentials.email);
            try {
                const queueUrl = process.env.SQS_QUEUE_URL;
                if (queueUrl && magicToken) {
                    const sqs = new SqsService();
                    const event = {
                        eventType: 'STUDENT_MAGIC_LINK_REQUESTED',
                        timestamp: new Date().toISOString(),
                        email: user.email,
                        magicToken,
                        linkUrl: `https://www.kudupay.co.za/for-students/login/verify-intent?token=${magicToken}`,
                        source: 'auth.loginUser'
                    };
                    await sqs.send(event, { groupId: 'student-magic-links', deduplicationId: magicToken });
                } else {
                    console.warn('SQS_QUEUE_URL not set or magicToken missing. Skipping SQS notification.');
                }
            } catch (sqsErr) {
                console.error('Failed to publish STUDENT_MAGIC_LINK_REQUESTED event to SQS:', sqsErr);
            }

        } else {
            // Non-students require password authentication
            if (!credentials.password) {
                return {error: 'Password is required'};
            }
            console.log(credentials)

            const isPasswordValid = await comparePassword(credentials.password, user.password_hash);
            if (!isPasswordValid) {
                return {error: 'Invalid email or password'};
            }
        }

        // Generate JWT token
        const token = generateToken({
            userId: user.id,
            email: user.email,
            role: user.role
        });

        // Return user data without password hash
        const {password_hash: _, ...userWithoutPassword} = user;

        return {user: userWithoutPassword, token};
    } catch (error) {
        console.error('Login error:', error);
        return {error: 'Login failed. Please try again.'};
    }
}

/**
 * Logout user by blacklisting the token
 */
export function logoutUser(token: string): { success: boolean, message: string } {
    try {
        if (!token) {
            return {success: false, message: 'No token provided'};
        }

        // Verify token is valid before blacklisting
        const payload = verifyToken(token);
        if (!payload) {
            return {success: false, message: 'Invalid token'};
        }

        // Add token to blacklist
        blacklistedTokens.add(token);

        return {success: true, message: 'User logged out successfully'};
    } catch (error) {
        console.error('Logout error:', error);
        return {success: false, message: 'Logout failed'};
    }
}

/**
 * Get current user from JWT token
 */
export async function getCurrentUser(token: string): Promise<{ user: Omit<iUser, 'password_hash'> } | { error: string }> {
    try {
        if (!token) {
            return {error: 'No token provided'};
        }

        // Verify token
        const payload = verifyToken(token);
        if (!payload) {
            return {error: 'Invalid or expired token'};
        }

        // Find user by ID
        const user = await findUserById(payload.userId);
        if (!user) {
            return {error: 'User not found'};
        }

        // Check if user is still active
        if (!user.is_active) {
            return {error: 'Account is deactivated'};
        }

        // Return user data without password hash
        const {password_hash: _, ...userWithoutPassword} = user;

        return {user: userWithoutPassword};
    } catch (error) {
        console.error('Get current user error:', error);
        return {error: 'Failed to get user information'};
    }
}

/**
 * Find user by email (utility function)
 */
export async function findUserByEmail(email: string): Promise<iUser | null> {
    try {
        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);

        // Query using the email-role-index GSI
        const result = await db.queryIndex({
            IndexName: 'email-role-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email.toLowerCase()
            }
        });

        if (result.Items && result.Items.length > 0) {
            // Return the first matching user
            const userData = result.Items[0];
            return {
                id: userData.id,
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                password_hash: userData.password_hash,
                studentNumber: userData.studentNumber,
                role: userData.role,
                pin: userData.pin,
                is_active: userData.is_active,
                created_at: userData.created_at
            } as iUser;
        }

        return null;
    } catch (error) {
        console.error('Error finding user by email:', error);
        return null;
    }
}

export async function generateMagicLinkTokenForStudent(email: string): Promise<string | null> {
    try {
        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        const result = await db.queryIndex({
            IndexName: 'email-role-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email.toLowerCase()
            }
        });
        if (result.Items && result.Items.length > 0) {
            const userData = result.Items[0];
            if (userData.role !== Roles.STUDENT) {
                return null;
            }
            const loginToken = uuidv4();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            // save on the student account
            await db.updateItem({
                Pk: userData.role.toUpperCase() + '#' + userData.id,
                Sk: 'USER',
                UpdateExpression: 'SET #loginToken = :loginToken, #magicTokenExpiresAt = :expiresAt',
                ExpressionAttributeNames: {
                    '#loginToken': 'loginToken',
                    '#magicTokenExpiresAt': 'magicTokenExpiresAt'
                },
                ExpressionAttributeValues: {
                    ':loginToken': loginToken,
                    ':expiresAt': expiresAt
                }
            });
            return loginToken;
        }
        return null;
    }catch (error) {
        console.error('Error generating magic token:', error);
        return null;
    }
}

export async function verifyMagicLinkToken(token: string): Promise<{ user: Omit<iUser, 'password_hash'>; token: string } | { error: string }> {
    try {
        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        
        // Scan for user with matching loginToken
        const result = await db.scan({
            FilterExpression: 'loginToken = :token AND #role = :role',
            ExpressionAttributeNames: {
                '#role': 'role'
            },
            ExpressionAttributeValues: {
                ':token': token,
                ':role': Roles.STUDENT
            }
        });

        if (!result.Items || result.Items.length === 0) {
            return { error: 'Invalid or expired magic link token' };
        }

        const userData = result.Items[0];
        
        // Check if token has expired
        if (userData.magicTokenExpiresAt) {
            const expiresAt = new Date(userData.magicTokenExpiresAt);
            const now = new Date();
            if (now > expiresAt) {
                return { error: 'Magic link token has expired' };
            }
        } else {
            return { error: 'Invalid magic link token' };
        }

        // Check if user is active
        if (!userData.is_active) {
            return { error: 'User account is deactivated' };
        }

        // Clear the magic link token after successful verification
        await db.updateItem({
            Pk: userData.role.toUpperCase() + '#' + userData.id,
            Sk: 'USER',
            UpdateExpression: 'REMOVE loginToken, magicTokenExpiresAt'
        });

        // Generate JWT token for the user
        const jwtPayload: iJWTPayload = {
            userId: userData.id,
            email: userData.email,
            role: userData.role
        };
        const jwtToken = generateToken(jwtPayload);

        const user: Omit<iUser, 'password_hash'> = {
            id: userData.id,
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
            studentNumber: userData.studentNumber,
            role: userData.role,
            pin: userData.pin,
            is_active: userData.is_active,
            created_at: userData.created_at
        };

        return { user, token: jwtToken };
    } catch (error) {
        console.error('Error verifying magic link token:', error);
        return { error: 'Internal server error' };
    }
}

/**
 * Find user by email and role (utility function)
 */
export async function findUserByEmailAndRole(email: string, role: Roles): Promise<iUser | null> {
    try {
        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);

        // Query using the email-role-index GSI
        const result = await db.queryIndex({
            IndexName: 'email-role-index',
            KeyConditionExpression: 'email = :email and #role = :role',
            ExpressionAttributeNames :{
                '#role': 'role'
            },
            ExpressionAttributeValues: {
                ':email': email.toLowerCase(),
                ':role': role
            }
        });

        if (result.Items && result.Items.length > 0) {
            // Return the first matching user
            const userData = result.Items[0];
            return {
                id: userData.id,
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                password_hash: userData.password_hash,
                studentNumber: userData.studentNumber,
                role: userData.role,
                pin: userData.pin,
                is_active: userData.is_active,
                created_at: userData.created_at
            } as iUser;
        }

        return null;
    } catch (error) {
        console.error('Error finding user by email:', error);
        return null;
    }
}

/**
 * Find user by ID (utility function)
 */
export async function findUserById(id: string): Promise<iUser | null> {
    try {
        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);

        // We need to scan for the user since we don't know the role
        // In a production system, you might want to store user data with a simpler key structure
        const result = await db.scan({
            FilterExpression: 'id = :id',
            ExpressionAttributeValues: {
                ':id': id
            }
        });

        if (result.Items && result.Items.length > 0) {
            const userData = result.Items[0];
            return {
                id: userData.id,
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                password_hash: userData.password_hash,
                studentNumber: userData.studentNumber,
                role: userData.role,
                pin: userData.pin,
                is_active: userData.is_active,
                created_at: userData.created_at
            } as iUser;
        }

        return null;
    } catch (error) {
        console.error('Error finding user by ID:', error);
        return null;
    }
}

/**
 * Get all users (admin function)
 */
export function getAllUsers(): Omit<iUser, 'password_hash'>[] {
    return users.map(({password_hash: _, ...user}) => user);
}

/**
 * Deactivate user account
 */
export function deactivateUser(userId: string): { success: boolean, message: string } {
    const user = users.find(u => u.id === userId);
    if (!user) {
        return {success: false, message: 'User not found'};
    }

    user.is_active = false;
    return {success: true, message: 'User account deactivated'};
}

/**
 * Middleware helper to authenticate requests
 */
export async function authenticateToken(req: Request): Promise<{ user: Omit<iUser, 'password_hash'> } | { error: string }> {
    const token = extractTokenFromHeader(req);
    if (!token) {
        return {error: 'Access token required'};
    }

    return await getCurrentUser(token);
}