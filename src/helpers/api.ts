import {InternalUser} from "../types/internal";
import axios from "axios";
import {serverURL} from "../index";

export async function apiCall(path: string, user: InternalUser) {
    const request = await axios.get(serverURL + '/api' + path, {
        headers: {
            'Authorization': `Bearer ${user.apiKey}`
        }
    })

    if (request.status !== 200) {
        throw new Error(`Error: ${request.status} ${request.statusText}`);
    }

    return request.data;
}

export async function loginToAudiobookshelf(username: string, password: string): Promise<InternalUser | null> {
    try {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] Attempting ABS login to: ${serverURL}/login`);
        }
        
        const response = await axios.post(`${serverURL}/login`, {
            username: username,
            password: password
        });
        
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] ABS login response status: ${response.status}`);
        }

        if (response.status === 200 && response.data.user) {
            const userData = response.data.user;
            if (process.env.NODE_ENV === 'development') {
                console.log(`[DEBUG] ABS login successful for user: ${userData.username}`);
            }
            return {
                name: userData.username,
                apiKey: userData.accessToken
            };
        }
        return null;
    } catch (error: any) {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] ABS login failed:`, error.response?.status, error.response?.data || error.message);
        } else {
            console.error('Login failed:', error.response?.status || error.message);
        }
        return null;
    }
}