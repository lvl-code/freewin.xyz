// =====================================================
// media-upload.js — R2 Upload/Delete Handler
// =====================================================
//
// Handles file uploads to Cloudflare R2 with:
//   - MIME type validation
//   - Extension validation
//   - File size enforcement (configurable)
//   - Path traversal prevention
//   - Safe R2 key generation
//   - Thumbnail URL generation (via Cloudflare Image Resizing)
//   - Metadata storage in D1 (media_library table)
//   - R2 object deletion
//
// All functions require an authenticated session and
// permission checks are performed by the caller (api.js).
//
// =====================================================

import {
    createMediaItem,
    getMediaById,
    deleteMediaItem,
} from './database/media_library.js';

import { getSiteContext } from './site-context.js';

// ── Local response helpers ──────────────────────────
// media-upload.js can't import json/success/failure from
// api.js (circular dependency), so we define minimal
// versions here that produce identical Response objects.
function jsonResponse(status, data) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

function jsonError(status, message) {
    return new Response(JSON.stringify({ success: false, error: message }), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}


// ── Configuration ────────────────────────────────────

// Maximum file sizes in bytes
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;    // 10 MB for images
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;  // 100 MB for videos
const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024; // 5 MB for documents

// Allowed MIME types per media type
const ALLOWED_MIME_TYPES = {
    image: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/svg+xml',
    ],
    video: [
        'video/mp4',
        'video/webm',
        'video/ogg',
    ],
    document: [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
};

// Allowed extensions per media type (lowercase, no dot)
const ALLOWED_EXTENSIONS = {
    image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'],
    video: ['mp4', 'webm', 'ogg', 'mov'],
    document: ['pdf', 'txt', 'doc', 'docx'],
};

// Cloudflare Image Resizing thumbnail presets
// Generates WebP thumbnails at multiple widths for responsive images
const THUMBNAIL_WIDTHS = [150, 400, 800];

// ── Utility functions ─────────────────────────────────

/**
 * Generates a cryptographically random hex string for unique file naming.
 * Uses Web Crypto API (available in Workers).
 * @param {number} length - Number of bytes to generate.
 * @returns {string} Hex string of length * 2 characters.
 */
function randomHex(length) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalizes a filename by removing path components, special characters,
 * and converting to lowercase with a safe extension.
 * @param {string} filename - The original filename.
 * @returns {{name: string, ext: string}} Safe name and extension.
 */
function normalizeFilename(filename) {
    if (typeof filename !== 'string') return { name: 'file', ext: '' };

    // Remove any path components (prevent path traversal)
    const basename = filename.replace(/^.*[\/\\]/, '');

    // Remove special characters, keep alphanumeric, dash, underscore, dot
    const cleaned = basename
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

    // Split name and extension
    const lastDot = cleaned.lastIndexOf('.');
    if (lastDot === -1) {
        return { name: cleaned || 'file', ext: '' };
    }
    return {
        name: cleaned.substring(0, lastDot) || 'file',
        ext: cleaned.substring(lastDot + 1).toLowerCase(),
    };
}

/**
 * Detects the media type from MIME type.
 * @param {string} mimeType - The MIME type string.
 * @returns {string} 'image', 'video', 'document', or 'unknown'.
 */
function detectMediaType(mimeType) {
    if (!mimeType) return 'unknown';
    const lower = mimeType.toLowerCase();
    if (lower.startsWith('image/')) return 'image';
    if (lower.startsWith('video/')) return 'video';
    if (lower.startsWith('application/pdf') ||
        lower.startsWith('text/') ||
        lower.startsWith('application/msword') ||
        lower.startsWith('application/vnd.openxmlformats')) return 'document';
    return 'unknown';
}

/**
 * Validates a file against allowed MIME types, extensions, and size limits.
 * @param {string} filename - The original filename.
 * @param {string} mimeType - The MIME type from the upload.
 * @param {number} size - File size in bytes.
 * @returns {{valid: boolean, error?: string, mediaType?: string, ext?: string}}
 */
function validateFile(filename, mimeType, size) {
    const { name, ext } = normalizeFilename(filename);
    const mediaType = detectMediaType(mimeType);

    // Check if MIME type is known
    if (mediaType === 'unknown') {
        return { valid: false, error: `Unsupported file type: ${mimeType}` };
    }

    // Check MIME type against allow list
    const allowedMimes = ALLOWED_MIME_TYPES[mediaType] || [];
    if (!allowedMimes.includes(mimeType.toLowerCase())) {
        return { valid: false, error: `MIME type ${mimeType} is not allowed for ${mediaType} files` };
    }

    // Check extension against allow list
    const allowedExts = ALLOWED_EXTENSIONS[mediaType] || [];
    if (ext && !allowedExts.includes(ext)) {
        return { valid: false, error: `File extension .${ext} is not allowed for ${mediaType} files` };
    }

    // If no extension, try to infer from MIME type
    let finalExt = ext;
    if (!finalExt) {
        const mimeToExt = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'image/svg+xml': 'svg',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'video/ogg': 'ogg',
            'application/pdf': 'pdf',
            'text/plain': 'txt',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        };
        finalExt = mimeToExt[mimeType.toLowerCase()] || '';
    }

    // Check file size
    const maxSize = mediaType === 'image' ? MAX_IMAGE_SIZE :
                    mediaType === 'video' ? MAX_VIDEO_SIZE :
                    MAX_DOCUMENT_SIZE;
    if (size > maxSize) {
        const maxMB = Math.round(maxSize / (1024 * 1024));
        return { valid: false, error: `File size exceeds maximum of ${maxMB}MB for ${mediaType} files` };
    }

    return { valid: true, mediaType, ext: finalExt };
}

