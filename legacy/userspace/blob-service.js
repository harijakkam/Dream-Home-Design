/**
 * userspace/blob-service.js
 * Backend-utility for Vercel Blob integrations in userspace.
 */

import { put, list, del } from '@vercel/blob';

export const saveUserProject = async (user_id, project_id, data) => {
  const filename = `userspace/${user_id}/${project_id}.json`;
  return await put(filename, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false
  });
};

export const listUserProjects = async (user_id) => {
  const { blobs } = await list({
    prefix: `userspace/${user_id}/`
  });
  return blobs;
};

export const deleteUserProject = async (url) => {
  return await del(url);
};
