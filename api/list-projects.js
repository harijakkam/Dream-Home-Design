import { list } from '@vercel/blob';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user_id } = request.query;

    if (!user_id) {
      return response.status(400).json({ error: 'Missing user_id parameter' });
    }

    // List all blobs in the userspace for this user
    const { blobs } = await list({
      prefix: `userspace/${user_id}/`
    });

    return response.status(200).json(blobs);
  } catch (error) {
    console.error('Blob list error:', error);
    return response.status(500).json({ error: 'Failed to list user projects from Blob' });
  }
}