/**
 * Generates a safe R2 key for storing the file.
 * Format: media/{folder_slug}/{timestamp}-{random}.{ext}
 * @param {string} folderSlug - The folder slug (sanitized).
 * @param {string} ext - The file extension (without dot).
 * @returns {string} The R2 key.
 */
function generateR2Key(folderSlug, ext) {
    const safeFolder = folderSlug
        ? folderSlug.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()
        : 'general';
    const timestamp = Date.now();
    const random = randomHex(8);
    const safeExt = ext ? `.${ext}` : '';
    return `media/${safeFolder || 'general'}/${timestamp}-${random}${safeExt}`;
}

/**
 * Generates the public URL for an R2 object.
 * Uses the /media/ path prefix which is served by the Worker.
 * @param {string} r2Key - The R2 object key.
 * @param {string} requestHost - The request host (for building absolute URL).
 * @returns {string} The public URL.
 */
function generatePublicUrl(r2Key, requestHost) {
    // The Worker serves R2 media at /media/{key}
    // This route will be added in api.js
    return `https://${requestHost}/${r2Key}`;
}

/**
 * Generates thumbnail URLs using Cloudflare Image Resizing.
 * Cloudflare Image Resizing is available via /cdn-cgi/image/ path.
 * @param {string} publicUrl - The original image public URL.
 * @returns {{thumbnail: string, responsive: string[]}} Thumbnail and responsive URLs.
 */
function generateThumbnailUrls(publicUrl) {
    // Cloudflare Image Resizing URL format:
    // /cdn-cgi/image/width=400,format=webp/{original_path}
    const urlObj = new URL(publicUrl);
    const path = urlObj.pathname;

    const thumbnail = `${urlObj.origin}/cdn-cgi/image/width=400,format=webp${path}`;

    // Generate responsive srcset URLs
    const responsive = THUMBNAIL_WIDTHS.map(
        w => `${urlObj.origin}/cdn-cgi/image/width=${w},format=webp${path} ${w}w`
    );

    return { thumbnail, responsive };
}

/**
 * Extracts image dimensions from the upload metadata.
 * In a Worker environment, we cannot parse image binary data directly.
 * The client (TinyMCE/media library UI) should send width/height as form fields.
 * If not provided, we set them to null and they can be updated later.
 * @param {FormData} formData - The form data from the upload request.
 * @returns {{width: number|null, height: number|null}}
 */
function extractDimensions(formData) {
    const width = formData.get('width');
    const height = formData.get('height');
    return {
        width: width ? parseInt(width, 10) || null : null,
        height: height ? parseInt(height, 10) || null : null,
    };
}

// ── Upload handler ───────────────────────────────────

/**
 * Handles a file upload to R2.
 *
 * Expects a multipart/form-data request with:
 *   - file: The file to upload (required)
 *   - folder: The folder slug (optional, defaults to 'general')
 *   - alt_text: Alt text for images (optional)
 *   - caption: Caption for the media (optional)
 *   - width: Image width in pixels (optional, for images)
 *   - height: Image height in pixels (optional, for images)
 *
 * @param {Request} request - The incoming request.
 * @param {Object} env - The Worker environment (D1, R2, etc.).
 * @param {Object} session - The authenticated session object.
 * @returns {Response} JSON response with upload result or error.
 */
