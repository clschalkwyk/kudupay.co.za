// Rapyd Money Stablecoin API Service
// Base URL: https://seal-app-qp9cc.ondigitalocean.app/api/v1

const BASE_URL = 'https://seal-app-qp9cc.ondigitalocean.app/api/v1';

// User interface based on the API schema
export interface User {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  imageUrl?: string | null;
  enabledPay?: boolean | null;
  role: 'ADMIN' | 'STUDENT' | 'MERCHANT'| 'SPONSOR';
  publicKey?: string | null;
  paymentIdentifier?: string | null;
  businessId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Request interfaces
export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
}

export interface CreateBankAccountRequest {
  accountHolder: string;
  accountNumber: string;
  branchCode: string;
  bankName: string;
}

export interface MintRequest {
  transactionAmount: number;
  transactionRecipient: string;
  transactionNotes: string;
}

// Response interfaces
export interface CreateUserResponse {
  user: User;
}

export interface GetUsersResponse {
  users: User[];
}

export interface GetUserResponse {
  user: User;
}

export interface BalanceResponse {
  balance: number;
  currency?: string;
}

export interface Transaction {
  id: string;
  amount: number;
  recipient: string;
  notes?: string;
  timestamp: string;
  status: string;
}

export interface TransactionsResponse {
  transactions: Transaction[];
}

export interface BankAccount {
  id: string;
  accountHolder: string;
  accountNumber: string;
  branchCode: string;
  bankName: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccountResponse {
  bankAccount: BankAccount;
}

export interface ActivatePayResponse {
  success: boolean;
  message?: string;
}

export interface Recipient {
  id: string;
  paymentIdentifier: string;
  name?: string;
  email?: string;
}

export interface RecipientResponse {
  recipient: Recipient;
}

export interface MintResponse {
  transactionId: string;
  amount: number;
  recipient: string;
  notes: string;
  status: string;
  timestamp: string;
}

// API Service Class
export class RapydMoneyService {
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiToken}`,
    };
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }
    return response.json() as T;
  }

  /**
   * Create a new user
   * POST /users
   */
  async createUser(userData: CreateUserRequest): Promise<User> {
    const response = await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(userData),
    });

    const result = await this.handleResponse<User>(response);
    return result;
  }

  /**
   * List all users associated with the authenticated business
   * GET /users
   */
  async listUsers(): Promise<User[]> {
    const response = await fetch(`${BASE_URL}/users`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    const result = await this.handleResponse<GetUsersResponse>(response);
    return result.users;
  }

  /**
   * Get a single user by ID
   * GET /users/{id}
   */
  async getUser(userId: string): Promise<User> {
    const response = await fetch(`${BASE_URL}/users/${userId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    const result = await this.handleResponse<User>(response);
    return result;
  }

  /**
   * Get user balance
   * GET /{userId}/balance
   */
  async getBalance(userId: string): Promise<BalanceResponse> {
    const response = await fetch(`${BASE_URL}/${userId}/balance`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    const result = await this.handleResponse<BalanceResponse>(response);
    return result;
  }

  /**
   * Get user transactions
   * GET /{userId}/transactions
   */
  async getTransactions(userId: string): Promise<Transaction[]> {
    const response = await fetch(`${BASE_URL}/${userId}/transactions`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    const result = await this.handleResponse<TransactionsResponse>(response);
    return result.transactions;
  }

  /**
   * Create bank account for user
   * POST /bank/{userId}
   */
  async createBankAccount(userId: string, bankData: CreateBankAccountRequest): Promise<BankAccount> {
    const response = await fetch(`${BASE_URL}/bank/${userId}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(bankData),
    });

    const result = await this.handleResponse<BankAccountResponse>(response);
    return result.bankAccount;
  }

  /**
   * Get bank account for user
   * GET /bank/{userId}
   */
  async getBankAccount(userId: string): Promise<BankAccount> {
    const response = await fetch(`${BASE_URL}/bank/${userId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    const result = await this.handleResponse<BankAccountResponse>(response);
    return result.bankAccount;
  }

  /**
   * Activate pay for user
   * POST /activate-pay/{userId}
   */
  async activatePay(userId: string): Promise<ActivatePayResponse> {
    const response = await fetch(`${BASE_URL}/activate-pay/${userId}`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    const result = await this.handleResponse<ActivatePayResponse>(response);
    return result;
  }

  /**
   * Get recipient by payment identifier
   * GET /recipient/{paymentIdentifier}
   */
  async getRecipient(paymentIdentifier: string): Promise<Recipient> {
    const response = await fetch(`${BASE_URL}/recipient/${paymentIdentifier}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    const result = await this.handleResponse<RecipientResponse>(response);
    return result.recipient;
  }

  /**
   * Mint tokens/create transaction
   * POST /mint
   */
  async mint(mintData: MintRequest): Promise<MintResponse> {
    const response = await fetch(`${BASE_URL}/mint`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(mintData),
    });

    const result = await this.handleResponse<MintResponse>(response);
    return result;
  }
}

// Factory function to create a service instance
export function createRapydMoneyService(apiToken: string): RapydMoneyService {
  return new RapydMoneyService(apiToken);
}

// Export default instance (requires API token to be set)
export default RapydMoneyService;