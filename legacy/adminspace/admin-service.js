/**
 * adminspace/admin-service.js
 * Backend-utility for managing all storage blobs across the Roomio platform.
 */

import { list, del, head } from '@vercel/blob';

/**
 * Global listing of all user projects.
 */
export const listAllProjects = async () => {
    const { blobs } = await list();
    return blobs;
};

/**
 * Perform administrative cleanup of a specific blob.
 */
export const adminCleanupProject = async (url) => {
    return await del(url);
};

/**
 * Retrieve metadata for any project blob.
 */
export const getBlobMetadata = async (url) => {
    return await head(url);
};
