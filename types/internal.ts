import { Request } from 'express';

export type InternalUser = {
    name: string
    apiKey: string
    password?: string
}

export interface AuthenticatedRequest extends Request {
    user?: InternalUser;
}
