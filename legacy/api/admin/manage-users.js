import { put, list, del } from '@vercel/blob';

/**
 * api/admin/manage-users.js
 * Admin endpoint for managing platform users.
 */
export default async function handler(request, response) {
  const { method } = request;
  const adminSecret = request.headers['x-admin-secret'] || request.query.secret;

  // Basic security check (In prod, use env variable)
  if (adminSecret !== 'adminpassword' && process.env.NODE_ENV === 'production') {
    return response.status(403).json({ error: 'Auth failed: Invalid admin credentials' });
  }

  const REGISTRY_PATH = 'adminspace/users-registry.json';

  try {
    if (method === 'GET') {
      // List all users from our simulated registry
      const { blobs } = await list({ prefix: REGISTRY_PATH });
      if (blobs.length === 0) {
        // Initial empty registry
        return response.status(200).json([]);
      }
      const data = await fetch(blobs[0].url).then(res => res.json());
      return response.status(200).json(data);
    } 
    
    if (method === 'POST') {
      // Update a user's role/access
      const { email, role, status } = request.body;
      
      // Load existing registry
      const { blobs } = await list({ prefix: REGISTRY_PATH });
      let registry = [];
      if (blobs.length > 0) {
        registry = await fetch(blobs[0].url).then(res => res.json());
      }

      // Update or Add user
      const userIndex = registry.findIndex(u => u.email === email);
      if (userIndex > -1) {
        registry[userIndex] = { ...registry[userIndex], role, status, updatedAt: new Date().toISOString() };
      } else {
        registry.push({ email, role, status, createdAt: new Date().toISOString() });
      }

      // Save back to Blob
      await put(REGISTRY_PATH, JSON.stringify(registry), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false
      });

      return response.status(200).json({ success: true, registry });
    }

    return response.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Admin Management Error:', error);
    return response.status(500).json({ error: 'Failed to manage user registry' });
  }
}
