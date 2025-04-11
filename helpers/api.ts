import {InternalUser} from "../types/internal";
import axios from "axios";
import {serverURL} from "../index";

export async function apiCall(path: string, user: InternalUser) {

    const request =await  axios.get(serverURL + '/api' + path, {
        headers: {
            'Authorization': `Bearer ${user.apiKey}`
        }
    })

    if (request.status !== 200) {
        throw new Error(`Error: ${request.status} ${request.statusText}`);
    }

    return request.data;

}