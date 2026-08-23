// =====================================================
// rich-editor.js — Reusable TinyMCE Rich Editor Component
// =====================================================
//
// Single source of truth for all rich text editing in the
// Tenant CMS. Used by news, reviews, pages, dynamic
// pages, static pages, and any future content type.
//
// Features:
//   - Lazy-loads TinyMCE 7 from Cloudflare CDN (once per page)
//   - Auto-initializes on <textarea data-rich-editor> elements
//   - Full publishing toolbar (see TOOLBAR_CONFIG below)
//   - R2 image upload via /api/v1/media/upload
//   - Cloudflare Stream / R2 video embed
//   - Media library picker integration (Phase 5)
//   - Content syncs back to <textarea> for existing form handlers
//   - Autosave to localStorage (recoverable after crash)
//   - Global RichEditor API for programmatic control
//   - Responsive: works on desktop, tablet, mobile
//   - Dark mode compatible (auto-detects dashboard theme)
//
// Usage (HTML):
//   <textarea name="content" data-rich-editor data-editor-id="news-content"></textarea>
//   <script src="/static/js/rich-editor.js"></script>
//
// Usage (JS):
//   RichEditor.get('news-content');       // → HTML string
//   RichEditor.set('news-content', html);  // Set content
//   RichEditor.insertImage('news-content', url, alt);
//   RichEditor.destroy('news-content');
//
// =====================================================

