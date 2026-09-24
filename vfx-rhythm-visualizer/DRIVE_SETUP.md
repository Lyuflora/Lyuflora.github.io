# Google Drive setup

The Pattern Library is a static browser app. It stores reference metadata, patterns, collections, and small poster thumbnails in IndexedDB on the current device. Original media is uploaded to Google Drive. The app does not store OAuth access tokens after the current page session.

## Configure Google Cloud

1. Create or select a Google Cloud project.
2. Enable the Google Drive API and Google Picker API.
3. Configure the OAuth consent screen for the app.
4. Create an OAuth client ID with application type **Web application**.
5. Add https://arislyu.com under **Authorized JavaScript origins**.
6. Create an API key for Google Picker and restrict it to the https://arislyu.com/* website referrer and the Picker API.
7. Keep the client ID, API key, and project number available for the in-app Drive settings.

When connecting, the app requests only https://www.googleapis.com/auth/drive.file. This scope is limited to files created by the app or files the user selects in Google Drive Picker. The app does not request access to the user's whole Drive.

## Connect from the app

Open **Drive settings** in the Pattern Library and enter the OAuth client ID, API key, and Google Cloud project number. Save the settings, then choose **Connect Drive**.

On first sync, the app creates this folder structure in My Drive:

    VFX Rhythm Library/
      Media/
        Gameplay/
        Environment/
        Cinematic/
      Thumbnails/
      LibraryData/
      Exports/

Original local uploads go to the selected category folder. Imports selected in Google Drive Picker remain at their existing Drive location and are linked by Drive file ID. The JSON backup in LibraryData contains metadata, not original media.

## Sync and offline behavior

- IndexedDB is the fast working copy for the current browser profile.
- The Drive metadata backup is written after changes while connected, and **Manual sync** checks the Drive change feed incrementally.
- The app lists files only inside its own library folders during the first sync.
- Poster thumbnails are cached locally. Full-resolution media is fetched only after opening a reference and choosing to load the original.
- Access tokens stay in memory. After a page reload or token expiry, connect Drive again before syncing or previewing originals.
- Metadata edits remain local if Drive is unavailable and can be synced after reconnecting.

The library is currently local to each browser until Drive is connected and synchronized. Similarity search by a drawn curve and pattern mutation are data-compatible future work and are not included in this milestone.
