// =====================================================
// media-library.js — Full Media Library UI Component
// =====================================================
//
// Renders a complete media management interface inside
// a container element on the admin Media page.
//
// Corrected API routes (Phase 3):
//   POST /api/v1/media/upload          — upload file
//   POST /api/v1/media/r2/delete       — delete file {id}
//   GET  /api/v1/media/browse          — paginated list
//   GET  /api/v1/media/search          — search ?q=
//   GET  /api/v1/media/get?id=         — single item
//   POST /api/v1/media/meta/update     — update {id,...}
//   GET  /api/v1/media/folders/tree    — folder tree
//   POST /api/v1/media/folder/create  — create folder
//   POST /api/v1/media/folder/update  — rename folder
//   POST /api/v1/media/folder/delete  — delete folder
//   GET  /api/v1/media/folder/count?id= — count in folder
//
// Usage:
//   <div id="media-library-container"></div>
//   <script src="/static/js/media-library.js"></script>
//   <script>MediaLibrary.init('media-library-container');</script>
//
// =====================================================

(function () {
    'use strict';

    // ── Configuration ────────────────────────────────────

    var API = {
        upload:    '/en/api/v1/media/upload',
        delete:    '/en/api/v1/media/r2/delete',
        browse:    '/en/api/v1/media/browse',
        search:    '/en/api/v1/media/search',
        get:       '/en/api/v1/media/get',
        metaUpdate:'/en/api/v1/media/meta/update',
        foldersTree:'/en/api/v1/media/folders/tree',
        folderCreate:'/en/api/v1/media/folder/create',
        folderUpdate:'/en/api/v1/media/folder/update',
        folderDelete:'/en/api/v1/media/folder/delete',
        folderCount:'/en/api/v1/media/folder/count',
    };

    var ITEMS_PER_PAGE = 24;
    var ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/ogg,application/pdf,text/plain';

    // ── State ───────────────────────────────────────────

    var state = {
        container: null,
        currentFolder: null,
        folders: [],
        mediaItems: [],
        totalItems: 0,
        currentPage: 1,
        totalPages: 1,
        searchQuery: '',
        typeFilter: 'all',
        sortBy: 'created_at',
        sortOrder: 'DESC',
        loading: false,
        selectedItems: new Set(),
    };

    // ── Utility functions ───────────────────────────────

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        var units = ['B', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(1024));
        if (i >= units.length) i = units.length - 1;
        return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    function formatDate(isoDate) {
        if (!isoDate) return '';
        var d = new Date(isoDate);
        if (isNaN(d.getTime())) return isoDate;
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }

    function showToast(message, type) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
            return;
        }
        var el = document.createElement('div');
        el.textContent = message;
        el.className = 'ml-toast ml-toast-' + (type || 'info');
        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('ml-toast-show'); });
        setTimeout(function () {
            el.classList.remove('ml-toast-show');
            setTimeout(function () { el.remove(); }, 300);
        }, 3000);
    }

    function getCsrfToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }

    function isDarkMode() {
        var body = document.body;
        var html = document.documentElement;
        if (body && body.classList.contains('dark')) return true;
        if (html && html.classList.contains('dark')) return true;
        if (html && html.getAttribute('data-theme') === 'dark') return true;
        return false;
    }

    function getTypeIcon(type, mimeType) {
        if (type === 'image') {
            return '<svg class="ml-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
        }
        if (type === 'video') {
            return '<svg class="ml-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>';
        }
        return '<svg class="ml-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    }

    function debounce(fn, wait) {
        var timer;
        return function () {
            var ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 300);
        };
    }

    // ── API helpers ──────────────────────────────────────

    function apiGet(url) {
        return fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); });
    }

    function apiPost(url, body, isJson) {
        var opts = {
            method: 'POST',
            credentials: 'same-origin',
        };
        if (isJson) {
            opts.headers = { 'Content-Type': 'application/json' };
            opts.body = JSON.stringify(body);
        } else {
            opts.body = body; // FormData
        }
        return fetch(url, opts).then(function (r) { return r.json(); });
    }

    // ── Load folders ────────────────────────────────────

    function loadFolders() {
        return apiGet(API.foldersTree).then(function (data) {
            if (data.success) {
                state.folders = data.folders || [];
            }
        }).catch(function () {
            state.folders = [];
        });
    }

    // ── Load media ──────────────────────────────────────

    function loadMedia() {
        state.loading = true;
        renderGrid();

        var params = new URLSearchParams();
        params.set('limit', String(ITEMS_PER_PAGE));
        params.set('offset', String((state.currentPage - 1) * ITEMS_PER_PAGE));
        params.set('sort', state.sortBy);
        params.set('order', state.sortOrder);

        if (state.typeFilter !== 'all') {
            params.set('type', state.typeFilter);
        }
        if (state.currentFolder) {
            params.set('folder', state.currentFolder);
        }

        var url;
        if (state.searchQuery) {
            params.set('q', state.searchQuery);
            url = API.search + '?' + params.toString();
        } else {
            url = API.browse + '?' + params.toString();
        }

        return apiGet(url).then(function (data) {
            state.loading = false;
            if (data.success) {
                state.mediaItems = data.items || data.results || [];
                state.totalItems = data.total || state.mediaItems.length;
                state.totalPages = Math.ceil(state.totalItems / ITEMS_PER_PAGE) || 1;
            } else {
                state.mediaItems = [];
                state.totalItems = 0;
                state.totalPages = 1;
                showToast(data.error || 'Failed to load media', 'error');
            }
            renderGrid();
            renderPagination();
        }).catch(function (err) {
            state.loading = false;
            state.mediaItems = [];
            renderGrid();
            showToast('Network error loading media', 'error');
        });
    }

    // ── Upload ──────────────────────────────────────────

    function handleUploadFiles(files, folderSlug) {
        if (!files || files.length === 0) return;

        var folder = folderSlug || state.currentFolder || 'general';
        var uploaded = 0;
        var failed = 0;
        var total = files.length;

        for (var i = 0; i < files.length; i++) {
            (function (file) {
                var formData = new FormData();
                formData.append('file', file);
                formData.append('folder', folder);

                apiPost(API.upload, formData).then(function (data) {
                    if (data.success) {
                        uploaded++;
                        showToast('Uploaded: ' + (data.media && data.media.filename || 'file'), 'success');
                    } else {
                        failed++;
                        showToast(data.error || 'Upload failed', 'error');
                    }
                    if (uploaded + failed === total) {
                        if (failed > 0) {
                            showToast(uploaded + ' uploaded, ' + failed + ' failed', 'info');
                        }
                        loadMedia();
                    }
                }).catch(function () {
                    failed++;
                    showToast('Upload failed: ' + file.name, 'error');
                    if (uploaded + failed === total) {
                        loadMedia();
                    }
                });
            })(files[i]);
        }

        showToast('Uploading ' + total + ' file(s)...', 'info');
    }

    // ── Delete ──────────────────────────────────────────

    function handleDeleteMedia(mediaId, filename) {
        if (!confirm('Delete "' + (filename || 'this file') + '"? This cannot be undone.')) return;

        apiPost(API.delete, { id: mediaId }, true).then(function (data) {
            if (data.success) {
                showToast('Media deleted', 'success');
                loadMedia();
            } else {
                showToast(data.error || 'Delete failed', 'error');
            }
        }).catch(function () {
            showToast('Network error during delete', 'error');
        });
    }

    // ── Update metadata ─────────────────────────────────

    function handleUpdateMetadata(mediaId, updates) {
        updates.id = mediaId;
        return apiPost(API.metaUpdate, updates, true).then(function (data) {
            if (data.success) {
                showToast('Metadata updated', 'success');
            } else {
                showToast(data.error || 'Update failed', 'error');
            }
            return data;
        }).catch(function () {
            showToast('Network error during update', 'error');
        });
    }

    // ── Folder CRUD ─────────────────────────────────────

    function handleCreateFolder(name, slug, parentId) {
        return apiPost(API.folderCreate, {
            name: name,
            slug: slug,
            parent_id: parentId || null,
        }, true).then(function (data) {
            if (data.success) {
                showToast('Folder created', 'success');
                loadFolders().then(renderFolderSidebar);
            } else {
                showToast(data.error || 'Failed to create folder', 'error');
            }
            return data;
        });
    }

    function handleRenameFolder(folderId, name, slug) {
        return apiPost(API.folderUpdate, {
            id: folderId,
            name: name,
            slug: slug,
        }, true).then(function (data) {
            if (data.success) {
                showToast('Folder renamed', 'success');
                loadFolders().then(renderFolderSidebar);
            } else {
                showToast(data.error || 'Failed to rename folder', 'error');
            }
            return data;
        });
    }

    function handleDeleteFolder(folderId) {
        if (!confirm('Delete this folder? Media items inside will remain but lose their folder assignment.')) return;

        apiPost(API.folderDelete, { id: folderId }, true).then(function (data) {
            if (data.success) {
                showToast('Folder deleted', 'success');
                if (state.currentFolder) {
                    state.currentFolder = null;
                }
                loadFolders().then(function () {
                    renderFolderSidebar();
                    loadMedia();
                });
            } else {
                showToast(data.error || 'Failed to delete folder', 'error');
            }
        });
    }

    // ── Rendering: Main layout ──────────────────────────

    function renderMainLayout() {
        var c = state.container;
        c.innerHTML = '';

        // Toolbar
        var toolbar = document.createElement('div');
        toolbar.className = 'ml-toolbar';
        toolbar.innerHTML =
            '<div class="ml-toolbar-left">' +
                '<input type="text" class="ml-search-input" placeholder="Search media..." value="' + escapeHtml(state.searchQuery) + '">' +
                '<select class="ml-type-filter">' +
                    '<option value="all"' + (state.typeFilter === 'all' ? ' selected' : '') + '>All types</option>' +
                    '<option value="image"' + (state.typeFilter === 'image' ? ' selected' : '') + '>Images</option>' +
                    '<option value="video"' + (state.typeFilter === 'video' ? ' selected' : '') + '>Videos</option>' +
                    '<option value="document"' + (state.typeFilter === 'document' ? ' selected' : '') + '>Documents</option>' +
                '</select>' +
                '<select class="ml-sort-select">' +
                    '<option value="created_at:DESC"' + (state.sortBy === 'created_at' && state.sortOrder === 'DESC' ? ' selected' : '') + '>Newest first</option>' +
                    '<option value="created_at:ASC"' + (state.sortBy === 'created_at' && state.sortOrder === 'ASC' ? ' selected' : '') + '>Oldest first</option>' +
                    '<option value="filename:ASC"' + (state.sortBy === 'filename' && state.sortOrder === 'ASC' ? ' selected' : '') + '>Name A-Z</option>' +
                    '<option value="filename:DESC"' + (state.sortBy === 'filename' && state.sortOrder === 'DESC' ? ' selected' : '') + '>Name Z-A</option>' +
                    '<option value="size:DESC"' + (state.sortBy === 'size' && state.sortOrder === 'DESC' ? ' selected' : '') + '>Largest first</option>' +
                    '<option value="size:ASC"' + (state.sortBy === 'size' && state.sortOrder === 'ASC' ? ' selected' : '') + '>Smallest first</option>' +
                '</select>' +
            '</div>' +
            '<div class="ml-toolbar-right">' +
                '<button class="ml-btn ml-btn-primary ml-upload-btn">Upload</button>' +
                '<button class="ml-btn ml-btn-secondary ml-new-folder-btn">New Folder</button>' +
            '</div>';

        c.appendChild(toolbar);

        // Body: sidebar + grid
        var body = document.createElement('div');
        body.className = 'ml-body';

        var sidebar = document.createElement('div');
        sidebar.className = 'ml-sidebar';
        sidebar.id = 'ml-sidebar';

        var gridWrapper = document.createElement('div');
        gridWrapper.className = 'ml-grid-wrapper';

        var dropzone = document.createElement('div');
        dropzone.className = 'ml-dropzone';
        dropzone.id = 'ml-dropzone';
        dropzone.innerHTML =
            '<div class="ml-dropzone-inner">' +
                '<svg class="ml-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
                '<p>Drag &amp; drop files here, or click "Upload"</p>' +
                '<p class="ml-dropzone-hint">JPEG, PNG, WEBP, SVG, GIF, MP4, WebM, PDF — max 10MB (images) / 100MB (videos)</p>' +
            '</div>';

        var grid = document.createElement('div');
        grid.className = 'ml-grid';
        grid.id = 'ml-grid';

        var pagination = document.createElement('div');
        pagination.className = 'ml-pagination';
        pagination.id = 'ml-pagination';

        gridWrapper.appendChild(dropzone);
        gridWrapper.appendChild(grid);
        gridWrapper.appendChild(pagination);

        body.appendChild(sidebar);
        body.appendChild(gridWrapper);

        c.appendChild(body);

        // Hidden file input for upload
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.accept = ACCEPTED_TYPES;
        fileInput.style.display = 'none';
        fileInput.id = 'ml-file-input';
        c.appendChild(fileInput);

        // Attach event listeners
        attachEventListeners();
    }

    // ── Rendering: Folder sidebar ───────────────────────

    function renderFolderSidebar() {
        var sidebar = document.getElementById('ml-sidebar');
        if (!sidebar) return;

        var html =
            '<div class="ml-sidebar-header">' +
                '<h3>Folders</h3>' +
            '</div>' +
            '<div class="ml-folder-list">' +
                '<div class="ml-folder-item' + (!state.currentFolder ? ' ml-folder-active' : '') + '" data-folder="">' +
                    '<svg class="ml-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
                    '<span>All Media</span>' +
                '</div>';

        for (var i = 0; i < state.folders.length; i++) {
            var f = state.folders[i];
            var isActive = state.currentFolder === f.slug;
            html +=
                '<div class="ml-folder-item' + (isActive ? ' ml-folder-active' : '') + '" data-folder="' + escapeHtml(f.slug) + '" data-folder-id="' + f.id + '">' +
                    '<svg class="ml-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
                    '<span class="ml-folder-name">' + escapeHtml(f.name) + '</span>' +
                    '<button class="ml-folder-menu-btn" data-folder-id="' + f.id + '" data-folder-name="' + escapeHtml(f.name) + '" data-folder-slug="' + escapeHtml(f.slug) + '">&hellip;</button>' +
                '</div>';
        }

        html += '</div>';

        sidebar.innerHTML = html;

        // Attach folder click listeners
        var folderItems = sidebar.querySelectorAll('.ml-folder-item');
        for (var j = 0; j < folderItems.length; j++) {
            folderItems[j].addEventListener('click', function (e) {
                if (e.target.classList.contains('ml-folder-menu-btn')) return;
                state.currentFolder = this.getAttribute('data-folder') || null;
                state.currentPage = 1;
                renderFolderSidebar();
                loadMedia();
            });
        }

        // Attach folder menu (rename/delete) listeners
        var menuBtns = sidebar.querySelectorAll('.ml-folder-menu-btn');
        for (var k = 0; k < menuBtns.length; k++) {
            menuBtns[k].addEventListener('click', function (e) {
                e.stopPropagation();
                var folderId = parseInt(this.getAttribute('data-folder-id'), 10);
                var folderName = this.getAttribute('data-folder-name');
                var folderSlug = this.getAttribute('data-folder-slug');
                showFolderMenu(folderId, folderName, folderSlug);
            });
        }
    }

    // ── Rendering: Media grid ───────────────────────────

    function renderGrid() {
        var grid = document.getElementById('ml-grid');
        if (!grid) return;

        if (state.loading) {
            grid.innerHTML =
                '<div class="ml-grid-loading">' +
                    '<div class="ml-loading-spinner"></div>' +
                    '<p>Loading media...</p>' +
                '</div>';
            return;
        }

        if (state.mediaItems.length === 0) {
            grid.innerHTML =
                '<div class="ml-grid-empty">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="ml-empty-icon"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' +
                    '<p>No media found. Upload files to get started.</p>' +
                '</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < state.mediaItems.length; i++) {
            var item = state.mediaItems[i];
            var isImage = item.type === 'image';
            var thumb = item.thumbnail_url || item.url || '';
            var name = item.filename || item.original_filename || 'unnamed';
            var altText = item.alt_text || '';

            html +=
                '<div class="ml-card" data-media-id="' + item.id + '">' +
                    '<div class="ml-card-thumb">';

            if (isImage && thumb) {
                html += '<img src="' + escapeHtml(thumb) + '" alt="' + escapeHtml(altText) + '" loading="lazy" />';
            } else {
                html += '<div class="ml-card-thumb-placeholder">' + getTypeIcon(item.type, item.mime_type) + '</div>';
            }

            html +=
                    '</div>' +
                    '<div class="ml-card-info">' +
                        '<p class="ml-card-name" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</p>' +
                        '<p class="ml-card-meta">' + formatFileSize(item.size) + ' &middot; ' + formatDate(item.created_at) + '</p>' +
                    '</div>' +
                    '<div class="ml-card-actions">' +
                        '<button class="ml-card-btn ml-copy-url" data-url="' + escapeHtml(item.url || '') + '" title="Copy URL">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                        '</button>' +
                        '<button class="ml-card-btn ml-edit-meta" data-media-id="' + item.id + '" title="Edit metadata">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                        '</button>' +
                        '<button class="ml-card-btn ml-delete-media" data-media-id="' + item.id + '" data-media-name="' + escapeHtml(name) + '" title="Delete">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
                        '</button>' +
                    '</div>' +
                '</div>';
        }

        grid.innerHTML = html;

        // Attach card action listeners
        var copyBtns = grid.querySelectorAll('.ml-copy-url');
        for (var c = 0; c < copyBtns.length; c++) {
            copyBtns[c].addEventListener('click', function () {
                var url = this.getAttribute('data-url');
                copyToClipboard(url);
                showToast('URL copied to clipboard', 'success');
            });
        }

        var editBtns = grid.querySelectorAll('.ml-edit-meta');
        for (var e = 0; e < editBtns.length; e++) {
            editBtns[e].addEventListener('click', function () {
                var mediaId = parseInt(this.getAttribute('data-media-id'), 10);
                showEditModal(mediaId);
            });
        }

        var deleteBtns = grid.querySelectorAll('.ml-delete-media');
        for (var d = 0; d < deleteBtns.length; d++) {
            deleteBtns[d].addEventListener('click', function () {
                var mediaId = parseInt(this.getAttribute('data-media-id'), 10);
                var mediaName = this.getAttribute('data-media-name');
                handleDeleteMedia(mediaId, mediaName);
            });
        }
    }

    // ── Rendering: Pagination ───────────────────────────

    function renderPagination() {
        var pagination = document.getElementById('ml-pagination');
        if (!pagination) return;

        if (state.totalPages <= 1) {
            pagination.innerHTML = '<span class="ml-pagination-info">' + state.totalItems + ' item(s)</span>';
            return;
        }

        var html = '<span class="ml-pagination-info">Page ' + state.currentPage + ' of ' + state.totalPages + ' (' + state.totalItems + ' total)</span>';

        if (state.currentPage > 1) {
            html += '<button class="ml-btn ml-btn-small ml-page-btn" data-page="' + (state.currentPage - 1) + '">&laquo; Prev</button>';
        }

        // Show up to 5 page numbers around current page
        var start = Math.max(1, state.currentPage - 2);
        var end = Math.min(state.totalPages, state.currentPage + 2);

        if (start > 1) {
            html += '<button class="ml-btn ml-btn-small ml-page-btn" data-page="1">1</button>';
            if (start > 2) html += '<span class="ml-pagination-ellipsis">...</span>';
        }

        for (var p = start; p <= end; p++) {
            html += '<button class="ml-btn ml-btn-small ml-page-btn' + (p === state.currentPage ? ' ml-btn-active' : '') + '" data-page="' + p + '">' + p + '</button>';
        }

        if (end < state.totalPages) {
            if (end < state.totalPages - 1) html += '<span class="ml-pagination-ellipsis">...</span>';
            html += '<button class="ml-btn ml-btn-small ml-page-btn" data-page="' + state.totalPages + '">' + state.totalPages + '</button>';
        }

        if (state.currentPage < state.totalPages) {
            html += '<button class="ml-btn ml-btn-small ml-page-btn" data-page="' + (state.currentPage + 1) + '">Next &raquo;</button>';
        }

        pagination.innerHTML = html;

        var pageBtns = pagination.querySelectorAll('.ml-page-btn');
        for (var i = 0; i < pageBtns.length; i++) {
            pageBtns[i].addEventListener('click', function () {
                state.currentPage = parseInt(this.getAttribute('data-page'), 10);
                loadMedia();
            });
        }
    }

    // ── Modals ──────────────────────────────────────────

    function showEditModal(mediaId) {
        // Find media item in current items
        var item = null;
        for (var i = 0; i < state.mediaItems.length; i++) {
            if (state.mediaItems[i].id === mediaId) {
                item = state.mediaItems[i];
                break;
            }
        }

        if (!item) {
            // Fetch from API
            apiGet(API.get + '?id=' + mediaId).then(function (data) {
                if (data.success && data.media) {
                    renderEditModal(data.media);
                } else {
                    showToast('Could not load media details', 'error');
                }
            });
            return;
        }

        renderEditModal(item);
    }

    function renderEditModal(item) {
        var overlay = document.createElement('div');
        overlay.className = 'ml-modal-overlay';
        overlay.id = 'ml-edit-modal';

        // Build folder options
        var folderOptions = '<option value="">No folder</option>';
        for (var i = 0; i < state.folders.length; i++) {
            var f = state.folders[i];
            folderOptions += '<option value="' + escapeHtml(f.slug) + '"' + (item.folder === f.slug ? ' selected' : '') + '>' + escapeHtml(f.name) + '</option>';
        }

        overlay.innerHTML =
            '<div class="ml-modal">' +
                '<div class="ml-modal-header">' +
                    '<h3>Edit Media Details</h3>' +
                    '<button class="ml-modal-close">&times;</button>' +
                '</div>' +
                '<div class="ml-modal-body">' +
                    '<div class="ml-modal-preview">';

        if (item.type === 'image' && (item.thumbnail_url || item.url)) {
            overlay.innerHTML += '<img src="' + escapeHtml(item.thumbnail_url || item.url) + '" alt="' + escapeHtml(item.alt_text) + '" />';
        } else {
            overlay.innerHTML += '<div class="ml-modal-preview-placeholder">' + getTypeIcon(item.type, item.mime_type) + '</div>';
        }

        overlay.innerHTML +=
                    '</div>' +
                    '<div class="ml-form-group">' +
                        '<label>Filename</label>' +
                        '<input type="text" class="ml-form-input" value="' + escapeHtml(item.filename || '') + '" readonly>' +
                    '</div>' +
                    '<div class="ml-form-group">' +
                        '<label>Alt Text</label>' +
                        '<input type="text" class="ml-form-input" id="ml-edit-alt" value="' + escapeHtml(item.alt_text || '') + '" placeholder="Describe this image for accessibility">' +
                    '</div>' +
                    '<div class="ml-form-group">' +
                        '<label>Caption</label>' +
                        '<input type="text" class="ml-form-input" id="ml-edit-caption" value="' + escapeHtml(item.caption || '') + '" placeholder="Caption shown below image">' +
                    '</div>' +
                    '<div class="ml-form-group">' +
                        '<label>Folder</label>' +
                        '<select class="ml-form-input" id="ml-edit-folder">' + folderOptions + '</select>' +
                    '</div>' +
                    '<div class="ml-form-group">' +
                        '<label>URL</label>' +
                        '<input type="text" class="ml-form-input" value="' + escapeHtml(item.url || '') + '" readonly>' +
                    '</div>' +
                '</div>' +
                '<div class="ml-modal-footer">' +
                    '<button class="ml-btn ml-btn-secondary ml-modal-cancel">Cancel</button>' +
                    '<button class="ml-btn ml-btn-primary ml-modal-save" data-media-id="' + item.id + '">Save Changes</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        requestAnimationFrame(function () { overlay.classList.add('ml-modal-show'); });

        // Close handlers
        overlay.querySelector('.ml-modal-close').addEventListener('click', function () { closeModal(overlay); });
        overlay.querySelector('.ml-modal-cancel').addEventListener('click', function () { closeModal(overlay); });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal(overlay);
        });

        // Save handler
        overlay.querySelector('.ml-modal-save').addEventListener('click', function () {
            var mediaId = parseInt(this.getAttribute('data-media-id'), 10);
            handleUpdateMetadata(mediaId, {
                alt_text: document.getElementById('ml-edit-alt').value,
                caption: document.getElementById('ml-edit-caption').value,
                folder: document.getElementById('ml-edit-folder').value,
            }).then(function (data) {
                if (data && data.success) {
                    closeModal(overlay);
                    loadMedia();
                }
            });
        });
    }

    function showFolderMenu(folderId, folderName, folderSlug) {
        var overlay = document.createElement('div');
        overlay.className = 'ml-modal-overlay';
        overlay.id = 'ml-folder-menu-modal';

        overlay.innerHTML =
            '<div class="ml-modal ml-modal-small">' +
                '<div class="ml-modal-header">' +
                    '<h3>Edit Folder</h3>' +
                    '<button class="ml-modal-close">&times;</button>' +
                '</div>' +
                '<div class="ml-modal-body">' +
                    '<div class="ml-form-group">' +
                        '<label>Folder Name</label>' +
                        '<input type="text" class="ml-form-input" id="ml-folder-name" value="' + escapeHtml(folderName) + '">' +
                    '</div>' +
                    '<div class="ml-form-group">' +
                        '<label>Slug</label>' +
                        '<input type="text" class="ml-form-input" id="ml-folder-slug" value="' + escapeHtml(folderSlug) + '">' +
                    '</div>' +
                '</div>' +
                '<div class="ml-modal-footer">' +
                    '<button class="ml-btn ml-btn-danger ml-folder-delete-btn" data-folder-id="' + folderId + '">Delete Folder</button>' +
                    '<button class="ml-btn ml-btn-secondary ml-modal-cancel">Cancel</button>' +
                    '<button class="ml-btn ml-btn-primary ml-folder-save-btn" data-folder-id="' + folderId + '">Save</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);
        requestAnimationFrame(function () { overlay.classList.add('ml-modal-show'); });

        overlay.querySelector('.ml-modal-close').addEventListener('click', function () { closeModal(overlay); });
        overlay.querySelector('.ml-modal-cancel').addEventListener('click', function () { closeModal(overlay); });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal(overlay);
        });

        overlay.querySelector('.ml-folder-save-btn').addEventListener('click', function () {
            var fid = parseInt(this.getAttribute('data-folder-id'), 10);
            var name = document.getElementById('ml-folder-name').value;
            var slug = document.getElementById('ml-folder-slug').value;
            if (!name) { showToast('Name is required', 'error'); return; }
            handleRenameFolder(fid, name, slug).then(function (data) {
                if (data && data.success) closeModal(overlay);
            });
        });

        overlay.querySelector('.ml-folder-delete-btn').addEventListener('click', function () {
            var fid = parseInt(this.getAttribute('data-folder-id'), 10);
            handleDeleteFolder(fid);
            closeModal(overlay);
        });
    }

    function showNewFolderModal() {
        var overlay = document.createElement('div');
        overlay.className = 'ml-modal-overlay';
        overlay.id = 'ml-new-folder-modal';

        overlay.innerHTML =
            '<div class="ml-modal ml-modal-small">' +
                '<div class="ml-modal-header">' +
                    '<h3>New Folder</h3>' +
                    '<button class="ml-modal-close">&times;</button>' +
                '</div>' +
                '<div class="ml-modal-body">' +
                    '<div class="ml-form-group">' +
                        '<label>Folder Name</label>' +
                        '<input type="text" class="ml-form-input" id="ml-new-folder-name" placeholder="e.g. Screenshots">' +
                    '</div>' +
                    '<div class="ml-form-group">' +
                        '<label>Slug (URL-friendly name)</label>' +
                        '<input type="text" class="ml-form-input" id="ml-new-folder-slug" placeholder="e.g. screenshots">' +
                    '</div>' +
                '</div>' +
                '<div class="ml-modal-footer">' +
                    '<button class="ml-btn ml-btn-secondary ml-modal-cancel">Cancel</button>' +
                    '<button class="ml-btn ml-btn-primary ml-new-folder-create">Create</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);
        requestAnimationFrame(function () { overlay.classList.add('ml-modal-show'); });

        // Auto-generate slug from name
        var nameInput = overlay.querySelector('#ml-new-folder-name');
        var slugInput = overlay.querySelector('#ml-new-folder-slug');
        nameInput.addEventListener('input', function () {
            slugInput.value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        });

        overlay.querySelector('.ml-modal-close').addEventListener('click', function () { closeModal(overlay); });
        overlay.querySelector('.ml-modal-cancel').addEventListener('click', function () { closeModal(overlay); });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal(overlay);
        });

        overlay.querySelector('.ml-new-folder-create').addEventListener('click', function () {
            var name = nameInput.value;
            var slug = slugInput.value;
            if (!name) { showToast('Name is required', 'error'); return; }
            if (!slug) { showToast('Slug is required', 'error'); return; }
            handleCreateFolder(name, slug).then(function (data) {
                if (data && data.success) closeModal(overlay);
            });
        });
    }

    function closeModal(overlay) {
        overlay.classList.remove('ml-modal-show');
        setTimeout(function () { overlay.remove(); }, 300);
    }

    // ── Clipboard ───────────────────────────────────────

    function copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
        } else {
            var textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    }

    // ── Event listeners ──────────────────────────────────

    function attachEventListeners() {
        // Search input
        var searchInput = document.querySelector('.ml-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(function () {
                state.searchQuery = this.value;
                state.currentPage = 1;
                loadMedia();
            }, 400));
        }

        // Type filter
        var typeFilter = document.querySelector('.ml-type-filter');
        if (typeFilter) {
            typeFilter.addEventListener('change', function () {
                state.typeFilter = this.value;
                state.currentPage = 1;
                loadMedia();
            });
        }

        // Sort
        var sortSelect = document.querySelector('.ml-sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', function () {
                var parts = this.value.split(':');
                state.sortBy = parts[0];
                state.sortOrder = parts[1];
                loadMedia();
            });
        }

        // Upload button
        var uploadBtn = document.querySelector('.ml-upload-btn');
        var fileInput = document.getElementById('ml-file-input');
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', function () {
                fileInput.click();
            });
            fileInput.addEventListener('change', function () {
                if (this.files && this.files.length > 0) {
                    handleUploadFiles(this.files);
                    this.value = '';
                }
            });
        }

        // New folder button
        var newFolderBtn = document.querySelector('.ml-new-folder-btn');
        if (newFolderBtn) {
            newFolderBtn.addEventListener('click', showNewFolderModal);
        }

        // Dropzone
        var dropzone = document.getElementById('ml-dropzone');
        if (dropzone) {
            dropzone.addEventListener('click', function () {
                if (fileInput) fileInput.click();
            });

            dropzone.addEventListener('dragover', function (e) {
                e.preventDefault();
                e.stopPropagation();
                this.classList.add('ml-dropzone-active');
            });

            dropzone.addEventListener('dragleave', function (e) {
                e.preventDefault();
                e.stopPropagation();
                this.classList.remove('ml-dropzone-active');
            });

            dropzone.addEventListener('drop', function (e) {
                e.preventDefault();
                e.stopPropagation();
                this.classList.remove('ml-dropzone-active');
                if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                    handleUploadFiles(e.dataTransfer.files);
                }
            });
        }

        // Global drag & drop on the container
        var container = state.container;
        if (container) {
            container.addEventListener('dragover', function (e) {
                e.preventDefault();
            });
            container.addEventListener('drop', function (e) {
                e.preventDefault();
                if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                    // Only handle if drop wasn't on the dropzone (which handles its own)
                    if (!e.target.closest('#ml-dropzone')) {
                        handleUploadFiles(e.dataTransfer.files);
                    }
                }
            });
        }
    }

    // ── Init ─────────────────────────────────────────────

    function init(containerId) {
        var container = document.getElementById(containerId);
        if (!container) {
            console.error('MediaLibrary: Container "' + containerId + '" not found');
            return;
        }
        state.container = container;
        renderMainLayout();
        loadFolders().then(function () {
            renderFolderSidebar();
            loadMedia();
        });
    }

    // ── Public API ───────────────────────────────────────

    window.MediaLibrary = {
        init: init,
        loadMedia: loadMedia,
        loadFolders: loadFolders,
    };

})();
