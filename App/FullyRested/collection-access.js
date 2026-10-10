// What the renderer may read, write and look up in the keychain. The main process owns this: it records the
// collection the user opened (or saved) and the request files they chose in a native dialog, and refuses
// every path or secret service outside those, so a renderer can't reach arbitrary files or keychain entries.
const path = require('node:path');
const fs = require('node:fs');
const { REConstants, COLLECTION_FILE_EXTENSIONS, ACTION_FILE_EXTENSIONS, secretServiceForCollection, secretServiceForFolder, secretServiceForRequest } = require('@fullyrested/core');

// Collection guids, request ids and folder ids are app-generated GUIDs; secret names are user-typed keys
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const ACCOUNT_PATTERN = /^[^\0\r\n]{1,256}$/;

const hasExtension = (file, extensions) => extensions.some(e => file.toLowerCase().endsWith(e.toLowerCase()));

// The real path of a file that may not exist yet: its folder must exist, and an existing file is followed
// through any symlink
function realTarget(file) {
    const full = path.resolve(file);
    if (fs.existsSync(full))
        return fs.realpathSync.native(full);
    return path.join(fs.realpathSync.native(path.dirname(full)), path.basename(full));
}

function isInside(base, full) {
    const relative = path.relative(base, full);
    return relative == '' || (relative != '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

class CollectionAccess {
    // trustedFile: where the request files chosen in a dialog are remembered between runs.
    // seedFiles: the files to trust when there is no trustedFile yet (the open tabs from before this existed).
    constructor(trustedFile, seedFiles = () => []) {
        this.trustedFile = trustedFile;
        this.collectionFile = undefined;
        this.root = undefined;
        this.services = new Set();
        this.trusted = this.readTrusted(seedFiles);
    }

    readTrusted(seedFiles) {
        try {
            return new Set(JSON.parse(fs.readFileSync(this.trustedFile, 'utf8')));
        } catch (err) {
            if (err.code !== 'ENOENT')
                console.log(`Cannot read ${this.trustedFile}: ${err.message}`);
        }

        const seeded = new Set();
        for (const file of seedFiles()) {
            try {
                if (typeof file == 'string' && file != '' && hasExtension(file, ACTION_FILE_EXTENSIONS))
                    seeded.add(fs.realpathSync.native(file));
            } catch {
                // a tab whose file has gone stays untrusted
            }
        }
        this.trusted = seeded;
        this.writeTrusted();
        return seeded;
    }

    writeTrusted() {
        fs.writeFileSync(this.trustedFile, JSON.stringify([...this.trusted], null, 4));
    }

    // The user opened or saved this collection: its folder becomes the one the renderer can reach
    openCollection(filename, config) {
        if (!hasExtension(filename, COLLECTION_FILE_EXTENSIONS))
            throw new Error(`${filename} is not a FullyRested collection`);
        const real = fs.realpathSync.native(filename);
        if (real != this.collectionFile)
            this.services = new Set();
        this.collectionFile = real;
        this.root = path.dirname(real);
        this.allowSecrets(secretServiceForCollection, config?.collectionGuid);
    }

    // Collection files the renderer names (recent files) can be opened, but nothing else
    checkCollectionToOpen(filename) {
        if (typeof filename != 'string' || !hasExtension(filename, COLLECTION_FILE_EXTENSIONS))
            throw new Error(`${filename} is not a FullyRested collection`);
        return filename;
    }

    // Saving writes only the open collection's own file; a new one goes through Save As
    checkCollectionToSave(filename) {
        if (this.collectionFile == undefined || typeof filename != 'string' || filename == '' || realTarget(filename) != this.collectionFile)
            throw new Error(`${filename} is not the open collection`);
        return this.collectionFile;
    }

    // A collection-relative path ('/' separated) as a real path inside the open collection's folder.
    // root is the folder the renderer thinks is open; a stale one is refused rather than read.
    collectionPath(root, relative) {
        if (this.root == undefined)
            throw new Error('No collection is open');
        if (typeof root != 'string' || !this.sameFolder(root))
            throw new Error(`${root} is not the open collection`);
        const full = path.resolve(this.root, ...String(relative).split('/').filter(p => p != ''));
        return this.checkInside(full);
    }

    sameFolder(folder) {
        try {
            return fs.realpathSync.native(folder) == this.root;
        } catch {
            return false;
        }
    }

    checkInside(full) {
        const real = realTarget(full);
        if (this.root == undefined || !isInside(this.root, real))
            throw new Error(`${full} is outside the collection folder`);
        return real;
    }

    // A request file: inside the open collection, or one the user chose in a dialog
    checkRequest(fullFilename) {
        if (typeof fullFilename != 'string' || fullFilename == '' || !hasExtension(fullFilename, ACTION_FILE_EXTENSIONS))
            throw new Error(`${fullFilename} is not a FullyRested request`);
        const real = realTarget(fullFilename);
        if (this.trusted.has(real) || (this.root != undefined && isInside(this.root, real)))
            return real;
        throw new Error(`${fullFilename} is outside the collection folder`);
    }

    // The user chose this request file in a native dialog
    trustRequest(fullFilename) {
        const real = realTarget(fullFilename);
        if (this.trusted.has(real)) return;
        this.trusted.add(real);
        this.writeTrusted();
    }

    // folder.frfolder in a folder of the open collection, saved under a well-formed folder id
    checkFolderSave(folderPath, folderId) {
        if (typeof folderId != 'string' || !ID_PATTERN.test(folderId))
            throw new Error(`${folderId} is not a folder id`);
        const file = this.checkInside(path.join(this.checkInside(folderPath), REConstants.FolderSettingsFile));
        this.allowSecrets(secretServiceForFolder, folderId);
        return file;
    }

    // Called with each file the renderer reads from the collection: the secrets it names become readable
    noteRead(file, text) {
        const isFolder = path.basename(file).toLowerCase() == REConstants.FolderSettingsFile;
        if (!isFolder && !hasExtension(file, ACTION_FILE_EXTENSIONS) && !hasExtension(file, COLLECTION_FILE_EXTENSIONS))
            return;
        try {
            const parsed = JSON.parse(text);
            if (isFolder)
                this.allowSecrets(secretServiceForFolder, parsed?.folderId);
            else if (hasExtension(file, ACTION_FILE_EXTENSIONS))
                this.allowSecrets(secretServiceForRequest, parsed?.id);
            else if (realTarget(file) == this.collectionFile)
                this.allowSecrets(secretServiceForCollection, parsed?.collectionGuid);
        } catch {
            // not JSON: the tree reports it, and it names no secrets
        }
    }

    allowSecrets(serviceFor, id) {
        if (typeof id == 'string' && ID_PATTERN.test(id))
            this.services.add(serviceFor(id));
    }

    checkSecret(service, account) {
        if (typeof service != 'string' || !this.services.has(service))
            throw new Error(`${service} is not a secret of the open collection`);
        if (typeof account != 'string' || !ACCOUNT_PATTERN.test(account))
            throw new Error('Not a secret name');
    }
}

module.exports = { CollectionAccess };
