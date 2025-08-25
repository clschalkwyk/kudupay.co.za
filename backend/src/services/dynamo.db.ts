import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    QueryCommand,
    ScanCommand,
    UpdateCommand,
    DeleteCommand,
    TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";

export interface DynamoItem {
    Pk: string;
    Sk: string;

    [key: string]: any;
}

export interface GetItemParams {
    Pk: string;
    Sk: string;
}

export class DynamoDBInterface {
    private docClient: DynamoDBDocumentClient;
    private tableName: string;

    constructor(tableName: string, region: string = 'af-south-1') {
        const client = new DynamoDBClient({region});
        this.docClient = DynamoDBDocumentClient.from(client);
        this.tableName = tableName;
    }

    /**
     * Query items from the primary index (by partition key)
     */
    async query(params: {
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, any>;
        ExpressionAttributeNames?: Record<string, string>;
        FilterExpression?: string;
        ScanIndexForward?: boolean;
        Limit?: number;
        ExclusiveStartKey?: Record<string, any>;
    }): Promise<{
        Items?: DynamoItem[];
        Count?: number;
        ScannedCount?: number;
        LastEvaluatedKey?: Record<string, any>;
    }> {
        try {
            const command = new QueryCommand({
                TableName: this.tableName,
                KeyConditionExpression: params.KeyConditionExpression,
                ExpressionAttributeValues: params.ExpressionAttributeValues,
                ExpressionAttributeNames: params.ExpressionAttributeNames,
                FilterExpression: params.FilterExpression,
                ScanIndexForward: params.ScanIndexForward,
                Limit: params.Limit,
                ExclusiveStartKey: params.ExclusiveStartKey
            });
            const response = await this.docClient.send(command);
            return {
                Items: response.Items as DynamoItem[] || [],
                Count: response.Count,
                ScannedCount: response.ScannedCount,
                LastEvaluatedKey: response.LastEvaluatedKey
            };
        } catch (error) {
            console.error('Error querying table:', error);
            throw error;
        }
    }

    /**
     * Put an item into the DynamoDB table
     */
    async putItem(item: DynamoItem, options?: { ConditionExpression?: string }): Promise<void> {
        try {
            const command = new PutCommand({
                TableName: this.tableName,
                Item: item,
                ConditionExpression: options?.ConditionExpression
            });

            await this.docClient.send(command);
        } catch (error) {
            console.error('Error putting item:', error);
            throw error;
        }
    }

    /**
     * Update an item in the DynamoDB table
     * // Update specific attributes
     * await dynamoDB.updateItem({
     *     Pk: 'user#123',
     *     Sk: 'profile',
     *     UpdateExpression: 'SET #name = :name, #email = :email, #updatedAt = :updatedAt',
     *     ExpressionAttributeNames: {
     *         '#name': 'name',
     *         '#email': 'email',
     *         '#updatedAt': 'updatedAt'
     *     },
     *     ExpressionAttributeValues: {
     *         ':name': 'Jane Doe',
     *         ':email': 'jane@example.com',
     *         ':updatedAt': new Date().toISOString()
     *     }
     * });
     *
     * // Add to a number attribute
     * await dynamoDB.updateItem({
     *     Pk: 'user#123',
     *     Sk: 'stats',
     *     UpdateExpression: 'ADD #loginCount :increment',
     *     ExpressionAttributeNames: {
     *         '#loginCount': 'loginCount'
     *     },
     *     ExpressionAttributeValues: {
     *         ':increment': 1
     *     }
     * });
     *
     * // Remove an attribute
     * await dynamoDB.updateItem({
     *     Pk: 'user#123',
     *     Sk: 'profile',
     *     UpdateExpression: 'REMOVE #tempField',
     *     ExpressionAttributeNames: {
     *         '#tempField': 'tempField'
     *     }
     * });
     *
     * // Conditional update
     * await dynamoDB.updateItem({
     *     Pk: 'user#123',
     *     Sk: 'profile',
     *     UpdateExpression: 'SET #status = :status',
     *     ExpressionAttributeNames: {
     *         '#status': 'status'
     *     },
     *     ExpressionAttributeValues: {
     *         ':status': 'active',
     *         ':expectedStatus': 'pending'
     *     },
     *     ConditionExpression: '#status = :expectedStatus'
     * });
     */
    async updateItem(params: {
        Pk: string;
        Sk: string;
        UpdateExpression: string;
        ExpressionAttributeValues?: Record<string, any>;
        ExpressionAttributeNames?: Record<string, string>;
        ConditionExpression?: string;
        ReturnValues?: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW';
    }): Promise<DynamoItem | null> {
        try {
            const command = new UpdateCommand({
                TableName: this.tableName,
                Key: {
                    Pk: params.Pk,
                    Sk: params.Sk
                },
                UpdateExpression: params.UpdateExpression,
                ExpressionAttributeValues: params.ExpressionAttributeValues,
                ExpressionAttributeNames: params.ExpressionAttributeNames,
                ConditionExpression: params.ConditionExpression,
                ReturnValues: params.ReturnValues || 'ALL_NEW'
            });

            const response = await this.docClient.send(command);
            return response.Attributes as DynamoItem || null;
        } catch (error) {
            console.error('Error updating item:', error);
            throw error;
        }
    }

