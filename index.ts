import express, { Request, Response } from 'express';
import {InternalUser} from "./types/internal";
import dotenv from 'dotenv';
import {buildItemEntries, buildLibraryEntries, buildOPDSXMLSkeleton, buildSearchDefinition} from "./helpers/abs";
import {apiCall} from "./helpers/api";
import {Library, LibraryItem} from "./types/library";
import {hash} from "crypto";

// load .env
dotenv.config();

const app = express();
const port = process.env.PORT || 3010;
export const serverURL = process.env.ABS_URL || 'http://localhost:3000';
const internalUsersString = process.env.OPDS_USERS || '';
const showAudioBooks = process.env.SHOW_AUDIOBOOKS === 'true' || false;

const internalUsers: InternalUser[] = internalUsersString.split(',').map(user => {
    const [name, apiKey, password] = user.split(':');
    return { name, apiKey, password };
})



app.get('/opds/:username', async (req: Request, res: Response) => {
    const user: InternalUser | undefined = internalUsers.find(u => u.name.toLowerCase() === req.params.username.toLowerCase());
    if (!user) {
        res.status(401).send('Unauthorized');
        return
    }

    const libraries = await apiCall(`/libraries`, user);
    const parsedLibaries: Library[] = libraries.libraries.map((library: any) => {
        return {
            id: library.id,
            name: library.name,
            icon: library.icon
        }
    })

    res.type('application/xml').send(
        buildOPDSXMLSkeleton(
            hash('sha1', user.name),
            `${user.name}'s Libraries`,
            buildLibraryEntries(parsedLibaries, user)

        )
    )
});

app.get('/opds/:username/libraries/:libraryId', async (req: Request, res: Response) => {
    const user: InternalUser | undefined = internalUsers.find(u => u.name.toLowerCase() === req.params.username.toLowerCase());
    if (!user) {
        res.status(401).send('Unauthorized');
        return
    }

    const items = await apiCall(`/libraries/${req.params.libraryId}/items`, user);

    const library: Library = await apiCall(`/libraries/${req.params.libraryId}`, user);

    let parsedItems: LibraryItem[] = items.results.map((item: any) => {
        return {
            id: item.id,
            title: item.media.metadata.title,
            subtitle: item.media.metadata.subtitle,
            description: item.media.metadata.description,
            genres: item.media.metadata.genres || [],
            tags: item.media.metadata.tags || [],
            publisher: item.media.metadata.publisher,
            isbn: item.media.metadata.isbn,
            language: item.media.metadata.language,
            publishedYear: item.media.metadata.publishedYear,
            authors: item.media.metadata?.authorName?.split(',').map((author: string) => {
                return {
                    name: author
                }
            }) || [],
            format: item.media.ebookFormat
        }
    }).filter((item: LibraryItem) => item.format !== undefined || showAudioBooks)

    if(req.query.q) {
        const query = req.query.q as string;
        const search = new RegExp(query, 'i');
        parsedItems = parsedItems.filter((item: LibraryItem) => {
            if (!item) return false;
            if (item.title === undefined) return false;
            // match by search term
            if (item.title.match(search)) return true;
            if (item.subtitle && item.subtitle.match(search)) return true;
            if (item.description && item.description.match(search)) return true;
            if (item.publisher && item.publisher.match(search)) return true;
            if (item.isbn && item.isbn.match(search)) return true;
            if (item.language && item.language.match(search)) return true;
            if (item.publishedYear && item.publishedYear.match(search)) return true;
            if (item.authors && item.authors.some((author: any) => author.name.match(search))) return true;
            if (item.genres && item.genres.some((genre: any) => genre.match(search))) return true;
            if (item.tags && item.tags.some((tag: any) => tag.match(search))) return true;
        })
    }

    // Page the results
    const page = parseInt(req.query.page as string) || 0;
    const pageSize = process.env.OPDS_PAGE_SIZE ? parseInt(process.env.OPDS_PAGE_SIZE) : 20;
    const startIndex = (page) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, parsedItems.length);
    const paginatedItems = parsedItems.slice(startIndex, endIndex);
    const endOfPage = endIndex >= parsedItems.length;

    res.type('application/xml').send(
        buildOPDSXMLSkeleton(
            `urn:uuid:${req.params.libraryId}`,
            `${library.name}`,
            buildItemEntries(paginatedItems, user),
            library,
                user,
                req,
            endOfPage
        )
    )
});

app.get('/opds/:username/libraries/:libraryId/search-definition', async (req: Request, res: Response) => {
    const user: InternalUser | undefined = internalUsers.find(u => u.name.toLowerCase() === req.params.username.toLowerCase());
    if (!user) {
        res.status(401).send('Unauthorized');
        return
    }

    res.type('application/xml').send(buildSearchDefinition(req.params.libraryId, user))


})


app.listen(port, () => {
    console.log(`OPDS server running at http://localhost:${port}/opds/:username`);
    console.log(`OPDS users: ${internalUsers.map(user => user.name).join(', ')}`);
    console.log(`Server URL: ${serverURL}`);
})