/**
 * api-client.js - Mock API Client for Roomio
 * This simulates requests to serverless functions that connect to a database like Supabase.
 */

const ApiClient = {
    /**
     * Fetches projects from Vercel Blob via serverless API /api/list-projects
     */
    async fetchProjects() {
        if (!RoomioAuth.isAuthenticated()) return [];
        const user_id = RoomioAuth.user.id;
        
        console.log(`[API] Fetching projects for user: ${user_id}`);
        try {
            const response = await fetch(`/api/list-projects?user_id=${user_id}`);
            if (!response.ok) throw new Error('Failed to list projects');
            
            const blobs = await response.json();
            // Blobs contain 'url', 'pathname', 'size', 'uploadedAt'
            // We need to fetch the content of these blobs or just return the metadata
            return blobs.map(blob => ({
                id: blob.pathname.split('/').pop().replace('.json', ''),
                projectName: blob.pathname.split('/').pop().replace('.json', ''), 
                updatedAt: blob.uploadedAt,
                url: blob.url
            }));
        } catch (error) {
            console.error('API Error:', error);
            return [];
        }
    },

    /**
     * Saves a project to Vercel Blob via serverless API /api/save-project
     */
    async saveProject(project) {
        if (!RoomioAuth.isAuthenticated()) {
            throw new Error('Authentication required to save to cloud.');
        }

        const user_id = RoomioAuth.user.id;
        const project_id = project.id || 'project_' + Date.now();
        project.id = project_id; // Ensure project has an ID

        console.log(`[API] Saving project ${project_id} for user ${user_id}`);

        try {
            const response = await fetch('/api/save-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id,
                    project_id,
                    project_data: project
                })
            });

            if (!response.ok) throw new Error('Failed to save project to Blob');
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    async deleteProject(id) {
        // Implementation for deletion would follow similar pattern
        console.log(`[API] Deleting project ${id}`);
        return true;
    }
};

window.RoomioApi = ApiClient;
