import {LibraryDB} from "./db.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const MIME_FOLDER = "application/vnd.google-apps.folder";
const MEDIA_TYPES = "video/mp4,video/quicktime,video/webm,image/gif,image/png,image/jpeg";
let gisPromise;
let pickerPromise;
let tokenClient;

function loadScript(src, test) {
  return new Promise(function(resolve, reject) {
    if (test()) { resolve(); return; }
    let script = document.querySelector('script[data-library-src="' + src + '"]');
    if (!script) {
      script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.librarySrc = src;
      document.head.appendChild(script);
    }
    script.addEventListener("load", function() { test() ? resolve() : reject(new Error("Google's library did not initialize.")); }, {once: true});
    script.addEventListener("error", function() { reject(new Error("Google services could not load. Check your connection and try again.")); }, {once: true});
  });
}

function quoteQuery(value) { return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

function userFacingError(error) {
  const message = (error && error.message) || String(error || "Drive request failed.");
  if (/401|invalid credentials|login expired|token/i.test(message)) return "Google sign-in expired. Connect Drive again to continue.";
  if (/403|permission|insufficient/i.test(message)) return "Google Drive denied access. Check that Drive API is enabled and reselect the file in Drive Picker.";
  if (/404|not found/i.test(message)) return "A Drive file is missing or no longer shared with this app. Its metadata is still saved locally.";
  if (/429|rate limit|quota/i.test(message)) return "Google Drive is rate-limiting requests. Your local metadata is safe; try syncing again in a moment.";
  if (/network|fetch|failed to fetch|offline/i.test(message)) return "Drive is temporarily unavailable. The local library remains available offline.";
  return message;
}

class DriveLibrary {
  constructor() {
    this.config = {clientId: "", apiKey: "", projectNumber: ""};
    this.accessToken = null;
    this.expiresAt = 0;
    this.connected = false;
  }

  configure(config) {
    const next = Object.assign({}, this.config, config || {});
    if (this.config.clientId && next.clientId !== this.config.clientId) {
      this.accessToken = null;
      this.expiresAt = 0;
      this.connected = false;
      tokenClient = null;
    }
    this.config = next;
  }

  async loadIdentity() {
    if (gisPromise) return gisPromise;
    gisPromise = loadScript("https://accounts.google.com/gsi/client", function() {
      return !!(window.google && google.accounts && google.accounts.oauth2);
    });
    return gisPromise;
  }

  async connect() {
    if (!this.config.clientId) throw new Error("Add the Google OAuth client ID in Drive settings first.");
    await this.loadIdentity();
    const self = this;
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: DRIVE_SCOPE,
        callback: function(response) {
          if (response.error) {
            self._pendingReject && self._pendingReject(new Error(response.error_description || response.error));
            self._pendingResolve = self._pendingReject = null;
            return;
          }
          self.accessToken = response.access_token;
          self.expiresAt = Date.now() + (Number(response.expires_in || 3500) * 1000) - 30000;
          self.connected = true;
          if (self._pendingResolve) self._pendingResolve({email: "", expiresAt: self.expiresAt});
          self._pendingResolve = self._pendingReject = null;
        },
        error_callback: function(error) {
          if (self._pendingReject) self._pendingReject(new Error((error && error.message) || "Google sign-in was cancelled."));
          self._pendingResolve = self._pendingReject = null;
        }
      });
    }
    return new Promise(function(resolve, reject) {
      self._pendingResolve = resolve;
      self._pendingReject = reject;
      try { tokenClient.requestAccessToken({prompt: ""}); }
      catch (error) { reject(error); }
    });
  }

  disconnect() {
    if (this.accessToken && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(this.accessToken, function() {}); } catch (_) {}
    }
    this.accessToken = null;
    this.expiresAt = 0;
    this.connected = false;
    tokenClient = null;
  }

  requireToken() {
    if (!this.accessToken || Date.now() >= this.expiresAt) {
      this.accessToken = null;
      this.connected = false;
      throw new Error("Google sign-in expired. Connect Drive again to continue.");
    }
    return this.accessToken;
  }

  async request(path, options) {
    const token = this.requireToken();
    const response = await fetch(DRIVE_API + path, Object.assign({}, options || {}, {
      headers: Object.assign({"Authorization": "Bearer " + token}, (options && options.headers) || {})
    }));
    if (!response.ok) {
      let detail = "";
      try { const body = await response.json(); detail = body.error && body.error.message || ""; } catch (_) {}
      throw new Error(detail || ("Google Drive request failed (" + response.status + ")."));
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async listFiles(query, fields) {
    let pageToken = "";
    const files = [];
    do {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("pageSize", "1000");
      params.set("orderBy", "modifiedTime desc");
      params.set("fields", "nextPageToken,files(" + (fields || "id,name,mimeType,modifiedTime,parents,webViewLink,thumbnailLink,trashed,appProperties") + ")");
      if (pageToken) params.set("pageToken", pageToken);
      const result = await this.request("/files?" + params.toString());
      files.push.apply(files, result.files || []);
      pageToken = result.nextPageToken || "";
    } while (pageToken);
    return files;
  }

  async findOrCreateFolder(name, parentId) {
    const cachedKey = "drive-folder-" + (parentId || "root") + "-" + name;
    const cached = await LibraryDB.getSetting(cachedKey, "");
    if (cached) {
      try {
        const result = await this.request("/files/" + encodeURIComponent(cached) + "?fields=id,name,mimeType,trashed");
        if (result && !result.trashed) return result.id;
      } catch (_) {}
    }
    const conditions = ["name='" + quoteQuery(name) + "'", "mimeType='" + MIME_FOLDER + "'", "trashed=false"];
    if (parentId) conditions.push("'" + quoteQuery(parentId) + "' in parents");
    const found = await this.listFiles(conditions.join(" and "), "id,name,mimeType,modifiedTime,trashed,parents");
    if (found.length) {
      await LibraryDB.saveSetting(cachedKey, found[0].id);
      return found[0].id;
    }
    const body = {name: name, mimeType: MIME_FOLDER};
    if (parentId) body.parents = [parentId];
    const created = await this.request("/files?fields=id,name,mimeType,parents", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
    await LibraryDB.saveSetting(cachedKey, created.id);
    return created.id;
  }

  async ensureFolders() {
    const root = await this.findOrCreateFolder("VFX Rhythm Library", "");
    const media = await this.findOrCreateFolder("Media", root);
    const folders = {root: root, media: media, thumbnails: await this.findOrCreateFolder("Thumbnails", root), libraryData: await this.findOrCreateFolder("LibraryData", root), exports: await this.findOrCreateFolder("Exports", root)};
    folders.category = {};
    for (const name of ["Gameplay", "Environment", "Cinematic"]) folders.category[name] = await this.findOrCreateFolder(name, media);
    await LibraryDB.saveSetting("drive-folder-root", root);
    return folders;
  }

  async uploadFile(file, parentId, metadata, progress) {
    const token = this.requireToken();
    const start = await fetch(UPLOAD_API + "/files?uploadType=resumable&fields=id,name,mimeType,modifiedTime,webViewLink,thumbnailLink,parents", {
      method: "POST",
      headers: {"Authorization": "Bearer " + token, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": file.type || "application/octet-stream", "X-Upload-Content-Length": String(file.size)},
      body: JSON.stringify(Object.assign({name: file.name, mimeType: file.type || "application/octet-stream", parents: parentId ? [parentId] : []}, metadata || {}))
    });
    if (!start.ok) {
      let errorText = "";
      try { const body = await start.json(); errorText = body.error && body.error.message || ""; } catch (_) {}
      throw new Error(errorText || ("Drive upload could not start (" + start.status + ")."));
    }
    const location = start.headers.get("Location");
    if (!location) throw new Error("Drive did not return an upload address.");
    return new Promise(function(resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", location);
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = function(event) { if (progress && event.lengthComputable) progress(event.loaded, event.total); };
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch (_) { reject(new Error("Drive returned an unreadable upload result.")); }
        } else {
          let message = "Drive upload failed (" + xhr.status + ").";
          try { const response = JSON.parse(xhr.responseText); message = response.error && response.error.message || message; } catch (_) {}
          reject(new Error(message));
        }
      };
      xhr.onerror = function() { reject(new Error("Network interrupted during the Drive upload. The reference metadata is still safe locally.")); };
      xhr.onabort = function() { reject(new Error("The Drive upload was interrupted.")); };
      xhr.send(file);
    });
  }

  async uploadThumbnail(blob, name, parentId) {
    const file = new File([blob], name || "vfx-poster.jpg", {type: blob.type || "image/jpeg"});
    return this.uploadFile(file, parentId, {description: "Preview thumbnail generated by VFX Pattern Library."});
  }

  async getFile(fileId) {
    return this.request("/files/" + encodeURIComponent(fileId) + "?fields=id,name,mimeType,modifiedTime,webViewLink,thumbnailLink,parents,trashed,size");
  }

  async downloadMedia(fileId) {
    const token = this.requireToken();
    const response = await fetch(DRIVE_API + "/files/" + encodeURIComponent(fileId) + "?alt=media", {headers: {"Authorization": "Bearer " + token}});
    if (!response.ok) {
      if (response.status === 401) throw new Error("Google sign-in expired. Connect Drive again to preview the original.");
      if (response.status === 404) throw new Error("The original Drive file is missing or no longer shared with this app.");
      throw new Error("The original media is not available from Drive right now (" + response.status + ").");
    }
    return response.blob();
  }

  async downloadThumbnail(file) {
    const info = file && file.thumbnailLink ? file : await this.getFile(file.id || file);
    if (!info || !info.thumbnailLink) return null;
    const token = this.requireToken();
    const response = await fetch(info.thumbnailLink, {headers: {"Authorization": "Bearer " + token}});
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob && blob.size < 5 * 1024 * 1024 ? blob : null;
  }

  async openPicker() {
    if (!this.config.apiKey || !this.config.projectNumber) throw new Error("Add the Google API key and Cloud project number in Drive settings to use the picker.");
    this.requireToken();
    if (!pickerPromise) {
      pickerPromise = loadScript("https://apis.google.com/js/api.js", function() { return !!window.gapi; }).then(function() {
        return new Promise(function(resolve, reject) {
          try { gapi.load("picker", {callback: resolve, onerror: function() { reject(new Error("Google Drive Picker did not load.")); }}); }
          catch (error) { reject(error); }
        });
      });
    }
    await pickerPromise;
    const self = this;
    return new Promise(function(resolve, reject) {
      try {
        const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
        view.setIncludeFolders(false);
        view.setMimeTypes(MEDIA_TYPES);
        const picker = new google.picker.PickerBuilder()
          .setAppId(self.config.projectNumber)
          .setDeveloperKey(self.config.apiKey)
          .setOAuthToken(self.requireToken())
          .addView(view)
          .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
          .setTitle("Choose VFX references")
          .setCallback(function(data) {
            if (data.action === google.picker.Action.PICKED) resolve(data.docs || []);
            else if (data.action === google.picker.Action.CANCEL) resolve([]);
          })
          .build();
        picker.setVisible(true);
      } catch (error) { reject(error); }
    });
  }

  async readBackup(folderId) {
    const files = await this.listFiles("name='library-index.json' and '" + quoteQuery(folderId) + "' in parents and trashed=false", "id,name,mimeType,modifiedTime,parents");
    if (!files.length) return null;
    const file = files[0];
    await LibraryDB.saveSetting("drive-backup-file-id", file.id);
    const token = this.requireToken();
    const response = await fetch(DRIVE_API + "/files/" + encodeURIComponent(file.id) + "?alt=media", {headers: {"Authorization": "Bearer " + token}});
    if (!response.ok) throw new Error("Could not read the Drive metadata backup (" + response.status + ").");
    return {id: file.id, data: await response.json()};
  }

  async writeBackup(folderId, backup) {
    const cachedId = await LibraryDB.getSetting("drive-backup-file-id", "");
    const payload = new Blob([JSON.stringify(backup, null, 2)], {type: "application/json"});
    if (cachedId) {
      try {
        const token = this.requireToken();
        const response = await fetch(UPLOAD_API + "/files/" + encodeURIComponent(cachedId) + "?uploadType=media&fields=id,modifiedTime", {
          method: "PATCH", headers: {"Authorization": "Bearer " + token, "Content-Type": "application/json"}, body: payload
        });
        if (!response.ok) throw new Error("Metadata backup update failed (" + response.status + ").");
        return;
      } catch (error) {
        if (!/404|not found/i.test(error.message || "")) throw error;
      }
    }
    const file = await this.request("/files?fields=id,name", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: "library-index.json", mimeType: "application/json", parents: [folderId]})});
    await LibraryDB.saveSetting("drive-backup-file-id", file.id);
    const token = this.requireToken();
    const response = await fetch(UPLOAD_API + "/files/" + encodeURIComponent(file.id) + "?uploadType=media&fields=id,modifiedTime", {
      method: "PATCH", headers: {"Authorization": "Bearer " + token, "Content-Type": "application/json"}, body: payload
    });
    if (!response.ok) throw new Error("Could not write the Drive metadata backup (" + response.status + ").");
  }

  async sync(onProgress) {
    const folders = await this.ensureFolders();
    const startToken = await LibraryDB.getSetting("drive-start-page-token", "");
    let imported = 0;
    let removed = 0;
    let conflicts = 0;
    const backupRecord = await this.readBackup(folders.libraryData);
    if (backupRecord && backupRecord.data) {
      const merged = await LibraryDB.mergeBackup(backupRecord.data);
      conflicts = merged.conflicts;
    }

    if (!startToken) {
      const initialToken = await this.request("/changes/startPageToken?fields=startPageToken");
      const knownReferences = await LibraryDB.getReferences();
      for (const category of ["Gameplay", "Environment", "Cinematic"]) {
        if (onProgress) onProgress("Checking " + category + " media");
        const files = await this.listFiles("'" + quoteQuery(folders.category[category]) + "' in parents and trashed=false");
        for (const file of files) {
          if (!file.mimeType || file.mimeType === MIME_FOLDER || !/^(video\/(mp4|quicktime|webm)|image\/(gif|png|jpeg))$/i.test(file.mimeType)) continue;
          const prior = knownReferences.find(function(ref) { return ref.driveFileId === file.id; });
          if (!prior) {
            const discovered = {
              id: LibraryDB.newId("ref"), driveFileId: file.id, driveThumbnailId: "", title: file.name.replace(/\.[^.]+$/, ""),
              category: category, game: "", studio: "", gameplayFunction: "", rhythmFamily: "", duration: null, climaxPosition: null,
              peakCount: null, attackType: "", decayType: "", spacingType: "", phenomena: [], renderingStyle: "", motionCharacter: "",
              cameraDistance: "", gameplayImportance: "", visualPriority: "", environmentContext: "", loopType: "", ambientDensity: "",
              spatialScale: "", environmentalRole: "", rating: 0, favorite: false, tags: [], sourceType: "",
              sourceUrl: file.webViewLink || "", sourceTimestamp: "", captureDate: "", notes: "", whyItWorks: "", principleToReuse: "",
              whatToAvoid: "", rhythmCurve: [], layerCurves: [], patternIds: [], collectionIds: [], mimeType: file.mimeType,
              driveModifiedTime: file.modifiedTime || "", sourceMissing: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            await LibraryDB.saveReference(discovered);
            knownReferences.push(discovered);
            imported++;
          }
        }
      }
      await LibraryDB.saveSetting("drive-start-page-token", initialToken.startPageToken);
    } else {
      let pageToken = startToken;
      let nextStart = "";
      while (pageToken) {
        const params = new URLSearchParams({pageToken: pageToken, pageSize: "1000", includeRemoved: "true", fields: "nextPageToken,newStartPageToken,changes(fileId,removed,time,file(id,name,mimeType,modifiedTime,webViewLink,thumbnailLink,trashed,parents))"});
        const page = await this.request("/changes?" + params.toString());
        const refs = await LibraryDB.getReferences();
        for (const change of (page.changes || [])) {
          const ref = refs.find(function(item) { return item.driveFileId === change.fileId; });
          if (!ref) continue;
          if (change.removed || (change.file && change.file.trashed)) {
            ref.sourceMissing = true;
            ref.updatedAt = new Date().toISOString();
            await LibraryDB.saveReference(ref);
            removed++;
          } else if (change.file) {
            ref.sourceMissing = false;
            ref.driveModifiedTime = change.file.modifiedTime || ref.driveModifiedTime;
            ref.sourceUrl = change.file.webViewLink || ref.sourceUrl;
            await LibraryDB.saveReference(ref);
          }
        }
        if (page.newStartPageToken) nextStart = page.newStartPageToken;
        pageToken = page.nextPageToken || "";
      }
      if (nextStart) await LibraryDB.saveSetting("drive-start-page-token", nextStart);
    }

    const backup = await LibraryDB.getBackup();
    await this.writeBackup(folders.libraryData, backup);
    const lastSync = new Date().toISOString();
    await LibraryDB.saveSetting("drive-last-sync", lastSync);
    return {imported: imported, removed: removed, conflicts: conflicts, lastSync: lastSync, folders: folders};
  }

  async syncMetadata() {
    const dataFolder = await this.findOrCreateFolder("VFX Rhythm Library", "").then(async (root) => this.findOrCreateFolder("LibraryData", root));
    await this.writeBackup(dataFolder, await LibraryDB.getBackup());
    const lastSync = new Date().toISOString();
    await LibraryDB.saveSetting("drive-last-sync", lastSync);
    return lastSync;
  }
}

export const DriveService = new DriveLibrary();
export {userFacingError};
