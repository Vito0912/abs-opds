import {AuthenticatedRequest} from "../types/internal";
import {NextFunction, Response} from "express";
import basicAuth from "basic-auth";
import axios from "axios";
import {AUTH_DOCUMENT, internalUsers, serverURL} from "../index";

const AUTH_DOC_MIME_TYPE = 'application/opds-authentication+json';

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {

    const credentials: {name: string, pass: string} | undefined = basicAuth(req)

    if (!credentials) {
        res.set('Content-Type', AUTH_DOC_MIME_TYPE);
        res.set('Link', `<${AUTH_DOCUMENT.id}>; rel="http://opds-spec.org/auth/document"; type="${AUTH_DOC_MIME_TYPE}"`);
        res.status(401).json(AUTH_DOCUMENT);
        return;
    }

    const user = internalUsers.find(u => u.name.toLowerCase() === credentials.name.toLowerCase());

    if (user) {
        if (user.password && (!user || user.password !== credentials.pass)) {
            console.log(`Authentication failed for user: ${credentials}`);
            res.set('Content-Type', AUTH_DOC_MIME_TYPE);
            res.set('Link', `<${AUTH_DOCUMENT.id}>; rel="http://opds-spec.org/auth/document"; type="${AUTH_DOC_MIME_TYPE}"`);
            res.status(401).json(AUTH_DOCUMENT);
            return;
        }

        console.log(`Authentication successful for user: ${user.name}`);
        req.user = user;
        next();
    } else {
        // ABS Auth

        const axiosResponse = axios.post(`${serverURL}/login`, {
            username: credentials.name,
            password: credentials.pass
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        }).then(response => {
            console.log(response.status)
            if (response.status === 200) {
                req.user = {
                    name: response.data.user.username,
                    apiKey: response.data.user.token,
                };
                next();
            } else {
                res.set('Content-Type', AUTH_DOC_MIME_TYPE);
                res.set('Link', `<${AUTH_DOCUMENT.id}>; rel="http://opds-spec.org/auth/document"; type="${AUTH_DOC_MIME_TYPE}"`);
                res.status(401).json(AUTH_DOCUMENT);
            }
        }).catch(error => {
            console.error(`Authentication failed for user: ${credentials}`, error);
            res.set('Content-Type', AUTH_DOC_MIME_TYPE);
            res.set('Link', `<${AUTH_DOCUMENT.id}>; rel="http://opds-spec.org/auth/document"; type="${AUTH_DOC_MIME_TYPE}"`);
            res.status(401).json(AUTH_DOCUMENT);
        })

    }


};