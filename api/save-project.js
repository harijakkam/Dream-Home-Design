import { put } from '@vercel/blob';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user_id, project_id, project_data } = request.body;

    if (!user_id || !project_id || !project_data) {
      return response.status(400).json({ error: 'Missing required fields' });
    }

    // Path structure: userspace/{user_id}/{project_id}.json
    const filename = `userspace/${user_id}/${project_id}.json`;
    
    const blob = await put(filename, JSON.stringify(project_data), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false // We keep the project ID as the filename
    });

    return response.status(200).json(blob);
  } catch (error) {
    console.error('Blob upload error:', error);
    return response.status(500).json({ error: 'Failed to save project to Blob storage' });
  }
}
