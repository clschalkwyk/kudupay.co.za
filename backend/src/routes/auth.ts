import {Router, Request, Response} from 'express';
import {registerUser, loginUser, logoutUser, getCurrentUser, verifyMagicLinkToken} from "../services/auth";

const router = Router();

// POST /api/auth/register - Create account for students, sponsors, and merchants
router.post('/register', async (req: Request, res: Response) => {
    const {
        firstName, 
        lastName, 
        email, 
        studentNumber, 
        password, 
        role,
        sponsorType,
        // Merchant-specific fields
        businessName,
        category,
        registrationNumber,
        whatsappNumber
    } = req.body;

    try {
        // Validate merchant-specific fields if role is merchant
        if (role === 'merchant') {
            if (!businessName || !firstName || !lastName || !email || !password) {
                return res.status(400).json({
                    error: 'Business name, email, owner first name, owner last name, and password are required for merchant registration'
                });
            }
        }

        const result = await registerUser({firstName, lastName, email, studentNumber, password, role, sponsorType});

        if ('error' in result) {
            return res.status(400).json({
                error: result.error
            });
        }

        // Handle merchant-specific business data storage
        if (role === 'merchant') {
            const {DynamoDBInterface} = require('../services/dynamo.db');
            const DB_TABLE_NAME = process.env.DB_TABLE_NAME || 'users';
            const DB_TABLE_REGION = process.env.DB_TABLE_REGION || 'af-south-1';
            
            const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
            const merchantBusinessData = {
                Pk: `MERCHANT#${result.user.id}`,
                Sk: 'BUSINESS_INFO',
                businessName,
                category,
                registrationNumber: registrationNumber || null,
                whatsappNumber: whatsappNumber || null,
                approved: true, // Auto-approve for now
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            await db.putItem(merchantBusinessData);

            // Return merchant-specific response format
            return res.status(201).json({
                message: 'Merchant registered successfully! Welcome to KuduPay.',
                data: {
                    user: result.user,
                    token: result.token,
                    merchant: {
                        id: result.user.id,
                        businessName,
                        email: result.user.email,
                        firstName: result.user.firstName,
                        lastName: result.user.lastName,
                        category,
                        registrationNumber,
                        whatsappNumber,
                        approved: true,
                        isOnline: false,
                        status: 'active',
                        created_at: result.user.created_at
                    }
                }
            });
        }

        // Return standard response for students and sponsors
        return res.status(201).json({
            message: 'User registered successfully',
            data: {
                user: result.user,
                token: result.token
            }
        });
    } catch (error) {
        console.error('Registration route error:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// POST /api/auth/login - JWT-based auth
router.post('/login', async (req: Request, res: Response) => {
    const {email, password} = req.body;

    try {
        const result = await loginUser({email, password});

        if ('error' in result) {
            return res.status(401).json({
                error: result.error
            });
        }

        return res.status(200).json({
            message: 'User logged in successfully',
            data: {
                user: result.user,
                token: result.token
            }
        });
    } catch (error) {
        console.error('Login route error:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// POST /api/auth/loginStudent - JWT-based auth
router.post('/loginStudent', async (req: Request, res: Response) => {
    const {email} = req.body;

    try {
        const result = await loginUser({email});

        if ('error' in result) {
            return res.status(401).json({
                error: result.error
            });
        }

        return res.status(200).json({
            message: 'User logged in successfully',
            data: {
                user: result.user,
                token: result.token
            }
        });
    } catch (error) {
        console.error('Login route error:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// GET /api/auth/verify - Verify JWT token
router.get('/verify', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'No token provided'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const result = await getCurrentUser(token);

        if ('error' in result) {
            return res.status(401).json({
                error: result.error
            });
        }

        return res.status(200).json({
            message: 'Token verified successfully',
            data: {
                user: result.user
            }
        });
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// POST /api/auth/logout - Logout user
router.post('/logout', (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'No token provided'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const result = logoutUser(token);

        if (!result.success) {
            return res.status(400).json({
                error: result.message
            });
        }

        return res.status(200).json({
            message: result.message
        });
    } catch (error) {
        console.error('Logout route error:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// GET /api/auth/me - Get current user info
router.get('/me', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'No token provided'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const result = await getCurrentUser(token);

        if ('error' in result) {
            return res.status(401).json({
                error: result.error
            });
        }

        return res.status(200).json({
            message: 'User information retrieved successfully',
            data: {
                user: result.user
            }
        });
    } catch (error) {
        console.error('Get current user error:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// POST /api/auth/verify-magic-link - Verify magic link token
router.post('/verify-magic-link', async (req: Request, res: Response) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({
            error: 'Token is required'
        });
    }

    try {
        const result = await verifyMagicLinkToken(token);

        if ('error' in result) {
            return res.status(401).json({
                error: result.error
            });
        }

        return res.status(200).json({
            message: 'Magic link verified successfully',
            data: {
                user: result.user,
                token: result.token
            }
        });
    } catch (error) {
        console.error('Magic link verification route error:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
});

export default router;