//async function handleUpload(request, env, session) {
export async function handleUpload(request, env, user) {

    try {
        // Check R2 binding exists
        if (!env.MEDIA_BUCKET) {
            return jsonError(500, 'R2 media bucket is not configured');
        }

        // Parse multipart form data
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || !(file instanceof File)) {
            return jsonError(400, 'No file provided');
        }

        // Extract metadata
        const folderSlug = (formData.get('folder') || 'general').toString();
        const altText = (formData.get('alt_text') || '').toString();
        const caption = (formData.get('caption') || '').toString();
        const originalFilename = file.name || 'upload';
        const mimeType = file.type || 'application/octet-stream';
        const size = file.size;

        // Validate the file
        const validation = validateFile(originalFilename, mimeType, size);
        if (!validation.valid) {
            return jsonError(400, validation.error);
        }

        const { mediaType, ext } = validation;

        // Generate safe R2 key
        const r2Key = generateR2Key(folderSlug, ext);

        // Read file as ArrayBuffer
        const fileBuffer = await file.arrayBuffer();

        // Upload to R2
        await env.MEDIA_BUCKET.put(r2Key, fileBuffer, {
            httpMetadata: {
                contentType: mimeType,
            },
            customMetadata: {
                uploadedBy: String(user.user_id),
                originalFilename: originalFilename,
                uploadedAt: new Date().toISOString(),
            },
        });

        // Generate public URL
        const site = await getSiteContext(request, env);
        const publicUrl = generatePublicUrl(r2Key, site.hostname);

        // Generate thumbnail URLs for images
        let thumbnailUrl = null;
        let responsiveSrcset = null;
        if (mediaType === 'image') {
            const thumbs = generateThumbnailUrls(publicUrl);
            thumbnailUrl = thumbs.thumbnail;
            responsiveSrcset = thumbs.responsive.join(', ');
        }

        // Extract dimensions (from client or null)
        const { width, height } = extractDimensions(formData);

        // Store metadata in D1
        const mediaItem = await createMediaItem(env, {
            filename: originalFilename,
            url: publicUrl,
            thumbnail_url: thumbnailUrl,
            alt_text: altText,
            width: width,
            height: height,
            mime_type: mimeType,
            size: size,
            folder: folderSlug,
            uploaded_by: user.user_id,
            r2_key: r2Key,
            original_filename: originalFilename,
            type: mediaType,
            caption: caption,
            file_ext: ext,
          });
          if (!mediaItem) {
              throw new Error("createMediaItem returned undefined");
          }



        // Return success response
        return jsonResponse(201, {
            success: true,
            media: {
                id: mediaItem.id,
                url: publicUrl,
                thumbnail_url: thumbnailUrl,
                responsive_srcset: responsiveSrcset,
                alt_text: altText,
                caption: caption,
                type: mediaType,
                mime_type: mimeType,
                size: size,
                width: width,
                height: height,
                folder: folderSlug,
                r2_key: r2Key,
                filename: originalFilename,
                created_at: mediaItem.created_at,
            },
        });

    } catch (error) {
        console.error('Upload error:', error);
        return jsonError(500, 'Upload failed: ' + (error.message || 'Unknown error'));
    }
}

// ── Delete handler ───────────────────────────────────

/**
 * Handles deletion of a media item.
 * Deletes the R2 object and the D1 metadata row.
 * Permission check: editors can delete their own media, admins can delete any.
 *
 * @param {Request} request - The incoming request.
 * @param {Object} env - The Worker environment.
 * @param {Object} session - The authenticated session object.
 * @param {number} mediaId - The media item ID to delete.
 * @returns {Response} JSON response.
 */
//async function handleDelete(request, env, session, mediaId) {
export async function handleDelete(request, env, user, mediaId) {
    try {
        // Check R2 binding exists
        if (!env.MEDIA_BUCKET) {
            return jsonError(500, 'R2 media bucket is not configured');
        }

        // Get the media item to find the R2 key
        const media = await getMediaById(env, mediaId);
        if (!media) {
            return jsonError(404, 'Media item not found');
        }

        // Permission check: editors can only delete their own uploads
        if (user.role === 'editor' && media.uploaded_by !== user.user_id) {
            return jsonError(403, 'You can only delete your own media uploads');
        }

        // Delete from R2 if r2_key exists
        if (media.r2_key) {
            try {
                await env.MEDIA_BUCKET.delete(media.r2_key);
            } catch (r2Error) {
                // Log but don't fail — D1 record should still be cleaned up
                console.error('R2 delete error (non-fatal):', r2Error);
            }
        }

        // Delete from D1
        await deleteMediaItem(env, mediaId);

        return jsonResponse(200, {
            success: true,
            message: 'Media deleted successfully',
            id: mediaId,
        });

    } catch (error) {
        console.error('Delete error:', error);
        return jsonError(500, 'Delete failed: ' + (error.message || 'Unknown error'));
    }
}

// ── R2 media serving ──────────────────────────────────

/**
 * Serves a media file directly from R2.
 * This handles GET /media/{folder}/{filename} requests.
 * Sets appropriate content-type and caching headers.
 *
 * @param {Request} request - The incoming request.
 * @param {Object} env - The Worker environment.
 * @param {string} r2Key - The R2 object key (media/{folder}/{file}).
 * @returns {Response} The file response with appropriate headers.
 */
export async function serveMedia(request, env, r2Key) {
    try {
        if (!env.MEDIA_BUCKET) {
            return new Response('Media storage not configured', { status: 503 });
        }

        // Get object from R2
        const object = await env.MEDIA_BUCKET.get(r2Key);

        if (!object) {
            return new Response('Media not found', { status: 404 });
        }

        // Get content type from R2 metadata
        const contentType = object.httpMetadata?.contentType || 'application/octet-stream';

        // Build response headers
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('ETag', object.httpEtag);

        // Handle conditional requests (304 Not Modified)
        const ifNoneMatch = request.headers.get('If-None-Match');
        if (ifNoneMatch && ifNoneMatch === object.httpEtag) {
            return new Response(null, { status: 304, headers });
        }

        // Return the file body
        return new Response(object.body, { headers });

    } catch (error) {
        console.error('Serve media error:', error);
        return new Response('Error serving media', { status: 500 });
    }
}

