/**
 * adminspace/user-manager.js
 * Backend-utility for administrative user registry operations.
 */

import { listAllProjects } from './admin-service.js';

/**
 * Enhanced user registry lookup including project counts based on blobs.
 */
export const getEnrichedUserList = async (registry) => {
    const allBlobs = await listAllProjects();
    
    return registry.map(user => {
        // user_id is typically the user's email or a unique ID from auth
        // Blob paths are userspace/{user_id}/*.json
        const userProjectBlobs = allBlobs.filter(b => b.pathname.includes(`userspace/${user.id}/`));
        
        return {
            ...user,
            projectsCount: userProjectBlobs.length,
            lastActivity: userProjectBlobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0]?.uploadedAt || user.updatedAt
        };
    });
};
