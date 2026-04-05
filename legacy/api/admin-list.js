import { listAllProjects } from '../adminspace/admin-service.js';

/**
 * Admin endpoint for listing all blobs on the platform.
 * Should be protected with a custom secret for production.
 */
export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { admin_secret } = request.query;

    // Simulate basic admin auth check
    if (admin_secret !== process.env.ADMIN_SECRET) {
      if (process.env.NODE_ENV === 'production') {
        return response.status(403).json({ error: 'Forbidden' });
      }
      // If no ADMIN_SECRET is set, we bypass during development
    }

    const projects = await listAllProjects();
    return response.status(200).json(projects);
  } catch (error) {
    console.error('Admin Blob list error:', error);
    return response.status(500).json({ error: 'Failed to access global storage' });
  }
}
