import type { InternalUser } from './internal.js'

declare global {
    namespace Express {
        interface Request {
            user?: InternalUser
        }
    }
}

export {}