(function () {
    'use strict';

    // ── Configuration ────────────────────────────────

    // TinyMCE loaded from Cloudflare CDN (fast, cached, no npm build needed)
    // Using TinyMCE 7 free build (MIT-licensed core, standard plugins)
    var TINYMCE_CDN_URL = 'https://cdn.jsdelivr.net/npm/tinymce@7.4.0/tinymce.min.js';

    // API endpoints (match Phase 3 routes)
    var API_UPLOAD = '/en/api/v1/media/upload';
    var API_MEDIA_LIST = '/en/api/v1/media/list';
    var API_MEDIA_SEARCH = '/en/api/v1/media/search';

    // Maximum file size for image uploads (10 MB — matches server config)
    var MAX_IMAGE_SIZE = 10 * 1024 * 1024;

    // Allowed image extensions
    var ALLOWED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];

    // Allowed video embed sources (for iframe sanitization)
    var ALLOWED_VIDEO_SOURCES = [
        'https://www.youtube.com/embed/',
        'https://youtube.com/embed/',
        'https://player.vimeo.com/video/',
        'https://players.brightcove.net/',
        'https://iframe.cloudflarestream.com/',
        'https://watch.cloudflarestream.com/'
    ];

    // Track if TinyMCE script has been loaded or is loading
    var tinymceLoaded = false;
    var tinymceLoading = false;
    var pendingEditors = [];

    // Registry of active editor instances
    var editorRegistry = {};

    // ── Utility functions ──────────────────────────────

    /**
     * Gets the CSRF token from the cookie or meta tag.
     * The existing auth system uses session cookies, so we
     * include credentials in fetch requests.
     * @returns {string} The CSRF token or empty string.
     */
    function getCsrfToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }

    /**
     * Detects if the dashboard is in dark mode.
     * Checks for a 'dark' class on body or html, or a data-theme attribute.
     * @returns {boolean} True if dark mode is active.
     */
    function isDarkMode() {
        var body = document.body;
        var html = document.documentElement;
        if (body && body.classList.contains('dark')) return true;
        if (html && html.classList.contains('dark')) return true;
        if (html && html.getAttribute('data-theme') === 'dark') return true;
        if (body && body.getAttribute('data-theme') === 'dark') return true;
        // Check CSS variable
        var bg = getComputedStyle(body || html).backgroundColor;
        if (bg) {
            var rgb = bg.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
                var brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
                return brightness < 128;
            }
        }
        return false;
    }

    /**
     * Generates a unique ID for an editor instance.
     * @param {HTMLElement} textarea - The textarea element.
     * @returns {string} A unique editor ID.
     */
    function generateEditorId(textarea) {
        if (textarea.dataset.editorId) return textarea.dataset.editorId;
        var id = 'editor_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        textarea.dataset.editorId = id;
        return id;
    }

    /**
     * Shows a toast notification (uses existing dashboard notification pattern
     * or falls back to a simple alert).
     * @param {string} message - The message to show.
     * @param {string} type - 'success', 'error', or 'info'.
     */
    function showToast(message, type) {
        // Try existing dashboard notification system
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
            return;
        }
        // Try existing dashboard toast
        var toast = document.querySelector('.dashboard-toast');
        if (toast) {
            toast.textContent = message;
            toast.className = 'dashboard-toast ' + (type || 'info');
            toast.style.display = 'block';
            setTimeout(function () { toast.style.display = 'none'; }, 3000);
            return;
        }
        // Fallback — create a temporary toast
        var el = document.createElement('div');
        el.textContent = message;
        el.style.cssText =
            'position:fixed;bottom:20px;right:20px;padding:12px 20px;' +
            'border-radius:6px;color:#fff;font-size:14px;z-index:100000;' +
            'background:' + (type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db') + ';' +
            'box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.3s;';
        document.body.appendChild(el);
        setTimeout(function () {
            el.style.opacity = '0';
            setTimeout(function () { el.remove(); }, 300);
        }, 3000);
    }

    // ── Autosave to localStorage ───────────────────────

    /**
     * Saves editor content to localStorage for crash recovery.
     * @param {string} editorId - The editor instance ID.
     * @param {string} content - The HTML content to save.
     */
    function autosave(editorId, content) {
        try {
            localStorage.setItem('richeditor_autosave_' + editorId, content);
            localStorage.setItem('richeditor_autosave_time_' + editorId, Date.now().toString());
        } catch (e) {
            // localStorage might be full or disabled — silently ignore
        }
    }

    /**
     * Retrieves autosaved content from localStorage.
     * @param {string} editorId - The editor instance ID.
     * @returns {string|null} The autosaved content or null.
     */
    function getAutosave(editorId) {
        try {
            var content = localStorage.getItem('richeditor_autosave_' + editorId);
            var time = localStorage.getItem('richeditor_autosave_time_' + editorId);
            if (!content || !time) return null;
            // Only offer autosave if it's less than 24 hours old
            var age = Date.now() - parseInt(time, 10);
            if (age > 24 * 60 * 60 * 1000) {
                localStorage.removeItem('richeditor_autosave_' + editorId);
                localStorage.removeItem('richeditor_autosave_time_' + editorId);
                return null;
            }
            return content;
        } catch (e) {
            return null;
        }
    }

    /**
     * Clears autosaved content for an editor.
     * @param {string} editorId - The editor instance ID.
     */
    function clearAutosave(editorId) {
        try {
            localStorage.removeItem('richeditor_autosave_' + editorId);
            localStorage.removeItem('richeditor_autosave_time_' + editorId);
        } catch (e) {
            // Ignore
        }
    }

    // ── Image upload handler ───────────────────────────

    /**
     * Uploads an image file to R2 via the media upload API.
     * @param {File} file - The image file to upload.
     * @param {string} folder - The folder slug (default: 'general').
     * @returns {Promise<Object>} The upload response with URL and metadata.
     */
    async function uploadImage(file, folder) {
        var formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folder || 'general');

        // Get image dimensions for the server
        var dimensions = await getImageDimensions(file);
        if (dimensions) {
            formData.append('width', dimensions.width);
            formData.append('height', dimensions.height);
        }

        var response = await fetch(API_UPLOAD, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'X-CSRF-Token': getCsrfToken()
            },
            body: formData
        });

        var result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Upload failed');
        }

        return result.media;
    }

    /**
     * Gets the dimensions of an image file.
     * @param {File} file - The image file.
     * @returns {Promise<{width: number, height: number}|null>}
     */
    function getImageDimensions(file) {
        return new Promise(function (resolve) {
            if (!file.type.startsWith('image/')) {
                resolve(null);
                return;
            }
            // SVG dimensions are not reliably available via Image object
            if (file.type === 'image/svg+xml') {
                resolve(null);
                return;
            }
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
                URL.revokeObjectURL(url);
            };
            img.onerror = function () {
                resolve(null);
                URL.revokeObjectURL(url);
            };
            img.src = url;
        });
    }

    /**
     * Validates an image file before upload.
     * @param {File} file - The file to validate.
     * @returns {{valid: boolean, error?: string}}
     */
    function validateImageFile(file) {
        if (!file) return { valid: false, error: 'No file selected' };

        // Check size
        if (file.size > MAX_IMAGE_SIZE) {
            return { valid: false, error: 'Image size exceeds 10MB limit' };
        }

        // Check extension
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        if (ALLOWED_IMAGE_EXTS.indexOf(ext) === -1) {
            return { valid: false, error: 'File type .' + ext + ' is not allowed. Use: ' + ALLOWED_IMAGE_EXTS.join(', ') };
        }

        return { valid: true };
    }

    // ── TinyMCE toolbar configuration ─────────────────

    /**
     * Builds the TinyMCE toolbar configuration.
     * This is the full publishing toolbar requested in the spec.
     * @returns {string} Toolbar button string.
     */
    function getToolbarConfig() {
        return [
            'undo redo',
            '|',
            'bold italic underline strikethrough',
            '|',
            'forecolor backcolor',
            '|',
            'fontsize select',
            '|',
            'blocks',
            '|',
            'alignleft aligncenter alignright alignjustify',
            '|',
            'bullist numlist outdent indent',
            '|',
            'table tabledelete tableprops tablecellprops tablerowprops tablemergecells tablesplitcells',
            '|',
            'image media link anchor',
            '|',
            'code blockquote hr calloutbox addinserter',
            '|',
            'sup subscript superscript',
            '|',
            'emoticons charmap',
            '|',
            'removeformat',
            '|',
            'fullscreen preview',
            '|',
            'wordcount',
            '|',
            'customsourcecode'
        ].join(' ');
    }

    function getToolbarConfigbackup() {
        return [
            'undo redo',
            '|',
            'bold italic underline strikethrough',
            '|',
            'forecolor backcolor',
            '|',
            'fontsize select',
            '|',
            'blocks',
            '|',
            'alignleft aligncenter alignright alignjustify',
            '|',
            'bullist numlist outdent indent',
            '|',
            'table tabledelete tableprops tablecellprops tablerowprops tablemergecells tablesplitcells',
            '|',
            'image media link anchor',
            '|',
            'code blockquote hr',
            '|',
            'sup subscript superscript',
            '|',
            'emoticons charmap',
            '|',
            'removeformat',
            '|',
            'fullscreen preview',
            '|',
            'wordcount',
            '|',
            'customsourcecode'
        ].join(' ');
    }

    /**
     * Builds the TinyMCE menu bar configuration.
     * @returns {Object} Menu bar configuration object.
     */
    function getMenuConfig() {
        return {
            file: { title: 'File', items: 'newdocument restoredraft | preview | print' },
            edit: { title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace' },
            view: { title: 'View', items: 'code | visualaid visualchars visualblocks | fullscreen' },
            insert: { title: 'Insert', items: 'image link media addcomment pageembed template codesample inserttable | charmap emoticons hr | anchor toc | nonbreaking' },
            format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript codeformat | formats blockformats fontformats fontsizes align lineheight | forecolor backcolor | removeformat' },
            tools: { title: 'Tools', items: 'spellchecker spellcheckerlanguage | wordcount | code' },
            table: { title: 'Table', items: 'inserttable | cell row column | tableprops deletetable' },
            help: { title: 'Help', items: 'help' }
        };
    }

    // ── TinyMCE plugin configuration ───────────────────

    /**
     * Returns the list of TinyMCE plugins to load.
     * Only standard free plugins are included.
     * @returns {string} Space-separated plugin list.
     */
    function getPluginList() {
        return [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
            'preview', 'anchor', 'searchreplace', 'visualblocks', 'code',
            'fullscreen', 'insertdatetime', 'media', 'table', 'help',
            'wordcount', 'emoticons', 'autosave', 'quickbars', 'codesample'
        ].join(' ');
    }

    // ── Custom source code dialog ──────────────────────

    /**
     * Registers a custom "Source Code" button that opens a dialog
     * showing the raw HTML of the editor content, allowing direct editing.
     * @param {Object} editor - The TinyMCE editor instance.
     */
    function registerSourceCodePlugin(editor) {
        editor.ui.registry.addButton('customsourcecode', {
            text: 'HTML',
            tooltip: 'View / Edit Source Code',
            onAction: function () {
                var currentContent = editor.getContent();
                editor.windowManager.open({
                    title: 'Source Code',
                    size: 'large',
                    body: {
                        type: 'panel',
                        items: [{
                            type: 'textarea',
                            name: 'sourcecode',
                            label: 'HTML Source',
                            rows: 20,
                            inputMode: 'text'
                        }]
                    },
                    buttons: [
                        {
                            type: 'cancel',
                            text: 'Cancel'
                        },
                        {
                            type: 'submit',
                            text: 'Apply',
                            primary: true
                        }
                    ],
                    initialData: {
                        sourcecode: currentContent
                    },
                    onSubmit: function (api) {
                        var data = api.getData();
                        editor.setContent(data.sourcecode);
                        api.close();
                    }
                });
            }
        });
    }

    // ── Custom image upload handler for TinyMCE ────────

    /**
     * Configures TinyMCE's image uploader to use our R2 API.
     * This replaces TinyMCE's default behavior of converting images to base64.
     * @param {Object} editor - The TinyMCE editor instance.
     * @param {string} editorId - The editor instance ID.
     * @param {string} folder - The default upload folder.
     */
    function configureImageUpload(editor, editorId, folder) {
        // Handle images pasted or dragged into the editor
        editor.ui.registry.addButton('image', {
            icon: 'image',
            tooltip: 'Insert image',
            onAction: function () {
                openImageDialog(editor, editorId, folder);
            }
        });

        // Configure image upload handler (for drag & drop and paste)
        editor.options.set('images_upload_url', API_UPLOAD);
        editor.options.set('images_upload_credentials', true);

        // Custom upload handler — intercepts TinyMCE's image upload
        editor.options.set('images_upload_handler', function (blobInfo, progress) {
            return new Promise(function (resolve, reject) {
                var file = blobInfo.blob();
                var validation = validateImageFile(file);
                if (!validation.valid) {
                    reject(validation.error);
                    return;
                }

                uploadImage(file, folder).then(function (media) {
                    resolve(media.url);
                }).catch(function (error) {
                    reject(error.message || 'Upload failed');
                });
            });
        });
    }

    /**
     * Opens the image insertion dialog.
     * Provides two tabs: "Upload" (upload new image) and "Library" (pick from media library).
     * @param {Object} editor - The TinyMCE editor instance.
     * @param {string} editorId - The editor instance ID.
     * @param {string} folder - The default upload folder.
     */
    function openImageDialog(editor, editorId, folder) {
        // Check if media library picker is available (Phase 5)
        if (typeof window.MediaPicker !== 'undefined' && typeof window.MediaPicker.openImagePicker === 'function') {
            // Use the full media picker from Phase 5
            window.MediaPicker.openImagePicker(function (media) {
                insertImageIntoEditor(editor, media.url, media.alt_text || '', media.width, media.height);
            }, folder);
            return;
        }

        // Fallback: simple upload dialog
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;

            var validation = validateImageFile(file);
            if (!validation.valid) {
                showToast(validation.error, 'error');
                input.remove();
                return;
            }

            showToast('Uploading image...', 'info');

            uploadImage(file, folder).then(function (media) {
                insertImageIntoEditor(editor, media.url, '', media.width, media.height);
                showToast('Image uploaded successfully', 'success');
            }).catch(function (error) {
                showToast(error.message || 'Upload failed', 'error');
            }).finally(function () {
                input.remove();
            });
        });

        input.click();
    }

    /**
     * Inserts an image into the TinyMCE editor with proper attributes.
     * @param {Object} editor - The TinyMCE editor instance.
     * @param {string} url - The image URL.
     * @param {string} alt - The alt text.
     * @param {number|null} width - Image width (optional).
     * @param {number|null} height - Image height (optional).
     */
    function insertImageIntoEditor(editor, url, alt, width, height) {
        var html = '<img src="' + url + '" alt="' + (alt || '') + '" loading="lazy"';
        if (width) html += ' width="' + width + '"';
        if (height) html += ' height="' + height + '"';
        html += ' />';
        editor.insertContent(html);
    }

    // ── Custom video embed handler ────────────────────

    /**
     * Configures the video/media button to use a custom dialog
     * that supports Cloudflare Stream, R2-hosted videos, and standard embeds.
     * @param {Object} editor - The TinyMCE editor instance.
     * @param {string} editorId - The editor instance ID.
     * @param {string} folder - The default upload folder.
     */
    function configureVideoEmbed(editor, editorId, folder) {
        // Override the media button with our custom handler
        editor.ui.registry.addButton('media', {
            icon: 'embed',
            tooltip: 'Insert video',
            onAction: function () {
                openVideoDialog(editor, editorId, folder);
            }
        });
    }

    /**
     * Opens the video insertion dialog.
     * Supports: Cloudflare Stream embed, YouTube/Vimeo embed, R2 video upload.
     * @param {Object} editor - The TinyMCE editor instance.
     * @param {string} editorId - The editor instance ID.
     * @param {string} folder - The default upload folder.
     */
    function openVideoDialog(editor, editorId, folder) {
        editor.windowManager.open({
            title: 'Insert Video',
            size: 'normal',
            body: {
                type: 'panel',
                items: [
                    {
                        type: 'input',
                        name: 'embedurl',
                        label: 'Video embed URL (YouTube, Vimeo, Cloudflare Stream)',
                        placeholder: 'https://www.youtube.com/embed/VIDEO_ID'
                    },
                    {
                        type: 'textarea',
                        name: 'iframehtml',
                        label: 'Or paste iframe embed code',
                        rows: 4
                    },
                    {
                        type: 'urlinput',
                        name: 'r2url',
                        label: 'Or enter R2 video URL (MP4/WebM)',
                        filetype: 'file'
                    },
                    {
                        type: 'input',
                        name: 'poster',
                        label: 'Poster image URL (optional)',
                        placeholder: 'https://...'
                    },
                    {
                        type: 'input',
                        name: 'width',
                        label: 'Width (px)',
                        inputMode: 'numeric',
                        placeholder: '640'
                    },
                    {
                        type: 'input',
                        name: 'height',
                        label: 'Height (px)',
                        inputMode: 'numeric',
                        placeholder: '360'
                    }
                ]
            },
            buttons: [
                {
                    type: 'cancel',
                    text: 'Cancel'
                },
                {
                    type: 'submit',
                    text: 'Insert',
                    primary: true
                }
            ],
            initialData: {
                embedurl: '',
                iframehtml: '',
                r2url: '',
                poster: '',
                width: '640',
                height: '360'
            },
            onSubmit: function (api) {
                var data = api.getData();
                var html = buildVideoEmbed(data);
                if (html) {
                    editor.insertContent(html);
                    api.close();
                } else {
                    showToast('Please provide a video URL or embed code', 'error');
                }
            }
        });
    }

    /**
     * Builds the video embed HTML from dialog data.
     * @param {Object} data - The dialog form data.
     * @returns {string} The HTML embed code, or empty string if invalid.
     */
    function buildVideoEmbed(data) {
        var width = parseInt(data.width, 10) || 640;
        var height = parseInt(data.height, 10) || 360;

        // Option 1: Iframe embed code (paste)
        if (data.iframehtml && data.iframehtml.trim()) {
            // Extract src from iframe for sanitization
            var srcMatch = data.iframehtml.match(/src=["']([^"']+)["']/i);
            if (srcMatch) {
                var src = srcMatch[1];
                if (isAllowedVideoSource(src)) {
                    return '<iframe src="' + src + '" width="' + width + '" height="' + height + '" frameborder="0" allowfullscreen loading="lazy"></iframe>';
                }
            }
            // If we can't extract/validate src, return the raw iframe HTML
            // (it will be sanitized at render time by Phase 2)
            return data.iframehtml;
        }

        // Option 2: Embed URL (YouTube, Vimeo, Stream)
        if (data.embedurl && data.embedurl.trim()) {
            var url = data.embedurl.trim();
            if (isAllowedVideoSource(url)) {
                return '<iframe src="' + url + '" width="' + width + '" height="' + height + '" frameborder="0" allowfullscreen loading="lazy"></iframe>';
            }
            showToast('Video source not in allowed list', 'error');
            return '';
        }

        // Option 3: R2 video URL (direct MP4/WebM)
        if (data.r2url && data.r2url.value) {
            var videoSrc = data.r2url.value;
            var posterAttr = data.poster ? ' poster="' + data.poster + '"' : '';
            return '<video src="' + videoSrc + '"' + posterAttr + ' width="' + width + '" height="' + height + '" controls preload="metadata"></video>';
        }

        return '';
    }

    /**
     * Checks if a video source URL is from an allowed provider.
     * @param {string} url - The URL to check.
     * @returns {boolean} True if allowed.
     */
    function isAllowedVideoSource(url) {
        var lower = url.toLowerCase();
        for (var i = 0; i < ALLOWED_VIDEO_SOURCES.length; i++) {
            if (lower.startsWith(ALLOWED_VIDEO_SOURCES[i])) return true;
        }
        // Allow own domain
        if (window.location.hostname && lower.startsWith('https://' + window.location.hostname)) return true;
        return false;
    }

    // ── Internal link handler ──────────────────────────

    /**
     * Configures the link button to support internal linking.
     * Adds an "Internal Link" option that lets editors search for pages,
     * news, reviews, and casinos to link to.
     * @param {Object} editor - The TinyMCE editor instance.
     */
    
        // ── Ad Inserter plugin ─────────────────────────────

    /**
     * Registers the "Add Advert" button.
     * Opens a dialog showing all available ads (from settings + components)
     * and lets the editor insert <!--AD-->, <!--AD1-->, <!--AD2--> markers
     * at the cursor position.
     * @param {Object} editor - The TinyMCE editor instance.
     */
    function configureAdInserter(editor) {
        editor.ui.registry.addButton('addinserter', {
            text: 'Ad',
            tooltip: 'Insert advertisement marker',
            onAction: function () {
                openAdInserterDialog(editor);
            }
        });
    }

    /**
     * Opens the ad inserter dialog.
     * Fetches available ads from the API and displays them.
     * @param {Object} editor - The TinyMCE editor instance.
     */
    function openAdInserterDialog(editor) {
        // Show loading dialog first
        editor.windowManager.open({
            title: 'Insert Advertisement',
            size: 'normal',
            body: {
                type: 'panel',
                items: [
                    {
                        type: 'htmlpanel',
                        html: '<div style="padding:20px;text-align:center;color:#999">Loading available ads...</div>'
                    },
                    {
                        type: 'listbox',
                        name: 'admarker',
                        label: 'Ad marker to insert',
                        items: [
                            { text: '— Select an ad slot —', value: '' },
                            { text: '<!--AD-->  (first ad)', value: '<!--AD-->' },
                            { text: '<!--AD1--> (first ad, explicit)', value: '<!--AD1-->' },
                            { text: '<!--AD2--> (second ad)', value: '<!--AD2-->' },
                            { text: '<!--AD3--> (third ad)', value: '<!--AD3-->' },
                            { text: '<!--AD4--> (fourth ad)', value: '<!--AD4-->' },
                            { text: '<!--AD5--> (fifth ad)', value: '<!--AD5-->' }
                        ]
                    }
                ]
            },
            buttons: [
                { type: 'cancel', text: 'Cancel' },
                { type: 'submit', text: 'Insert Marker', primary: true }
            ],
            initialData: { admarker: '' },
            onSubmit: function (api) {
                var data = api.getData();
                if (!data.admarker) {
                    showToast('Please select an ad marker', 'error');
                    return;
                }
                editor.insertContent('\n' + data.admarker + '\n');
                showToast('Ad marker inserted: ' + data.admarker, 'success');
                api.close();
            }
        });

        // Fetch available ads and rebuild the dialog
        fetchAvailableAds().then(function (ads) {
            var adListHtml = buildAdListHtml(ads);

            editor.windowManager.open({
                title: 'Insert Advertisement',
                size: 'normal',
                body: {
                    type: 'panel',
                    items: [
                        {
                            type: 'htmlpanel',
                            html: adListHtml
                        },
                        {
                            type: 'listbox',
                            name: 'admarker',
                            label: 'Ad marker to insert at cursor',
                            items: [
                                { text: '— Select an ad slot —', value: '' },
                                { text: '<!--AD-->  (first ad)', value: '<!--AD-->' },
                                { text: '<!--AD1--> (first ad, explicit)', value: '<!--AD1-->' },
                                { text: '<!--AD2--> (second ad)', value: '<!--AD2-->' },
                                { text: '<!--AD3--> (third ad)', value: '<!--AD3-->' },
                                { text: '<!--AD4--> (fourth ad)', value: '<!--AD4-->' },
                                { text: '<!--AD5--> (fifth ad)', value: '<!--AD5-->' }
                            ]
                        }
                    ]
                },
                buttons: [
                    { type: 'cancel', text: 'Cancel' },
                    { type: 'submit', text: 'Insert Marker', primary: true }
                ],
                initialData: { admarker: '' },
                onSubmit: function (api) {
                    var data = api.getData();
                    if (!data.admarker) {
                        showToast('Please select an ad marker', 'error');
                        return;
                    }
                    editor.insertContent('\n' + data.admarker + '\n');
                    showToast('Ad marker inserted: ' + data.admarker, 'success');
                    api.close();
                }
            });
        }).catch(function () {
            showToast('Could not load ad list', 'error');
        });
    }

    /**
     * Fetches available ads from the API.
     * Returns ad components (type=ad) and the settings fallback ad.
     * @returns {Promise<Array>} Array of ad objects.
     */
    async function fetchAvailableAds() {
        var ads = [];

        // 1. Fetch ad components
        try {
            var res = await fetch('/api/v1/components/list?type=ad', { credentials: 'same-origin' });
            if (res.ok) {
                var data = await res.json();
                var components = data.components || [];
                for (var i = 0; i < components.length; i++) {
                    ads.push({
                        name: components[i].name,
                        slug: components[i].slug,
                        status: components[i].status,
                        source: 'component',
                        preview: (components[i].content || '').substring(0, 200)
                    });
                }
            }
        } catch (e) {
            // Ignore — components endpoint may not be available
        }

        // 2. Fetch settings fallback ad
        try {
            var settingsRes = await fetch('/api/v1/settings/get', { credentials: 'same-origin' });
            if (settingsRes.ok) {
                var settingsData = await settingsRes.json();
                var settings = settingsData.settings || {};
                if (settings.news_inline_ad) {
                    var isComponent = settings.news_inline_ad.startsWith('component:');
                    ads.push({
                        name: isComponent
                            ? 'Fallback: ' + settings.news_inline_ad
                            : 'Fallback Ad (raw HTML)',
                        slug: isComponent ? settings.news_inline_ad.slice(10) : 'settings',
                        status: 'active',
                        source: 'settings',
                        preview: isComponent
                            ? 'Loads component: ' + settings.news_inline_ad.slice(10)
                            : settings.news_inline_ad.substring(0, 200)
                    });
                }
            }
        } catch (e) {
            // Ignore
        }

        return ads;
    }

    /**
     * Builds the HTML for the ad list display in the dialog.
     * @param {Array} ads - Array of ad objects.
     * @returns {string} HTML string.
     */
    function buildAdListHtml(ads) {
        if (!ads || ads.length === 0) {
            return '<div style="padding:20px;text-align:center;color:#999">' +
                'No ads found. Create ad components (type = "ad") in the ' +
                '<a href="/en/admin/components" target="_blank">Components</a> page, ' +
                'or set fallback HTML in <a href="/en/admin/settings" target="_blank">Settings</a>.' +
                '</div>';
        }

        var html = '<div style="padding:12px;max-height:300px;overflow-y:auto">';

        html += '<div style="margin-bottom:10px;font-size:12px;color:#888">' +
            ads.length + ' ad' + (ads.length > 1 ? 's' : '') + ' available. ' +
            'Ads are auto-inserted if no markers are placed. ' +
            'Use markers below to control exact placement.' +
            '</div>';

        for (var i = 0; i < ads.length; i++) {
            var ad = ads[i];
            var isActive = ad.status === 'active';
            var badgeColor = isActive ? '#22c55e' : '#a1a1aa';
            var badgeBg = isActive ? 'rgba(34,197,94,0.12)' : 'rgba(161,161,170,0.12)';
            var sourceIcon = ad.source === 'component' ? '🧩' : '⚙️';

            html += '<div style="padding:10px 12px;margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">';
            html += '<strong style="font-size:13px">' + sourceIcon + ' ' + escapeEditorHtml(ad.name) + '</strong>';
            html += '<span style="font-size:11px;padding:2px 8px;border-radius:999px;background:' + badgeBg + ';color:' + badgeColor + '">' + (isActive ? 'Active' : 'Inactive') + '</span>';
            html += '</div>';
            html += '<div style="font-size:11px;color:#888;margin-bottom:4px">Slug: <code>' + escapeEditorHtml(ad.slug) + '</code> · Source: ' + ad.source + '</div>';
            if (ad.preview) {
                html += '<div style="font-size:11px;color:#aaa;max-height:40px;overflow:hidden;text-overflow:ellipsis">' + escapeEditorHtml(ad.preview) + '</div>';
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ── Callout Box plugin ──────────────────────────────

    /**
     * Registers the "Add Callout" button.
     * Opens a form to create a styled callout/info box with
     * title, text, background color, text color, and optional icon.
     * @param {Object} editor - The TinyMCE editor instance.
     */
    function configureCalloutBox(editor) {
        editor.ui.registry.addButton('calloutbox', {
            text: 'Callout',
            tooltip: 'Insert callout / info box',
            onAction: function () {
                openCalloutDialog(editor);
            }
        });
    }

    /**
     * Opens the callout box dialog.
     * @param {Object} editor - The TinyMCE editor instance.
     */
    function openCalloutDialog(editor) {
        var selectedText = editor.selection.getContent({ format: 'text' });

        var presetColors = [
            { text: 'Blue (Info)', value: '#dbeafe' },
            { text: 'Green (Success)', value: '#d1fae5' },
            { text: 'Yellow (Warning)', value: '#fef3c7' },
            { text: 'Red (Error)', value: '#fee2e2' },
            { text: 'Purple (Tip)', value: '#ede9fe' },
            { text: 'Gray (Neutral)', value: '#f3f4f6' },
            { text: 'Dark', value: '#1f2937' },
            { text: 'Custom...', value: 'custom' }
        ];

        editor.windowManager.open({
            title: 'Insert Callout Box',
            size: 'normal',
            body: {
                type: 'panel',
                items: [
                    {
                        type: 'input',
                        name: 'callouttitle',
                        label: 'Title (optional)',
                        placeholder: 'e.g., Important Notice'
                    },
                    {
                        type: 'textarea',
                        name: 'callouttext',
                        label: 'Content',
                        rows: 4,
                        placeholder: 'Enter the callout text...'
                    },
                    {
                        type: 'listbox',
                        name: 'bgcolor',
                        label: 'Background color',
                        items: presetColors
                    },
                    {
                        type: 'colorpicker',
                        name: 'custombg',
                        label: 'Custom background color'
                    },
                    {
                        type: 'listbox',
                        name: 'textcolor',
                        label: 'Text color',
                        items: [
                            { text: 'Dark', value: '#1f2937' },
                            { text: 'White', value: '#ffffff' },
                            { text: 'Blue', value: '#1e40af' },
                            { text: 'Green', value: '#065f46' },
                            { text: 'Red', value: '#991b1b' },
                            { text: 'Purple', value: '#5b21b6' },
                            { text: 'Gray', value: '#4b5563' }
                        ]
                    },
                    {
                        type: 'listbox',
                        name: 'icon',
                        label: 'Icon (optional)',
                        items: [
                            { text: 'No icon', value: '' },
                            { text: 'ℹ️ Info', value: 'ℹ️' },
                            { text: '✅ Success', value: '✅' },
                            { text: '⚠️ Warning', value: '⚠️' },
                            { text: '❌ Error', value: '❌' },
                            { text: '💡 Tip', value: '💡' },
                            { text: '🔥 Hot', value: '🔥' },
                            { text: '⭐ Featured', value: '⭐' },
                            { text: '🔒 Security', value: '🔒' },
                            { text: '💰 Bonus', value: '💰' }
                        ]
                    },
                    {
                        type: 'listbox',
                        name: 'borderradius',
                        label: 'Corner radius',
                        items: [
                            { text: 'Rounded (12px)', value: '12px' },
                            { text: 'Slightly rounded (8px)', value: '8px' },
                            { text: 'Sharp (0px)', value: '0px' },
                            { text: 'Pill (999px)', value: '999px' }
                        ]
                    }
                ]
            },
            buttons: [
                { type: 'cancel', text: 'Cancel' },
                { type: 'submit', text: 'Insert', primary: true }
            ],
            initialData: {
                callouttitle: '',
                callouttext: selectedText || '',
                bgcolor: '#dbeafe',
                custombg: '#dbeafe',
                textcolor: '#1f2937',
                icon: 'ℹ️',
                borderradius: '12px'
            },
            onSubmit: function (api) {
                var data = api.getData();

                if (!data.callouttext.trim() && !data.callouttitle.trim()) {
                    showToast('Please enter a title or content', 'error');
                    return;
                }

                var bgColor = data.bgcolor === 'custom' ? data.custombg : data.bgcolor;
                var textColor = data.textcolor;
                var radius = data.borderradius || '12px';

                var iconHtml = data.icon
                    ? '<span style="font-size:20px;margin-right:10px;flex-shrink:0">' + data.icon + '</span>'
                    : '';

                var titleHtml = data.callouttitle
                    ? '<strong style="display:block;margin-bottom:6px;font-size:15px">' + escapeEditorHtml(data.callouttitle) + '</strong>'
                    : '';

                var html =
                    '<div style="' +
                    'display:flex;' +
                    'align-items:flex-start;' +
                    'padding:16px 20px;' +
                    'margin:20px 0;' +
                    'background:' + bgColor + ';' +
                    'color:' + textColor + ';' +
                    'border-radius:' + radius + ';' +
                    'border:1px solid rgba(0,0,0,0.06);' +
                    '">' +
                    iconHtml +
                    '<div style="flex:1">' +
                    titleHtml +
                    '<div style="font-size:14px;line-height:1.6">' + escapeEditorHtml(data.callouttext) + '</div>' +
                    '</div>' +
                    '</div>';

                editor.insertContent(html);
                showToast('Callout box inserted', 'success');
                api.close();
            }
        });
    }

    /**
     * Escapes HTML for safe display in editor dialogs.
     * @param {string} text - The text to escape.
     * @returns {string} Escaped HTML.
     */
    function escapeEditorHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }


    function configureInternalLink(editor) {
        // The default TinyMCE link dialog already supports URL entry.
        // We add a custom button for internal link search.
        editor.ui.registry.addButton('internallink', {
            text: 'Internal',
            tooltip: 'Insert internal link',
            icon: 'link',
            onAction: function () {
                openInternalLinkDialog(editor);
            }
        });
    }

    /**
     * Opens the internal link dialog.
     * Searches existing content (news, reviews, pages, casinos) via API
     * and inserts a link to the selected item.
     * @param {Object} editor - The TinyMCE editor instance.
     */
    function openInternalLinkDialog(editor) {
        var selectedText = editor.selection.getContent({ format: 'text' });

        editor.windowManager.open({
            title: 'Insert Internal Link',
            size: 'normal',
            body: {
                type: 'panel',
                items: [
                    {
                        type: 'input',
                        name: 'search',
                        label: 'Search for content (title or slug)',
                        placeholder: 'e.g., best-casinos or review title'
                    },
                    {
                        type: 'listbox',
                        name: 'linktarget',
                        label: 'Search results',
                        items: [{
                            text: 'Type to search...',
                            value: ''
                        }]
                    },
                    {
                        type: 'input',
                        name: 'linktext',
                        label: 'Link text',
                        value: selectedText || ''
                    },
                    {
                        type: 'checkbox',
                        name: 'newtab',
                        label: 'Open in new tab',
                        checked: false
                    }
                ]
            },
            buttons: [
                {
                    type: 'cancel',
                    text: 'Cancel'
                },
                {
                    type: 'submit',
                    text: 'Insert Link',
                    primary: true
                }
            ],
            initialData: {
                search: '',
                linktarget: '',
                linktext: selectedText || '',
                newtab: false
            },
            onTabChange: function (api, details) {
                // Handle tab changes if needed
            },
            onChange: function (api) {
                var data = api.getData();
                if (data.search && data.search.length > 2) {
                    searchInternalLinks(data.search).then(function (results) {
                        var items = results.map(function (r) {
                            return { text: r.title + ' (' + r.type + ')', value: r.url };
                        });
                        if (items.length === 0) {
                            items = [{ text: 'No results found', value: '' }];
                        }
                        api.redial({
                            title: 'Insert Internal Link',
                            size: 'normal',
                            body: {
                                type: 'panel',
                                items: [
                                    {
                                        type: 'input',
                                        name: 'search',
                                        label: 'Search for content (title or slug)',
                                        value: data.search
                                    },
                                    {
                                        type: 'listbox',
                                        name: 'linktarget',
                                        label: 'Search results',
                                        items: items
                                    },
                                    {
                                        type: 'input',
                                        name: 'linktext',
                                        label: 'Link text',
                                        value: data.linktext
                                    },
                                    {
                                        type: 'checkbox',
                                        name: 'newtab',
                                        label: 'Open in new tab',
                                        checked: data.newtab
                                    }
                                ]
                            },
                            buttons: [
                                { type: 'cancel', text: 'Cancel' },
                                { type: 'submit', text: 'Insert Link', primary: true }
                            ],
                            initialData: data,
                            onSubmit: function (submitApi) {
                                handleInternalLinkSubmit(editor, submitApi);
                            }
                        });
                    });
                }
            },
            onSubmit: function (api) {
                handleInternalLinkSubmit(editor, api);
            }
        });
    }

    /**
     * Handles the internal link dialog submission.
     * @param {Object} editor - The TinyMCE editor instance.
     * @param {Object} api - The dialog API.
     */
    function handleInternalLinkSubmit(editor, api) {
        var data = api.getData();
        if (!data.linktarget) {
            showToast('Please select a link target', 'error');
            return;
        }
        var text = data.linktext || data.linktarget;
        var target = data.newtab ? ' target="_blank" rel="noopener"' : '';
        var html = '<a href="' + data.linktarget + '"' + target + '>' + text + '</a>';
        editor.insertContent(html);
        api.close();
    }

    /**
     * Searches for internal content to link to.
     * Queries existing public API endpoints for news, reviews, pages, casinos.
     * @param {string} query - The search query.
     * @returns {Promise<Array>} Array of {title, url, type} results.
     */
    async function searchInternalLinks(query) {
        var results = [];
        var endpoints = [
            { url: '/en/api/v1/public/news/list?q=' + encodeURIComponent(query), type: 'news' },
            { url: '/en/api/v1/public/casinos/list?q=' + encodeURIComponent(query), type: 'casino' },
            { url: '/en/api/v1/public/pages/list?q=' + encodeURIComponent(query), type: 'page' }
        ];

        var promises = endpoints.map(function (ep) {
            return fetch(ep.url, { credentials: 'same-origin' })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.success && data.items) {
                        return data.items.map(function (item) {
                            return {
                                title: item.title || item.name || item.slug,
                                url: '/' + ep.type + '/' + (item.slug || item.id),
                                type: ep.type
                            };
                        });
                    }
                    return [];
                })
                .catch(function () { return []; });
        });

        var allResults = await Promise.all(promises);
        for (var i = 0; i < allResults.length; i++) {
            results = results.concat(allResults[i]);
        }
        return results.slice(0, 20);
    }

    // ── TinyMCE initialization ─────────────────────────

    /**
     * Initializes a TinyMCE editor on a textarea element.
     * @param {HTMLElement} textarea - The textarea to enhance.
     */
    function initEditor(textarea) {
        var editorId = generateEditorId(textarea);
        var folder = textarea.dataset.editorFolder || 'general';
        var darkMode = isDarkMode();

        // Check for autosaved content
        var autosaved = getAutosave(editorId);
        if (autosaved && textarea.value && autosaved !== textarea.value) {
            // Offer to restore autosaved content
            // We use a non-blocking approach — set a data attribute that the UI can check
            textarea.dataset.autosaveAvailable = 'true';
        }

        var config = {
            target: textarea,
            selector: '#' + CSS.escape(textarea.id || ''),
            // Do not use selector — use target instead for reliability
            menubar: true,
            menu: getMenuConfig(),
            toolbar: getToolbarConfig(),
            plugins: getPluginList(),
            skin: darkMode ? 'oxide-dark' : 'oxide',
            content_css: darkMode
                ? ['https://cdn.jsdelivr.net/npm/tinymce@7.4.0/skins/ui/oxide-dark/content.min.css']
                : ['https://cdn.jsdelivr.net/npm/tinymce@7.4.0/skins/ui/oxide/content.min.css'],
            content_style: getContentStyle(darkMode),
            height: textarea.dataset.editorHeight || 500,
            min_height: 300,
            autoresize_bottom_margin: 50,
            resize: true,
            branding: false,
            promotion: false,
            elementpath: true,
            statusbar: true,
            paste_data_images: true,
            paste_as_text: false,
            paste_filter_drop: true,
            paste_word_valid_elements: 'b,strong,i,em,h1,h2,h3,h4,h5,h6,p,div,ul,ol,li,table,tr,td,th,tbody,thead,tfoot,a[href|target|rel],img[src|alt|width|height],br,hr,sub,sup,blockquote,pre,code,span,figure,figcaption,video[src|controls|poster|width|height],source[src|type]',
            paste_webkit_styles: 'color font-size background-color text-align',
            browser_spellcheck: true,
            contextmenu: 'link image table tablecell tablemergecells tablesplitcells',
            quickbars_selection_toolbar: 'bold italic underline | blockquote quicklink quickimage',
        //    quickbars_insert_toolbar: 'quickimage quicktable | hr pageembed',
            quickbars_insert_toolbar: 'quickimage quicktable | hr pageembed | calloutbox addinserter',
            image_advtab: true,
            image_caption: true,
            image_title: true,
            image_list: API_MEDIA_LIST + '?type=image',
            image_advtab: true,
            link_list: [],
            link_title: true,
            link_target_list: [
                { title: 'Same tab', value: '' },
                { title: 'New tab', value: '_blank' }
            ],
            link_default_target: '',
            link_rel_list: [
                { title: 'Default', value: '' },
                { title: 'No follow', value: 'nofollow' },
                { title: 'No follow + noopener', value: 'nofollow noopener' },
                { title: 'Sponsored', value: 'sponsored' },
                { title: 'UGC', value: 'ugc' }
            ],
            table_default_styles: {
                'border-collapse': 'collapse',
                'width': '100%'
            },
            table_default_attributes: {
                border: '1'
            },
            table_style_by_css: true,
            table_use_colgroups: true,
            formats: {
                alignleft: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'align-left' },
                aligncenter: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'align-center' },
                alignright: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'align-right' },
                alignjustify: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'align-justify' }
            },
            setup: function (editor) {
                // Register custom plugins/buttons
                registerSourceCodePlugin(editor);
                configureImageUpload(editor, editorId, folder);
                configureVideoEmbed(editor, editorId, folder);
                configureInternalLink(editor);
                configureAdInserter(editor);
                configureCalloutBox(editor);

                // Sync content back to textarea on input
                editor.on('input', function () {
                    editor.save(); // Saves to textarea
                    autosave(editorId, editor.getContent());
                });

                // Sync on change (formatting changes, etc.)
                editor.on('change', function () {
                    editor.save();
                    autosave(editorId, editor.getContent());
                });

                // Sync before form submit
                editor.on('submit', function () {
                    editor.save();
                    clearAutosave(editorId);
                });

                // Handle paste — sanitize pasted content
                editor.on('PastePostProcess', function (e) {
                    // TinyMCE already filters pasted content via paste_word_valid_elements
                    // Additional server-side sanitization happens at render time (Phase 2)
                });

                // Register the editor in our registry
                editor.on('init', function () {
                    editorRegistry[editorId] = editor;
                    textarea.dataset.richEditorReady = 'true';

                    // Dispatch a custom event so other scripts know the editor is ready
                    var event = new CustomEvent('richeditor:ready', {
                        detail: { editorId: editorId, editor: editor },
                        bubbles: true
                    });
                    textarea.dispatchEvent(event);
                });

                // Handle editor removal
                editor.on('remove', function () {
                    delete editorRegistry[editorId];
                });
            }
        };

        // If the textarea has an ID, use it; otherwise TinyMCE uses the target
        if (textarea.id) {
            config.selector = '#' + CSS.escape(textarea.id);
        } else {
            // Generate an ID if none exists
            textarea.id = 'tinymce_' + editorId;
            config.selector = '#' + CSS.escape(textarea.id);
        }

        tinymce.init(config);
    }

    /**
     * Returns the content CSS style for the editor.
     * Adapts to dark mode and provides consistent typography.
     * @param {boolean} darkMode - Whether dark mode is active.
     * @returns {string} CSS string for editor content area.
     */
    function getContentStyle(darkMode) {
        var bg = darkMode ? '#1a1a2e' : '#fff';
        var color = darkMode ? '#e0e0e0' : '#333';
        var link = darkMode ? '#6c9ff2' : '#0066cc';

        return [
            'body {',
            '  background: ' + bg + ';',
            '  color: ' + color + ';',
            '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
            '  font-size: 15px;',
            '  line-height: 1.7;',
            '  padding: 16px;',
            '}',
            'a { color: ' + link + '; }',
            'img { max-width: 100%; height: auto; border-radius: 4px; }',
            'table { border-collapse: collapse; width: 100%; }',
            'td, th { border: 1px solid ' + (darkMode ? '#444' : '#ddd') + '; padding: 8px; }',
            'th { background: ' + (darkMode ? '#2a2a4e' : '#f5f5f5') + '; font-weight: bold; }',
            'blockquote {',
            '  border-left: 4px solid ' + (darkMode ? '#444' : '#ddd') + ';',
            '  margin: 1em 0;',
            '  padding: 0.5em 1em;',
            '  color: ' + (darkMode ? '#aaa' : '#666') + ';',
            '}',
            'pre {',
            '  background: ' + (darkMode ? '#0d0d1a' : '#f8f8f8') + ';',
            '  border: 1px solid ' + (darkMode ? '#333' : '#eee') + ';',
            '  border-radius: 4px;',
            '  padding: 12px;',
            '  overflow-x: auto;',
            '  font-family: "SF Mono", Monaco, Consolas, monospace;',
            '  font-size: 13px;',
            '}',
            'code {',
            '  background: ' + (darkMode ? '#0d0d1a' : '#f8f8f8') + ';',
            '  padding: 2px 6px;',
            '  border-radius: 3px;',
            '  font-family: "SF Mono", Monaco, Consolas, monospace;',
            '  font-size: 13px;',
            '}',
            'figure { margin: 1em 0; }',
            'figcaption { font-size: 13px; color: ' + (darkMode ? '#888' : '#999') + '; text-align: center; }',
            'video, iframe { max-width: 100%; border-radius: 4px; }',
            'hr { border: none; border-top: 1px solid ' + (darkMode ? '#444' : '#ddd') + '; margin: 2em 0; }',
            '.align-left { text-align: left; }',
            '.align-center { text-align: center; }',
            '.align-right { text-align: right; }',
            '.align-justify { text-align: justify; }'
        ].join('\n');
    }

    // ── Lazy load TinyMCE ──────────────────────────────

    /**
     * Dynamically loads the TinyMCE script from CDN.
     * Only loads once per page, even with multiple editors.
     * @returns {Promise<void>} Resolves when TinyMCE is loaded.
     */
    function loadTinyMCE() {
        return new Promise(function (resolve, reject) {
            if (tinymceLoaded && typeof tinymce !== 'undefined') {
                resolve();
                return;
            }
            if (tinymceLoading) {
                pendingEditors.push(resolve);
                return;
            }
            tinymceLoading = true;

            var script = document.createElement('script');
            script.src = TINYMCE_CDN_URL;
            script.referrerPolicy = 'origin';
            script.async = true;

            script.onload = function () {
                tinymceLoaded = true;
                tinymceLoading = false;
                resolve();
                // Resolve any pending editors
                for (var i = 0; i < pendingEditors.length; i++) {
                    pendingEditors[i]();
                }
                pendingEditors = [];
            };

            script.onerror = function () {
                tinymceLoading = false;
                showToast('Failed to load rich text editor. Please check your connection and refresh.', 'error');
                reject(new Error('Failed to load TinyMCE'));
            };

            document.head.appendChild(script);
        });
    }

    // ── Auto-initialization ────────────────────────────

    /**
     * Scans the document for <textarea data-rich-editor> elements
     * and initializes TinyMCE on each one.
     */
    function autoInit() {
        var textareas = document.querySelectorAll('textarea[data-rich-editor]');
        if (textareas.length === 0) return;

        // Load TinyMCE once, then init all editors
        loadTinyMCE().then(function () {
            for (var i = 0; i < textareas.length; i++) {
                initEditor(textareas[i]);
            }
        }).catch(function (error) {
            console.error('RichEditor initialization failed:', error);
        });
    }

    // ── Global RichEditor API ──────────────────────────

    /**
     * The global RichEditor API exposed on window.
     * Allows programmatic control of editor instances.
     */
    var RichEditor = {
        /**
         * Gets the HTML content of an editor.
         * @param {string} editorId - The editor instance ID.
         * @returns {string|null} The HTML content, or null if editor not found.
         */
        get: function (editorId) {
            var editor = editorRegistry[editorId];
            if (editor) return editor.getContent();
            // Fallback: read from textarea
            var textarea = document.querySelector('textarea[data-editor-id="' + editorId + '"]');
            return textarea ? textarea.value : null;
        },

        /**
         * Sets the HTML content of an editor.
         * @param {string} editorId - The editor instance ID.
         * @param {string} html - The HTML content to set.
         */
        set: function (editorId, html) {
            var editor = editorRegistry[editorId];
            if (editor) {
                editor.setContent(html);
                editor.save();
            } else {
                var textarea = document.querySelector('textarea[data-editor-id="' + editorId + '"]');
                if (textarea) textarea.value = html;
            }
        },

        /**
         * Inserts an image into the editor at the cursor position.
         * @param {string} editorId - The editor instance ID.
         * @param {string} url - The image URL.
         * @param {string} alt - The alt text.
         * @param {number} width - Optional width.
         * @param {number} height - Optional height.
         */
        insertImage: function (editorId, url, alt, width, height) {
            var editor = editorRegistry[editorId];
            if (editor) {
                insertImageIntoEditor(editor, url, alt, width, height);
            }
        },

        /**
         * Inserts arbitrary HTML content at the cursor position.
         * @param {string} editorId - The editor instance ID.
         * @param {string} html - The HTML to insert.
         */
        insertContent: function (editorId, html) {
            var editor = editorRegistry[editorId];
            if (editor) {
                editor.insertContent(html);
            }
        },

        /**
         * Inserts a video embed into the editor.
         * @param {string} editorId - The editor instance ID.
         * @param {string} embedHtml - The video embed HTML.
         */
        insertVideo: function (editorId, embedHtml) {
            var editor = editorRegistry[editorId];
            if (editor) {
                editor.insertContent(embedHtml);
            }
        },

        /**
         * Destroys an editor instance and restores the original textarea.
         * @param {string} editorId - The editor instance ID.
         */
        destroy: function (editorId) {
            var editor = editorRegistry[editorId];
            if (editor) {
                editor.remove();
                delete editorRegistry[editorId];
            }
        },

        /**
         * Initializes an editor on a specific textarea element.
         * Useful for dynamically added textareas (e.g., after AJAX content load).
         * @param {HTMLElement|string} textarea - The textarea element or selector.
         * @param {Object} options - Optional configuration overrides.
         */
        init: function (textarea, options) {
            if (typeof textarea === 'string') {
                textarea = document.querySelector(textarea);
            }
            if (!textarea) {
                console.error('RichEditor.init: textarea not found');
                return;
            }
            // Apply options as data attributes
            if (options) {
                if (options.folder) textarea.dataset.editorFolder = options.folder;
                if (options.height) textarea.dataset.editorHeight = options.height;
                if (options.id) textarea.dataset.editorId = options.id;
            }
            // Ensure the data-rich-editor attribute is set
            textarea.setAttribute('data-rich-editor', '');

            loadTinyMCE().then(function () {
                initEditor(textarea);
            });
        },

        /**
         * Gets the autosaved content for an editor (if available).
         * @param {string} editorId - The editor instance ID.
         * @returns {string|null} The autosaved content or null.
         */
        getAutosave: function (editorId) {
            return getAutosave(editorId);
        },

        /**
         * Clears the autosaved content for an editor.
         * @param {string} editorId - The editor instance ID.
         */
        clearAutosave: function (editorId) {
            clearAutosave(editorId);
        },

        /**
         * Syncs all editor instances back to their textareas.
         * Call before form submission to ensure all content is saved.
         */
        syncAll: function () {
            for (var id in editorRegistry) {
                if (editorRegistry.hasOwnProperty(id)) {
                    editorRegistry[id].save();
                }
            }
        },

        /**
         * Checks if an editor instance is ready.
         * @param {string} editorId - The editor instance ID.
         * @returns {boolean} True if the editor is initialized and ready.
         */
        isReady: function (editorId) {
            return !!editorRegistry[editorId];
        }
    };

    // ── Form submission hook ───────────────────────────

    /**
     * Hooks into form submission to ensure all editors sync their content
     * to their textareas before the form is submitted.
     * This is a safety net — TinyMCE also syncs on its own 'submit' event,
     * but this ensures it happens even if TinyMCE's internal handler is slow.
     */
    function hookFormSubmission() {
        document.addEventListener('submit', function (e) {
            // Sync all editors
            RichEditor.syncAll();
        }, true); // Use capture phase to run before form handlers
    }

    // ── Bootstrap ──────────────────────────────────────

    /**
     * Initializes the RichEditor system on DOMContentLoaded.
     * Scans for data-rich-editor textareas and auto-initializes them.
     */
    function bootstrap() {
        // Auto-init existing textareas
        autoInit();

        // Hook form submission for safety
        hookFormSubmission();

        // Watch for dynamically added textareas (MutationObserver)
        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(function (mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    var mutation = mutations[i];
                    for (var j = 0; j < mutation.addedNodes.length; j++) {
                        var node = mutation.addedNodes[j];
                        if (node.nodeType === 1) {
                            // Check if the added node is a textarea with data-rich-editor
                            if (node.tagName === 'TEXTAREA' && node.hasAttribute('data-rich-editor')) {
                                loadTinyMCE().then(function () {
                                    initEditor(node);
                                });
                            }
                            // Check for textareas inside the added node
                            var textareas = node.querySelectorAll
                                ? node.querySelectorAll('textarea[data-rich-editor]')
                                : [];
                            for (var k = 0; k < textareas.length; k++) {
                                (function (ta) {
                                    loadTinyMCE().then(function () {
                                        initEditor(ta);
                                    });
                                })(textareas[k]);
                            }
                        }
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    // ── Expose global API ───────────────────────────────

    window.RichEditor = RichEditor;

    // ── Initialize on DOM ready ─────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

})();
