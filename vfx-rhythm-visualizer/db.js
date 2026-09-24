const DB_NAME = "vfx-pattern-library";
const DB_VERSION = 2;
let dbPromise;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function(resolve, reject) {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support IndexedDB."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function() {
      const db = request.result;
      const references = db.objectStoreNames.contains("references") ? request.transaction.objectStore("references") : db.createObjectStore("references", {keyPath: "id"});
      if (!references.indexNames.contains("category")) references.createIndex("category", "category", {unique:false});
      if (!references.indexNames.contains("favorite")) references.createIndex("favorite", "favorite", {unique:false});
      if (!references.indexNames.contains("driveFileId")) references.createIndex("driveFileId", "driveFileId", {unique:false});
      if (!references.indexNames.contains("updatedAt")) references.createIndex("updatedAt", "updatedAt", {unique:false});
      if (!references.indexNames.contains("tags")) references.createIndex("tags", "tags", {unique:false,multiEntry:true});
      if (!db.objectStoreNames.contains("patterns")) db.createObjectStore("patterns", {keyPath: "id"});
      if (!db.objectStoreNames.contains("collections")) db.createObjectStore("collections", {keyPath: "id"});
      if (!db.objectStoreNames.contains("thumbnails")) db.createObjectStore("thumbnails", {keyPath: "id"});
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", {keyPath: "key"});
    };
    request.onsuccess = function() {
      const db = request.result;
      db.onversionchange = function() { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = function() { reject(request.error || new Error("Could not open the local library.")); };
    request.onblocked = function() { reject(new Error("Close other Pattern Library tabs, then reload this one.")); };
  });
  return dbPromise;
}

function requestResult(request) {
  return new Promise(function(resolve, reject) {
    request.onsuccess = function() { resolve(request.result); };
    request.onerror = function() { reject(request.error || new Error("The local library request failed.")); };
  });
}

async function readAll(storeName) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, "readonly");
  return requestResult(tx.objectStore(storeName).getAll());
}

async function readOne(storeName, id) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, "readonly");
  return requestResult(tx.objectStore(storeName).get(id));
}

async function writeOne(storeName, value) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  return new Promise(function(resolve, reject) {
    tx.oncomplete = function() { resolve(value); };
    tx.onerror = function() { reject(tx.error || new Error("Could not save to the local library.")); };
    tx.onabort = function() { reject(tx.error || new Error("The local save was interrupted.")); };
  });
}

async function removeOne(storeName, id) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(id);
  return new Promise(function(resolve, reject) {
    tx.oncomplete = function() { resolve(); };
    tx.onerror = function() { reject(tx.error || new Error("Could not update the local library.")); };
    tx.onabort = function() { reject(tx.error || new Error("The local update was interrupted.")); };
  });
}

function newId(prefix) {
  const value = window.crypto && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
  return (prefix || "ref") + "_" + value;
}

function cleanReference(reference) {
  const copy = Object.assign({}, reference);
  delete copy.thumbnailBlob;
  delete copy.localObjectUrl;
  copy.searchText = [
    copy.title,copy.game,copy.studio,copy.category,copy.gameplayFunction,copy.functionGroup,copy.rhythmFamily,
    copy.renderingStyle,copy.motionCharacter,copy.sourceType,copy.sourceUrl,copy.notes,copy.whyItWorks,
    copy.principleToReuse,copy.whatToAvoid
  ].concat(copy.tags || [],copy.phenomena || []).filter(Boolean).join(" ").toLowerCase();
  return copy;
}

export const LibraryDB = {
  open: openDatabase,
  newId: newId,
  getReferences: function() { return readAll("references"); },
  getReference: function(id) { return readOne("references", id); },
  saveReference: function(reference) { return writeOne("references", cleanReference(reference)); },
  deleteReference: function(id) { return removeOne("references", id); },
  getPatterns: function() { return readAll("patterns"); },
  getPattern: function(id) { return readOne("patterns", id); },
  savePattern: function(pattern) { return writeOne("patterns", pattern); },
  deletePattern: function(id) { return removeOne("patterns", id); },
  getCollections: function() { return readAll("collections"); },
  saveCollection: function(collection) { return writeOne("collections", collection); },
  deleteCollection: function(id) { return removeOne("collections", id); },
  getThumbnail: function(id) { return readOne("thumbnails", id); },
  saveThumbnail: function(id, blob) { return writeOne("thumbnails", {id: id, blob: blob, updatedAt: new Date().toISOString()}); },
  deleteThumbnail: function(id) { return removeOne("thumbnails", id); },
  getSetting: async function(key, fallback) {
    const value = await readOne("settings", key);
    return value ? value.value : fallback;
  },
  saveSetting: function(key, value) { return writeOne("settings", {key: key, value: value}); },
  getBackup: async function() {
    const results = await Promise.all([readAll("references"), readAll("patterns"), readAll("collections")]);
    return {
      schemaVersion: DB_VERSION,
      exportedAt: new Date().toISOString(),
      references: results[0].map(cleanReference),
      patterns: results[1],
      collections: results[2]
    };
  },
  mergeBackup: async function(backup) {
    let conflicts = 0;
    const localRefs = await readAll("references");
    const byId = new Map(localRefs.map(function(ref) { return [ref.id, ref]; }));
    for (const remote of (backup.references || [])) {
      if (!remote || !remote.id) continue;
      const local = byId.get(remote.id);
      if (!local || String(remote.updatedAt || "") > String(local.updatedAt || "")) {
        if (local) conflicts++;
        await writeOne("references", cleanReference(remote));
      } else if (local && String(remote.updatedAt || "") !== String(local.updatedAt || "")) {
        conflicts++;
      }
    }
    const localPatterns = await readAll("patterns");
    const patternMap = new Map(localPatterns.map(function(item) { return [item.id, item]; }));
    for (const remote of (backup.patterns || [])) {
      if (!remote || !remote.id) continue;
      const local = patternMap.get(remote.id);
      if (!local || String(remote.updatedAt || "") > String(local.updatedAt || "")) {
        if (local) conflicts++;
        await writeOne("patterns", remote);
      } else if (local && String(remote.updatedAt || "") !== String(local.updatedAt || "")) conflicts++;
    }
    const localCollections = await readAll("collections");
    const collectionMap = new Map(localCollections.map(function(item) { return [item.id, item]; }));
    for (const remote of (backup.collections || [])) {
      if (!remote || !remote.id) continue;
      const local = collectionMap.get(remote.id);
      if (!local || String(remote.updatedAt || "") > String(local.updatedAt || "")) {
        if (local) conflicts++;
        await writeOne("collections", remote);
      } else if (local && String(remote.updatedAt || "") !== String(local.updatedAt || "")) conflicts++;
    }
    return {conflicts: conflicts};
  }
};
