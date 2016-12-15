import EventEmitter from 'events';
import domains from './domains';
import fs from 'fs';
import glob from 'glob';
import crypto from 'crypto';

const readFile = (url) => {
    return new Promise((resolve, reject) => {
        fs.readFile(url, 'utf8', (error, data) => {
            if (error) {
                reject(error);
            }
            resolve(data);
        });
    });
};

const globFiles = (pattern) => {
    return new Promise((resolve, reject) => {
        glob(pattern, (error, files) => {
            if (error) {
                reject(error);
            }
            resolve(files);
        });
    });
};

export class FrontendModem extends EventEmitter {

    constructor() {
        super();
    }

    sendFrontend(value) {
        this.emit('send-frontend', value);
    }

    sendBackend(value) {
        this.emit('send-backend', value);
    }

    deliver = async (msg, store) => {
        const [domain, prop] = msg.method.split('.');
        let func;
        try {
            func = domains[domain][prop];
        } catch (e) {
            func = null;
        }

        let result;
        if (func) {
            result = await func(msg, store, this);
        }
        if (!result) {
            result = {};
        }

        const resp = {id: msg.id, result};
        this.sendFrontend(resp);
    }

    contextCreated = async () => {
        const resp = {
            method: 'Runtime.executionContextCreated',
            params: {
                context: {
                    id: 1,
                    origin: 'file://',
                    name: 'Lua Host VM',
                    auxData: {
                        isDefault: true,
                        frameId: '1',
                    },
                },
            },
        };
        this.sendFrontend(resp);
    }

    scriptParsed = async (store) => {
        const project = store.project;
        const pattern = `${project.sourceRoot}/**/*.lua`;
        const files = await globFiles(pattern);
        for (const file of files) {
            const path = file.replace(project.sourceRoot, '');
            const content = await readFile(file);
            const lines = content.split('\n');
            const md5sum = crypto.createHash('md5');
            md5sum.update(content);
            this.sendFrontend({
                method: 'Debugger.scriptParsed',
                params: {
                    endColumn: 0,
                    endLine: lines.length,
                    executionContextAuxData: {
                        'frameId': '1',
                        'isDefault': true,
                    },
                    executionContextId: 1,
                    hasSourceURL: false,
                    hash: md5sum.digest('hex').toUpperCase(),
                    isLiveEdit: false,
                    scriptId: path,
                    sourceMapURL: '',
                    startColumn: 0,
                    startLine: 0,
                    url: `file:///${path}`,
                },
            });
        }
    }

    replayFrontendEvents = async (store) => {
        const method = 'Log.entryAdded';
        const events = await store.eventGetByMethod(method);
        for (const event of events) {
            this.sendFrontend(event);
        }
    }

}