    /**
     * Get an item from the DynamoDB table
     */
    async getItem(params: GetItemParams): Promise<DynamoItem | null> {
        try {
            const command = new GetCommand({
                TableName: this.tableName,
                Key: {
                    Pk: params.Pk,
                    Sk: params.Sk
                }
            });

            const response = await this.docClient.send(command);
            return response.Item as DynamoItem || null;
        } catch (error) {
            console.error('Error getting item:', error);
            throw error;
        }
    }

    /**
     * Query items from a Global Secondary Index
     */
    async queryIndex(params: {
        IndexName: string;
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, any>;
        ExpressionAttributeNames?: Record<string, string>;
        FilterExpression?: string;
        ScanIndexForward?: boolean;
        Limit?: number;
        ExclusiveStartKey?: Record<string, any>;
    }): Promise<{
        Items?: DynamoItem[];
        Count?: number;
        ScannedCount?: number;
        LastEvaluatedKey?: Record<string, any>;
    }> {
        try {
            const command = new QueryCommand({
                TableName: this.tableName,
                IndexName: params.IndexName,
                KeyConditionExpression: params.KeyConditionExpression,
                ExpressionAttributeValues: params.ExpressionAttributeValues,
                ExpressionAttributeNames: params.ExpressionAttributeNames,
                FilterExpression: params.FilterExpression,
                ScanIndexForward: params.ScanIndexForward,
                Limit: params.Limit,
                ExclusiveStartKey: params.ExclusiveStartKey
            });
            const response = await this.docClient.send(command);
            return {
                Items: response.Items as DynamoItem[] || [],
                Count: response.Count,
                ScannedCount: response.ScannedCount,
                LastEvaluatedKey: response.LastEvaluatedKey
            };
        } catch (error) {
            console.error(error)
            console.error('Error querying index:', error);
            throw error;
        }
    }

    /**
     * Scan items from the DynamoDB table with optional filter
     */
    async scan(params: {
        FilterExpression?: string;
        ExpressionAttributeValues?: Record<string, any>;
        ExpressionAttributeNames?: Record<string, string>;
        Limit?: number;
        ExclusiveStartKey?: Record<string, any>;
    }): Promise<{
        Items?: DynamoItem[];
        Count?: number;
        ScannedCount?: number;
        LastEvaluatedKey?: Record<string, any>;
    }> {
        try {
            const command = new ScanCommand({
                TableName: this.tableName,
                FilterExpression: params.FilterExpression,
                ExpressionAttributeValues: params.ExpressionAttributeValues,
                ExpressionAttributeNames: params.ExpressionAttributeNames,
                Limit: params.Limit,
                ExclusiveStartKey: params.ExclusiveStartKey
            });
            
            const response = await this.docClient.send(command);
            return {
                Items: response.Items as DynamoItem[] || [],
                Count: response.Count,
                ScannedCount: response.ScannedCount,
                LastEvaluatedKey: response.LastEvaluatedKey
            };
        } catch (error) {
            console.error('Error scanning table:', error);
            throw error;
        }
    }

    async deleteItem(params: GetItemParams): Promise<void> {
        try {
            const command = new DeleteCommand({
                TableName: this.tableName,
                Key: {
                    Pk: params.Pk,
                    Sk: params.Sk
                }
            });
            await this.docClient.send(command);
        } catch (error) {
            console.error('Error deleting item:', error);
            throw error;
        }
    }

    /**
     * Execute a transactional write (up to 25 items)
     * Each TransactItem should include one of Put/Update/Delete requests. If TableName is omitted,
     * it will default to this.tableName.
     */
    async transactWrite(params: { TransactItems: Array<any> }): Promise<void> {
        try {
            const normalized = (params.TransactItems || []).map((op) => {
                if (op.Put) {
                    return { Put: { TableName: op.Put.TableName || this.tableName, Item: op.Put.Item || op.Put, ConditionExpression: op.Put.ConditionExpression, ExpressionAttributeNames: op.Put.ExpressionAttributeNames, ExpressionAttributeValues: op.Put.ExpressionAttributeValues } };
                }
                if (op.Update) {
                    const u = op.Update;
                    const Key = u.Key || { Pk: u.Pk, Sk: u.Sk };
                    return { Update: { TableName: u.TableName || this.tableName, Key, UpdateExpression: u.UpdateExpression, ExpressionAttributeNames: u.ExpressionAttributeNames, ExpressionAttributeValues: u.ExpressionAttributeValues, ConditionExpression: u.ConditionExpression } };
                }
                if (op.Delete) {
                    const d = op.Delete;
                    const Key = d.Key || { Pk: d.Pk, Sk: d.Sk };
                    return { Delete: { TableName: d.TableName || this.tableName, Key, ConditionExpression: d.ConditionExpression, ExpressionAttributeNames: d.ExpressionAttributeNames, ExpressionAttributeValues: d.ExpressionAttributeValues } };
                }
                return op;
            });
            const command = new TransactWriteCommand({ TransactItems: normalized });
            await this.docClient.send(command);
        } catch (error) {
            console.error('Error executing transactWrite:', error);
            throw error;
        }
    }

}

// Usage example:
// const dynamoDB = new DynamoDBInterface('your-table-name');
//
// // Put item
// await dynamoDB.putItem({
//   Pk: 'user#123',
//   Sk: 'profile',
//   name: 'John Doe',
//   email: 'john@example.com'
// });
//
// // Get item
// const item = await dynamoDB.getItem({
//   Pk: 'user#123',
//   Sk: 'profile'
// });